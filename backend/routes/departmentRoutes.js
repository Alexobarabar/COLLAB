const express = require("express");
const Department = require("../models/Department");

const router = express.Router();

// Get all departments sorted alphabetically
router.get("/", async (req, res) => {
  try {
    const departments = await Department.find({}).sort({ name: 1 });
    return res.json({ success: true, departments });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// Create a new department
router.post("/", async (req, res) => {
  try {
    const { name } = req.body || {};

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Department name is required" });
    }

    const cleanedName = name.trim();
    const slug = cleanedName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");

    const existing = await Department.findOne({ slug });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Department already exists",
      });
    }

    const department = new Department({ name: cleanedName, slug });
    await department.save();

    return res
      .status(201)
      .json({
        success: true,
        message: "Department created successfully",
        department,
      });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;

