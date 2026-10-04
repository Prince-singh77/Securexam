const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    severity: { type: String, enum: ["major", "minor", "info"], required: true },
    at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SecurityEvent", eventSchema);