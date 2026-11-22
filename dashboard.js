import { initializeSupabase } from "./supabase-client.js";

const loadingScreen = document.querySelector("#dashboard-loading");
const errorScreen = document.querySelector("#dashboard-error");
const errorCopy = document.querySelector("#dashboard-error-copy");
const dashboardApp = document.querySelector("#dashboard-app");
const dashboardAlert = document.querySelector("#dashboard-alert");
const ticketList = document.querySelector("#ticket-list");
const ticketForm = document.querySelector("#ticket-form");
const ticketSubject = document.querySelector("#ticket-subject");
const ticketDescription = document.querySelector("#ticket-description");
const createMessage = document.querySelector("#create-message");
const notificationSection = document.querySelector("#notification-section");
const notificationList = document.querySelector("#notification-list");
const notificationMessage = document.querySelector("#notification-message");
const notificationCount = document.querySelector("#notification-count");
const filterButtons = [...document.querySelectorAll("[data-ticket-filter]")];
const searchInput = document.querySelector("#ticket-search");
const sidebar = document.querySelector("#sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const toast = document.querySelector("#dashboard-toast");

const DEMO_SESSION_STORAGE_KEY = "justice-demo-session-v1";
const DEMO_TICKETS_STORAGE_KEY = "demo-ticket-system-tickets-v1";
const TICKET_STATUSES = [
    ["open", "Ανοιχτό"],
    ["in_progress", "Σε εξέλιξη"],
    ["resolved", "Επιλύθηκε"],
    ["closed", "Κλειστό"]
];

let supabase;
let demoMode = false;
let currentUser;
let profile;
let isAdmin = false;
let tickets = [];
let activeFilter = "all";
let toastTimeout;

function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.dataset.error = String(isError);
}

function setDashboardAlert(message = "") {
    dashboardAlert.textContent = message;
    dashboardAlert.hidden = !message;
}

function showToast(message, isError = false) {
    window.clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.dataset.error = String(isError);
    toast.hidden = false;
    toastTimeout = window.setTimeout(() => {
        toast.hidden = true;
    }, 3500);
}

function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return "Άγνωστη ημερομηνία";
    return new Intl.DateTimeFormat("el-GR", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function ticketStatusLabel(status) {
    return TICKET_STATUSES.find(([value]) => value === status)?.[1] ?? status ?? "Άγνωστη";
}

function ticketStatusClass(status) {
    return {
        open: "status-open",
        in_progress: "status-in-progress",
        resolved: "status-resolved",
        closed: "status-closed"
    }[status] ?? "status-unknown";
}

function initialsFor(value) {
    const parts = value.trim().split(/[\s._-]+/).filter(Boolean);
    return parts.slice(0, 2).map(part => [...part][0]).join("").toUpperCase() || "U";
}

function setAccountDetails() {
    const accountName = profile?.username
        ?? currentUser?.username
        ?? currentUser?.name
        ?? currentUser?.user_metadata?.username
        ?? currentUser?.email
        ?? "Χρήστης";
    const roleLabel = isAdmin ? "Διαχειριστής" : "Μέλος";

    document.querySelector("#greeting-name").textContent = accountName;
    document.querySelector("#sidebar-username").textContent = accountName;
    document.querySelector("#sidebar-role").textContent = roleLabel;
    document.querySelector("#sidebar-avatar").textContent = initialsFor(accountName);
    document.querySelector("#tickets-title").textContent = isAdmin ? "Όλα τα αιτήματα" : "Τα αιτήματά μου";
    document.querySelector("#dashboard-intro").textContent = isAdmin
        ? "Διαχειρίσου τα αιτήματα και τις εγγραφές της κοινότητας."
        : "Παρακολούθησε τα αιτήματά σου και μείνε ενημερωμένος για την εξέλιξή τους.";
}

function getDemoSession() {
    const rawSession = localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!rawSession) return null;

    try {
        const session = JSON.parse(rawSession);
        if (typeof session?.id === "string" && typeof session?.email === "string") return session;
    } catch (error) {
        console.error("Could not read the saved demo session.", error);
    }

    localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    return null;
}

function getDemoTickets() {
    const rawTickets = localStorage.getItem(DEMO_TICKETS_STORAGE_KEY);
    if (!rawTickets) return [];

    const savedTickets = JSON.parse(rawTickets);
    if (!Array.isArray(savedTickets)) throw new Error("Saved demo tickets have an invalid format.");
    return savedTickets;
}

function saveDemoTickets(savedTickets) {
    localStorage.setItem(DEMO_TICKETS_STORAGE_KEY, JSON.stringify(savedTickets));
}

