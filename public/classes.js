const currentUser = JSON.parse(localStorage.getItem("user") || "null");


// ===============================
// SMALL HELPERS
// ===============================

// Builds an element and puts text in safely
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function fieldValue(id) {
    return document.getElementById(id).value.trim();
}

function showMessage(text, kind) {
    const box = document.getElementById("formMessage");
    box.textContent = text;
    box.className = "form-message " + (kind || "");
}

// "14:30" becomes { time: "02:30", ap: "PM" }
function splitTime(value) {
    if (!value) return null;
    const parts = value.split(":").map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    const ap = parts[0] >= 12 ? "PM" : "AM";
    const hour = parts[0] % 12 === 0 ? 12 : parts[0] % 12;
    return {
        time: String(hour).padStart(2, "0") + ":" + String(parts[1]).padStart(2, "0"),
        ap: ap
    };
}


// ===============================
// DRAW ONE CLASS ROW
// ===============================

function renderClass(c) {

    const isTeacher = currentUser.role === "teacher";
    const row = el("div", "class-row");

    const t = splitTime(c.startTime);
    const timeBox = el("div", "class-time", t ? t.time : "--:--");
    if (t) timeBox.appendChild(el("small", "", t.ap));
    row.appendChild(timeBox);

    const info = el("div", "class-info");
    info.appendChild(el("strong", "", c.name));

    const parts = [c.department, c.room];
    if (!isTeacher && c.teacher && c.teacher.name) {
        parts.push("Teacher: " + c.teacher.name);
    }
    info.appendChild(el("span", "", parts.filter(Boolean).join(" • ") || "No details added"));
    row.appendChild(info);

    if (isTeacher) {

        const count = (c.students || []).length;
        row.appendChild(el("div", "attendance-pill", count + (count === 1 ? " student" : " students")));

        const actions = el("div", "row-actions");

        const codeButton = el("button", "code-badge", c.joinCode);
        codeButton.title = "Click to copy the join code";
        codeButton.addEventListener("click", () => copyCode(c.joinCode));
        actions.appendChild(codeButton);

        const attendanceButton = el("button", "outline-btn", "Attendance");
        attendanceButton.addEventListener("click", () => {
            window.location.href = "attendance.html?classId=" + encodeURIComponent(c._id);
        });
        actions.appendChild(attendanceButton);

        const deleteButton = el("button", "danger-btn", "Delete");
        deleteButton.addEventListener("click", () => deleteClass(c._id, c.name));
        actions.appendChild(deleteButton);

        row.appendChild(actions);

    } else {
        row.appendChild(el("div", "attendance-pill", "Enrolled"));
    }

    return row;
}


// ===============================
// LOAD THE LIST
// ===============================

async function loadClasses() {

    const list = document.getElementById("classList");
    list.replaceChildren();

    try {

        const data = await apiFetch("/api/classes");

        if (!data.success) {
            showMessage(data.message || "Could not load classes.", "error");
            return;
        }

        if (data.classes.length === 0) {
            const note = currentUser.role === "teacher"
                ? "No classes yet. Create your first class above."
                : "You have not joined any class yet. Enter a join code above.";
            list.appendChild(el("p", "empty-note", note));
            return;
        }

        data.classes.forEach((c) => list.appendChild(renderClass(c)));

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


// ===============================
// CREATE (TEACHER)
// ===============================

async function createClass() {

    const name = fieldValue("className");

    if (!name) {
        showMessage("Please enter a class name.", "error");
        return;
    }

    try {

        const data = await apiFetch("/api/classes", {
            method: "POST",
            body: JSON.stringify({
                name: name,
                department: fieldValue("classDepartment"),
                room: fieldValue("classRoom"),
                startTime: fieldValue("classTime")
            })
        });

        if (!data.success) {
            showMessage(data.message || "Could not create the class.", "error");
            return;
        }

        ["className", "classDepartment", "classRoom", "classTime"].forEach((id) => {
            document.getElementById(id).value = "";
        });

        showMessage("Class created. Join code: " + data.class.joinCode, "ok");
        loadClasses();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


// ===============================
// JOIN (STUDENT)
// ===============================

async function joinClass() {

    const code = fieldValue("joinCode");

    if (!code) {
        showMessage("Please enter the join code.", "error");
        return;
    }

    try {

        const data = await apiFetch("/api/classes/join", {
            method: "POST",
            body: JSON.stringify({ joinCode: code })
        });

        if (!data.success) {
            showMessage(data.message || "Could not join the class.", "error");
            return;
        }

        document.getElementById("joinCode").value = "";
        showMessage(data.message, "ok");
        loadClasses();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}


// ===============================
// DELETE AND COPY (TEACHER)
// ===============================

async function deleteClass(id, name) {

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) {
        return;
    }

    try {

        const data = await apiFetch("/api/classes/" + encodeURIComponent(id), {
            method: "DELETE"
        });

        if (!data.success) {
            showMessage(data.message || "Could not delete the class.", "error");
            return;
        }

        showMessage("Class deleted.", "ok");
        loadClasses();

    } catch (error) {
        showMessage("Cannot reach the server.", "error");
    }
}

async function copyCode(code) {
    try {
        await navigator.clipboard.writeText(code);
        showMessage("Join code " + code + " copied.", "ok");
    } catch (error) {
        showMessage("Join code: " + code, "ok");
    }
}


// ===============================
// START
// ===============================

if (currentUser) {

    document.getElementById("userRole").textContent =
        currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

    if (currentUser.role === "teacher") {
        document.getElementById("teacherTools").hidden = false;
    }

    if (currentUser.role === "student") {
        document.getElementById("studentTools").hidden = false;
    }

    loadClasses();
}