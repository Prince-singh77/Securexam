// ===============================
// HELPERS
// ===============================

function isLoginPage() {
    return document.body.classList.contains("login-page");
}


// ===============================
// LOGIN
// ===============================

async function login() {

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const message = document.getElementById("message");

    message.textContent = "";

    if (!email || !password) {
        message.textContent = "Please enter your email and password.";
        return;
    }

    try {

        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!data.success) {
            message.textContent = data.message || "Login failed.";
            return;
        }

        if (data.user.role !== role) {
            message.textContent = "This account is not registered as " + role + ".";
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

                const next = sessionStorage.getItem("afterLogin");
        sessionStorage.removeItem("afterLogin");

        if (next && next.startsWith("/") && !next.startsWith("//")) {
            window.location.href = next;
        } else {
                        window.location.href = data.user.role === "teacher" ? "dashboard.html" : "classes.html";
        }

    } catch (error) {
        message.textContent = "Cannot reach the server. Is it running?";
    }
}


// ===============================
// LOGOUT
// ===============================

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "index.html";
}


// ===============================
// NAVIGATION
// ===============================

function openAttendance() {
    window.location.href = "attendance.html";
}


// ===============================
// RUNS WHEN A PAGE LOADS
// ===============================

document.addEventListener("DOMContentLoaded", () => {

    // Login page: pressing Enter signs in
    if (isLoginPage()) {
        document.addEventListener("keydown", (event) => {
                         if (event.key === "Enter" && document.getElementById("email")) {
                  login();
              }
        });
        return;
    }

    // All other pages: must be logged in
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!token || !user) {
        sessionStorage.setItem("afterLogin", window.location.pathname + window.location.search);
        window.location.href = "index.html";
        return;
    }

    // Show the real user's details (only if the page has these places)
    const nameBox = document.getElementById("userName");
    const avatarBox = document.getElementById("avatar");
    const greetingBox = document.getElementById("greeting");

    if (nameBox) {
        nameBox.textContent = user.name;
    }

    if (avatarBox) {
        avatarBox.textContent = user.name
            .split(" ")
            .map((word) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    if (greetingBox) {
        const hour = new Date().getHours();
        const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        greetingBox.textContent = "Good " + part + ", " + user.name.split(" ")[0] + " 👋";
    }
});
// ===============================
// TALKING TO THE SERVER (sends your login token)
// ===============================

async function apiFetch(url, options = {}) {

    const token = localStorage.getItem("token");

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
            Authorization: "Bearer " + token
        }
    });

       if (response.status === 401) {
        logout();
        throw new Error("Session expired");
    }

    return response.json();
}


// Every protected page checks that the login is still valid
document.addEventListener("DOMContentLoaded", () => {
    if (!isLoginPage() && localStorage.getItem("token")) {
        apiFetch("/api/auth/me").catch(() => {});
    }
});// ===============================
// SHARED HELPERS FOR NEWER PAGES
// ===============================

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function showMessage(text, kind) {
    const box = document.getElementById("formMessage");
    if (!box) return;
    box.textContent = text;
    box.className = "form-message " + (kind || "");
}