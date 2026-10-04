const crypto = require("crypto");

// The QR code changes every 15 seconds.
// A scan stays valid for 15 to 30 seconds.
const ROTATE_SECONDS = 15;

function windowNumber(time = Date.now()) {
    return Math.floor(time / (ROTATE_SECONDS * 1000));
}

function tokenFor(secret, sessionId, windowNo) {
    return crypto
        .createHmac("sha256", secret)
        .update(sessionId + "." + windowNo)
        .digest("hex")
        .slice(0, 24);
}

function currentToken(session, now = Date.now()) {
    return tokenFor(session.secret, String(session._id), windowNumber(now));
}

function isValidToken(session, token, now = Date.now()) {
    if (typeof token !== "string" || !/^[0-9a-f]{24}$/.test(token)) {
        return false;
    }

    const current = windowNumber(now);

    return [current, current - 1].some((windowNo) => {
        const expected = tokenFor(session.secret, String(session._id), windowNo);
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
    });
}

function msUntilRotation(now = Date.now()) {
    const size = ROTATE_SECONDS * 1000;
    return size - (now % size);
}

module.exports = { ROTATE_SECONDS, currentToken, isValidToken, msUntilRotation };