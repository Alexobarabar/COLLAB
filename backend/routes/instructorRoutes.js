const express = require("express");
const mongoose = require("mongoose");
const Instructor = require("../models/Instructor");
const Evaluation = require("../models/Evaluation");
const User = require("../models/User");
const Student = require("../models/Student");
const bcrypt = require("bcrypt");
const router = express.Router();
const crypto = require("crypto");
const EmailService = require("../services/emailService");
const { enforcePermission } = require("../middleware/rbacMiddleware");

// Get instructors (filter by archived via query)
router.get("/", enforcePermission("viewInstructorList"), async (req, res) => {
  try {
    const { archived } = req.query;
    const filter = {};
    if (archived === 'true') {
      // Get only archived instructors
      filter.isArchived = true;
    } else {
      // Get only active instructors (not archived)
      // This handles both archived='false' and when archived is not provided
      filter.isArchived = { $ne: true };
    }
    const instructors = await Instructor.find(filter);
    
    // Add student count for each instructor
    const instructorsWithCounts = await Promise.all(
      instructors.map(async (instructor) => {
        // Find the user account for this instructor
        const instructorUser = await User.findOne({
          email: instructor.email.toLowerCase().trim(),
          role: "instructor"
        });
        
        let studentCount = 0;
        if (instructorUser) {
          // Count all students assigned to this instructor
          studentCount = await Student.countDocuments({ instructorId: instructorUser._id });
        }
        
        // Convert instructor to plain object and add student count
        const instructorObj = instructor.toObject();
        instructorObj.totalStudents = studentCount;
        return instructorObj;
      })
    );
    
    res.json({ success: true, instructors: instructorsWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get instructor by ID
router.get("/:id", enforcePermission("viewInstructorDetails"), async (req, res) => {
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
router.post("/", enforcePermission("createInstructor"), async (req, res) => {
  try {
    const { name, email, department } = req.body;
    const cleanedDepartment = typeof department === 'string' ? department.trim() : '';
    
    if (!name || !email || !cleanedDepartment) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, department, and email are required" 
      });
    }

    // Generate a secure random password
    // 16 chars: upper, lower, digits, symbols (without confusing quotes/backticks)
    const candidate = crypto.randomBytes(24).toString("base64").replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
    const symbols = "!@#$%^&*";
    const instructorPassword = `${candidate}${symbols[Math.floor(Math.random()*symbols.length)]}${Math.floor(Math.random()*10)}`;
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(instructorPassword, saltRounds);

    // Generate a unique username based on name/email
    const baseUsername = (name || email).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'instructor';
    let username = baseUsername;
    let suffix = 0;
    // Ensure uniqueness
    // eslint-disable-next-line no-constant-condition
    while (await Instructor.exists({ username })) {
      suffix += 1;
      username = `${baseUsername}${suffix}`;
    }

    // Create instructor record
    const instructor = new Instructor({
      name,
      email,
      department: cleanedDepartment,
      username,
    });

    // Create user account for instructor using the exact email provided
    const instructorUser = new User({
      email: email, // Use the actual email from the form
      password: hashedPassword,
      role: "instructor",
      authProvider: "local",
    });

    // Save both records
    await instructor.save();
    await instructorUser.save();

    // Send credentials email (best-effort)
    try {
      const emailService = new EmailService();
      await emailService.sendInstructorCredentialsEmail(
        email,
        name,
        instructorPassword,
        {
          fromName: process.env.FROM_NAME || 'College of Technology',
          replyToEmail: process.env.REPLY_TO_EMAIL || undefined,
          username,
        }
      );
    } catch (e) {
      console.warn('Could not send instructor credentials email:', e.message);
    }

    res.status(201).json({ 
      success: true, 
      message: "Instructor created and credentials emailed.",
      instructor
    });
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
router.put("/:id", enforcePermission("editInstructor"), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { version, ...updates } = req.body || {};

    if (version === undefined || version === null) {
      return res.status(400).json({
        success: false,
        message: "MVCC version is required to update an instructor",
      });
    }

    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });

    const instructor = await Instructor.findById(req.params.id)
      .session(session)
      .readConcern("snapshot");

    if (!instructor) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }

    if (instructor.version !== version) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "Instructor was updated by someone else. Refresh and try again.",
        error: "INSTRUCTOR_VERSION_CONFLICT",
        conflict: {
          currentVersion: instructor.version,
          attemptedVersion: version,
          documentId: instructor._id,
        },
      });
    }

    // Prevent clients from spoofing MVCC/internal fields
    delete updates.version;
    delete updates.lastModifiedAt;
    delete updates.lastModifiedBy;
    delete updates.conflictResolution;

    Object.assign(instructor, updates);
    instructor.lastModifiedBy = req.user?._id || instructor.lastModifiedBy;
    instructor.lastModifiedAt = new Date();

    await instructor.save({ session });
    await session.commitTransaction();

    res.json({
      success: true,
      instructor,
      mvcc: {
        version: instructor.version,
        transactionId: session.id?.toString() || "committed",
      },
    });
  } catch (error) {
    await session.abortTransaction();

    if (
      error.code === "INSTRUCTOR_VERSION_CONFLICT" ||
      error.name === "InstructorVersionConflictError"
    ) {
      return res.status(409).json({
        success: false,
        message: "Instructor was updated by someone else. Refresh and try again.",
        error: "INSTRUCTOR_VERSION_CONFLICT",
        conflict: {
          currentVersion: error.currentVersion,
          attemptedVersion: error.attemptedVersion,
          documentId: error.documentId,
        },
      });
    }

    res.status(500).json({ success: false, message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
});

// Delete instructor (hard delete with cascade)
router.delete("/:id", enforcePermission("deleteInstructor"), async (req, res) => {
  try {
    const instructorId = req.params.id;
    
    // Check if instructor exists
    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }

    // Get the actual email from the instructor record
    const instructorEmail = instructor.email;

    // Check if instructor has evaluations
    const evaluationCount = await Evaluation.countDocuments({ instructorId });
    
    if (evaluationCount > 0) {
      // Delete all evaluations for this instructor
      await Evaluation.deleteMany({ instructorId });
      console.log(`Deleted ${evaluationCount} evaluations for instructor ${instructor.name}`);
    }

    // Delete the instructor user account using the actual email
    const deletedUser = await User.findOneAndDelete({ email: instructorEmail });
    if (deletedUser) {
      console.log(`Deleted user account for instructor ${instructor.name} (${instructorEmail})`);
    }

    // Delete the instructor
    await Instructor.findByIdAndDelete(instructorId);
    
    res.json({ 
      success: true, 
      message: `Instructor "${instructor.name}", user account, and ${evaluationCount} related evaluations deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting instructor:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
