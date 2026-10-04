const currentUser = JSON.parse(localStorage.getItem("user") || "null");

const EVENT_LABEL = {
    tab_hidden: "Switched tab or minimised the window",
    window_blur: "Left the exam window",
    fullscreen_exit: "Exited full screen",
    copy: "Tried to copy",
    cut: "Tried to cut",
    paste: "Tried to paste",
    context_menu: "Tried to right-click",
    resumed: "Reopened or refreshed the exam page"
};

const LEVEL_PILL = {
    high: ["bad", "High concern"],
    medium: ["warn", "Warnings"],
    low: ["", "Minor"],
    clean: ["good", "Clean"]
};


async function loadExamList() {

    const select = document.getElementById("examSelect");

    try {

        const data = await apiFetch("/api/exams");

        select.replaceChildren();

        if (!data.success || data.exams.length === 0) {
            const option = document.createElement("option");
            option.textContent = "No exams yet";
            select.appendChild(option);
            showMessage("Create and publish an exam first. Reports appear after students take it.", "");
            return;
        }

        data.exams.forEach((exam) => {
            const option = document.createElement("option");
            option.value = exam.id;
            option.textContent = exam.title + " • " + exam.className + " • " +
                new Date(exam.startsAt).toLocaleDateString([], { dateStyle: "medium" });
            select.appendChild(option);
        });

        const wanted = new URLSearchParams(window.location.search).get("examId");
        if (wanted) select.value = wanted;

        loadReport();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


function renderStudent(s) {

    const card = el("div", "q-card");

    const pill = LEVEL_PILL[s.level] || ["", s.level];
    const head = el("div", "q-head");
    head.appendChild(el("span", "q-text", s.name));
    head.appendChild(el("span", "pill " + pill[0], pill[1]));

    if (s.submitReason === "violations") {
        head.appendChild(el("span", "pill bad", "Auto-submitted"));
    }

    card.appendChild(head);

    card.appendChild(el(
        "p",
        "q-meta",
        s.email + " • " + s.major + (s.major === 1 ? " warning" : " warnings") + " • " +
        s.minor + " blocked " + (s.minor === 1 ? "action" : "actions") + " • " +
        s.resumed + (s.resumed === 1 ? " page reopen" : " page reopens")
    ));

    if (s.timeline.length > 0) {

        const details = el("details", "event-log");
        details.appendChild(el("summary", "", "Show timeline (" + s.timeline.length + ")"));

        const list = document.createElement("ul");

        s.timeline.forEach((e) => {
            list.appendChild(el(
                "li",
                "",
                new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
                " - " + (EVENT_LABEL[e.type] || e.type)
            ));
        });

        details.appendChild(list);
        card.appendChild(details);
    }

    return card;
}


async function loadReport() {

    const id = document.getElementById("examSelect").value;

    if (!id) return;

    try {

        const data = await apiFetch("/api/reports/exam/" + encodeURIComponent(id) + "/security");

        if (!data.success) {
            showMessage(data.message || "Could not load the report.", "error");
            return;
        }

        showMessage("", "");

        document.getElementById("reportArea").hidden = false;
        document.getElementById("sAttempts").textContent = data.summary.attempts;
        document.getElementById("sFlagged").textContent = data.summary.flagged;
        document.getElementById("sAuto").textContent = data.summary.autoSubmitted;
        document.getElementById("sEvents").textContent = data.summary.totalEvents;

        const list = document.getElementById("studentList");
        list.replaceChildren();

        if (data.students.length === 0) {
            list.appendChild(el("p", "empty-note", "No student has started this exam yet."));
            return;
        }

        data.students.forEach((s) => list.appendChild(renderStudent(s)));

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


if (currentUser) {
    if (currentUser.role !== "teacher") {
        window.location.href = "classes.html";
    } else {
        loadExamList();
    }
}