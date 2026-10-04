const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Class = require("../models/Class");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

function makeJoinCode() {
    return crypto.randomBytes(3).toString("hex").toUpperCase();
}


// CREATE A CLASS (teachers only)
router.post("/", requireRole("teacher"), async (req, res) => {
    try {
        const { name, department, room, startTime } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Class name is required" });
        }

        let created = null;

        for (let i = 0; i < 5 && !created; i++) {
            try {
                created = await Class.create({
                    name,
                    department,
                    room,
                    startTime,
                    teacher: req.user._id,
                    joinCode: makeJoinCode()
                });
            } catch (error) {
                if (error.code !== 11000) throw error;
            }
        }

        if (!created) {
            return res.status(500).json({ success: false, message: "Could not create class. Try again." });
        }

        res.status(201).json({ success: true, class: created });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// LIST MY CLASSES (teacher: classes they teach, student: classes they joined)
router.get("/", async (req, res) => {
    try {
        const isTeacher = req.user.role === "teacher";
        const filter = isTeacher ? { teacher: req.user._id } : { students: req.user._id };

        const classes = await Class.find(filter)
            .sort({ createdAt: -1 })
            .select(isTeacher ? "" : "-joinCode -students")
            .populate("teacher", "name");

        res.json({ success: true, classes });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// JOIN A CLASS (students only)
router.post("/join", requireRole("student"), async (req, res) => {
    try {
        const code = (req.body.joinCode || "").trim().toUpperCase();

        const cls = await Class.findOneAndUpdate(
            { joinCode: code },
            { $addToSet: { students: req.user._id } },
            { returnDocument: "after" }
        );

        if (!cls) {
            return res.status(404).json({ success: false, message: "Invalid join code" });
        }

        res.json({ success: true, message: "You joined " + cls.name });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// ONE CLASS (its teacher, or a student who joined it)
router.get("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const cls = await Class.findById(req.params.id)
            .populate("teacher", "name email")
            .populate("students", "name email");

        if (!cls) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const isOwner = cls.teacher._id.equals(req.user._id);
        const isEnrolled = cls.students.some((s) => s._id.equals(req.user._id));

        if (!isOwner && !isEnrolled) {
            return res.status(403).json({ success: false, message: "You do not have access to this class" });
        }

        const data = cls.toObject();

        if (!isOwner) {
            delete data.joinCode;
            delete data.students;
        }

        res.json({ success: true, class: data });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// DELETE A CLASS (its teacher only)
router.delete("/:id", requireRole("teacher"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const removed = await Class.findOneAndDelete({
            _id: req.params.id,
            teacher: req.user._id
        });

        if (!removed) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        res.json({ success: true, message: "Class deleted" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;