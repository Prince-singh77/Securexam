const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, trim: true, default: "General" },
    text: { type: String, required: true, trim: true },
    options: {
        type: [String],
        validate: {
            validator: (list) => list.length === 4 && list.every((o) => o.trim().length > 0),
            message: "Exactly four non-empty options are required"
        }
    },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
    marks: { type: Number, default: 1, min: 1, max: 10 }
}, { timestamps: true });

module.exports = mongoose.model("Question", questionSchema);