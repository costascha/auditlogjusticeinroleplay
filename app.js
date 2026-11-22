import { initializeSupabase } from "./supabase-client.js";

const loadingScreen = document.querySelector("#app-loading");
const loginView = document.querySelector("#login-view");
const passwordResetView = document.querySelector("#password-reset-view");
const loginForm = document.querySelector("#login-form");
const resetForm = document.querySelector("#password-reset-form");
const formMessage = document.querySelector("#form-message");
const resetMessage = document.querySelector("#reset-message");
const accountIdentifierInput = document.querySelector("#account-identifier");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#submit-button");
const submitLabel = document.querySelector("#submit-label");
const loginTitle = document.querySelector("#login-title");
const authLead = document.querySelector("#auth-lead");
const accountIdentifierLabel = document.querySelector("#account-identifier-label");
const authOptions = document.querySelector(".form-options");
const passwordToggle = document.querySelector("#password-toggle");
const authModeToggle = document.querySelector("#auth-mode-toggle");
const authSwitchCopy = document.querySelector("#auth-switch-copy");
const forgotPasswordButton = document.querySelector("#recovery-button");

const DEMO_SESSION_STORAGE_KEY = "justice-demo-session-v1";
const DEMO_ACCOUNTS = {
    "admin@demo.local": { password: "DemoAdmin123!", username: "admin", name: "Demo Admin", isAdmin: true },
    "user@demo.local": { password: "DemoUser123!", username: "user", name: "Demo User", isAdmin: false }
};

let supabase;
let demoMode = false;
let isSignupMode = false;
let passwordRecoveryInProgress = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.dataset.error = String(isError);
}

function showLogin() {
    passwordResetView.hidden = true;
    loginView.hidden = false;
    showMessage(resetMessage, "");
}

function showPasswordReset() {
    passwordRecoveryInProgress = true;
    loginView.hidden = true;
    passwordResetView.hidden = false;
    showMessage(resetMessage, "");
}

function redirectToDashboard() {
    window.location.replace("./dashboard.html");
}

function setSignupMode(enabled) {
    isSignupMode = enabled;
    loginTitle.textContent = enabled ? "Δημιουργία λογαριασμού" : "Σύνδεση";
    authLead.textContent = enabled
        ? "Διάλεξε username και όρισε κωδικό."
        : "Συμπλήρωσε τα στοιχεία σου για να συνεχίσεις.";
    accountIdentifierLabel.textContent = enabled ? "Username" : "Username ή email";
    accountIdentifierInput.placeholder = enabled ? "π.χ. alex_123" : "Username ή name@email.com";
    authOptions.hidden = enabled;
    submitLabel.textContent = enabled ? "Δημιουργία λογαριασμού" : "Σύνδεση";
    authSwitchCopy.textContent = enabled ? "Έχεις ήδη λογαριασμό;" : "Δεν έχεις λογαριασμό;";
    authModeToggle.textContent = enabled ? "Σύνδεση" : "Δημιούργησε λογαριασμό";
    passwordInput.autocomplete = enabled ? "new-password" : "current-password";
    passwordInput.minLength = enabled ? 10 : 0;
    forgotPasswordButton.hidden = enabled || demoMode;
    showMessage(formMessage, "");
}

function enableDemoMode() {
    demoMode = true;
    document.querySelector(".auth-switch").hidden = true;
    setSignupMode(false);
    showMessage(formMessage, "Demo: admin@demo.local / DemoAdmin123! ή user@demo.local / DemoUser123!");
    if (passwordRecoveryInProgress) {
        showMessage(resetMessage, "Η επαναφορά κωδικού δεν είναι διαθέσιμη στη δοκιμαστική λειτουργία.", true);
    }
}

function getDemoSession() {
    const rawSession = localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!rawSession) return null;

    try {
        return JSON.parse(rawSession);
    } catch (error) {
        console.error("Could not read the saved demo session.", error);
        localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
        return null;
    }
}

passwordToggle.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    passwordToggle.setAttribute("aria-label", isVisible ? "Εμφάνιση κωδικού" : "Απόκρυψη κωδικού");
    passwordToggle.setAttribute("aria-pressed", String(!isVisible));
});

authModeToggle.addEventListener("click", () => setSignupMode(!isSignupMode));

