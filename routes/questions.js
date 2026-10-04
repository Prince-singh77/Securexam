const express = require("express");
const mongoose = require("mongoose");
const Question = require("../models/Question");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("teacher"));


// Checks and cleans what the teacher typed
function cleanQuestion(body) {

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const subject = typeof body.subject === "string" && body.subject.trim()
        ? body.subject.trim().slice(0, 40)
        : "General";
    const options = Array.isArray(body.options)
        ? body.options.map((o) => (typeof o === "string" ? o.trim() : ""))
        : [];
    const correctIndex = Number(body.correctIndex);
    const marks = Math.min(Math.max(Math.round(Number(body.marks)) || 1, 1), 10);

    if (!text) return { error: "Please type the question." };
    if (text.length > 1000) return { error: "The question is too long." };
    if (options.length !== 4 || options.some((o) => !o)) return { error: "Please fill in all four options." };
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return { error: "Please choose the correct answer." };

    return { value: { text, subject, options, correctIndex, marks } };
}


// ADD
router.post("/", async (req, res) => {
    try {
        const result = cleanQuestion(req.body);

        if (result.error) {
            return res.status(400).json({ success: false, message: result.error });
        }

        const question = await Question.create({ ...result.value, teacher: req.user._id });

        res.status(201).json({ success: true, question });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// LIST (optionally for one subject)
router.get("/", async (req, res) => {
    try {
        const filter = { teacher: req.user._id };

        if (typeof req.query.subject === "string" && req.query.subject) {
            filter.subject = req.query.subject;
        }

        const questions = await Question.find(filter).sort({ createdAt: -1 });
        const subjects = await Question.distinct("subject", { teacher: req.user._id });

        res.json({ success: true, questions, subjects: subjects.sort() });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// EDIT
router.put("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Question not found" });
        }

        const result = cleanQuestion(req.body);

        if (result.error) {
            return res.status(400).json({ success: false, message: result.error });
        }

        const question = await Question.findOneAndUpdate(
            { _id: req.params.id, teacher: req.user._id },
            result.value,
            { returnDocument: "after", runValidators: true }
        );

        if (!question) {
            return res.status(404).json({ success: false, message: "Question not found" });
        }

        res.json({ success: true, question });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// DELETE
router.delete("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Question not found" });
        }

        const removed = await Question.findOneAndDelete({ _id: req.params.id, teacher: req.user._id });

        if (!removed) {
            return res.status(404).json({ success: false, message: "Question not found" });
        }

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;