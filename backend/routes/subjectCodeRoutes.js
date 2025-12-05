const express = require("express");
const SubjectCode = require("../models/SubjectCode");
const User = require("../models/User");

function requireInstructorAuth(req, res, next) {
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
    User.findById(userId)
      .then((user) => {
        if (!user || user.role !== "instructor") {
          return res.status(403).json({ success: false, message: "Forbidden: instructor access required" });
        }
        if (user.isArchived) {
          return res.status(401).json({
            success: false,
            message: "Account disabled. Please contact the Dean!",
            error: "ACCOUNT_ARCHIVED",
          });
        }
        req.user = user;
        next();
      })
      .catch((err) => {
        return res.status(500).json({ success: false, message: "Auth lookup error", details: err.message });
      });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Auth error", details: e.message });
  }
}

const router = express.Router();

// GET all subject codes
router.get("/", async (req, res) => {
  try {
    const subjectCodes = await SubjectCode.find({}).sort({ name: 1 });
    return res.json({ success: true, subjectCodes });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// CREATE subject code
router.post("/", requireInstructorAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Subject code is required" });
    }

    const cleanedName = name.trim();
    const slug = cleanedName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");

    const existing = await SubjectCode.findOne({ slug });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Subject code already exists" });
    }

    const subjectCode = new SubjectCode({ name: cleanedName, slug });
    await subjectCode.save();

    return res.status(201).json({
      success: true,
      message: "Subject code added successfully",
      subjectCode,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;

