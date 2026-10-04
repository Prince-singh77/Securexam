const Submission = require("../models/Submission");


function cleanAnswers(raw, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const value = Array.isArray(raw) ? raw[i] : null;
        out.push(Number.isInteger(value) && value >= 0 && value <= 3 ? value : null);
    }
    return out;
}

function gradeAnswers(exam, answers) {
    let score = 0;
    exam.questions.forEach((q, i) => {
        if (answers[i] === q.correctIndex) score += q.marks;
    });
    return score;
}

// Locks in the answers and calculates the score (only works once)
async function finalize(submission, exam, rawAnswers, auto, reason) {
    const answers = cleanAnswers(rawAnswers, exam.questions.length);

    const done = await Submission.findOneAndUpdate(
        { _id: submission._id, status: "in_progress" },
        {
            $set: {
                status: "submitted",
                submittedAt: new Date(),
                answers: answers,
                score: gradeAnswers(exam, answers),
                totalMarks: exam.totalMarks,
                autoSubmitted: auto,
                submitReason: reason || (auto ? "timeout" : "manual")
            }
        },
        { returnDocument: "after" }
    );

    return done || (await Submission.findById(submission._id));
}

// Submits every attempt whose time ran out while the student was away
async function finalizeExpired(exam, graceMs) {
    const stale = await Submission.find({
        examId: exam._id,
        status: "in_progress",
        deadline: { $lt: new Date(Date.now() - graceMs) }
    });

    for (const sub of stale) {
        await finalize(sub, exam, Array.from(sub.answers), true, "timeout");
    }
}

module.exports = { cleanAnswers, gradeAnswers, finalize, finalizeExpired };