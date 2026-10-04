const takeUser = JSON.parse(localStorage.getItem("user") || "null");
const examId = new URLSearchParams(window.location.search).get("examId");

const MAJOR_EVENTS = ["tab_hidden", "window_blur", "fullscreen_exit"];
const canFullscreen = !!document.documentElement.requestFullscreen;

const EVENT_TEXT = {
    tab_hidden: "You left the exam tab.",
    window_blur: "You left the exam window.",
    fullscreen_exit: "You exited full screen."
};

let questions = [];
let answers = [];
let current = 0;
let deadlineMs = 0;
let clockOffset = 0;
let timerId = null;
let active = false;
let finished = false;
let submitting = false;
let pendingWarning = null;
const lastMinorAt = {};


function nowMs() {
    return Date.now() + clockOffset;
}

function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return hours > 0 ? hours + ":" + minutes + ":" + seconds : minutes + ":" + seconds;
}

function answeredCount() {
    return answers.filter((a) => a !== null).length;
}


// ===============================
// MESSAGE BOX (not the browser's popup)
// ===============================

function showOverlay(title, text, buttons) {

    document.getElementById("overlayTitle").textContent = title;
    document.getElementById("overlayText").textContent = text;

    const box = document.getElementById("overlayButtons");
    box.replaceChildren();

    buttons.forEach((b) => {
        const button = el("button", b.primary ? "primary-btn compact" : "outline-btn", b.label);
        button.addEventListener("click", b.action);
        box.appendChild(button);
    });

    document.getElementById("overlay").hidden = false;
}

function hideOverlay() {
    document.getElementById("overlay").hidden = true;
}


async function enterFullscreen() {
    if (!canFullscreen || document.fullscreenElement) return;

    try {
        await document.documentElement.requestFullscreen();
    } catch (error) {
        // some browsers refuse; the exam continues without full screen
    }
}


// ===============================
// QUESTIONS AND ANSWERS
// ===============================

function renderNav() {

    const grid = document.getElementById("navGrid");
    grid.replaceChildren();

    questions.forEach((q, i) => {
        let cls = "nav-dot";
        if (answers[i] !== null) cls += " answered";
        if (i === current) cls += " current";

        const dot = el("button", cls, String(i + 1));
        dot.addEventListener("click", () => {
            current = i;
            showQuestion();
        });
        grid.appendChild(dot);
    });

    document.getElementById("progressText").textContent =
        answeredCount() + " of " + questions.length + " answered";
}


function showQuestion() {

    const q = questions[current];

    document.getElementById("qNumber").textContent = "Question " + (current + 1) + " of " + questions.length;
    document.getElementById("qMarks").textContent = q.marks + (q.marks === 1 ? " mark" : " marks");
    document.getElementById("qText").textContent = q.text;

    const box = document.getElementById("options");
    box.replaceChildren();

    q.options.forEach((option, i) => {
        const button = el(
            "button",
            "option-btn" + (answers[current] === i ? " chosen" : ""),
            String.fromCharCode(65 + i) + ".  " + option
        );
        button.addEventListener("click", () => choose(i));
        box.appendChild(button);
    });

    document.getElementById("prevBtn").disabled = current === 0;
    document.getElementById("nextBtn").disabled = current === questions.length - 1;

    renderNav();
}


async function saveAnswer(index, choice) {

    try {

        const data = await apiFetch("/api/my-exams/" + encodeURIComponent(examId) + "/answer", {
            method: "POST",
            body: JSON.stringify({ questionIndex: index, choice: choice })
        });

        showMessage(data.success ? "" : (data.message || "Could not save your answer."), data.success ? "" : "error");

    } catch (error) {
        showMessage("Connection problem. Check your Wi-Fi. Your answers are sent again when you submit.", "error");
    }
}


function choose(choice) {
    if (finished) return;
    answers[current] = choice;
    showQuestion();
    saveAnswer(current, choice);
}


function clearAnswer() {
    if (finished || answers[current] === null) return;
    answers[current] = null;
    showQuestion();
    saveAnswer(current, null);
}


// ===============================
// SUBMITTING
// ===============================

function finishWith(data, reason) {

    finished = true;
    active = false;
    clearInterval(timerId);

    hideOverlay();

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    document.getElementById("examArea").hidden = true;
    document.getElementById("timer").hidden = true;
    document.getElementById("progressText").textContent = "";
    document.getElementById("resultArea").hidden = false;

    if (reason === "violations") {
        document.getElementById("resultTitle").textContent = "Exam submitted automatically";
        document.getElementById("resultNote").textContent =
            "Your exam was submitted because you left the exam window too many times.";
    }

    document.getElementById("resultText").textContent =
        "Your score: " + data.score + " / " + data.totalMarks;

    showMessage("", "");
}


function askSubmit() {

    const left = questions.length - answeredCount();

    const text = left > 0
        ? "You have " + left + " unanswered " + (left === 1 ? "question" : "questions") + ". You cannot change answers after submitting."
        : "You cannot change your answers after submitting.";

    showOverlay("Submit your exam?", text, [
        { label: "Keep working", action: hideOverlay },
        { label: "Submit now", primary: true, action: () => { hideOverlay(); submitExam(false); } }
    ]);
}


