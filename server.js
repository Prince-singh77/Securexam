const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
  const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing in .env. Server stopped.");
    process.exit(1);
}

const app = express();

  const PORT = process.env.PORT || 3000;

// ===============================
// MIDDLEWARE
// ===============================

  if (process.env.NODE_ENV === "production") {
      app.set("trust proxy", 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(express.json({ limit: "100kb" }));

app.use(express.static("public"));


// ===============================
// API ROUTES
// ===============================

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: { success: false, message: "Too many attempts. Try again in a few minutes." }
});

app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/classes", require("./routes/classes"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/questions", require("./routes/questions"));
app.use("/api/exams", require("./routes/exams"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/my-exams", require("./routes/myexams"));
app.use("/api/reports", require("./routes/reports"));


// ===============================
// MONGODB CONNECTION
// ===============================

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("MongoDB connected successfully");
    })
    .catch((error) => {
        console.error("MongoDB connection failed:");
        console.error(error.message);
    });


// ===============================
// HOME PAGE
// ===============================

app.get("/", (req, res) => {

    res.sendFile(
        __dirname + "/public/index.html"
    );

});


// ===============================
// TEST API
// ===============================

app.get("/api/status", (req, res) => {

    res.json({
        success: true,
        message: "SecureExam backend is working",
        database:
            mongoose.connection.readyState === 1
                ? "connected"
                : "not connected"
    });

});
  // ===============================
  // UNKNOWN API ADDRESSES AND ERRORS
  // ===============================

  app.use("/api", (req, res) => {
      res.status(404).json({ success: false, message: "Not found" });
  });

  app.use((error, req, res, next) => {
      const status = error.status && error.status < 500 ? error.status : 500;

      res.status(status).json({
          success: false,
          message: status < 500 ? "Bad request" : "Server error"
      });
  });

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

    console.log(
        `SecureExam running at http://localhost:${PORT}`
    );

});