forgotPasswordButton.addEventListener("click", async () => {
    const email = accountIdentifierInput.value.trim();
    if (!email.includes("@")) {
        showMessage(formMessage, email
            ? "Οι λογαριασμοί username-only δεν έχουν αυτόματη επαναφορά. Επικοινώνησε με τον διαχειριστή."
            : "Συμπλήρωσε πρώτα το email του λογαριασμού σου.", true);
        if (!email) accountIdentifierInput.focus();
        return;
    }

    forgotPasswordButton.disabled = true;
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.href.split("#")[0]
        });
        if (error) throw error;
        showMessage(formMessage, "Στάλθηκε σύνδεσμος επαναφοράς στο email σου.");
    } catch (error) {
        console.error("Password reset request failed.", error);
        showMessage(formMessage, "Δεν ήταν δυνατή η αποστολή email επαναφοράς. Δοκίμασε ξανά.", true);
    } finally {
        forgotPasswordButton.disabled = false;
    }
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage(formMessage, "");
    submitButton.disabled = true;
    submitLabel.textContent = isSignupMode ? "Δημιουργία..." : "Σύνδεση...";

    const identifier = accountIdentifierInput.value.trim();
    const normalizedIdentifier = identifier.toLowerCase();
    const password = passwordInput.value;

    try {
        if (demoMode) {
            const demoAccount = Object.entries(DEMO_ACCOUNTS).find(([email, account]) =>
                (normalizedIdentifier === email || normalizedIdentifier === account.username) && account.password === password
            );
            if (!demoAccount) {
                showMessage(formMessage, "Τα στοιχεία σύνδεσης δεν είναι σωστά. Demo: admin/DemoAdmin123! ή user/DemoUser123!.", true);
                return;
            }

            const [email, account] = demoAccount;
            localStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify({
                id: `demo-${account.username}`,
                email,
                username: account.username,
                name: account.name,
                isAdmin: account.isAdmin
            }));
            redirectToDashboard();
            return;
        }

        if (!supabase) throw new Error("Supabase client is not available.");

        if (isSignupMode) {
            const username = identifier.toLowerCase();
            if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
                showMessage(formMessage, "Το username πρέπει να έχει 3-32 χαρακτήρες: λατινικά γράμματα, αριθμούς, τελεία, _ ή -.", true);
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email: `${username}@users.auditlog.invalid`,
                password,
                options: { data: { username } }
            });
            if (error) throw error;
            if (data.session) {
                redirectToDashboard();
            } else {
                showMessage(formMessage, "Η εγγραφή έγινε, αλλά δεν δημιουργήθηκε συνεδρία. Βεβαιώσου ότι το Confirm email είναι απενεργοποιημένο στο Supabase.", true);
                setSignupMode(false);
            }
            return;
        }

        let session;
        if (identifier.includes("@")) {
            const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
            if (error) throw error;
            session = data.session;
        } else {
            const { data, error } = await supabase.functions.invoke("username-auth", {
                body: { action: "sign-in", username: identifier.toLowerCase(), password }
            });
            if (error) throw error;
            if (
                typeof data?.access_token !== "string" ||
                typeof data?.refresh_token !== "string"
            ) {
                throw new Error("Username authentication returned an invalid session.");
            }

            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token
            });
            if (sessionError) throw sessionError;
            session = sessionData.session;
        }

        if (!session) throw new Error("Authentication succeeded without an active session.");
        redirectToDashboard();
    } catch (error) {
        console.error("Authentication failed.", error);
        showMessage(
            formMessage,
            isSignupMode
                ? "Δεν ήταν δυνατή η εγγραφή. Έλεγξε το username και τον κωδικό σου."
                : "Η σύνδεση απέτυχε. Έλεγξε το username/email και τον κωδικό σου.",
            true
        );
    } finally {
        submitButton.disabled = false;
        submitLabel.textContent = isSignupMode ? "Δημιουργία λογαριασμού" : "Σύνδεση";
    }
});

resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = document.querySelector("#new-password").value;
    const confirmPassword = document.querySelector("#confirm-password").value;
    const resetButton = resetForm.querySelector('button[type="submit"]');

    if (newPassword !== confirmPassword) {
        showMessage(resetMessage, "Οι κωδικοί δεν ταιριάζουν.", true);
        return;
    }

    resetButton.disabled = true;
    try {
        if (demoMode) {
            const email = accountIdentifierInput.value.trim().toLowerCase();
            if (!DEMO_ACCOUNTS[email]) {
                showMessage(resetMessage, "Δεν βρέθηκε demo account για αυτό το email.", true);
                return;
            }
            DEMO_ACCOUNTS[email].password = newPassword;
            showMessage(resetMessage, "Ο demo κωδικός ενημερώθηκε επιτυχώς.");
            window.setTimeout(showLogin, 600);
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        showMessage(resetMessage, "Ο κωδικός ενημερώθηκε. Γίνεται μετάβαση στο dashboard...");
        redirectToDashboard();
    } catch (error) {
        console.error("Password update failed.", error);
        showMessage(resetMessage, "Δεν ήταν δυνατή η αλλαγή κωδικού. Ζήτησε νέο σύνδεσμο επαναφοράς.", true);
    } finally {
        resetButton.disabled = false;
    }
});

async function initialize() {
    if (passwordRecoveryInProgress) showPasswordReset();

    try {
        const result = await initializeSupabase();
        supabase = result.client;
        demoMode = result.demoMode;

        if (demoMode) {
            enableDemoMode();
            if (getDemoSession()) redirectToDashboard();
            return;
        }

        supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") showPasswordReset();
            if (event === "SIGNED_OUT") showLogin();
        });

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session && !passwordRecoveryInProgress) redirectToDashboard();
    } catch (error) {
        console.error("Application initialization failed.", error);
        showMessage(
            formMessage,
            "Δεν ήταν δυνατή η σύνδεση με το Supabase. Έλεγξε το config.js και τη σύνδεση δικτύου.",
            true
        );
    } finally {
        loadingScreen.hidden = true;
    }
}

initialize();
