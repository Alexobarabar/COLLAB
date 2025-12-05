const express = require("express");
const Instructor = require("../models/Instructor");
const User = require("../models/User");
const Section = require("../models/Section");
const Student = require("../models/Student");
const EmailService = require("../services/emailService");
const { enforcePermission } = require("../middleware/rbacMiddleware");
const router = express.Router();

// Toggle archive status for instructor and linked user
router.patch("/archive-instructor/:id", enforcePermission("archiveInstructor"), async (req, res) => {
  try {
    const { id } = req.params;
    const { isArchived } = req.body || {};
    if (typeof isArchived !== 'boolean') {
      return res.status(400).json({ success: false, message: "isArchived boolean required" });
    }

    const instructor = await Instructor.findByIdAndUpdate(
      id,
      { isArchived },
      { new: true }
    );
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }

    // Also update the corresponding user by email (case-insensitive)
    const normalizedEmail = instructor.email.toLowerCase().trim();
    await User.findOneAndUpdate(
      { email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      { isArchived },
      { new: true }
    );

    return res.json({ 
      success: true, 
      message: isArchived ? "Instructor archived successfully" : "Instructor restored successfully", 
      instructor 
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Server error", error: e.message });
  }
});

// GET sections for a specific instructor (by instructor ID from Instructor model)
router.get("/instructors/:instructorId/sections", enforcePermission("viewInstructorSections"), async (req, res) => {
  try {
    const { instructorId } = req.params;

    // Find the instructor
    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }

    // Find the user account for this instructor
    const instructorUser = await User.findOne({ 
      email: instructor.email.toLowerCase().trim(),
      role: "instructor"
    });

    if (!instructorUser) {
      return res.json({ success: true, count: 0, sections: [] });
    }

    // Get all sections for this instructor's user ID
    const sections = await Section.find({ instructorId: instructorUser._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, count: sections.length, sections });
  } catch (error) {
    console.error('Error fetching sections for instructor:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// GET students for a specific section
router.get("/sections/:sectionId/students", enforcePermission("viewStudentsBySection"), async (req, res) => {
  try {
    const { sectionId } = req.params;

    // Verify section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found" });
    }

    // Get all students for this section
    const students = await Student.find({ sectionId: sectionId })
      .populate('sectionId', 'sectionCode course yearLevel subjectCode')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: students.length, students });
  } catch (error) {
    console.error('Error fetching students for section:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// GET all students for a specific instructor (across all sections)
router.get("/instructors/:instructorId/students", enforcePermission("viewStudentsByInstructor"), async (req, res) => {
  try {
    const { instructorId } = req.params;

    // Find the instructor
    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }

    // Find the user account for this instructor
    const instructorUser = await User.findOne({ 
      email: instructor.email.toLowerCase().trim(),
      role: "instructor"
    });

    if (!instructorUser) {
      return res.json({ success: true, count: 0, students: [] });
    }

    // Get all students for this instructor across all sections
    const students = await Student.find({ instructorId: instructorUser._id })
      .populate('sectionId', 'sectionCode course yearLevel subjectCode')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: students.length, students });
  } catch (error) {
    console.error('Error fetching students for instructor:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// POST route to send evaluation form to all students (no filters)
router.post("/send-evaluation-form/all", enforcePermission("sendEvalAllStudents"), async (req, res) => {
  try {
    const { evaluationFormLink } = req.body || {};

    // Validate required fields
    if (!evaluationFormLink) {
      return res.status(400).json({ 
        success: false, 
        message: "evaluationFormLink is required" 
      });
    }

    // Get all students from the database (regardless of section or instructor)
    const students = await Student.find({})
      .populate('sectionId', 'sectionCode course yearLevel subjectCode')
      .populate('instructorId', 'name email');

    if (students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No students found in the database" 
      });
    }

    // Initialize email service
    const emailService = new EmailService();
    const results = {
      total: students.length,
      success: [],
      failed: []
    };

    // Send emails to all students
    for (const student of students) {
      try {
        const nameParts = [student.firstName, student.lastName].filter(Boolean);
        const studentName = nameParts.length > 0 ? nameParts.join(" ") : student.email;
        
        // Get instructor name from populated instructorId or use default
        const instructorName = student.instructorId?.name || 'Instructor';
        const subjectName = student.sectionId?.subjectCode || student.subject || 'General Evaluation';
        
        await emailService.sendEvaluationFormEmail(
          student.email,
          studentName,
          subjectName,
          instructorName,
          evaluationFormLink,
          {
            fromName: process.env.FROM_NAME || 'College of Technology',
            replyToEmail: process.env.REPLY_TO_EMAIL || undefined
          }
        );
        results.success.push(student.email);
      } catch (error) {
        console.error(`Failed to send email to ${student.email}:`, error);
        results.failed.push({
          email: student.email,
          error: error.message
        });
      }
    }

    // Return results
    if (results.failed.length === 0) {
      return res.json({ 
        success: true, 
        message: `Evaluation form sent successfully to all ${results.success.length} students.`,
        results
      });
    } else if (results.success.length > 0) {
      return res.status(207).json({ 
        success: true, 
        message: `Evaluation form sent to ${results.success.length} students. ${results.failed.length} failed.`,
        results
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send evaluation forms to all students.",
        results
      });
    }
  } catch (error) {
    console.error('Error sending evaluation form to all students:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// POST route to send evaluation form to all students under a selected instructor
router.post("/send-evaluation-form/instructor/:instructorId", enforcePermission("sendEvalByInstructor"), async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { evaluationFormLink } = req.body || {};

    // Validate required fields
    if (!evaluationFormLink) {
      return res.status(400).json({ 
        success: false, 
        message: "evaluationFormLink is required" 
      });
    }

    // Find the instructor
    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      return res.status(404).json({ 
        success: false, 
        message: "Instructor not found" 
      });
    }

    // Find the user account for this instructor
    const instructorUser = await User.findOne({ 
      email: instructor.email.toLowerCase().trim(),
      role: "instructor"
    });

    if (!instructorUser) {
      return res.status(404).json({ 
        success: false, 
        message: "Instructor user account not found" 
      });
    }

    // Get all sections assigned to this instructor
    const sections = await Section.find({ instructorId: instructorUser._id });
    const sectionIds = sections.map(s => s._id);

    // Get all students under those sections
    const students = await Student.find({ sectionId: { $in: sectionIds } })
      .populate('sectionId', 'sectionCode course yearLevel subjectCode')
      .populate('instructorId', 'name email');

    if (students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No students found for this instructor" 
      });
    }

    // Initialize email service
    const emailService = new EmailService();
    const results = {
      total: students.length,
      success: [],
      failed: []
    };

    // Send emails to all students
    for (const student of students) {
      try {
        const nameParts = [student.firstName, student.lastName].filter(Boolean);
        const studentName = nameParts.length > 0 ? nameParts.join(" ") : student.email;
        const subjectName = student.sectionId?.subjectCode || student.subject || 'General Evaluation';
        
        await emailService.sendEvaluationFormEmail(
          student.email,
          studentName,
          subjectName,
          instructor.name,
          evaluationFormLink,
          {
            fromName: process.env.FROM_NAME || 'College of Technology',
            replyToEmail: process.env.REPLY_TO_EMAIL || instructor.email
          }
        );
        results.success.push(student.email);
      } catch (error) {
        console.error(`Failed to send email to ${student.email}:`, error);
        results.failed.push({
          email: student.email,
          error: error.message
        });
      }
    }

    // Return results
    if (results.failed.length === 0) {
      return res.json({ 
        success: true, 
        message: `Evaluation form sent successfully to all ${results.success.length} students under ${instructor.name}.`,
        results
      });
    } else if (results.success.length > 0) {
      return res.status(207).json({ 
        success: true, 
        message: `Evaluation form sent to ${results.success.length} students under ${instructor.name}. ${results.failed.length} failed.`,
        results
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send evaluation forms to all students.",
        results
      });
    }
  } catch (error) {
    console.error('Error sending evaluation form to instructor students:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// POST route to send evaluation form to a specific section
router.post("/send-evaluation-form/section/:sectionId", enforcePermission("sendEvalBySection"), async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { evaluationFormLink } = req.body || {};

    // Validate required fields
    if (!evaluationFormLink) {
      return res.status(400).json({ 
        success: false, 
        message: "evaluationFormLink is required" 
      });
    }

    // Verify section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ 
        success: false, 
        message: "Section not found" 
      });
    }

    // Get instructor info
    const instructorUser = await User.findById(section.instructorId);
    if (!instructorUser) {
      return res.status(404).json({ 
        success: false, 
        message: "Instructor user account not found" 
      });
    }

    const instructor = await Instructor.findOne({ email: instructorUser.email });
    const instructorName = instructor?.name || 'Instructor';

    // Get all students for this section
    const students = await Student.find({ sectionId: sectionId })
      .populate('sectionId', 'sectionCode course yearLevel subjectCode')
      .populate('instructorId', 'name email');

    if (students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No students found in this section" 
      });
    }

    // Initialize email service
    const emailService = new EmailService();
    const results = {
      total: students.length,
      success: [],
      failed: []
    };

    // Send emails to all students
    for (const student of students) {
      try {
        const nameParts = [student.firstName, student.lastName].filter(Boolean);
        const studentName = nameParts.length > 0 ? nameParts.join(" ") : student.email;
        const subjectName = section.subjectCode || student.subject || 'General Evaluation';
        
        await emailService.sendEvaluationFormEmail(
          student.email,
          studentName,
          subjectName,
          instructorName,
          evaluationFormLink,
          {
            fromName: process.env.FROM_NAME || 'College of Technology',
            replyToEmail: process.env.REPLY_TO_EMAIL || instructorUser.email
          }
        );
        results.success.push(student.email);
      } catch (error) {
        console.error(`Failed to send email to ${student.email}:`, error);
        results.failed.push({
          email: student.email,
          error: error.message
        });
      }
    }

    // Return results
    if (results.failed.length === 0) {
      return res.json({ 
        success: true, 
        message: `Evaluation form sent successfully to all ${results.success.length} students in section ${section.sectionCode}.`,
        results
      });
    } else if (results.success.length > 0) {
      return res.status(207).json({ 
        success: true, 
        message: `Evaluation form sent to ${results.success.length} students in section ${section.sectionCode}. ${results.failed.length} failed.`,
        results
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send evaluation forms to all students.",
        results
      });
    }
  } catch (error) {
    console.error('Error sending evaluation form to section students:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

module.exports = router;


