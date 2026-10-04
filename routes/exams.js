const express = require("express");
const mongoose = require("mongoose");
const Class = require("../models/Class");
const Question = require("../models/Question");
const Exam = require("../models/Exam");
const { requireAuth, requireRole } = require("../middleware/auth");
const Submission = require("../models/Submission");

const router = express.Router();

router.use(requireAuth, requireRole("teacher"));


function describe(exam, className) {
    return {
        id: exam._id,
        title: exam.title,
        className: className,
        startsAt: exam.startsAt,
        durationMinutes: exam.durationMinutes,
        status: exam.status,
        questionCount: exam.questions.length,
        totalMarks: exam.totalMarks
    };
}

async function findOwnedExam(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ success: false, message: "Exam not found" });
        return null;
    }

    const exam = await Exam.findOne({ _id: req.params.id, teacher: req.user._id });

    if (!exam) {
        res.status(404).json({ success: false, message: "Exam not found" });
        return null;
    }

    return exam;
}


// CREATE (saved as a draft)
router.post("/", async (req, res) => {
    try {
        const { classId, title, startsAt, durationMinutes, questionIds } = req.body;

        if (typeof classId !== "string" || !mongoose.isValidObjectId(classId)) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const cls = await Class.findOne({ _id: classId, teacher: req.user._id });

        if (!cls) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const cleanTitle = typeof title === "string" ? title.trim().slice(0, 120) : "";

        if (!cleanTitle) {
            return res.status(400).json({ success: false, message: "Please enter the exam title." });
        }

        const start = new Date(startsAt);

        if (isNaN(start.getTime())) {
            return res.status(400).json({ success: false, message: "Please choose a valid start date and time." });
        }

        const duration = Math.round(Number(durationMinutes));

        if (!(duration >= 5 && duration <= 300)) {
            return res.status(400).json({ success: false, message: "Duration must be between 5 and 300 minutes." });
        }

        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            return res.status(400).json({ success: false, message: "Please select at least one question." });
        }

        const ids = [...new Set(questionIds.filter((id) => typeof id === "string" && mongoose.isValidObjectId(id)))];

        const found = await Question.find({ _id: { $in: ids }, teacher: req.user._id });

        if (ids.length === 0 || found.length !== ids.length) {
            return res.status(400).json({ success: false, message: "Some selected questions were not found." });
        }

        const byId = new Map(found.map((q) => [String(q._id), q]));

        const questions = ids.map((id) => {
            const q = byId.get(id);
            return { text: q.text, options: q.options, correctIndex: q.correctIndex, marks: q.marks };
        });

        const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

        const exam = await Exam.create({
            teacher: req.user._id,
            classId: cls._id,
            title: cleanTitle,
            startsAt: start,
            durationMinutes: duration,
            questions,
            totalMarks
        });

        res.status(201).json({ success: true, exam: describe(exam, cls.name) });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// LIST MY EXAMS
router.get("/", async (req, res) => {
    try {
        const exams = await Exam.find({ teacher: req.user._id })
            .sort({ startsAt: -1 })
            .populate("classId", "name");

        res.json({
            success: true,
            exams: exams.map((exam) =>
                describe(exam, exam.classId ? exam.classId.name : "(class deleted)")
            )
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// PUBLISH OR TAKE BACK TO DRAFT
router.post("/:id/publish", async (req, res) => {
    try {
        const exam = await findOwnedExam(req, res);
        if (!exam) return;

        const publish = req.body.publish === true;
        const now = Date.now();
        const startMs = exam.startsAt.getTime();

        if (publish) {
            if (startMs + exam.durationMinutes * 60 * 1000 <= now) {
                return res.status(400).json({ success: false, message: "This exam's time has already passed." });
            }
            exam.status = "published";
        } else {
            if (startMs <= now) {
                return res.status(400).json({ success: false, message: "This exam has already started, so it cannot go back to draft." });
            }
            exam.status = "draft";
        }

        await exam.save();

        res.json({ success: true, status: exam.status });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// DELETE
router.delete("/:id", async (req, res) => {
    try {
        const exam = await findOwnedExam(req, res);
        if (!exam) return;
                if (await Submission.exists({ examId: exam._id })) {
            return res.status(400).json({ success: false, message: "Students have already started this exam, so it cannot be deleted." });
        }

        await exam.deleteOne();

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;