const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    secret: { type: String, required: true, select: false },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model("AttendanceSession", sessionSchema);