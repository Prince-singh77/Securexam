require("dotenv").config();

const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const Class = require("./models/Class");
const Question = require("./models/Question");
const Exam = require("./models/Exam");
const AttendanceSession = require("./models/AttendanceSession");
const AttendanceRecord = require("./models/AttendanceRecord");
const Submission = require("./models/Submission");
const SecurityEvent = require("./models/SecurityEvent");


const DEMO_PASSWORD = "Team@404";
const TEACHER_EMAIL = "demo.teacher@secureexam.test";

const STUDENTS = [
    ["Aarav Sharma", "student1@secureexam.test"],
    ["Diya Verma", "student2@secureexam.test"],
    ["Kabir Singh", "student3@secureexam.test"],
    ["Ananya Gupta", "student4@secureexam.test"],
    ["Rohan Yadav", "student5@secureexam.test"]
];

const DS_QUESTIONS = [
    { text: "Which data structure follows the First-In-First-Out (FIFO) order?", options: ["Stack", "Queue", "Tree", "Graph"], correctIndex: 1 },
    { text: "What is the time complexity of binary search on a sorted array?", options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"], correctIndex: 1 },
    { text: "Which traversal of a binary search tree gives the values in sorted order?", options: ["Preorder", "Postorder", "Inorder", "Level order"], correctIndex: 2 },
    { text: "Which data structure does a compiler use to manage function calls and recursion?", options: ["Queue", "Stack", "Heap", "Array"], correctIndex: 1 },
    { text: "What is the worst-case time complexity of quicksort?", options: ["O(n log n)", "O(n)", "O(n^2)", "O(log n)"], correctIndex: 2 },
    { text: "A complete binary tree in which every parent is greater than or equal to its children is called:", options: ["Min heap", "Max heap", "AVL tree", "Trie"], correctIndex: 1 },
    { text: "How many edges does a tree with n nodes have?", options: ["n", "n - 1", "n + 1", "n / 2"], correctIndex: 1 },
    { text: "Which of these is NOT a linear data structure?", options: ["Array", "Linked list", "Stack", "Tree"], correctIndex: 3 }
];

const CYBER_QUESTIONS = [
    { text: "In the CIA triad, what does the letter C stand for?", options: ["Confidentiality", "Cryptography", "Control", "Compliance"], correctIndex: 0 },
    { text: "Which attack tricks people into revealing passwords through fake emails or websites?", options: ["Phishing", "SQL injection", "Brute force", "Ransomware"], correctIndex: 0 },
    { text: "Which property is essential for a cryptographic hash function?", options: ["It is reversible", "It is one-way", "It is slow by design", "It uses a shared key"], correctIndex: 1 }
];


function snapshot(list) {
    return list.map((q) => ({
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        marks: q.marks
    }));
}

function minutesFrom(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}


async function removeOldDemoData() {

    const emails = [TEACHER_EMAIL, ...STUDENTS.map((s) => s[1])];
    const users = await User.find({ email: { $in: emails } }).select("_id");
    const ids = users.map((u) => u._id);

    const classes = await Class.find({ teacher: { $in: ids } }).select("_id");
    const classIds = classes.map((c) => c._id);

    await SecurityEvent.deleteMany({ classId: { $in: classIds } });
    await Submission.deleteMany({ classId: { $in: classIds } });
    await AttendanceRecord.deleteMany({ classId: { $in: classIds } });
    await AttendanceSession.deleteMany({ classId: { $in: classIds } });
    await Exam.deleteMany({ classId: { $in: classIds } });
    await Question.deleteMany({ teacher: { $in: ids } });
    await Class.deleteMany({ _id: { $in: classIds } });
    await User.deleteMany({ _id: { $in: ids } });
}


async function run() {

    if (process.env.NODE_ENV === "production") {
        console.error("Refusing to add demo data while NODE_ENV is production.");
        process.exit(1);
    }

    if (!process.env.MONGODB_URI) {
        console.error("MONGODB_URI is missing in .env");
        process.exit(1);
    }

    const startsInMinutes = Math.max(1, Number(process.argv[2]) || 2);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected. Replacing old demo data...");

    await removeOldDemoData();

    const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);

    const teacher = await User.create({
        name: "Demo Teacher",
        email: TEACHER_EMAIL,
        password: hashed,
        role: "teacher"
    });

    const students = await User.insertMany(
        STUDENTS.map(([name, email]) => ({ name, email, password: hashed, role: "student" }))
    );

    const dsClass = await Class.create({
        name: "Data Structures",
        department: "CSE",
        room: "Room 204",
        startTime: "10:00",
        joinCode: "DEMO42",
        teacher: teacher._id,
        students: students.map((s) => s._id)
    });

    const cyberClass = await Class.create({
        name: "Cyber Security",
        department: "CSE",
        room: "Lab 2",
        startTime: "12:00",
        joinCode: "DEMO43",
        teacher: teacher._id,
        students: students.slice(0, 3).map((s) => s._id)
    });

    const dsDocs = await Question.insertMany(
        DS_QUESTIONS.map((q) => ({ ...q, subject: "Data Structures", marks: 1, teacher: teacher._id }))
    );

    const cyberDocs = await Question.insertMany(
        CYBER_QUESTIONS.map((q) => ({ ...q, subject: "Cyber Security", marks: 1, teacher: teacher._id }))
    );


    // ---------- A FINISHED EXAM WITH RESULTS AND SECURITY EVENTS ----------

    const pastStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pastQuestions = snapshot(dsDocs.slice(0, 6));
    const pastMarks = pastQuestions.reduce((sum, q) => sum + q.marks, 0);

    const pastExam = await Exam.create({
        teacher: teacher._id,
        classId: dsClass._id,
        title: "Mid-term Test (completed)",
        startsAt: pastStart,
        durationMinutes: 30,
        status: "published",
        questions: pastQuestions,
        totalMarks: pastMarks
    });

    const plans = [
        { correct: 6, reason: "manual", events: [] },
        { correct: 5, reason: "manual", events: [] },
        { correct: 4, reason: "manual", events: [["tab_hidden", "major"]] },
        { correct: 3, reason: "manual", events: [["resumed", "info"], ["copy", "minor"]] },
        {
            correct: 2,
            reason: "violations",
            unansweredFrom: 3,
            events: [
                ["window_blur", "major"],
                ["tab_hidden", "major"],
                ["fullscreen_exit", "major"],
                ["paste", "minor"]
            ]
        }
    ];

    for (let i = 0; i < students.length; i++) {

        const plan = plans[i];
        const startedAt = minutesFrom(pastStart, i + 1);

        const answers = pastQuestions.map((q, j) => {
            if (plan.unansweredFrom !== undefined && j >= plan.unansweredFrom) return null;
            return j < plan.correct ? q.correctIndex : (q.correctIndex + 1) % 4;
        });

        const score = pastQuestions.reduce((sum, q, j) => sum + (answers[j] === q.correctIndex ? q.marks : 0), 0);

        const submission = await Submission.create({
            examId: pastExam._id,
            classId: dsClass._id,
            student: students[i]._id,
            startedAt: startedAt,
            deadline: minutesFrom(startedAt, 30),
            submittedAt: minutesFrom(startedAt, plan.reason === "violations" ? 9 : 12 + i * 3),
            status: "submitted",
            answers: answers,
            score: score,
            totalMarks: pastMarks,
            autoSubmitted: plan.reason === "violations",
            submitReason: plan.reason
        });

        if (plan.events.length > 0) {
            await SecurityEvent.insertMany(
                plan.events.map(([type, severity], k) => ({
                    examId: pastExam._id,
                    submissionId: submission._id,
                    classId: dsClass._id,
                    student: students[i]._id,
                    type: type,
                    severity: severity,
                    at: minutesFrom(startedAt, 3 + k * 2)
                }))
            );
        }
    }


    // ---------- AN EXAM THAT STARTS SOON, AND A DRAFT ----------

    const soonQuestions = snapshot(dsDocs.slice(2, 8));

    await Exam.create({
        teacher: teacher._id,
        classId: dsClass._id,
        title: "Sessional Test (starts soon)",
        startsAt: new Date(Date.now() + startsInMinutes * 60 * 1000),
        durationMinutes: 20,
        status: "published",
        questions: soonQuestions,
        totalMarks: soonQuestions.reduce((sum, q) => sum + q.marks, 0)
    });

    const draftQuestions = snapshot(cyberDocs);

    await Exam.create({
        teacher: teacher._id,
        classId: cyberClass._id,
        title: "Unit 1 Quiz (draft)",
        startsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
        durationMinutes: 15,
        status: "draft",
        questions: draftQuestions,
        totalMarks: draftQuestions.reduce((sum, q) => sum + q.marks, 0)
    });


    // ---------- TODAY'S ATTENDANCE (4 OF 5 PRESENT) ----------

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sessionStart = new Date(Math.max(startOfDay.getTime() + 60 * 1000, Date.now() - 60 * 60 * 1000));

    const session = await AttendanceSession.create({
        classId: dsClass._id,
        teacher: teacher._id,
        secret: crypto.randomBytes(32).toString("hex"),
        status: "closed",
        startedAt: sessionStart,
        endsAt: minutesFrom(sessionStart, 10)
    });

    await AttendanceRecord.insertMany(
        students.slice(0, 4).map((s, i) => ({
            sessionId: session._id,
            classId: dsClass._id,
            student: s._id,
            markedAt: minutesFrom(sessionStart, 1 + i),
            method: i === 3 ? "manual" : "qr"
        }))
    );


    console.log("");
    console.log("Demo data is ready.");
    console.log("");
    console.log("Teacher:  " + TEACHER_EMAIL + "  /  " + DEMO_PASSWORD);
    console.log("Students: student1@secureexam.test ... student5@secureexam.test  /  " + DEMO_PASSWORD);
    console.log("Class join codes: DEMO42 (Data Structures), DEMO43 (Cyber Security)");
    console.log("A live exam starts in " + startsInMinutes + " minute(s) for the Data Structures class.");

    await mongoose.disconnect();
}


run().catch(async (error) => {
    console.error("Seeding failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
});