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

let supabase;
let currentUser;
let isAdmin = false;
let passwordRecoveryInProgress = false;

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.dataset.error = String(isError);
}

function showError(element, message, error) {
    console.error(message, error);
    showMessage(element, message, true);
}

function showLogin() {
    currentUser = undefined;
    isAdmin = false;
    passwordRecoveryInProgress = false;
    passwordResetView.hidden = true;
    ticketsView.hidden = true;
    authView.hidden = false;
    ticketList.replaceChildren();
    showMessage(formMessage, "");
}

function showPasswordReset() {
    passwordRecoveryInProgress = true;
    authView.hidden = true;
    ticketsView.hidden = true;
    passwordResetView.hidden = false;
    showMessage(resetMessage, "");
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
            const { error } = await supabase
                .from("tickets")
                .update({ status: select.value })
                .eq("ticket_number", ticket.ticket_number);
            if (error) throw error;

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
        requester.textContent = `Αναγνωριστικό χρήστη: ${ticket.user_id}`;
        card.append(requester);
    }
    card.append(subject, description);
    return card;
}

async function loadTickets() {
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
    passwordToggle.setAttribute("aria-label", showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού");
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase) {
        showMessage(formMessage, "Η υπηρεσία σύνδεσης δεν έχει ρυθμιστεί ακόμη.", true);
        return;
    }

    const submitButton = loginForm.querySelector('button[type="submit"]');
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
    if (!supabase) {
        showMessage(formMessage, "Η υπηρεσία επαναφοράς δεν έχει ρυθμιστεί ακόμη.", true);
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
    if (!supabase || !currentUser) {
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
        const [supabaseModule, config] = await Promise.all([
            import("https://esm.sh/@supabase/supabase-js@2"),
            import("./config.js")
        ]);
        if (
            !config.SUPABASE_URL ||
            !config.SUPABASE_ANON_KEY ||
            config.SUPABASE_URL.includes("YOUR-PROJECT") ||
            config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
        ) {
            throw new Error("Supabase URL or anon key is not configured.");
        }

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
    }
}

initialize();
