function toggleCode() {
    document.getElementById("codeBox").hidden =
        document.getElementById("regRole").value !== "teacher";
}


async function register() {

    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const role = document.getElementById("regRole").value;
    const inviteCode = document.getElementById("regCode").value;
    const message = document.getElementById("message");

    message.textContent = "";

    if (!name || !email || !password) {
        message.textContent = "Please fill in your name, email and password.";
        return;
    }

    if (password.length < 8) {
        message.textContent = "Your password must be at least 8 characters.";
        return;
    }

    try {

        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, role, inviteCode })
        });

        const data = await response.json();

        if (!data.success) {
            message.textContent = data.message || "Could not create the account.";
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        window.location.href = data.user.role === "teacher" ? "dashboard.html" : "classes.html";

    } catch (error) {
        message.textContent = "Cannot reach the server. Is it running?";
    }
}


document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        register();
    }
});