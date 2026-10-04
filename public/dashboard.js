const dashUser = JSON.parse(localStorage.getItem("user") || "null");


function splitTime(value) {
    if (!value) return null;
    const parts = value.split(":").map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return {
        time: String(parts[0] % 12 === 0 ? 12 : parts[0] % 12).padStart(2, "0") + ":" + String(parts[1]).padStart(2, "0"),
        ap: parts[0] >= 12 ? "PM" : "AM"
    };
}


function renderClassRow(c) {

    const row = el("div", "class-row");

    const t = splitTime(c.startTime);
    const timeBox = el("div", "class-time", t ? t.time : "--:--");
    if (t) timeBox.appendChild(el("small", "", t.ap));
    row.appendChild(timeBox);

    const info = el("div", "class-info");
    info.appendChild(el("strong", "", c.name));
    info.appendChild(el("span", "", [c.department, c.room].filter(Boolean).join(" • ") || (c.total + " students")));
    row.appendChild(info);

    row.appendChild(el(
        "div",
        "attendance-pill",
        c.present === null ? "Not taken" : c.present + " / " + c.total
    ));

    const button = el("button", "outline-btn", "Attendance");
    button.addEventListener("click", () => {
        window.location.href = "attendance.html?classId=" + encodeURIComponent(c.id);
    });
    row.appendChild(button);

    return row;
}


function renderExamCard(e) {

    const card = el("div", "exam-card");
    const when = new Date(e.startsAt);

    const date = el("div", "exam-date");
    date.appendChild(el("strong", "", String(when.getDate()).padStart(2, "0")));
    date.appendChild(el("span", "", when.toLocaleString("en-US", { month: "short" }).toUpperCase()));
    card.appendChild(date);

    const info = el("div", "exam-info");
    info.appendChild(el("strong", "", e.title));
    info.appendChild(el("span", "", e.className));
    info.appendChild(el(
        "small",
        "",
        when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " • " +
        e.durationMinutes + " min • " + e.questionCount + " questions"
    ));
    card.appendChild(info);

    card.appendChild(el(
        "span",
        "status " + (e.status === "published" ? "scheduled" : "draft"),
        e.status === "published" ? "Scheduled" : "Draft"
    ));

    return card;
}


async function loadDashboard() {

    try {

        const data = await apiFetch("/api/dashboard/teacher");

        if (!data.success) return;

        document.getElementById("statClasses").textContent = data.activeClasses;
        document.getElementById("statClassesNote").textContent =
            data.studentCount + (data.studentCount === 1 ? " student enrolled" : " students enrolled");

        document.getElementById("statAttendance").textContent =
            data.attendancePercent === null ? "--" : data.attendancePercent + "%";
        document.getElementById("statAttendanceNote").textContent =
            data.attendancePercent === null
                ? "No attendance taken today"
                : data.presentToday + " of " + data.enrolledToday + " present";

        document.getElementById("statExams").textContent = data.upcomingCount;
        document.getElementById("statExamsNote").textContent =
            data.upcomingExams.length > 0
                ? "Next: " + new Date(data.upcomingExams[0].startsAt).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
                : "None scheduled";
                        document.getElementById("statAlerts").textContent = data.securityAlerts;
        document.getElementById("statAlertsNote").textContent =
            data.securityAlerts === 0 ? "No alerts this week" : "Students flagged this week";

        const classList = document.getElementById("todayClasses");
        classList.replaceChildren();

        if (data.classes.length === 0) {
            classList.appendChild(el("p", "empty-note", "No classes yet. Create one in My Classes."));
        } else {
            data.classes.forEach((c) => classList.appendChild(renderClassRow(c)));
        }

        const examList = document.getElementById("upcomingExams");
        examList.replaceChildren();

        if (data.upcomingExams.length === 0) {
            examList.appendChild(el("p", "empty-note", "No upcoming exams. Create one in Exams."));
        } else {
            data.upcomingExams.forEach((e) => examList.appendChild(renderExamCard(e)));
        }

    } catch (error) {
        // the numbers stay as they are
    }
}


if (dashUser) {
    if (dashUser.role !== "teacher") {
        window.location.href = "classes.html";
    } else {
        document.getElementById("todayLabel").textContent =
            new Date().toLocaleDateString("en-IN", {
                weekday: "long", day: "numeric", month: "long", year: "numeric"
            }).toUpperCase();

        loadDashboard();
    }
}