async function submitExam(auto) {

    if (finished || submitting) return;

    submitting = true;

    try {

        const data = await apiFetch("/api/my-exams/" + encodeURIComponent(examId) + "/submit", {
            method: "POST",
            body: JSON.stringify({ answers: answers, auto: auto })
        });

        if (!data.success) {
            showMessage(data.message || "Could not submit the exam.", "error");
            submitting = false;
            return;
        }

        finishWith(data, null);

    } catch (error) {
        showMessage("Cannot reach the server. Trying again...", "error");
        submitting = false;
    }
}


// ===============================
// MONITORING
// ===============================

function maybeShowWarning() {

    if (!pendingWarning || finished || document.visibilityState !== "visible") return;

    const w = pendingWarning;
    pendingWarning = null;

    const left = w.max - w.violations;

    const text = (EVENT_TEXT[w.type] || "A violation was recorded.") +
        " This has been recorded." +
        (left > 0
            ? " If it happens " + left + " more " + (left === 1 ? "time" : "times") + ", your exam is submitted automatically."
            : "");

    showOverlay("Warning " + w.violations + " of " + w.max, text, [
        {
            label: "Continue exam",
            primary: true,
            action: async () => {
                hideOverlay();
                await enterFullscreen();
            }
        }
    ]);
}


async function reportEvent(type) {

    if (!active || finished) return;

    try {

        const data = await apiFetch("/api/my-exams/" + encodeURIComponent(examId) + "/event", {
            method: "POST",
            body: JSON.stringify({ type: type })
        });

        if (!data.success || data.ignored) return;

        if (data.autoSubmitted) {
            finishWith(data, "violations");
            return;
        }

        if (MAJOR_EVENTS.includes(type)) {
            pendingWarning = { violations: data.violations, max: data.max, type: type };
            maybeShowWarning();
        }

    } catch (error) {
        // the next event will try again
    }
}


function blockAndLog(type, message) {
    return (event) => {
        if (!active || finished) return;

        event.preventDefault();
        showMessage(message, "error");

        const now = Date.now();

        if (!lastMinorAt[type] || now - lastMinorAt[type] > 3000) {
            lastMinorAt[type] = now;
            reportEvent(type);
        }
    };
}


document.addEventListener("visibilitychange", () => {
    if (!active || finished) return;

    if (document.visibilityState === "hidden") {
        reportEvent("tab_hidden");
    } else {
        maybeShowWarning();
    }
});

window.addEventListener("blur", () => {
    if (!active || finished) return;

    // If the whole tab was hidden, tab_hidden already covers it
    setTimeout(() => {
        if (active && !finished && document.visibilityState === "visible" && !document.hasFocus()) {
            reportEvent("window_blur");
        }
    }, 400);
});

document.addEventListener("fullscreenchange", () => {
    if (active && !finished && canFullscreen && !document.fullscreenElement) {
        reportEvent("fullscreen_exit");
    }
});

document.addEventListener("copy", blockAndLog("copy", "Copying is disabled during the exam."));
document.addEventListener("cut", blockAndLog("cut", "Cutting is disabled during the exam."));
document.addEventListener("paste", blockAndLog("paste", "Pasting is disabled during the exam."));
document.addEventListener("contextmenu", blockAndLog("context_menu", "Right-click is disabled during the exam."));


// ===============================
// TIMER AND START
// ===============================

function tick() {

    const left = deadlineMs - nowMs();
    const timer = document.getElementById("timer");

    timer.textContent = formatTime(left);
    timer.className = "take-timer" + (left <= 60000 ? " urgent" : "");

    if (left <= 0 && !finished) {
        submitExam(true);
    }
}


async function startExam() {

    try {

        const data = await apiFetch("/api/my-exams/" + encodeURIComponent(examId) + "/start", {
            method: "POST"
        });

        document.getElementById("introArea").hidden = true;

        if (!data.success) {
            document.getElementById("backLink").hidden = false;
            showMessage(data.message || "Could not open the exam.", "error");
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            return;
        }

        questions = data.questions;
        answers = data.answers.map((a) => (Number.isInteger(a) ? a : null));
        deadlineMs = new Date(data.deadline).getTime();
        clockOffset = data.serverNow - Date.now();

        document.getElementById("examTitle").textContent = data.title;
        document.getElementById("timer").hidden = false;
        document.getElementById("examArea").hidden = false;

        showQuestion();
        tick();
        timerId = setInterval(tick, 500);

        active = true;

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
        document.getElementById("beginBtn").disabled = false;
    }
}


async function beginExam() {
    document.getElementById("beginBtn").disabled = true;
    await enterFullscreen();
    await startExam();
}


document.getElementById("prevBtn").addEventListener("click", () => {
    if (current > 0) { current--; showQuestion(); }
});

document.getElementById("nextBtn").addEventListener("click", () => {
    if (current < questions.length - 1) { current++; showQuestion(); }
});

document.getElementById("clearBtn").addEventListener("click", clearAnswer);
document.getElementById("submitBtn").addEventListener("click", askSubmit);
document.getElementById("beginBtn").addEventListener("click", beginExam);

window.addEventListener("beforeunload", (event) => {
    if (active && !finished) {
        event.preventDefault();
        event.returnValue = "";
    }
});


if (takeUser) {
    if (takeUser.role !== "student") {
        window.location.href = "dashboard.html";
    } else if (!examId) {
        showMessage("No exam selected.", "error");
        document.getElementById("backLink").hidden = false;
    } else {
        document.getElementById("introArea").hidden = false;
    }
}