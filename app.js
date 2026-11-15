const authView = document.querySelector("#auth-view");
const passwordResetView = document.querySelector("#password-reset-view");
const ticketsView = document.querySelector("#tickets-view");
const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const formMessage = document.querySelector("#form-message");
const resetMessage = document.querySelector("#reset-message");
const createMessage = document.querySelector("#create-message");
const listMessage = document.querySelector("#list-message");
const ticketList = document.querySelector("#ticket-list");
const ticketForm = document.querySelector("#ticket-form");
const adminLabel = document.querySelector("#admin-label");
const accountLabel = document.querySelector("#account-label");
const ticketListTitle = document.querySelector("#ticket-list-title");

const DEMO_ACCOUNTS = {
    "admin@demo.local": { password: "DemoAdmin123!", isAdmin: true, name: "Demo Admin" },
    "user@demo.local": { password: "DemoUser123!", isAdmin: false, name: "Demo User" }
};
const DEMO_TICKETS_STORAGE_KEY = "demo-ticket-system-tickets-v1";

let supabase;
let currentUser;
let isAdmin = false;
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
    passwordResetView.hidden = true;
    ticketsView.hidden = true;
    authView.hidden = false;
    ticketList.replaceChildren();
    showMessage(formMessage, demoMode ? "Demo mode active. Use admin@demo.local / DemoAdmin123! or user@demo.local / DemoUser123!" : "");
}

function showPasswordReset() {
    passwordRecoveryInProgress = true;
    authView.hidden = true;
    ticketsView.hidden = true;
    passwordResetView.hidden = false;
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

    select.addEventListener("change", () => {
        const previousStatus = ticket.status;
        select.disabled = true;
        try {
            const tickets = getDemoTickets();
            const target = tickets.find(item => item.ticket_number === ticket.ticket_number);
            if (!target) throw new Error("Ticket not found.");

            target.status = select.value;
            target.updated_at = new Date().toISOString();
            saveDemoTickets(tickets);
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
        requester.textContent = `Χρήστης: ${ticket.user_email}`;
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

async function showSession(session) {
    if (!session) {
        showLogin();
        return;
    }

    authView.hidden = true;
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
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", session.user.id)
            .single();
        if (error) throw error;

        currentUser = session.user;
        isAdmin = profile.is_admin === true;
        accountLabel.textContent = session.user.email ?? "";
        adminLabel.hidden = !isAdmin;
        ticketListTitle.textContent = isAdmin ? "Όλα τα αιτήματα" : "Τα αιτήματά σου";
        showMessage(formMessage, "");
        await loadTickets();
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
    passwordToggle.textContent = showPassword ? "Απόκρυψη" : "Εμφάνιση";
    passwordToggle.setAttribute("aria-label", showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού");
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = loginForm.querySelector('button[type="submit"]');
    const enteredEmail = emailInput.value.trim().toLowerCase();
    const enteredPassword = passwordInput.value;

    if (demoMode) {
        const account = DEMO_ACCOUNTS[enteredEmail];
        if (!account || account.password !== enteredPassword) {
            showError(formMessage, "Λάθος email ή κωδικός στο demo mode.", null);
            return;
        }

        submitButton.disabled = true;
        showMessage(formMessage, "Γίνεται σύνδεση...");
        const session = createDemoSession(enteredEmail);
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
    showMessage(formMessage, "Γίνεται σύνδεση...");
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });
        if (error) throw error;
        await showSession(data.session);
    } catch (error) {
        showError(formMessage, "Η σύνδεση απέτυχε. Έλεγξε το email και τον κωδικό σου.", error);
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector("#recovery-button").addEventListener("click", async () => {
    if (!supabase && !demoMode) {
        showMessage(formMessage, "Η υπηρεσία επαναφοράς δεν έχει ρυθμιστεί ακόμη.", true);
        return;
    }
    if (demoMode) {
        const email = emailInput.value.trim().toLowerCase();
        if (!email) {
            showMessage(formMessage, "Συμπλήρωσε πρώτα το email σου.", true);
            emailInput.focus();
            return;
        }
        showMessage(formMessage, `Demo mode: ο λογαριασμός ${email} έχει προσωρινή επαναφορά κωδικού. Για δοκιμή χρησιμοποιήστε το demo password που αντιστοιχεί στο account.`);
        return;
    }
    if (!emailInput.reportValidity()) {
        emailInput.focus();
        return;
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(emailInput.value.trim(), {
            redirectTo: window.location.origin
        });
        if (error) throw error;
        showMessage(formMessage, "Αν υπάρχει λογαριασμός με αυτό το email, θα σταλεί σύνδεσμος επαναφοράς.");
    } catch (error) {
        showError(formMessage, "Δεν ήταν δυνατή η αποστολή email επαναφοράς.", error);
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
        const userEmail = currentUser ? currentUser.email : emailInput.value.trim().toLowerCase();
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
            .insert({ subject, description })
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
        const config = await import("./config.js");
        if (
            config.SUPABASE_URL &&
            config.SUPABASE_ANON_KEY &&
            !config.SUPABASE_URL.includes("YOUR-PROJECT") &&
            !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
        ) {
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
            return;
        }
    } catch (error) {
        console.info("Supabase configuration not found, enabling demo mode.", error);
    }

    demoMode = true;
    showLogin();
}

initialize();
