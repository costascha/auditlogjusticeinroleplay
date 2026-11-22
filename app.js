const authView = document.querySelector("#auth-view");
const loadingScreen = document.querySelector("#app-loading");
const passwordResetView = document.querySelector("#password-reset-view");
const ticketsView = document.querySelector("#tickets-view");
const loginForm = document.querySelector("#login-form");
const accountIdentifierInput = document.querySelector("#account-identifier");
const accountIdentifierLabel = document.querySelector("#account-identifier-label");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const formMessage = document.querySelector("#form-message");
const loginTitle = document.querySelector("#login-title");
const authLead = document.querySelector("#auth-lead");
const authOptions = document.querySelector(".form-options");
const authModeToggle = document.querySelector("#auth-mode-toggle");
const authSwitchCopy = document.querySelector("#auth-switch-copy");
const submitLabel = document.querySelector("#submit-label");
const resetMessage = document.querySelector("#reset-message");
const resetLead = document.querySelector("#reset-lead");
const createMessage = document.querySelector("#create-message");
const listMessage = document.querySelector("#list-message");
const ticketList = document.querySelector("#ticket-list");
const ticketForm = document.querySelector("#ticket-form");
const adminLabel = document.querySelector("#admin-label");
const accountLabel = document.querySelector("#account-label");
const ticketListTitle = document.querySelector("#ticket-list-title");
const notificationSection = document.querySelector("#notification-section");
const notificationList = document.querySelector("#notification-list");
const notificationMessage = document.querySelector("#notification-message");

const DEMO_ACCOUNTS = {
    "admin@demo.local": { password: "DemoAdmin123!", isAdmin: true, name: "Demo Admin" },
    "user@demo.local": { password: "DemoUser123!", isAdmin: false, name: "Demo User" }
};
const DEMO_TICKETS_STORAGE_KEY = "demo-ticket-system-tickets-v1";

let supabase;
let currentUser;
let isAdmin = false;
let isSignUpMode = false;
let passwordRecoveryInProgress = false;
let demoMode = false;

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.dataset.error = String(isError);
}

function showError(element, message, error) {
    console.error(message, error);
    showMessage(element, message, true);
}

function enableDemoMode() {
    demoMode = true;
    document.querySelector(".auth-switch")?.setAttribute("hidden", "");
    showLogin();
}

