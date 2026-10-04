const currentUser = JSON.parse(localStorage.getItem("user") || "null");

let bank = [];
const selected = new Set();


function formatWhen(value) {
    return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}


// ===============================
// CLASSES AND QUESTION PICKER
// ===============================

async function loadClasses() {

    const select = document.getElementById("examClass");

    try {

        const data = await apiFetch("/api/classes");

        select.replaceChildren();

        if (!data.success || data.classes.length === 0) {
            const option = document.createElement("option");
            option.textContent = "No classes yet";
            select.appendChild(option);
            return;
        }

        data.classes.forEach((c) => {
            const option = document.createElement("option");
            option.value = c._id;
            option.textContent = c.name;
            select.appendChild(option);
        });

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


async function loadBank() {

    try {

        const data = await apiFetch("/api/questions");

        if (!data.success) return;

        bank = data.questions;

        const filter = document.getElementById("pickSubject");
        filter.replaceChildren();

        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All subjects";
        filter.appendChild(all);

        data.subjects.forEach((subject) => {
            const option = document.createElement("option");
            option.value = subject;
            option.textContent = subject;
            filter.appendChild(option);
        });

        renderPicker();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


function updateCount() {

    const marks = bank
        .filter((q) => selected.has(q._id))
        .reduce((sum, q) => sum + q.marks, 0);

    document.getElementById("pickCount").textContent =
        selected.size + " selected • " + marks + (marks === 1 ? " mark" : " marks");
}


function renderPicker() {

    const subject = document.getElementById("pickSubject").value;
    const picker = document.getElementById("picker");

    picker.replaceChildren();

    const shown = bank.filter((q) => !subject || q.subject === subject);

    if (shown.length === 0) {
        picker.appendChild(el(
            "p",
            "empty-note",
            bank.length === 0
                ? "Your Question Bank is empty. Add questions in the Question Bank page first."
                : "No questions for this subject."
        ));
        updateCount();
        return;
    }

    shown.forEach((q) => {

        const row = el("label", "picker-row");

        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = selected.has(q._id);
        box.addEventListener("change", () => {
            if (box.checked) selected.add(q._id);
            else selected.delete(q._id);
            updateCount();
        });
        row.appendChild(box);

        const text = el("div");
        text.appendChild(el("span", "", q.text));
        text.appendChild(el("small", "", q.subject + " • " + q.marks + (q.marks === 1 ? " mark" : " marks")));
        row.appendChild(text);

        picker.appendChild(row);
    });

    updateCount();
}


// ===============================
// CREATE AN EXAM
// ===============================

async function createExam() {

    const title = document.getElementById("examTitle").value.trim();
    const classId = document.getElementById("examClass").value;
    const startValue = document.getElementById("examStart").value;
    const duration = Number(document.getElementById("examDuration").value);

    if (!title) {
        showMessage("Please enter the exam title.", "error");
        return;
    }

    if (!classId) {
        showMessage("Please choose a class. Create one first in My Classes.", "error");
        return;
    }

    if (!startValue) {
        showMessage("Please choose the start date and time.", "error");
        return;
    }

    if (selected.size === 0) {
        showMessage("Please select at least one question.", "error");
        return;
    }

    try {

        const data = await apiFetch("/api/exams", {
            method: "POST",
            body: JSON.stringify({
                title: title,
                classId: classId,
                startsAt: new Date(startValue).toISOString(),
                durationMinutes: duration,
                questionIds: Array.from(selected)
            })
        });

        if (!data.success) {
            showMessage(data.message || "Could not create the exam.", "error");
            return;
        }

        document.getElementById("examTitle").value = "";
        selected.clear();
        renderPicker();

        showMessage("Exam created as a draft. Publish it below when it is ready.", "ok");
        loadExams();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


// ===============================
// THE EXAM LIST
// ===============================

function renderExam(exam) {

    const card = el("div", "q-card");

    const head = el("div", "q-head");
    head.appendChild(el("span", "q-text", exam.title));
    head.appendChild(el(
        "span",
        "pill " + (exam.status === "published" ? "good" : "warn"),
        exam.status === "published" ? "Published" : "Draft"
    ));
    card.appendChild(head);

    card.appendChild(el(
        "p",
        "q-meta",
        exam.className + " • " + formatWhen(exam.startsAt) + " • " + exam.durationMinutes + " min • " +
        exam.questionCount + (exam.questionCount === 1 ? " question" : " questions") + " • " +
        exam.totalMarks + (exam.totalMarks === 1 ? " mark" : " marks")
    ));

    const actions = el("div", "row-actions");

    const publishButton = el(
        "button",
        "outline-btn",
        exam.status === "published" ? "Back to draft" : "Publish"
    );
    publishButton.addEventListener("click", () => setPublished(exam.id, exam.status !== "published"));
    actions.appendChild(publishButton);

    const deleteButton = el("button", "danger-btn", "Delete");
    deleteButton.addEventListener("click", () => deleteExam(exam.id, exam.title));
    actions.appendChild(deleteButton);

    card.appendChild(actions);

    return card;
}


async function loadExams() {

    const list = document.getElementById("examList");

    try {

        const data = await apiFetch("/api/exams");

        if (!data.success) {
            showMessage(data.message || "Could not load exams.", "error");
            return;
        }

        list.replaceChildren();

        if (data.exams.length === 0) {
            list.appendChild(el("p", "empty-note", "No exams yet. Create your first exam above."));
            return;
        }

        data.exams.forEach((exam) => list.appendChild(renderExam(exam)));

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


async function setPublished(id, publish) {

    try {

        const data = await apiFetch("/api/exams/" + encodeURIComponent(id) + "/publish", {
            method: "POST",
            body: JSON.stringify({ publish: publish })
        });

        if (!data.success) {
            showMessage(data.message || "Could not update the exam.", "error");
            return;
        }

        showMessage(publish ? "Exam published." : "Exam moved back to draft.", "ok");
        loadExams();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


async function deleteExam(id, title) {

    if (!confirm('Delete "' + title + '"? This cannot be undone.')) {
        return;
    }

    try {

        const data = await apiFetch("/api/exams/" + encodeURIComponent(id), { method: "DELETE" });

        if (!data.success) {
            showMessage(data.message || "Could not delete the exam.", "error");
            return;
        }

        showMessage("Exam deleted.", "ok");
        loadExams();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


// ===============================
// START
// ===============================

if (currentUser) {
    if (currentUser.role !== "teacher") {
        window.location.href = "classes.html";
    } else {
        loadClasses();
        loadBank();
        loadExams();
    }
}