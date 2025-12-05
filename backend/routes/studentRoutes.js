const express = require("express");
const Student = require("../models/Student");
const Section = require("../models/Section");
const User = require("../models/User");
const Instructor = require("../models/Instructor");
const EmailService = require("../services/emailService");
const { enforcePermission } = require("../middleware/rbacMiddleware");
const router = express.Router();

// Simple token-based auth middleware compatible with existing login tokens (user_<id>_timestamp)
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
    User.findById(userId).then((user) => {
      if (!user || user.role !== "instructor") {
        return res.status(403).json({ success: false, message: "Forbidden: instructor access required" });
      }
      // Check if account is archived
      if (user.isArchived) {
        return res.status(401).json({ 
          success: false, 
          message: "Account disabled. Please contact the Dean!",
          error: "ACCOUNT_ARCHIVED"
        });
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

// Reference lists for options (can be moved to DB later)
const YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const SECTIONS_BY_YEAR = {
  "1st Year": ["A", "B", "C", "D", "E"],
  "2nd Year": ["A", "B", "C", "D", "E"],
  "3rd Year": ["A", "B", "C", "D", "E"],
  "4th Year": ["A", "B", "C", "D", "E"],
};
const SUBJECTS = {
  "1st Year": ["Intro to IT", "Programming 1", "Computer Systems"],
  "2nd Year": ["Data Structures", "Web Development", "Database Systems"],
  "3rd Year": ["Algorithms", "Software Engineering", "Operating Systems"],
  "4th Year": ["Capstone Project", "Networks", "Information Security"],
};
const ALLOWED_SORT_FIELDS = ["course", "yearLevel", "section", "subject", "email", "createdAt"];

// GET options for year/section/subject
router.get("/options", requireInstructorAuth, async (req, res) => {
  const year = req.query.yearLevel || null;
  const sections = year && SECTIONS_BY_YEAR[year] ? SECTIONS_BY_YEAR[year] : [];
  const subjects = year && SUBJECTS[year] ? SUBJECTS[year] : [];
  res.json({ success: true, yearLevels: YEAR_LEVELS, sections, subjects });
});

// POST /api/instructor/subjects - add a subject to a given year
router.post("/subjects", requireInstructorAuth, async (req, res) => {
  try {
    const { yearLevel, subject } = req.body || {};
    if (!yearLevel || !subject) {
      return res.status(400).json({ success: false, message: "yearLevel and subject are required" });
    }
    if (!YEAR_LEVELS.includes(yearLevel)) {
      return res.status(400).json({ success: false, message: "Invalid year level" });
    }
    const normalized = String(subject).trim();
    if (!normalized) {
      return res.status(400).json({ success: false, message: "Subject cannot be empty" });
    }
    if (!SUBJECTS[yearLevel]) SUBJECTS[yearLevel] = [];
    const exists = SUBJECTS[yearLevel].some(s => s.toLowerCase() === normalized.toLowerCase());
    if (!exists) SUBJECTS[yearLevel].push(normalized);
    return res.status(201).json({ success: true, subjects: SUBJECTS[yearLevel] });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Server error", error: e.message });
  }
});

// POST /api/instructor/sections - create a new section
router.post("/sections", requireInstructorAuth, enforcePermission("createSection"), async (req, res) => {
  try {
    const { sectionCode, course, yearLevel, subjectCode } = req.body || {};

    const trimmedSectionCode = typeof sectionCode === "string" ? sectionCode.trim() : "";
    const trimmedCourse = typeof course === "string" ? course.trim() : "";
    const trimmedYearLevel = typeof yearLevel === "string" ? yearLevel.trim() : "";
    const trimmedSubjectCode = typeof subjectCode === "string" ? subjectCode.trim() : "";

    if (!trimmedSectionCode || !trimmedCourse || !trimmedYearLevel) {
      return res.status(400).json({ success: false, message: "Section code, course, and year level are required" });
    }

    if (!YEAR_LEVELS.includes(trimmedYearLevel)) {
      return res.status(400).json({ success: false, message: "Invalid year level. Must be one of: " + YEAR_LEVELS.join(", ") });
    }

    // Check if section with same code already exists for this instructor
    const existingSection = await Section.findOne({
      sectionCode: trimmedSectionCode,
      instructorId: req.user._id
    });

    if (existingSection) {
      return res.status(400).json({ success: false, message: "Section code already exists for this instructor" });
    }

    const section = new Section({
      sectionCode: trimmedSectionCode,
      course: trimmedCourse,
      yearLevel: trimmedYearLevel,
      ...(trimmedSubjectCode ? { subjectCode: trimmedSubjectCode } : {}),
      instructorId: req.user._id,
    });

    await section.save();

    res.status(201).json({ success: true, message: "Section created successfully", section });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ success: false, message: "Section code already exists for this instructor" });
    }
    console.error('Error creating section:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// GET /api/instructor/sections - get all sections for the authenticated instructor
router.get("/sections", requireInstructorAuth, enforcePermission("viewSections"), async (req, res) => {
  try {
    const sections = await Section.find({ instructorId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json({ success: true, count: sections.length, sections });
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// PUT /api/instructor/sections/:sectionId - update section code
router.put("/sections/:sectionId", requireInstructorAuth, enforcePermission("manageSectionInfo"), async (req, res) => {
  const session = await Section.startSession();
  try {
    const { sectionId } = req.params;
    const { newSectionCode, sectionVersion } = req.body || {};

    const trimmedSectionCode = typeof newSectionCode === "string" ? newSectionCode.trim() : "";
    if (!trimmedSectionCode) {
      return res.status(400).json({ success: false, message: "New section code is required" });
    }

    if (sectionVersion === undefined || sectionVersion === null) {
      return res.status(400).json({
        success: false,
        message: "Section version is required for MVCC updates",
        error: "SECTION_VERSION_REQUIRED",
      });
    }

    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });

    const section = await Section.findOne({
      _id: sectionId,
      instructorId: req.user._id,
    })
      .session(session)
      .readConcern("snapshot");

    if (!section) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Section not found or you don't have access to it" });
    }

    if (section.version !== sectionVersion) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "Section was updated by someone else. Refresh and try again.",
        error: "SECTION_VERSION_CONFLICT",
        conflict: {
          currentVersion: section.version,
          attemptedVersion: sectionVersion,
          documentId: section._id,
        },
      });
    }

    if (section.sectionCode === trimmedSectionCode) {
      await session.commitTransaction();
      return res.json({
        success: true,
        message: "Section code unchanged",
        section,
        mvcc: { version: section.version },
      });
    }

    const duplicate = await Section.findOne({
      _id: { $ne: section._id },
      instructorId: req.user._id,
      sectionCode: trimmedSectionCode,
    })
      .session(session)
      .readConcern("snapshot");

    if (duplicate) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Another section with this code already exists" });
    }

    section.sectionCode = trimmedSectionCode;
    section.lastModifiedBy = req.user._id;

    await section.save({ session });

    await Student.updateMany(
      { sectionId: section._id },
      { $set: { section: trimmedSectionCode } },
      { session }
    );

    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Section code updated successfully",
      section,
      mvcc: {
        version: section.version,
        lastModifiedAt: section.lastModifiedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    if (
      error.code === "SECTION_VERSION_CONFLICT" ||
      error.name === "SectionVersionConflictError"
    ) {
      return res.status(409).json({
        success: false,
        message: "Section was updated by someone else. Refresh and try again.",
        error: "SECTION_VERSION_CONFLICT",
        conflict: {
          currentVersion: error.currentVersion,
          attemptedVersion: error.attemptedVersion,
          documentId: error.documentId,
        },
      });
    }

    console.error("Error updating section code:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
});

// POST route to add a student (instructor auth required)
router.post("/add-student", requireInstructorAuth, enforcePermission("addStudents"), async (req, res) => {
  try {
    const {
      studentId,
      sectionId,
      email,
      subjectCode,
    } = req.body || {};

    const normalizedStudentId = typeof studentId === "string" ? studentId.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const trimmedSectionId = typeof sectionId === "string" ? sectionId.trim() : "";
    const normalizedSubjectCode = typeof subjectCode === "string" ? subjectCode.trim() : "";

    if (!normalizedStudentId || !trimmedSectionId || !normalizedEmail || !normalizedSubjectCode) {
      return res.status(400).json({ success: false, message: "Student ID, Section, Subject Code, and Email are required" });
    }

    // Basic studentId format validation (digits and letters allowed)
    if (!/^[A-Za-z0-9\-]+$/.test(normalizedStudentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID format" });
    }

    // Verify section exists and belongs to this instructor
    const section = await Section.findOne({
      _id: trimmedSectionId,
      instructorId: req.user._id
    });

    if (!section) {
      return res.status(404).json({ success: false, message: "Section not found or you don't have access to it" });
    }

    // Explicit duplicate check for clearer error message
    const existingStudent = await Student.findOne({
      studentId: normalizedStudentId,
      sectionId: section._id,
      subject: normalizedSubjectCode,
    });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: "Student already exists in this section with the same subject code",
      });
    }

    const student = new Student({
      studentId: normalizedStudentId,
      course: section.course,
      yearLevel: section.yearLevel,
      section: section.sectionCode,
      subject: normalizedSubjectCode,
      sectionId: section._id,
      email: normalizedEmail,
      createdBy: req.user._id,
      instructorId: req.user._id,
    });

    await student.save();

    res.status(201).json({ success: true, message: "Student added successfully", student });
  } catch (error) {
    if (error && error.code === 11000) {
      const fields = Object.keys(error.keyPattern || {});
      return res.status(400).json({ success: false, message: `Duplicate ${fields.join(", ")}` });
    }
    console.error('Error adding student:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// GET students added by the authenticated instructor
router.get("/students", requireInstructorAuth, enforcePermission("viewStudents"), async (req, res) => {
  try {
    const {
      yearLevel,
      section,
      subject,
      course,
      search,
      sortBy,
      sortOrder,
      sectionId, // New parameter for filtering by section ID
    } = req.query || {};

    const filter = { instructorId: req.user._id };

    // Filter by sectionId if provided (takes precedence over section text filter)
    if (sectionId && String(sectionId).trim()) {
      const trimmedSectionId = String(sectionId).trim();
      // Verify the section belongs to this instructor
      const section = await Section.findOne({
        _id: trimmedSectionId,
        instructorId: req.user._id
      });
      if (section) {
        filter.sectionId = trimmedSectionId;
      } else {
        // Section doesn't exist or doesn't belong to instructor
        return res.json({ success: true, count: 0, students: [] });
      }
    } else if (section) {
      // Legacy text-based section filter
      filter.section = { $regex: String(section).trim(), $options: "i" };
    }

    if (yearLevel) {
      filter.yearLevel = { $regex: String(yearLevel).trim(), $options: "i" };
    }
    if (subject) {
      filter.subject = { $regex: String(subject).trim(), $options: "i" };
    }
    if (course) {
      filter.course = { $regex: String(course).trim(), $options: "i" };
    }

    if (search && String(search).trim()) {
      const query = String(search).trim();
      const regex = { $regex: query, $options: "i" };
      filter.$or = [
        { course: regex },
        { yearLevel: regex },
        { section: regex },
        { subject: regex },
        { email: regex },
      ];
    }

    const normalizedSortField = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : "createdAt";
    const normalizedSortOrder = sortOrder === "asc" ? 1 : -1;
    const sortOptions = { [normalizedSortField]: normalizedSortOrder };

    if (normalizedSortField !== "createdAt") {
      // Stable secondary sort by newest entries
      sortOptions.createdAt = -1;
    }

    const students = await Student.find(filter)
      .populate('sectionId', 'sectionCode course yearLevel subjectCode')
      .sort(sortOptions);
    res.json({ success: true, count: students.length, students });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// POST route to send evaluation form to students (uses dynamic multi-level filters)
router.post("/send-evaluation-form", requireInstructorAuth, enforcePermission("sendEvalToStudents"), async (req, res) => {
  try {
    const { course, yearLevel, section, subject, evaluationFormLink } = req.body || {};

    // Validate required fields
    if (!evaluationFormLink) {
      return res.status(400).json({ 
        success: false, 
        message: "evaluationFormLink is required" 
      });
    }

    // Get instructor info
    const instructor = await Instructor.findOne({ email: req.user.email });
    if (!instructor) {
      return res.status(404).json({ 
        success: false, 
        message: "Instructor profile not found" 
      });
    }

    // Build dynamic filters (AND logic), matching GET /students behavior
    const filter = { instructorId: req.user._id };
    if (course && String(course).trim()) {
      filter.course = { $regex: String(course).trim(), $options: "i" };
    }
    if (yearLevel && String(yearLevel).trim()) {
      filter.yearLevel = { $regex: String(yearLevel).trim(), $options: "i" };
    }
    if (section && String(section).trim()) {
      filter.section = { $regex: String(section).trim(), $options: "i" };
    }
    if (subject && String(subject).trim()) {
      filter.subject = { $regex: String(subject).trim(), $options: "i" };
    }
    
    const students = await Student.find(filter);

    if (students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No students found matching the selected criteria" 
      });
    }

    // Initialize email service
    const emailService = new EmailService();
    const results = {
      total: students.length,
      success: [],
      failed: []
    };

    const studentsSent = [];

    // Send emails to all students
    for (const student of students) {
      try {
        const nameParts = [student.firstName, student.lastName].filter(Boolean);
        const studentName = nameParts.length > 0 ? nameParts.join(" ") : student.email;
        await emailService.sendEvaluationFormEmail(
          student.email,
          studentName,
          subject || 'General Evaluation', // Use subject if provided, otherwise use default
          instructor.name,
          evaluationFormLink,
          {
            fromName: process.env.FROM_NAME || 'College of Technology',
            replyToEmail: process.env.REPLY_TO_EMAIL || instructor.email
          }
        );
        results.success.push(student.email);
        studentsSent.push({
          email: student.email,
          name: studentName,
          sentAt: new Date()
        });
      } catch (error) {
        console.error(`Failed to send email to ${student.email}:`, error);
        results.failed.push({
          email: student.email,
          error: error.message
        });
      }
    }

    // Note: No longer persisting Google Form metadata after rollback

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
    console.error('Error sending evaluation forms:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

module.exports = router;

