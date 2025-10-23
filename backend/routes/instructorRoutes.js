const express = require("express");
const Instructor = require("../models/Instructor");
const router = express.Router();

// Get all instructors
router.get("/", async (req, res) => {
  try {
    const instructors = await Instructor.find({ isActive: true });
    res.json({ success: true, instructors });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get instructor by ID
router.get("/:id", async (req, res) => {
  try {
    const instructor = await Instructor.findById(req.params.id);
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }
    res.json({ success: true, instructor });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Create new instructor (Admin only)
router.post("/", async (req, res) => {
  try {
    const { name, email, department, courses } = req.body;
    
    if (!name || !email || !department) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email, and department are required" 
      });
    }

    const instructor = new Instructor({
      name,
      email,
      department,
      courses: courses || [],
    });

    await instructor.save();
    res.status(201).json({ success: true, instructor });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "Instructor with this email already exists" 
      });
    }
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Update instructor
router.put("/:id", async (req, res) => {
  try {
    const instructor = await Instructor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }
    
    res.json({ success: true, instructor });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Delete instructor (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const instructor = await Instructor.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }
    
    res.json({ success: true, message: "Instructor deactivated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
