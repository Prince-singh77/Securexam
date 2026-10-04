const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function makeToken(user) {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );
}

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, role, inviteCode } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Name, email and password are required" });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
        }

        const wantsTeacher = role !== "student";

        if (wantsTeacher) {
            if (!process.env.TEACHER_INVITE_CODE || inviteCode !== process.env.TEACHER_INVITE_CODE) {
                return res.status(403).json({ success: false, message: "A valid teacher invite code is required" });
            }
        }

        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) {
            return res.status(400).json({ success: false, message: "Email already registered" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({
            name,
            email,
            password: hashed,
            role: wantsTeacher ? "teacher" : "student"
        });

        res.status(201).json({
            success: true,
            token: makeToken(user),
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: (email || "").toLowerCase() });
        if (!user || !(await bcrypt.compare(password || "", user.password))) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        res.json({
            success: true,
            token: makeToken(user),
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// WHO AM I (checks the token is still valid)
router.get("/me", requireAuth, (req, res) => {
    res.json({
        success: true,
        user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role }
    });
});

module.exports = router;