const mongoose = require("mongoose");
const classSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    department: { type: String, trim: true, default: "" },
    room: { type: String, trim: true, default: "" },
    startTime: { type: String, trim: true, default: "" },
    joinCode: { type: String, required: true, unique: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

module.exports = mongoose.model("Class", classSchema);