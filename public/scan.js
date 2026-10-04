const scanUser = JSON.parse(localStorage.getItem("user") || "null");


function showResult(icon, title, text) {
    document.getElementById("scanIcon").textContent = icon;
    document.getElementById("scanTitle").textContent = title;
    document.getElementById("scanText").textContent = text;
}


async function markAttendance() {

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("s");
    const token = params.get("t");

    if (!sessionId || !token) {
        showResult("⚠️", "Invalid QR code", "This link is incomplete. Please scan the QR code on your teacher's screen again.");
        return;
    }

    if (scanUser.role !== "student") {
        showResult("⚠️", "Students only", "Only student accounts can mark attendance. Sign in with a student account.");
        return;
    }

    try {

        const data = await apiFetch("/api/attendance/mark", {
            method: "POST",
            body: JSON.stringify({ sessionId: sessionId, token: token })
        });

        if (!data.success) {
            showResult("⚠️", "Could not mark attendance", data.message || "Something went wrong.");
            return;
        }

        if (data.alreadyMarked) {
            showResult("✅", "Already marked", "You are already marked present in " + data.className + ".");
            return;
        }

        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        showResult("✅", "Attendance marked", "You are present in " + data.className + " at " + time + ".");

    } catch (error) {
        showResult("⚠️", "Cannot reach the server", "Check your Wi-Fi connection and scan the QR code again.");
    }
}


if (scanUser) {
    markAttendance();
}