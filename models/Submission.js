const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true },
    submittedAt: { type: Date },
    status: { type: String, enum: ["in_progress", "submitted"], default: "in_progress" },
    answers: { type: [Number], default: [] },
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    autoSubmitted: { type: Boolean, default: false },
    submitReason: { type: String, enum: ["manual", "timeout", "violations"] },
}, { timestamps: true });

// A student can attempt each exam only once
submissionSchema.index({ examId: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("Submission", submissionSchema);