function getDemoTickets() {
    try {
        const raw = localStorage.getItem(DEMO_TICKETS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn("Could not read demo tickets from localStorage.", error);
        return [];
    }
}

function saveDemoTickets(tickets) {
    localStorage.setItem(DEMO_TICKETS_STORAGE_KEY, JSON.stringify(tickets));
}

function createDemoSession(email) {
    const account = DEMO_ACCOUNTS[email];
    return {
        user: {
            id: `demo-${email.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
            email,
            isAdmin: Boolean(account?.isAdmin),
            name: account?.name ?? "Demo User"
        },
        access_token: "demo-token"
    };
}

function generateDemoTicketNumber() {
    const raw = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    return `1-${raw.replace(/[^0-9]/g, "").slice(-16)}`;
}

function showLogin() {
    currentUser = undefined;
    isAdmin = false;
    passwordRecoveryInProgress = false;
    setSignUpMode(false);
    passwordResetView.hidden = true;
    ticketsView.hidden = true;
    authView.hidden = false;
    ticketList.replaceChildren();
    showMessage(formMessage, demoMode ? "Demo mode active. Use admin@demo.local / DemoAdmin123! or user@demo.local / DemoUser123!" : "");
}

function setSignUpMode(enabled) {
    isSignUpMode = enabled;
    loginTitle.textContent = enabled ? "Δημιουργία λογαριασμού" : "Σύνδεση";
    authLead.textContent = enabled
        ? "Διάλεξε username και όρισε κωδικό."
        : "Συνδέσου με username ή email.";
    accountIdentifierLabel.textContent = enabled ? "Username" : "Username ή email";
    accountIdentifierInput.placeholder = enabled ? "π.χ. alex_123" : "Username ή name@email.com";
    authOptions.hidden = enabled;
    passwordInput.minLength = enabled ? 10 : 0;
    passwordInput.autocomplete = enabled ? "new-password" : "current-password";
    submitLabel.textContent = enabled ? "Δημιουργία λογαριασμού" : "Σύνδεση";
    authSwitchCopy.textContent = enabled ? "Έχεις ήδη λογαριασμό;" : "Δεν έχεις λογαριασμό;";
    authModeToggle.textContent = enabled ? "Σύνδεση" : "Δημιούργησε λογαριασμό";
    showMessage(formMessage, "");
}

function showPasswordReset() {
    passwordRecoveryInProgress = true;
    authView.hidden = true;
    ticketsView.hidden = true;
    passwordResetView.hidden = false;
    resetLead.textContent = "Επίλεξε νέο κωδικό πρόσβασης τουλάχιστον 10 χαρακτήρων.";
    showMessage(resetMessage, demoMode ? "Demo reset is enabled. Use any password for testing." : "");
}

function statusLabel(status) {
    return {
        open: "Ανοιχτό",
        in_progress: "Σε εξέλιξη",
        resolved: "Επιλύθηκε",
        closed: "Κλειστό"
    }[status] ?? status;
}

function createStatusControl(ticket) {
    if (!isAdmin) {
        const label = document.createElement("span");
        label.className = "ticket-status";
        label.textContent = statusLabel(ticket.status);
        return label;
    }

    const select = document.createElement("select");
    select.className = "ticket-status";
    select.setAttribute("aria-label", `Κατάσταση ticket ${ticket.ticket_number}`);
    for (const [value, label] of [
        ["open", "Ανοιχτό"],
        ["in_progress", "Σε εξέλιξη"],
        ["resolved", "Επιλύθηκε"],
        ["closed", "Κλειστό"]
    ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === ticket.status;
        select.append(option);
    }

    select.addEventListener("change", async () => {
        const previousStatus = ticket.status;
        select.disabled = true;
        try {
            if (demoMode) {
                const tickets = getDemoTickets();
                const target = tickets.find(item => item.ticket_number === ticket.ticket_number);
                if (!target) throw new Error("Ticket not found.");

                target.status = select.value;
                target.updated_at = new Date().toISOString();
                saveDemoTickets(tickets);
            } else {
                const { error } = await supabase
                    .from("tickets")
                    .update({ status: select.value })
                    .eq("ticket_number", ticket.ticket_number);
                if (error) throw error;
            }

            ticket.status = select.value;
            showMessage(listMessage, `Η κατάσταση του ${ticket.ticket_number} ενημερώθηκε.`);
        } catch (error) {
            select.value = previousStatus;
            showError(listMessage, "Δεν ήταν δυνατή η αλλαγή κατάστασης. Δοκίμασε ξανά.", error);
        } finally {
            select.disabled = false;
        }
    });

    return select;
}

function renderTicket(ticket) {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const top = document.createElement("div");
    top.className = "ticket-card-top";

    const number = document.createElement("span");
    number.className = "ticket-number";
    number.textContent = `No= ${ticket.ticket_number}`;
    top.append(number, createStatusControl(ticket));

    const created = document.createElement("time");
    created.className = "ticket-date";
    created.dateTime = ticket.created_at;
    created.textContent = new Intl.DateTimeFormat("el-GR", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(ticket.created_at));

    const subject = document.createElement("h4");
    subject.className = "ticket-subject";
    subject.textContent = ticket.subject;

    const description = document.createElement("p");
    description.className = "ticket-description";
    description.textContent = ticket.description;

    card.append(top, created);
    if (isAdmin) {
        const requester = document.createElement("small");
        requester.className = "ticket-requester";
        requester.textContent = demoMode
            ? `Χρήστης: ${ticket.user_email}`
            : `Αναγνωριστικό χρήστη: ${ticket.user_id}`;
        card.append(requester);
    }
    card.append(subject, description);
    return card;
}

function loadDemoTickets() {
    const tickets = getDemoTickets();
    const visibleTickets = tickets.filter(ticket => {
        if (isAdmin) return true;
        return ticket.user_email === currentUser.email;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    ticketList.replaceChildren();
    if (visibleTickets.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-tickets";
        empty.textContent = "Δεν υπάρχουν αιτήματα ακόμη.";
        ticketList.append(empty);
    } else {
        ticketList.append(...visibleTickets.map(renderTicket));
    }
    showMessage(listMessage, "");
}

async function loadTickets() {
    if (demoMode) {
        showMessage(listMessage, "Φόρτωση αιτημάτων...");
        loadDemoTickets();
        return;
    }

    showMessage(listMessage, "Φόρτωση αιτημάτων...");
    let tickets;
    try {
        const { data, error } = await supabase
            .from("tickets")
            .select("ticket_number, user_id, subject, description, status, created_at")
            .order("created_at", { ascending: false });
        if (error) throw error;
        tickets = data;
    } catch (error) {
        showError(listMessage, "Δεν ήταν δυνατή η φόρτωση των αιτημάτων.", error);
        return;
    }

    ticketList.replaceChildren();
    if (tickets.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-tickets";
        empty.textContent = "Δεν υπάρχουν αιτήματα ακόμη.";
        ticketList.append(empty);
    } else {
        ticketList.append(...tickets.map(renderTicket));
    }
    showMessage(listMessage, "");
}

async function loadRegistrationNotifications() {
    if (!isAdmin || demoMode) {
        notificationSection.hidden = true;
        return;
    }

    notificationSection.hidden = false;
    showMessage(notificationMessage, "Φόρτωση ειδοποιήσεων...");
    try {
        const { data, error } = await supabase
            .from("notification_queue")
            .select("id, title, body, status, available_at, created_at")
            .in("status", ["pending", "processing", "failed"])
            .order("created_at", { ascending: false })
            .limit(20);
        if (error) throw error;

        notificationList.replaceChildren();
        if (!data || data.length === 0) {
            showMessage(notificationMessage, "Δεν υπάρχουν εκκρεμείς ειδοποιήσεις.");
            return;
        }

        for (const notification of data) {
            const card = document.createElement("article");
            card.className = "notification-card";

            const copy = document.createElement("div");
            copy.className = "notification-copy";
            const title = document.createElement("strong");
            title.textContent = notification.title;
            const body = document.createElement("small");
            body.textContent = notification.body;
            copy.append(title, body);

            const notifyButton = document.createElement("button");
            notifyButton.type = "button";
            notifyButton.className = "notification-button";
            notifyButton.textContent = "Σήμανση ως κοινοποιημένη";
            notifyButton.addEventListener("click", async () => {
                notifyButton.disabled = true;
                const { error: updateError } = await supabase
                    .from("notification_queue")
                    .update({
                        status: "sent",
                        sent_at: new Date().toISOString()
                    })
                    .eq("id", notification.id);
                if (updateError) {
                    showError(notificationMessage, "Δεν ήταν δυνατή η ενημέρωση της ειδοποίησης.", updateError);
                    notifyButton.disabled = false;
                    return;
                }
                await loadRegistrationNotifications();
            });

            card.append(copy, notifyButton);
            notificationList.append(card);
        }
        showMessage(notificationMessage, `${data.length} εκκρεμεί${data.length === 1 ? "ς ειδοποίηση" : "ς ειδοποιήσεις"}.`);
    } catch (error) {
        showError(notificationMessage, "Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.", error);
    }
}

async function showSession(session) {
    if (!session) {
        showLogin();
        return;
    }

    authView.hidden = true;
    passwordResetView.hidden = true;
    ticketsView.hidden = false;
    ticketList.replaceChildren();
    showMessage(listMessage, "Φόρτωση λογαριασμού...");

    if (demoMode) {
        const demoUser = session.user;
        currentUser = demoUser;
        isAdmin = Boolean(demoUser.isAdmin);
        accountLabel.textContent = demoUser.email ?? "";
        adminLabel.hidden = !isAdmin;
        ticketListTitle.textContent = isAdmin ? "Όλα τα αιτήματα" : "Τα αιτήματά σου";
        showMessage(formMessage, "");
        loadDemoTickets();
        return;
    }

    try {
        const { error: profileEnsureError } = await supabase.rpc("ensure_current_user_profile");
        if (profileEnsureError && profileEnsureError.code !== "PGRST202") {
            throw profileEnsureError;
        }

        const { data: profile, error } = await supabase
            .from("users")
            .select("is_admin, username")
            .eq("id", session.user.id)
            .maybeSingle();
        if (error) throw error;

        currentUser = session.user;
        isAdmin = profile?.is_admin === true;
        accountLabel.textContent = profile?.username
            ?? session.user.user_metadata?.username
            ?? session.user.email
            ?? "";
        adminLabel.hidden = !isAdmin;
        ticketListTitle.textContent = isAdmin ? "Όλα τα αιτήματα" : "Τα αιτήματά σου";
        showMessage(formMessage, "");
        await loadTickets();
        await loadRegistrationNotifications();
    } catch (error) {
        ticketsView.hidden = true;
        authView.hidden = false;
        showError(formMessage, "Δεν ήταν δυνατή η φόρτωση του προφίλ. Έλεγξε τη ρύθμιση της βάσης.", error);
    }
}

passwordToggle.addEventListener("click", () => {
    const showPassword = passwordInput.type === "password";
    passwordInput.type = showPassword ? "text" : "password";
    passwordToggle.setAttribute("aria-pressed", String(showPassword));
    passwordToggle.setAttribute("aria-label", showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού");
});

authModeToggle.addEventListener("click", () => {
    setSignUpMode(!isSignUpMode);
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = loginForm.querySelector('button[type="submit"]');
    const enteredIdentifier = accountIdentifierInput.value.trim();
    const normalizedIdentifier = enteredIdentifier.toLowerCase();
    const enteredPassword = passwordInput.value;

    if (demoMode) {
        const account = DEMO_ACCOUNTS[normalizedIdentifier];
        if (!account || account.password !== enteredPassword) {
            showError(formMessage, "Λάθος email ή κωδικός στο demo mode.", null);
            return;
        }

        submitButton.disabled = true;
        showMessage(formMessage, "Γίνεται σύνδεση...");
        const session = createDemoSession(normalizedIdentifier);
        session.user.isAdmin = account.isAdmin;
        await showSession(session);
        submitButton.disabled = false;
        return;
    }

    if (!supabase) {
        showMessage(formMessage, "Η υπηρεσία σύνδεσης δεν έχει ρυθμιστεί ακόμη.", true);
        return;
    }

    submitButton.disabled = true;
    showMessage(formMessage, isSignUpMode ? "Δημιουργία λογαριασμού..." : "Γίνεται σύνδεση...");
    try {
        if (isSignUpMode) {
            const username = normalizedIdentifier;
            if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
                showMessage(formMessage, "Το username πρέπει να έχει 3–32 χαρακτήρες: λατινικά γράμματα, αριθμούς, τελεία, _ ή -.", true);
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email: `${username}@users.auditlog.invalid`,
                password: enteredPassword,
                options: { data: { username } }
            });
            if (error) throw error;
            if (data.session) {
                await showSession(data.session);
            } else {
                showMessage(formMessage, "Η εγγραφή έγινε, αλλά δεν δημιουργήθηκε συνεδρία. Βεβαιώσου ότι το Confirm email είναι απενεργοποιημένο στο Supabase.", true);
            }
        } else {
            let session;
            if (normalizedIdentifier.includes("@")) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: enteredIdentifier,
                    password: enteredPassword
                });
                if (error) throw error;
                session = data.session;
            } else {
                const { data, error } = await supabase.functions.invoke("username-auth", {
                    body: {
                        action: "sign-in",
                        username: normalizedIdentifier,
                        password: enteredPassword
                    }
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

            await showSession(session);
        }
    } catch (error) {
        const signupErrorMessage = "Δεν ήταν δυνατή η εγγραφή. Έλεγξε το username και τον κωδικό σου.";
        showError(
            formMessage,
            isSignUpMode
                ? signupErrorMessage
                : "Η σύνδεση απέτυχε. Έλεγξε το username/email και τον κωδικό σου.",
            error
        );
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector("#recovery-button").addEventListener("click", async () => {
    if (!supabase && !demoMode) {
        showMessage(formMessage, "Η υπηρεσία επαναφοράς δεν έχει ρυθμιστεί ακόμη.", true);
        return;
    }
    const enteredIdentifier = accountIdentifierInput.value.trim();
    if (demoMode) {
        const demoEmail = enteredIdentifier.toLowerCase();
        if (!demoEmail) {
            showMessage(formMessage, "Συμπλήρωσε πρώτα το username ή email σου.", true);
            accountIdentifierInput.focus();
            return;
        }
        showMessage(formMessage, `Demo mode: χρησιμοποίησε τον demo κωδικό που αντιστοιχεί στο account ${demoEmail}.`);
        return;
    }

    if (!enteredIdentifier) {
        showMessage(formMessage, "Συμπλήρωσε πρώτα το email του λογαριασμού σου.", true);
        accountIdentifierInput.focus();
        return;
    }

    if (!enteredIdentifier.includes("@")) {
        showMessage(formMessage, "Οι λογαριασμοί username-only δεν έχουν αυτόματη επαναφορά. Επικοινώνησε με τον διαχειριστή.", true);
        return;
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(enteredIdentifier, {
            redirectTo: `${window.location.origin}${window.location.pathname}`
        });
        if (error) throw error;
        showMessage(formMessage, "Αν υπάρχει λογαριασμός με αυτό το email, θα σταλεί σύνδεσμος επαναφοράς.");
    } catch (error) {
        showError(formMessage, "Δεν ήταν δυνατή η έναρξη επαναφοράς κωδικού.", error);
    }
});

document.querySelector("#password-reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = document.querySelector("#new-password").value;
    const confirmPassword = document.querySelector("#confirm-password").value;
    if (newPassword !== confirmPassword) {
        showMessage(resetMessage, "Οι κωδικοί δεν ταιριάζουν.", true);
        return;
    }

    if (demoMode) {
        const userEmail = currentUser ? currentUser.email : accountIdentifierInput.value.trim().toLowerCase();
        if (!userEmail || !DEMO_ACCOUNTS[userEmail]) {
            showMessage(resetMessage, "Δεν βρέθηκε demo account για αυτό το email.", true);
            return;
        }

        DEMO_ACCOUNTS[userEmail].password = newPassword;
        showMessage(resetMessage, "Ο demo κωδικός ενημερώθηκε επιτυχώς.");
        setTimeout(() => {
            showLogin();
        }, 600);
        return;
    }

    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showMessage(resetMessage, "Ενημέρωση κωδικού...");
    try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;

        passwordRecoveryInProgress = false;
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        await showSession(data.session);
        showMessage(listMessage, "Ο κωδικός πρόσβασης ενημερώθηκε.");
    } catch (error) {
        showError(resetMessage, "Δεν ήταν δυνατή η ενημέρωση του κωδικού.", error);
    } finally {
        submitButton.disabled = false;
    }
});

ticketForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) {
        showMessage(createMessage, "Συνδέσου ξανά για να υποβάλεις αίτημα.", true);
        return;
    }

    const submitButton = ticketForm.querySelector('button[type="submit"]');
    const subject = ticketForm.elements.subject.value.trim();
    const description = ticketForm.elements.description.value.trim();
    if (!subject || !description) {
        showMessage(createMessage, "Συμπλήρωσε θέμα και περιγραφή.", true);
        return;
    }

    submitButton.disabled = true;
    showMessage(createMessage, "Υποβολή αιτήματος...");

    if (demoMode) {
        const ticket = {
            ticket_number: generateDemoTicketNumber(),
            user_email: currentUser.email,
            user_id: currentUser.id,
            subject,
            description,
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const list = getDemoTickets();
        list.unshift(ticket);
        saveDemoTickets(list);
        ticketForm.reset();
        showMessage(createMessage, `Το αίτημα καταχωρήθηκε με αριθμό No= ${ticket.ticket_number}.`);
        loadDemoTickets();
        submitButton.disabled = false;
        return;
    }

    try {
        const { data: ticket, error } = await supabase
            .from("tickets")
            .insert({ user_id: currentUser.id, subject, description })
            .select("ticket_number")
            .single();
        if (error) throw error;

        ticketForm.reset();
        showMessage(createMessage, `Το αίτημα καταχωρήθηκε με αριθμό No= ${ticket.ticket_number}.`);
        await loadTickets();
    } catch (error) {
        showError(createMessage, "Δεν ήταν δυνατή η υποβολή του ticket. Δοκίμασε ξανά.", error);
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector("#sign-out-button").addEventListener("click", async () => {
    if (demoMode) {
        currentUser = undefined;
        isAdmin = false;
        showLogin();
        return;
    }
    if (!supabase) return;
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        showLogin();
    } catch (error) {
        showError(listMessage, "Δεν ήταν δυνατή η αποσύνδεση.", error);
    }
});

async function initialize() {
    try {
        let config;
        try {
            config = await import("./config.js");
        } catch (error) {
            console.info("Supabase configuration not found, enabling demo mode.", error);
            enableDemoMode();
            return;
        }

        if (
            !config.SUPABASE_URL ||
            !config.SUPABASE_ANON_KEY ||
            config.SUPABASE_URL.includes("YOUR-PROJECT") ||
            config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
        ) {
            enableDemoMode();
            return;
        }

        const supabaseModule = await import("https://esm.sh/@supabase/supabase-js@2");
        supabase = supabaseModule.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
        supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") showPasswordReset();
            if (event === "SIGNED_OUT") showLogin();
        });

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (passwordRecoveryInProgress) return;
        await showSession(data.session);
    } catch (error) {
        showError(
            formMessage,
            "Δεν ήταν δυνατή η σύνδεση με το Supabase. Έλεγξε το config.js, το SQL setup και τη σύνδεση δικτύου.",
            error
        );
    } finally {
        loadingScreen.hidden = true;
    }
}

initialize();
