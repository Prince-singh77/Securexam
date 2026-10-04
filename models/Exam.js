const mongoose = require("mongoose");

const examQuestionSchema = new mongoose.Schema({
    text: { type: String, required: true },
    options: { type: [String], required: true },
    correctIndex: { type: Number, required: true },
    marks: { type: Number, required: true }
});

const examSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    title: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 300 },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    questions: [examQuestionSchema],
    totalMarks: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Exam", examSchema);