function makeEmptyState(title, message) {
    const state = document.createElement("div");
    state.className = "empty-state";

    const icon = document.createElement("span");
    icon.className = "empty-state-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v3a3 3 0 0 0 0 6v3a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18v-3a3 3 0 0 0 0-6V6A1.5 1.5 0 0 1 5 4.5Z" stroke="currentColor" stroke-width="1.5"/><path d="M12 8v1m0 3v1m0 3v.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = message;
    state.append(icon, heading, copy);
    return state;
}

async function updateTicketStatus(ticket, select) {
    const previousStatus = ticket.status;
    select.disabled = true;

    try {
        if (demoMode) {
            const savedTickets = getDemoTickets();
            const target = savedTickets.find(item => item.ticket_number === ticket.ticket_number);
            if (!target) throw new Error("Ticket not found.");
            target.status = select.value;
            target.updated_at = new Date().toISOString();
            saveDemoTickets(savedTickets);
        } else {
            const { error } = await supabase
                .from("tickets")
                .update({ status: select.value })
                .eq("ticket_number", ticket.ticket_number);
            if (error) throw error;
        }

        ticket.status = select.value;
        ticket.updated_at = new Date().toISOString();
        renderDashboardData();
        showToast(`Η κατάσταση του ${ticket.ticket_number} ενημερώθηκε.`);
    } catch (error) {
        console.error("Ticket status update failed.", error);
        select.value = previousStatus;
        showToast("Δεν ήταν δυνατή η αλλαγή κατάστασης. Δοκίμασε ξανά.", true);
    } finally {
        select.disabled = false;
    }
}

function createStatusControl(ticket) {
    if (!isAdmin) {
        const badge = document.createElement("span");
        badge.className = `ticket-status ${ticketStatusClass(ticket.status)}`;
        badge.textContent = ticketStatusLabel(ticket.status);
        return badge;
    }

    const select = document.createElement("select");
    select.className = "ticket-status-select";
    select.setAttribute("aria-label", `Κατάσταση ticket ${ticket.ticket_number}`);
    for (const [value, label] of TICKET_STATUSES) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === ticket.status;
        select.append(option);
    }
    select.addEventListener("change", () => updateTicketStatus(ticket, select));
    return select;
}

function renderTicket(ticket) {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const main = document.createElement("div");
    main.className = "ticket-card-main";

    const heading = document.createElement("div");
    heading.className = "ticket-card-heading";
    const number = document.createElement("span");
    number.className = "ticket-number";
    number.textContent = `No ${ticket.ticket_number}`;
    heading.append(number);

    const subject = document.createElement("h3");
    subject.textContent = ticket.subject;

    const description = document.createElement("p");
    description.className = "ticket-description";
    description.textContent = ticket.description;

    const meta = document.createElement("div");
    meta.className = "ticket-meta";
    const date = document.createElement("time");
    date.dateTime = ticket.created_at ?? "";
    date.textContent = formatDate(ticket.created_at);
    const dateLabel = document.createElement("span");
    dateLabel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dateLabel.append(date);
    meta.append(dateLabel);

    if (isAdmin && demoMode && ticket.user_email) {
        const requester = document.createElement("span");
        requester.textContent = `Χρήστης: ${ticket.user_email}`;
        meta.append(requester);
    }

    main.append(heading, subject, description, meta);
    card.append(main, createStatusControl(ticket));
    return card;
}

function getVisibleTickets() {
    const query = searchInput.value.trim().toLocaleLowerCase("el");
    return tickets.filter(ticket => {
        const matchesFilter = activeFilter === "all"
            || (activeFilter === "open" && ticket.status === "open")
            || (activeFilter === "in_progress" && ticket.status === "in_progress")
            || (activeFilter === "resolved" && ["resolved", "closed"].includes(ticket.status));
        if (!matchesFilter) return false;
        if (!query) return true;
        return `${ticket.ticket_number} ${ticket.subject} ${ticket.description}`
            .toLocaleLowerCase("el")
            .includes(query);
    });
}

function renderTickets() {
    const visibleTickets = getVisibleTickets();
    document.querySelector("#ticket-count").textContent =
        `${visibleTickets.length} ${visibleTickets.length === 1 ? "αίτημα" : "αιτήματα"}`;

    ticketList.replaceChildren();
    if (visibleTickets.length === 0) {
        const hasTickets = tickets.length > 0;
        ticketList.append(makeEmptyState(
            hasTickets ? "Δεν βρέθηκαν αιτήματα" : "Δεν υπάρχουν αιτήματα ακόμη",
            hasTickets
                ? "Δοκίμασε διαφορετικό φίλτρο ή όρο αναζήτησης."
                : "Όταν υποβάλεις νέο αίτημα, θα εμφανιστεί εδώ."
        ));
        return;
    }
    ticketList.append(...visibleTickets.map(renderTicket));
}

