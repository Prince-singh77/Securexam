const mongoose = require("mongoose");

const recordSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceSession", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        markedAt: { type: Date, default: Date.now },
    method: { type: String, enum: ["qr", "manual"], default: "qr" }
});

// One student can only be marked once per session
recordSchema.index({ sessionId: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceRecord", recordSchema);