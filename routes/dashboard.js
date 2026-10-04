const express = require("express");
const Class = require("../models/Class");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const Exam = require("../models/Exam");
const { requireAuth, requireRole } = require("../middleware/auth");
const SecurityEvent = require("../models/SecurityEvent");

const router = express.Router();

router.use(requireAuth, requireRole("teacher"));


router.get("/teacher", async (req, res) => {
    try {
        const classes = await Class.find({ teacher: req.user._id })
            .sort({ startTime: 1, name: 1 })
            .lean();

        const classIds = classes.map((c) => c._id);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const sessions = await AttendanceSession.find({
            classId: { $in: classIds },
            startedAt: { $gte: startOfDay }
        }).sort({ startedAt: -1 }).lean();

        // The latest session today for each class
        const latest = new Map();
        sessions.forEach((s) => {
            const key = String(s.classId);
            if (!latest.has(key)) latest.set(key, s);
        });

        const sessionIds = Array.from(latest.values()).map((s) => s._id);

        const counts = sessionIds.length
            ? await AttendanceRecord.aggregate([
                { $match: { sessionId: { $in: sessionIds } } },
                { $group: { _id: "$sessionId", count: { $sum: 1 } } }
            ])
            : [];

        const countBySession = new Map(counts.map((c) => [String(c._id), c.count]));

        let presentToday = 0;
        let enrolledToday = 0;
        const everyStudent = new Set();

        const classRows = classes.map((c) => {
            c.students.forEach((s) => everyStudent.add(String(s)));

            const total = c.students.length;
            const session = latest.get(String(c._id));
            let present = null;

            if (session) {
                present = countBySession.get(String(session._id)) || 0;
                presentToday += present;
                enrolledToday += total;
            }

            return {
                id: c._id,
                name: c.name,
                department: c.department,
                room: c.room,
                startTime: c.startTime,
                total: total,
                present: present
            };
        });

        const now = new Date();

        const upcoming = await Exam.find({ teacher: req.user._id, startsAt: { $gt: now } })
            .sort({ startsAt: 1 })
            .limit(5)
            .populate("classId", "name")
            .lean();

        const upcomingCount = await Exam.countDocuments({
            teacher: req.user._id,
            startsAt: { $gt: now }
        });
        // Students flagged for major violations in the last 7 days
        const examIds = (await Exam.find({ teacher: req.user._id }).select("_id").lean()).map((e) => e._id);

        const alertGroups = examIds.length
            ? await SecurityEvent.aggregate([
                {
                    $match: {
                        examId: { $in: examIds },
                        severity: "major",
                        at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                    }
                },
                { $group: { _id: { exam: "$examId", student: "$student" } } }
            ])
            : [];
        res.json({
            success: true,
            activeClasses: classes.length,
            studentCount: everyStudent.size,
            presentToday: presentToday,
            enrolledToday: enrolledToday,
            attendancePercent: enrolledToday > 0 ? Math.round((presentToday / enrolledToday) * 100) : null,
            upcomingCount: upcomingCount,
                        securityAlerts: alertGroups.length,
            classes: classRows,
            upcomingExams: upcoming.map((e) => ({
                id: e._id,
                title: e.title,
                className: e.classId ? e.classId.name : "",
                startsAt: e.startsAt,
                durationMinutes: e.durationMinutes,
                questionCount: e.questions.length,
                status: e.status
            }))
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});


module.exports = router;