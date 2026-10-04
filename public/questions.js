const currentUser = JSON.parse(localStorage.getItem("user") || "null");

let editingId = null;


function readForm() {

    const checked = document.querySelector('input[name="correct"]:checked');

    return {
        subject: document.getElementById("qSubject").value.trim(),
        text: document.getElementById("qText").value.trim(),
        options: [0, 1, 2, 3].map((i) => document.getElementById("qOpt" + i).value.trim()),
        correctIndex: checked ? Number(checked.value) : 0,
        marks: Number(document.getElementById("qMarks").value) || 1
    };
}


function resetForm() {

    editingId = null;

    document.getElementById("qText").value = "";
    [0, 1, 2, 3].forEach((i) => { document.getElementById("qOpt" + i).value = ""; });
    document.getElementById("qMarks").value = 1;
    document.querySelector('input[name="correct"][value="0"]').checked = true;

    document.getElementById("formTitle").textContent = "Add a question";
    document.getElementById("saveBtn").textContent = "Save question";
    document.getElementById("cancelBtn").hidden = true;
}


function cancelEdit() {
    resetForm();
    showMessage("", "");
}


function startEdit(q) {

    editingId = q._id;

    document.getElementById("qSubject").value = q.subject;
    document.getElementById("qText").value = q.text;
    q.options.forEach((option, i) => { document.getElementById("qOpt" + i).value = option; });
    document.getElementById("qMarks").value = q.marks;
    document.querySelector('input[name="correct"][value="' + q.correctIndex + '"]').checked = true;

    document.getElementById("formTitle").textContent = "Edit question";
    document.getElementById("saveBtn").textContent = "Save changes";
    document.getElementById("cancelBtn").hidden = false;

    showMessage("", "");
    window.scrollTo({ top: 0, behavior: "smooth" });
}


async function saveQuestion() {

    const values = readForm();

    if (!values.text) {
        showMessage("Please type the question.", "error");
        return;
    }

    if (values.options.some((o) => !o)) {
        showMessage("Please fill in all four options.", "error");
        return;
    }

    try {

        const url = editingId ? "/api/questions/" + encodeURIComponent(editingId) : "/api/questions";

        const data = await apiFetch(url, {
            method: editingId ? "PUT" : "POST",
            body: JSON.stringify(values)
        });

        if (!data.success) {
            showMessage(data.message || "Could not save the question.", "error");
            return;
        }

        showMessage(editingId ? "Question updated." : "Question saved.", "ok");
        resetForm();
        loadQuestions();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


async function deleteQuestion(id) {

    if (!confirm("Delete this question? Exams that already use it keep their own copy.")) {
        return;
    }

    try {

        const data = await apiFetch("/api/questions/" + encodeURIComponent(id), { method: "DELETE" });

        if (!data.success) {
            showMessage(data.message || "Could not delete the question.", "error");
            return;
        }

        if (editingId === id) resetForm();

        showMessage("Question deleted.", "ok");
        loadQuestions();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


function renderQuestion(q) {

    const card = el("div", "q-card");

    const head = el("div", "q-head");
    head.appendChild(el("span", "q-text", q.text));
    head.appendChild(el("span", "pill", q.subject));
    head.appendChild(el("span", "pill", q.marks + (q.marks === 1 ? " mark" : " marks")));
    card.appendChild(head);

    const list = el("ol", "q-options");
    list.style.listStyleType = "upper-alpha";
    q.options.forEach((option, i) => {
        list.appendChild(el("li", i === q.correctIndex ? "correct" : "", option));
    });
    card.appendChild(list);

    const actions = el("div", "row-actions");

    const editButton = el("button", "outline-btn", "Edit");
    editButton.addEventListener("click", () => startEdit(q));
    actions.appendChild(editButton);

    const deleteButton = el("button", "danger-btn", "Delete");
    deleteButton.addEventListener("click", () => deleteQuestion(q._id));
    actions.appendChild(deleteButton);

    card.appendChild(actions);

    return card;
}


async function loadQuestions() {

    const filter = document.getElementById("filterSubject");
    const chosen = filter.value;
    const list = document.getElementById("questionList");

    try {

        const url = chosen ? "/api/questions?subject=" + encodeURIComponent(chosen) : "/api/questions";
        const data = await apiFetch(url);

        if (!data.success) {
            showMessage(data.message || "Could not load questions.", "error");
            return;
        }

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

        if (chosen && !data.subjects.includes(chosen)) {
            filter.value = "";
            return loadQuestions();
        }

        filter.value = chosen;

        document.getElementById("countText").textContent =
            data.questions.length + (data.questions.length === 1 ? " question" : " questions");

        list.replaceChildren();

        if (data.questions.length === 0) {
            list.appendChild(el("p", "empty-note", "No questions yet. Add your first question above."));
            return;
        }

        data.questions.forEach((q) => list.appendChild(renderQuestion(q)));

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


if (currentUser) {
    if (currentUser.role !== "teacher") {
        window.location.href = "classes.html";
    } else {
        loadQuestions();
    }
}