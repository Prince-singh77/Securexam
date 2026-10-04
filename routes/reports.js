const express = require("express");
const mongoose = require("mongoose");
const Exam = require("../models/Exam");
const Class = require("../models/Class");
const Submission = require("../models/Submission");
const SecurityEvent = require("../models/SecurityEvent");
const { finalizeExpired } = require("../utils/grading");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("teacher"));

const PASS_PERCENT = 40;
const GRACE_MS = 10 * 1000;


async function ownedExam(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ success: false, message: "Exam not found" });
        return null;
    }

    const exam = await Exam.findOne({ _id: req.params.id, teacher: req.user._id });

    if (!exam) {
        res.status(404).json({ success: false, message: "Exam not found" });
        return null;
    }

    await finalizeExpired(exam, GRACE_MS);

    return exam;
}

function round1(number) {
    return Math.round(number * 10) / 10;
}


async function buildResults(exam) {

    const cls = await Class.findById(exam.classId).populate("students", "name email").lean();
    const students = cls ? cls.students : [];

    const subs = await Submission.find({ examId: exam._id }).lean();
    const subByStudent = new Map(subs.map((s) => [String(s.student), s]));

    const majorEvents = await SecurityEvent.find({ examId: exam._id, severity: "major" }).select("student").lean();
    const violations = new Map();

    majorEvents.forEach((e) => {
        const key = String(e.student);
        violations.set(key, (violations.get(key) || 0) + 1);
    });

    const rows = students.map((st) => {
        const sub = subByStudent.get(String(st._id));
        const submitted = !!sub && sub.status === "submitted";

        return {
            studentId: st._id,
            name: st.name,
            email: st.email,
            status: sub ? sub.status : "not_attempted",
            score: submitted ? sub.score : null,
            totalMarks: exam.totalMarks,
            percent: submitted && exam.totalMarks > 0 ? Math.round((sub.score / exam.totalMarks) * 100) : null,
            submittedAt: submitted ? sub.submittedAt : null,
            submitReason: submitted ? sub.submitReason || null : null,
            violations: violations.get(String(st._id)) || 0
        };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const submittedSubs = subs.filter((s) => s.status === "submitted");
    const percents = submittedSubs.map((s) => (exam.totalMarks > 0 ? (s.score / exam.totalMarks) * 100 : 0));

    const buckets = [0, 0, 0, 0, 0];
    percents.forEach((p) => {
        const index = p <= 20 ? 0 : p <= 40 ? 1 : p <= 60 ? 2 : p <= 80 ? 3 : 4;
        buckets[index]++;
    });

    const scores = submittedSubs.map((s) => s.score);

    const questionStats = exam.questions.map((q, i) => {
        let attempted = 0;
        let correct = 0;

        submittedSubs.forEach((s) => {
            const answer = s.answers[i];
            if (Number.isInteger(answer)) {
                attempted++;
                if (answer === q.correctIndex) correct++;
            }
        });

        return {
            index: i,
            text: q.text,
            attempted: attempted,
            correct: correct,
            percentCorrect: submittedSubs.length ? Math.round((correct / submittedSubs.length) * 100) : null
        };
    });

    return {
        examTitle: exam.title,
        totalMarks: exam.totalMarks,
        passPercent: PASS_PERCENT,
        enrolled: students.length,
        started: subs.length,
        submitted: submittedSubs.length,
        averageScore: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        averagePercent: percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
        highest: scores.length ? Math.max(...scores) : null,
        lowest: scores.length ? Math.min(...scores) : null,
        passed: percents.filter((p) => p >= PASS_PERCENT).length,
        distribution: [
            { label: "0-20%", count: buckets[0] },
            { label: "21-40%", count: buckets[1] },
            { label: "41-60%", count: buckets[2] },
            { label: "61-80%", count: buckets[3] },
            { label: "81-100%", count: buckets[4] }
        ],
        students: rows,
        questions: questionStats
    };
}


// RESULTS AND ANALYTICS
router.get("/exam/:id/results", async (req, res) => {
    try {
        const exam = await ownedExam(req, res);
        if (!exam) return;

        res.json({ success: true, ...(await buildResults(exam)) });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// CSV EXPORT
function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);

    // Stops spreadsheets from running text that starts like a formula
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;

    return '"' + text.replace(/"/g, '""') + '"';
}

const STATUS_TEXT = { submitted: "Submitted", in_progress: "In progress", not_attempted: "Not attempted" };
const REASON_TEXT = { manual: "Submitted by student", timeout: "Time ran out", violations: "Auto-submitted (violations)" };

router.get("/exam/:id/results.csv", async (req, res) => {
    try {
        const exam = await ownedExam(req, res);
        if (!exam) return;

        const data = await buildResults(exam);

        const lines = [
            ["Name", "Email", "Status", "Score", "Total marks", "Percent", "Submitted at", "How submitted", "Violations"]
        ];

        data.students.forEach((s) => {
            lines.push([
                s.name,
                s.email,
                STATUS_TEXT[s.status] || s.status,
                s.score,
                s.totalMarks,
                s.percent === null ? "" : s.percent + "%",
                s.submittedAt ? new Date(s.submittedAt).toISOString() : "",
                s.submitReason ? REASON_TEXT[s.submitReason] || s.submitReason : "",
                s.violations
            ]);
        });

        const csv = lines.map((line) => line.map(csvCell).join(",")).join("\r\n");

        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", 'attachment; filename="results.csv"');
        res.send("\uFEFF" + csv);

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// SECURITY REPORT
router.get("/exam/:id/security", async (req, res) => {
    try {
        const exam = await ownedExam(req, res);
        if (!exam) return;

        const subs = await Submission.find({ examId: exam._id }).populate("student", "name email").lean();
        const events = await SecurityEvent.find({ examId: exam._id }).sort({ at: 1 }).lean();

        const byStudent = new Map();

        events.forEach((e) => {
            const key = String(e.student);
            if (!byStudent.has(key)) byStudent.set(key, []);
            byStudent.get(key).push(e);
        });

        const students = subs
            .filter((s) => s.student)
            .map((s) => {
                const list = byStudent.get(String(s.student._id)) || [];
                const major = list.filter((e) => e.severity === "major").length;
                const minor = list.filter((e) => e.severity === "minor").length;
                const resumed = list.filter((e) => e.type === "resumed").length;

                let level = "clean";
                if (s.submitReason === "violations" || major >= 3) level = "high";
                else if (major >= 1) level = "medium";
                else if (minor > 0 || resumed > 0) level = "low";

                return {
                    studentId: s.student._id,
                    name: s.student.name,
                    email: s.student.email,
                    status: s.status,
                    submitReason: s.submitReason || null,
                    major: major,
                    minor: minor,
                    resumed: resumed,
                    level: level,
                    timeline: list.map((e) => ({ type: e.type, severity: e.severity, at: e.at }))
                };
            })
            .sort((a, b) => b.major - a.major || b.minor - a.minor || a.name.localeCompare(b.name));

        res.json({
            success: true,
            examTitle: exam.title,
            summary: {
                attempts: students.length,
                flagged: students.filter((s) => s.major > 0).length,
                autoSubmitted: students.filter((s) => s.submitReason === "violations").length,
                totalEvents: events.length
            },
            students: students
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;