function renderDashboardData() {
    const openCount = tickets.filter(ticket => ["open", "in_progress"].includes(ticket.status)).length;
    const resolvedCount = tickets.filter(ticket => ["resolved", "closed"].includes(ticket.status)).length;
    document.querySelector("#stat-total").textContent = String(tickets.length);
    document.querySelector("#stat-open").textContent = String(openCount);
    document.querySelector("#stat-resolved").textContent = String(resolvedCount);
    renderTickets();
}

async function loadTickets() {
    let loadedTickets;
    if (demoMode) {
        loadedTickets = getDemoTickets();
        loadedTickets = loadedTickets.filter(ticket =>
            isAdmin || ticket.user_email === currentUser.email
        );
    } else {
        const { data, error } = await supabase
            .from("tickets")
            .select("ticket_number, user_id, subject, description, status, created_at, updated_at")
            .order("created_at", { ascending: false });
        if (error) throw error;
        loadedTickets = data ?? [];
    }

    tickets = loadedTickets.sort((first, second) =>
        new Date(second.created_at).valueOf() - new Date(first.created_at).valueOf()
    );
    renderDashboardData();
}

function createNotificationCard(notification) {
    const card = document.createElement("article");
    card.className = "notification-item";

    const title = document.createElement("strong");
    title.textContent = notification.title;
    const body = document.createElement("p");
    body.className = "notification-body";
    body.textContent = notification.body;
    const date = document.createElement("time");
    date.dateTime = notification.created_at;
    date.textContent = formatDate(notification.created_at);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Σήμανση ως κοινοποιημένη";
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            const { error } = await supabase
                .from("notification_queue")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", notification.id);
            if (error) throw error;
            showMessage(notificationMessage, "Η ειδοποίηση σημάνθηκε ως κοινοποιημένη.");
            showToast("Η εγγραφή σημάνθηκε ως κοινοποιημένη.");
            await loadRegistrationNotifications();
        } catch (error) {
            console.error("Notification update failed.", error);
            showMessage(notificationMessage, "Δεν ήταν δυνατή η ενημέρωση της ειδοποίησης.", true);
            button.disabled = false;
        }
    });

    card.append(title, body, date, button);
    return card;
}

async function loadRegistrationNotifications() {
    if (!isAdmin || demoMode) {
        notificationSection.hidden = true;
        return;
    }

    notificationSection.hidden = false;
    try {
        const { data, error } = await supabase
            .from("notification_queue")
            .select("id, title, body, status, available_at, created_at")
            .in("status", ["pending", "processing", "failed"])
            .order("created_at", { ascending: false })
            .limit(20);
        if (error) throw error;

        const notifications = data ?? [];
        notificationCount.textContent = String(notifications.length);
        notificationList.replaceChildren();
        if (notifications.length === 0) {
            const empty = document.createElement("div");
            empty.className = "notification-empty";
            empty.textContent = "Δεν υπάρχουν εκκρεμείς εγγραφές.";
            notificationList.append(empty);
            showMessage(notificationMessage, "");
            return;
        }

        notificationList.append(...notifications.map(createNotificationCard));
        showMessage(notificationMessage, `${notifications.length} εκκρεμείς ειδοποιήσεις.`);
    } catch (error) {
        console.error("Registration notification loading failed.", error);
        showMessage(notificationMessage, "Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.", true);
    }
}

function closeSidebar() {
    sidebar.classList.remove("is-open");
    sidebarToggle.setAttribute("aria-expanded", "false");
    sidebarToggle.setAttribute("aria-label", "Άνοιγμα πλοήγησης");
    sidebarBackdrop.hidden = true;
}

sidebarToggle.addEventListener("click", () => {
    const open = !sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open", open);
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebarToggle.setAttribute("aria-label", open ? "Κλείσιμο πλοήγησης" : "Άνοιγμα πλοήγησης");
    sidebarBackdrop.hidden = !open;
});

sidebarBackdrop.addEventListener("click", closeSidebar);

document.querySelectorAll(".sidebar-nav .nav-link").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".sidebar-nav .nav-link").forEach(item => item.classList.remove("is-active"));
        link.classList.add("is-active");
        closeSidebar();
    });
});

filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        activeFilter = button.dataset.ticketFilter;
        filterButtons.forEach(item => item.classList.toggle("is-active", item === button));
        renderTickets();
    });
});

searchInput.addEventListener("input", renderTickets);

document.querySelector("#refresh-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setDashboardAlert("");
    try {
        await Promise.all([loadTickets(), loadRegistrationNotifications()]);
        showToast("Τα δεδομένα ανανεώθηκαν.");
    } catch (error) {
        console.error("Dashboard refresh failed.", error);
        setDashboardAlert("Δεν ήταν δυνατή η ανανέωση των δεδομένων. Δοκίμασε ξανά.");
    } finally {
        button.disabled = false;
    }
});

ticketForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage(createMessage, "");
    const subject = ticketSubject.value.trim();
    const description = ticketDescription.value.trim();
    if (!subject || !description) {
        showMessage(createMessage, "Συμπλήρωσε το θέμα και την περιγραφή.", true);
        return;
    }

    const submitButton = document.querySelector("#ticket-submit");
    submitButton.disabled = true;
    try {
        if (demoMode) {
            const savedTickets = getDemoTickets();
            const rawNumber = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            savedTickets.unshift({
                ticket_number: `1-${rawNumber.replace(/[^0-9]/g, "").slice(-16)}`,
                user_email: currentUser.email,
                user_id: currentUser.id,
                subject,
                description,
                status: "open",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            saveDemoTickets(savedTickets);
        } else {
            const { data, error } = await supabase
                .from("tickets")
                .insert({ user_id: currentUser.id, subject, description })
                .select("ticket_number")
                .single();
            if (error) throw error;
            showMessage(createMessage, `Το αίτημα καταχωρήθηκε με αριθμό No ${data.ticket_number}.`);
        }

        ticketForm.reset();
        await loadTickets();
        showToast("Το αίτημά σου καταχωρήθηκε με επιτυχία.");
    } catch (error) {
        console.error("Ticket creation failed.", error);
        showMessage(createMessage, "Δεν ήταν δυνατή η υποβολή του αιτήματος. Δοκίμασε ξανά.", true);
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector("#sign-out-button").addEventListener("click", async () => {
    if (demoMode) {
        localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
        window.location.replace("./");
        return;
    }

    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.replace("./");
    } catch (error) {
        console.error("Sign out failed.", error);
        showToast("Δεν ήταν δυνατή η αποσύνδεση. Δοκίμασε ξανά.", true);
    }
});

document.querySelector("#retry-button").addEventListener("click", () => window.location.reload());

async function initialize() {
    try {
        const result = await initializeSupabase();
        supabase = result.client;
        demoMode = result.demoMode;

        if (demoMode) {
            currentUser = getDemoSession();
            if (!currentUser) {
                window.location.replace("./");
                return;
            }
            isAdmin = currentUser.isAdmin === true;
            profile = { username: currentUser.username };
        } else {
            supabase.auth.onAuthStateChange((event) => {
                if (event === "SIGNED_OUT") window.location.replace("./");
            });

            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            if (!data.session) {
                window.location.replace("./");
                return;
            }
            currentUser = data.session.user;

            const { error: ensureError } = await supabase.rpc("ensure_current_user_profile");
            if (ensureError && ensureError.code !== "PGRST202") throw ensureError;

            const { data: userProfile, error: profileError } = await supabase
                .from("users")
                .select("is_admin, username")
                .eq("id", currentUser.id)
                .maybeSingle();
            if (profileError) throw profileError;
            profile = userProfile;
            isAdmin = userProfile?.is_admin === true;
        }

        setAccountDetails();
        dashboardApp.hidden = false;
        loadingScreen.hidden = true;
        const ticketsLoad = loadTickets().catch(error => {
            console.error("Ticket loading failed.", error);
            setDashboardAlert("Δεν ήταν δυνατή η φόρτωση των αιτημάτων. Δοκίμασε ανανέωση.");
            if (ticketList.querySelector(".ticket-skeleton")) {
                ticketList.replaceChildren(makeEmptyState(
                    "Δεν φορτώθηκαν τα αιτήματα",
                    "Έλεγξε τη σύνδεσή σου και χρησιμοποίησε την ανανέωση."
                ));
            }
        });
        await Promise.all([ticketsLoad, loadRegistrationNotifications()]);
    } catch (error) {
        console.error("Dashboard initialization failed.", error);
        loadingScreen.hidden = true;
        errorCopy.textContent = "Δεν ήταν δυνατή η φόρτωση του λογαριασμού ή των δεδομένων. Δοκίμασε ξανά.";
        errorScreen.hidden = false;
    }
}

initialize();
