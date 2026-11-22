export async function initializeSupabase() {
    let config;
    try {
        config = await import("./config.js");
    } catch (error) {
        console.info("Supabase configuration not found, enabling demo mode.", error);
        return { client: null, demoMode: true };
    }

    if (
        !config.SUPABASE_URL ||
        !config.SUPABASE_ANON_KEY ||
        config.SUPABASE_URL.includes("YOUR-PROJECT") ||
        config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
    ) {
        return { client: null, demoMode: true };
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    return {
        client: createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY),
        demoMode: false
    };
}
