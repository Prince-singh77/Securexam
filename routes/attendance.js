const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const Class = require("../models/Class");
const AttendanceSession = require("../models/AttendanceSession");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROTATE_SECONDS, currentToken, isValidToken, msUntilRotation } = require("../utils/qrToken");
const AttendanceRecord = require("../models/AttendanceRecord");

const router = express.Router();

router.use(requireAuth);


function baseUrl(req) {
    const base = process.env.APP_URL || (req.protocol + "://" + req.get("host"));
    return base.replace(/\/+$/, "");
}

function isActive(session) {
    return session.status === "active" && session.endsAt > new Date();
}

// Finds a session that belongs to the logged-in teacher
async function loadOwnedSession(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ success: false, message: "Session not found" });
        return null;
    }

    const session = await AttendanceSession
        .findOne({ _id: req.params.id, teacher: req.user._id })
        .select("+secret");

    if (!session) {
        res.status(404).json({ success: false, message: "Session not found" });
        return null;
    }

    return session;
}


// START A SESSION (teacher, for one of their own classes)
router.post("/sessions", requireRole("teacher"), async (req, res) => {
    try {
        const classId = req.body.classId;

        if (typeof classId !== "string" || !mongoose.isValidObjectId(classId)) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const cls = await Class.findOne({ _id: classId, teacher: req.user._id });

        if (!cls) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        let minutes = Math.round(Number(req.body.minutes)) || 10;
        minutes = Math.min(Math.max(minutes, 1), 60);

        // Only one live session per class
        await AttendanceSession.updateMany(
            { classId: cls._id, status: "active" },
            { status: "closed" }
        );

        const session = await AttendanceSession.create({
            classId: cls._id,
            teacher: req.user._id,
            secret: crypto.randomBytes(32).toString("hex"),
            endsAt: new Date(Date.now() + minutes * 60 * 1000)
        });

        res.status(201).json({
            success: true,
            session: {
                id: session._id,
                classId: cls._id,
                className: cls.name,
                endsAt: session.endsAt,
                rotateSeconds: ROTATE_SECONDS
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// GET THE CURRENT QR CODE (teacher who owns the session)
router.get("/sessions/:id/qr", requireRole("teacher"), async (req, res) => {
    try {
        const session = await loadOwnedSession(req, res);
        if (!session) return;

        if (!isActive(session)) {
            return res.status(410).json({ success: false, message: "This attendance session has ended" });
        }

        const token = currentToken(session);
        const url = baseUrl(req) + "/scan.html?s=" + session._id + "&t=" + token;

        const qr = await QRCode.toDataURL(url, {
            width: 320,
            margin: 2,
            errorCorrectionLevel: "M"
        });

        res.set("Cache-Control", "no-store");

        res.json({
            success: true,
            qr: qr,
            url: url,
            nextRefreshMs: msUntilRotation(),
            secondsLeft: Math.max(0, Math.round((session.endsAt - Date.now()) / 1000))
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// END A SESSION EARLY (teacher who owns the session)
router.post("/sessions/:id/close", requireRole("teacher"), async (req, res) => {
    try {
        const session = await loadOwnedSession(req, res);
        if (!session) return;

        session.status = "closed";
        await session.save();

        res.json({ success: true, message: "Attendance session closed" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// MARK MY ATTENDANCE (students only, after scanning the QR code)
router.post("/mark", requireRole("student"), async (req, res) => {
    try {
        const { sessionId, token } = req.body;

        if (typeof sessionId !== "string" || !mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ success: false, message: "This QR code is not valid." });
        }

        const session = await AttendanceSession.findById(sessionId).select("+secret");

        if (!session || !isActive(session)) {
            return res.status(410).json({ success: false, message: "This attendance session has ended." });
        }

        if (!isValidToken(session, token)) {
            return res.status(400).json({ success: false, message: "This QR code has expired. Please scan the screen again." });
        }

        const cls = await Class.findOne({ _id: session.classId, students: req.user._id });

        if (!cls) {
            return res.status(403).json({ success: false, message: "You are not enrolled in this class. Join it from My Classes first." });
        }

        try {
            await AttendanceRecord.create({
                sessionId: session._id,
                classId: cls._id,
                student: req.user._id
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.json({ success: true, alreadyMarked: true, className: cls.name });
            }
            throw error;
        }

        res.status(201).json({ success: true, className: cls.name });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// WHO IS PRESENT AND ABSENT (teacher who owns the session)
router.get("/sessions/:id/records", requireRole("teacher"), async (req, res) => {
    try {
        const session = await loadOwnedSession(req, res);
        if (!session) return;

        const cls = await Class.findById(session.classId).populate("students", "name email");

        const records = await AttendanceRecord.find({ sessionId: session._id })
            .populate("student", "name email")
            .sort({ markedAt: 1 });

        const present = records.filter((r) => r.student);
        const presentIds = new Set(present.map((r) => String(r.student._id)));
        const students = cls ? cls.students : [];

        res.json({
            success: true,
            className: cls ? cls.name : "",
            total: students.length,
            presentCount: present.length,
            present: present.map((r) => ({
                id: r.student._id,
                name: r.student.name,
                email: r.student.email,
                                markedAt: r.markedAt,
                method: r.method
            })),
            absent: students
                .filter((s) => !presentIds.has(String(s._id)))
                .map((s) => ({ id: s._id, name: s.name, email: s.email }))
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// FIND THE LIVE SESSION OF A CLASS (so a refreshed page can continue)
router.get("/sessions/active/:classId", requireRole("teacher"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.classId)) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const cls = await Class.findOne({ _id: req.params.classId, teacher: req.user._id });

        if (!cls) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const session = await AttendanceSession.findOne({
            classId: cls._id,
            teacher: req.user._id,
            status: "active",
            endsAt: { $gt: new Date() }
        }).sort({ startedAt: -1 });

        if (!session) {
            return res.json({ success: true, session: null });
        }

        res.json({
            success: true,
            session: {
                id: session._id,
                classId: cls._id,
                className: cls.name,
                endsAt: session.endsAt,
                rotateSeconds: ROTATE_SECONDS
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// MARK A STUDENT PRESENT OR ABSENT BY HAND (teacher who owns the session)
router.post("/sessions/:id/manual", requireRole("teacher"), async (req, res) => {
    try {
        const session = await loadOwnedSession(req, res);
        if (!session) return;

        const { studentId, present } = req.body;

        if (typeof studentId !== "string" || !mongoose.isValidObjectId(studentId) || typeof present !== "boolean") {
            return res.status(400).json({ success: false, message: "Invalid request" });
        }

        const enrolled = await Class.findOne({ _id: session.classId, students: studentId });

        if (!enrolled) {
            return res.status(404).json({ success: false, message: "That student is not in this class" });
        }

        if (present) {
            await AttendanceRecord.updateOne(
                { sessionId: session._id, student: studentId },
                { $setOnInsert: { classId: session.classId, markedAt: new Date(), method: "manual" } },
                { upsert: true }
            );
        } else {
            await AttendanceRecord.deleteOne({ sessionId: session._id, student: studentId });
        }

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;