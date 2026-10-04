# SecureExam

Secure online classroom platform: dynamic QR attendance, online exams with
anti-cheating monitoring, results analytics and security reports.

## Run it

1. Install Node.js and create a free MongoDB Atlas cluster.
2. Copy `.env.example` to `.env` and fill in the values.
3. `npm install`
4. `npm start` and open http://localhost:3000
5. Optional demo data: `npm run seed`

## Features

- Accounts with hashed passwords and signed login tokens; teachers need an invite code
- Classes with join codes
- Attendance with a QR code that changes every 15 seconds, one scan per student per session
- Question bank and exam builder (answers are copied into the exam when it is created)
- Timed exams: server-side clock, auto-save, auto-submit, one attempt per student
- Monitoring: tab switches, leaving the window, leaving full screen, copy/paste attempts;
  auto-submit after 3 warnings
- Results, score distribution, question analysis, CSV export, per-student security timelines

## Tech

Node.js, Express 5, MongoDB with Mongoose, plain HTML/CSS/JavaScript.