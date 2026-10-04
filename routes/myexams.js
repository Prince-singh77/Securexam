const express = require("express");
const mongoose = require("mongoose");
const Class = require("../models/Class");
const Exam = require("../models/Exam");
const Submission = require("../models/Submission");
const { requireAuth, requireRole } = require("../middleware/auth");
const SecurityEvent = require("../models/SecurityEvent");
const { cleanAnswers, finalize } = require("../utils/grading");

const router = express.Router();

router.use(requireAuth, requireRole("student"));

// A student may start up to 10 minutes after the exam begins
const LATE_START_MINUTES = 10;

// Small allowance for slow networks when the timer hits zero
const GRACE_MS = 10 * 1000;




// Finds a published exam for a class the student is in
async function loadExam(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ success: false, message: "Exam not found" });
        return null;
    }

    const exam = await Exam.findOne({ _id: req.params.id, status: "published" });

    if (!exam || !(await Class.exists({ _id: exam.classId, students: req.user._id }))) {
        res.status(404).json({ success: false, message: "Exam not found" });
        return null;
    }

    return exam;
}

function lateStartMs(exam) {
    return Math.min(LATE_START_MINUTES, exam.durationMinutes) * 60 * 1000;
}


// MY EXAMS
router.get("/", async (req, res) => {
    try {
        const classes = await Class.find({ students: req.user._id }).select("name");
        const names = new Map(classes.map((c) => [String(c._id), c.name]));

        const exams = await Exam.find({
            classId: { $in: classes.map((c) => c._id) },
            status: "published"
        }).sort({ startsAt: 1 });

        const subs = await Submission.find({
            student: req.user._id,
            examId: { $in: exams.map((e) => e._id) }
        });

        const subByExam = new Map(subs.map((s) => [String(s.examId), s]));
        const now = Date.now();
        const result = [];

        for (const exam of exams) {

            let sub = subByExam.get(String(exam._id));

            // Time ran out while the student was away: submit automatically
            if (sub && sub.status === "in_progress" && sub.deadline.getTime() + GRACE_MS < now) {
                sub = await finalize(sub, exam, Array.from(sub.answers), true);
            }

            const startMs = exam.startsAt.getTime();
            let state;

            if (sub && sub.status === "submitted") state = "submitted";
            else if (sub) state = "in_progress";
            else if (now < startMs) state = "upcoming";
            else if (now <= startMs + lateStartMs(exam)) state = "open";
            else state = "missed";

            result.push({
                id: exam._id,
                title: exam.title,
                className: names.get(String(exam.classId)) || "",
                startsAt: exam.startsAt,
                durationMinutes: exam.durationMinutes,
                questionCount: exam.questions.length,
                totalMarks: exam.totalMarks,
                state: state,
                score: state === "submitted" ? sub.score : null
            });
        }

        res.json({ success: true, exams: result });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// START (or resume) AN EXAM
router.post("/:id/start", async (req, res) => {
    try {
        const exam = await loadExam(req, res);
        if (!exam) return;

        const now = Date.now();
        const startMs = exam.startsAt.getTime();

        let sub = await Submission.findOne({ examId: exam._id, student: req.user._id });
                const resuming = !!sub;

        if (sub && sub.status === "submitted") {
            return res.status(409).json({ success: false, message: "You have already submitted this exam." });
        }

        if (sub && sub.deadline.getTime() + GRACE_MS < now) {
            await finalize(sub, exam, Array.from(sub.answers), true);
            return res.status(409).json({ success: false, message: "Your time for this exam is over. It was submitted automatically." });
        }

        if (!sub) {

            if (now < startMs) {
                return res.status(403).json({ success: false, message: "This exam has not started yet." });
            }

            if (now > startMs + lateStartMs(exam)) {
                return res.status(403).json({ success: false, message: "The time to start this exam has passed." });
            }

            try {
                sub = await Submission.create({
                    examId: exam._id,
                    classId: exam.classId,
                    student: req.user._id,
                    startedAt: new Date(now),
                    deadline: new Date(now + exam.durationMinutes * 60 * 1000),
                    answers: exam.questions.map(() => null),
                    totalMarks: exam.totalMarks
                });
            } catch (error) {
                if (error.code !== 11000) throw error;
                sub = await Submission.findOne({ examId: exam._id, student: req.user._id });
            }
        }
                if (resuming) {
            await SecurityEvent.create({
                examId: exam._id,
                submissionId: sub._id,
                classId: exam.classId,
                student: req.user._id,
                type: "resumed",
                severity: "info"
            });
        }

        res.json({
            success: true,
            title: exam.title,
            totalMarks: exam.totalMarks,
            deadline: sub.deadline,
            serverNow: Date.now(),
            answers: Array.from(sub.answers),
            // The correct answers are NOT sent
            questions: exam.questions.map((q, i) => ({
                index: i,
                text: q.text,
                options: q.options,
                marks: q.marks
            }))
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// SAVE ONE ANSWER AS THE STUDENT CLICKS
router.post("/:id/answer", async (req, res) => {
    try {
        const exam = await loadExam(req, res);
        if (!exam) return;

        const { questionIndex, choice } = req.body;

        if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= exam.questions.length) {
            return res.status(400).json({ success: false, message: "Invalid question" });
        }

        if (!(choice === null || (Number.isInteger(choice) && choice >= 0 && choice <= 3))) {
            return res.status(400).json({ success: false, message: "Invalid answer" });
        }

        const sub = await Submission.findOneAndUpdate(
            {
                examId: exam._id,
                student: req.user._id,
                status: "in_progress",
                deadline: { $gt: new Date(Date.now() - GRACE_MS) }
            },
            { $set: { ["answers." + questionIndex]: choice } }
        );

        if (!sub) {
            return res.status(409).json({ success: false, message: "This exam is no longer open for answers." });
        }

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// SUBMIT
router.post("/:id/submit", async (req, res) => {
    try {
        const exam = await loadExam(req, res);
        if (!exam) return;

        const sub = await Submission.findOne({ examId: exam._id, student: req.user._id });

        if (!sub) {
            return res.status(404).json({ success: false, message: "You have not started this exam." });
        }

        if (sub.status === "submitted") {
            return res.json({ success: true, score: sub.score, totalMarks: sub.totalMarks });
        }

        const inTime = Date.now() <= sub.deadline.getTime() + GRACE_MS;
        const answers = inTime && Array.isArray(req.body.answers) ? req.body.answers : Array.from(sub.answers);

        const done = await finalize(sub, exam, answers, req.body.auto === true);

        res.json({ success: true, score: done.score, totalMarks: done.totalMarks });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// RECORD A SECURITY EVENT (and auto-submit after too many violations)
const MAX_VIOLATIONS = 3;
const MAJOR_EVENTS = ["tab_hidden", "window_blur", "fullscreen_exit"];
const MINOR_EVENTS = ["copy", "cut", "paste", "context_menu"];

router.post("/:id/event", async (req, res) => {
    try {
        const exam = await loadExam(req, res);
        if (!exam) return;

        const type = req.body.type;

        if (!MAJOR_EVENTS.includes(type) && !MINOR_EVENTS.includes(type)) {
            return res.status(400).json({ success: false, message: "Unknown event" });
        }

        const sub = await Submission.findOne({ examId: exam._id, student: req.user._id, status: "in_progress" });

        if (!sub || Date.now() > sub.deadline.getTime() + GRACE_MS) {
            return res.json({ success: true, ignored: true });
        }

        const isMajor = MAJOR_EVENTS.includes(type);

        // Stops anyone from flooding the database
        const total = await SecurityEvent.countDocuments({ submissionId: sub._id });

        if (total < 300) {
            await SecurityEvent.create({
                examId: exam._id,
                submissionId: sub._id,
                classId: exam.classId,
                student: req.user._id,
                type: type,
                severity: isMajor ? "major" : "minor"
            });
        }

        const violations = await SecurityEvent.countDocuments({ submissionId: sub._id, severity: "major" });

        if (isMajor && violations >= MAX_VIOLATIONS) {
            const done = await finalize(sub, exam, Array.from(sub.answers), true, "violations");

            return res.json({
                success: true,
                violations: violations,
                max: MAX_VIOLATIONS,
                autoSubmitted: true,
                score: done.score,
                totalMarks: done.totalMarks
            });
        }

        res.json({ success: true, violations: violations, max: MAX_VIOLATIONS });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});
module.exports = router;