const express = require("express");
const router = express.Router();
const { createEvaluationForm, getEvaluationResponses, getGoogleFormInfo } = require("../controllers/evaluationController");
const { startAuth, oauthCallback, authStatus } = require("../controllers/googleOAuthController");
const User = require("../models/User");

function requireDeanAuth(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: "Missing Authorization token" });
    }
    const match = token.match(/^user_([a-f\d]{24})_\d+$/i);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid token format" });
    }
    const userId = match[1];
    User.findById(userId).then((user) => {
      if (!user || user.role !== "dean") {
        return res.status(403).json({ success: false, message: "Forbidden: dean access required" });
      }
      req.user = user;
      next();
    }).catch((err) => {
      return res.status(500).json({ success: false, message: "Auth lookup error", details: err.message });
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Auth error", details: e.message });
  }
}

// POST /api/google-forms/create
router.post("/create", requireDeanAuth, (req, res) => {
  // Ensure createdBy exists for controller validation
  req.body = { ...(req.body || {}), createdBy: req.user?._id };
  return createEvaluationForm(req, res);
});

// GET /api/google-forms/responses/:spreadsheetId
router.get("/responses/:spreadsheetId", getEvaluationResponses);

// OAuth routes
router.get("/auth", startAuth);
router.get("/oauth2callback", oauthCallback);
router.get("/auth/status", authStatus);

// Live Google Form info for preview
router.get("/form/:formId", getGoogleFormInfo);

module.exports = router;


