const currentUser = JSON.parse(localStorage.getItem("user") || "null");

const STATE_PILLS = {
    open: ["good", "Open now"],
    upcoming: ["", "Upcoming"],
    in_progress: ["warn", "In progress"],
    submitted: ["good", "Submitted"],
    missed: ["warn", "Missed"]
};


function formatWhen(value) {
    return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}


function renderExam(e) {

    const card = el("div", "q-card");

    const pill = STATE_PILLS[e.state] || ["", e.state];
    const head = el("div", "q-head");
    head.appendChild(el("span", "q-text", e.title));
    head.appendChild(el("span", "pill " + pill[0], pill[1]));
    card.appendChild(head);

    card.appendChild(el(
        "p",
        "q-meta",
        e.className + " • " + formatWhen(e.startsAt) + " • " + e.durationMinutes + " min • " +
        e.questionCount + (e.questionCount === 1 ? " question" : " questions") + " • " +
        e.totalMarks + (e.totalMarks === 1 ? " mark" : " marks")
    ));

    const actions = el("div", "row-actions");

    if (e.state === "open") {
        const button = el("button", "primary-btn compact", "Start exam");
        button.addEventListener("click", () => {
            if (confirm("Start this exam now? The timer starts immediately and cannot be paused.")) {
                window.location.href = "take.html?examId=" + encodeURIComponent(e.id);
            }
        });
        actions.appendChild(button);

    } else if (e.state === "in_progress") {
        const button = el("button", "primary-btn compact", "Resume exam");
        button.addEventListener("click", () => {
            window.location.href = "take.html?examId=" + encodeURIComponent(e.id);
        });
        actions.appendChild(button);

    } else if (e.state === "upcoming") {
        actions.appendChild(el("span", "q-meta", "Opens " + formatWhen(e.startsAt)));

    } else if (e.state === "missed") {
        actions.appendChild(el("span", "q-meta", "The time to start this exam has passed."));

    } else if (e.state === "submitted") {
        actions.appendChild(el("span", "q-text", "Score: " + e.score + " / " + e.totalMarks));
    }

    card.appendChild(actions);

    return card;
}


async function loadExams() {

    const list = document.getElementById("examList");

    try {

        const data = await apiFetch("/api/my-exams");

        if (!data.success) {
            showMessage(data.message || "Could not load your exams.", "error");
            return;
        }

        list.replaceChildren();

        if (data.exams.length === 0) {
            list.appendChild(el(
                "p",
                "empty-note",
                "No exams yet. When a teacher publishes an exam for your class, it appears here."
            ));
            return;
        }

        data.exams.forEach((e) => list.appendChild(renderExam(e)));

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


if (currentUser) {
    if (currentUser.role !== "student") {
        window.location.href = "dashboard.html";
    } else {
        loadExams();
        setInterval(loadExams, 20000);
    }
}