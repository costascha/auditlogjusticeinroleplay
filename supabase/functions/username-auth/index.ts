import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

const usernamePattern = /^[a-z0-9._-]{3,32}$/;
const authEmailForUsername = (username: string) => `${username}@users.auditlog.invalid`;

type RequestBody = {
    action?: string;
    username?: string;
    password?: string;
};

function isRequestBody(value: unknown): value is RequestBody {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respond(body: Record<string, unknown>, status = 200) {
    return Response.json(body, { status, headers: corsHeaders });
}

function getDefaultKey(variable: string, legacyVariable: string) {
    const rawKeys = Deno.env.get(variable);
    if (rawKeys) {
        const keys: unknown = JSON.parse(rawKeys);
        if (typeof keys === "object" && keys !== null && "default" in keys) {
            const defaultKey = Reflect.get(keys, "default");
            return typeof defaultKey === "string" ? defaultKey : "";
        }
        return "";
    }

    return Deno.env.get(legacyVariable) ?? "";
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") {
        return respond({ ok: true });
    }

    if (request.method !== "POST") {
        return respond({ error: "Method not allowed." }, 405);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4096) {
        return respond({ error: "Request is too large." }, 413);
    }

    let parsedBody: unknown;
    try {
        parsedBody = await request.json();
    } catch {
        return respond({ error: "Invalid request." }, 400);
    }
    if (!isRequestBody(parsedBody)) {
        return respond({ error: "Invalid request." }, 400);
    }
    const body = parsedBody;

    const username = typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";
    if (!usernamePattern.test(username)) {
        return respond({ error: "Invalid username." }, 400);
    }
    if (body.action !== "sign-in") {
        return respond({ error: "Invalid action." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let publishableKey: string;
    let secretKey: string;
    try {
        publishableKey = getDefaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
        secretKey = getDefaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    } catch {
        console.error("username-auth Supabase key configuration is invalid.");
        return respond({ error: "Authentication service is not configured." }, 500);
    }
    if (!supabaseUrl || !publishableKey || !secretKey) {
        console.error("username-auth is missing required Supabase environment variables.");
        return respond({ error: "Authentication service is not configured." }, 500);
    }

    const publicClient = createClient(supabaseUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const adminClient = createClient(supabaseUrl, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: profile, error: profileError } = await adminClient
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();
    if (profileError) {
        console.error("username-auth profile lookup failed.", profileError.code);
        return respond({ error: "Authentication service is unavailable." }, 500);
    }

    if (!profile) {
        return respond({ error: "Δεν ήταν δυνατή η επαλήθευση των στοιχείων." }, 401);
    }

    const { data: userResult, error: userError } = await adminClient.auth.admin.getUserById(profile.id);
    if (userError) {
        console.error("username-auth user lookup failed.", userError.code);
        return respond({ error: "Authentication service is unavailable." }, 500);
    }

    let email = userResult.user.email;
    if (!email && userResult.user.phone) {
        email = authEmailForUsername(username);
        const { error: migrationError } = await adminClient.auth.admin.updateUserById(profile.id, {
            email,
            email_confirm: true
        });
        if (migrationError) {
            console.error("username-auth legacy account migration failed.", migrationError.code);
            return respond({ error: "Δεν ήταν δυνατή η επαλήθευση των στοιχείων." }, 401);
        }
    }

    if (!email) {
        return respond({ error: "Δεν ήταν δυνατή η επαλήθευση των στοιχείων." }, 401);
    }

    if (typeof body.password !== "string" || body.password.length < 1 || body.password.length > 128) {
        return respond({ error: "Δεν ήταν δυνατή η επαλήθευση των στοιχείων." }, 401);
    }

    const { data, error } = await publicClient.auth.signInWithPassword({
        email,
        password: body.password
    });
    if (error || !data.session) {
        return respond({ error: "Δεν ήταν δυνατή η επαλήθευση των στοιχείων." }, 401);
    }

    return respond({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
    });
});
