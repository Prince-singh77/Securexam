const currentUser = JSON.parse(localStorage.getItem("user") || "null");

let lastTitle = "results";

const STATUS_PILL = {
    submitted: ["good", "Submitted"],
    in_progress: ["warn", "In progress"],
    not_attempted: ["", "Not attempted"]
};

const REASON_TEXT = {
    manual: "",
    timeout: "Time ran out",
    violations: "Auto-submitted (violations)"
};


function cell(text) {
    return el("td", "", text);
}


async function loadExamList() {

    const select = document.getElementById("examSelect");

    try {

        const data = await apiFetch("/api/exams");

        select.replaceChildren();

        if (!data.success || data.exams.length === 0) {
            const option = document.createElement("option");
            option.textContent = "No exams yet";
            select.appendChild(option);
            showMessage("Create and publish an exam first. Results appear after students submit.", "");
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

        loadResults();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


function renderDistribution(list) {

    const box = document.getElementById("distribution");
    box.replaceChildren();

    const most = Math.max(1, ...list.map((b) => b.count));

    list.forEach((bucket) => {
        const row = el("div", "bar-row");
        row.appendChild(el("span", "", bucket.label));

        const bar = el("div", "bar");
        const fill = document.createElement("span");
        fill.style.width = (bucket.count / most) * 100 + "%";
        bar.appendChild(fill);
        row.appendChild(bar);

        row.appendChild(el("span", "", String(bucket.count)));
        box.appendChild(row);
    });
}


function renderStudents(list) {

    const holder = document.getElementById("studentTable");
    holder.replaceChildren();

    if (list.length === 0) {
        holder.appendChild(el("p", "empty-note", "No students are enrolled in this class yet."));
        return;
    }

    const table = el("table", "data-table");

    const headRow = document.createElement("tr");
    ["Student", "Status", "Score", "Percent", "Submitted", "Notes"].forEach((name) => {
        headRow.appendChild(el("th", "", name));
    });

    const thead = document.createElement("thead");
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    list.forEach((s) => {

        const row = document.createElement("tr");

        const who = document.createElement("td");
        who.appendChild(el("strong", "", s.name));
        who.appendChild(el("div", "q-meta", s.email));
        row.appendChild(who);

        const pill = STATUS_PILL[s.status] || ["", s.status];
        const statusCell = document.createElement("td");
        statusCell.appendChild(el("span", "pill " + pill[0], pill[1]));
        row.appendChild(statusCell);

        row.appendChild(cell(s.score === null ? "-" : s.score + " / " + s.totalMarks));
        row.appendChild(cell(s.percent === null ? "-" : s.percent + "%"));
        row.appendChild(cell(s.submittedAt ? new Date(s.submittedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "-"));

        const notes = [];
        if (s.violations > 0) notes.push(s.violations + (s.violations === 1 ? " violation" : " violations"));
        if (s.submitReason && REASON_TEXT[s.submitReason]) notes.push(REASON_TEXT[s.submitReason]);
        row.appendChild(cell(notes.join(" • ") || "-"));

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    holder.appendChild(table);
}


function renderQuestions(list) {

    const box = document.getElementById("questionStats");
    box.replaceChildren();

    list.forEach((q) => {

        const card = el("div", "q-card");

        const text = q.text.length > 140 ? q.text.slice(0, 140) + "..." : q.text;
        card.appendChild(el("div", "q-text", "Q" + (q.index + 1) + ". " + text));

        const percent = q.percentCorrect === null ? 0 : q.percentCorrect;

        const row = el("div", "bar-row");
        row.appendChild(el("span", "", q.percentCorrect === null ? "No data" : q.correct + " correct"));

        const bar = el("div", "bar" + (percent < 40 ? " bad" : ""));
        const fill = document.createElement("span");
        fill.style.width = percent + "%";
        bar.appendChild(fill);
        row.appendChild(bar);

        row.appendChild(el("span", "", q.percentCorrect === null ? "-" : q.percentCorrect + "%"));
        card.appendChild(row);

        box.appendChild(card);
    });
}


async function loadResults() {

    const id = document.getElementById("examSelect").value;

    if (!id) return;

    try {

        const data = await apiFetch("/api/reports/exam/" + encodeURIComponent(id) + "/results");

        if (!data.success) {
            showMessage(data.message || "Could not load the results.", "error");
            return;
        }

        showMessage("", "");
        lastTitle = data.examTitle;

        document.getElementById("reportArea").hidden = false;

        document.getElementById("rSubmitted").textContent = data.submitted + " / " + data.enrolled;
        document.getElementById("rSubmittedNote").textContent =
            data.started - data.submitted > 0 ? (data.started - data.submitted) + " still in progress" : "of enrolled students";

        document.getElementById("rAverage").textContent = data.averagePercent === null ? "--" : data.averagePercent + "%";
        document.getElementById("rAverageNote").textContent =
            data.averageScore === null ? "No submissions yet" : data.averageScore + " of " + data.totalMarks + " marks";

        document.getElementById("rRange").textContent =
            data.highest === null ? "--" : data.highest + " / " + data.lowest;
        document.getElementById("rRangeNote").textContent = "Out of " + data.totalMarks + " marks";

        document.getElementById("rPassed").textContent =
            data.submitted === 0 ? "--" : data.passed + " / " + data.submitted;
        document.getElementById("rPassedNote").textContent = "Pass mark: " + data.passPercent + "%";

        renderDistribution(data.distribution);
        renderStudents(data.students);
        renderQuestions(data.questions);

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


async function downloadCsv() {

    const id = document.getElementById("examSelect").value;

    if (!id) return;

    try {

        const response = await fetch("/api/reports/exam/" + encodeURIComponent(id) + "/results.csv", {
            headers: { Authorization: "Bearer " + localStorage.getItem("token") }
        });

        if (!response.ok) {
            showMessage("Could not export the results.", "error");
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = lastTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-results.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

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