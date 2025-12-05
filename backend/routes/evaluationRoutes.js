const express = require("express");
const mongoose = require("mongoose");
const Evaluation = require("../models/Evaluation");
const Instructor = require("../models/Instructor");
const User = require("../models/User");
const {
  appendEvaluationRow,
  fetchInstructorResponses,
  buildSheetTitle,
  getAllInstructorSummaries,
  getOverallSummary,
} = require("../services/googleSheetsService");
const router = express.Router();

// Submit evaluation with MVCC (Multi-Version Concurrency Control)
router.post("/", async (req, res) => {
  // Start MongoDB transaction session for MVCC
  const session = await mongoose.startSession();
  
  try {
    // Begin transaction with snapshot isolation
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });

    const {
      instructorId,
      studentId,
      course,
      semester,
      academicYear,
      ratings,
      feedback,
      isAnonymous
    } = req.body;

    // Validate required fields
    if (!instructorId || !studentId || !course || !semester || !academicYear || !ratings) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Validate ratings
    const requiredRatings = ['teachingEffectiveness', 'communicationSkills', 'subjectKnowledge', 'punctuality', 'availability', 'overallRating'];
    for (const rating of requiredRatings) {
      if (!ratings[rating] || ratings[rating] < 1 || ratings[rating] > 5) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid rating for ${rating}. Must be between 1 and 5.`
        });
      }
    }

    // Check if instructor exists (within transaction snapshot)
    const instructor = await Instructor.findById(instructorId).session(session);
    if (!instructor) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Instructor not found"
      });
    }

    // MVCC: Check if evaluation already exists using snapshot isolation
    // This ensures we see a consistent view of the database
    const existingEvaluation = await Evaluation.findOne({
      instructorId,
      studentId,
      course,
      semester
    })
      .session(session)
      .readConcern('snapshot'); // Read from consistent snapshot

    if (existingEvaluation) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Evaluation already submitted for this instructor and course",
        existingEvaluation: {
          id: existingEvaluation._id,
          version: existingEvaluation.version,
          submittedAt: existingEvaluation.submittedAt
        }
      });
    }

    // Check if student exists (within transaction snapshot)
    const student = await User.findById(studentId).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Create new evaluation with MVCC version tracking
    // Version starts at 0 for new documents
    const evaluation = new Evaluation({
      instructorId,
      studentId,
      course,
      semester,
      academicYear,
      ratings,
      feedback: feedback || {},
      isAnonymous: isAnonymous || false,
      version: 0, // Initial version
      lastModifiedBy: studentId, // Track who created it
      lastModifiedAt: new Date()
    });

    // Save within transaction (atomic operation)
    await evaluation.save({ session });

    // Commit transaction - all operations succeed or all fail
    await session.commitTransaction();

    // Google Sheets sync happens AFTER transaction commit
    // This ensures database consistency even if Google Sheets sync fails
    let googleSheetSync = { success: true };
    try {
      await appendEvaluationRow({
        instructor,
        student,
        evaluation,
      });
    } catch (error) {
      console.error("Failed to append evaluation to Google Sheet:", error);
      googleSheetSync = {
        success: false,
        message: error.message,
        sheetTitle: buildSheetTitle(instructor.name),
      };
      // Note: Evaluation is already saved, so we continue
    }

    res.status(201).json({ 
      success: true, 
      evaluation: {
        ...evaluation.toObject(),
        version: evaluation.version // Include version in response
      },
      googleSheetSync,
      mvcc: {
        version: evaluation.version,
        transactionId: session.id?.toString() || 'committed'
      }
    });
  } catch (error) {
    // Abort transaction on any error
    await session.abortTransaction();
    
    // Handle specific MVCC version conflicts
    if (error.code === 'VERSION_CONFLICT' || error.name === 'VersionConflictError') {
      console.warn('MVCC Version Conflict:', {
        documentId: error.documentId,
        currentVersion: error.currentVersion,
        attemptedVersion: error.attemptedVersion
      });
      
      return res.status(409).json({
        success: false,
        message: "Conflict detected: Another evaluation was submitted simultaneously. Please refresh and try again.",
        error: 'VERSION_CONFLICT',
        conflict: {
          currentVersion: error.currentVersion,
          attemptedVersion: error.attemptedVersion,
          documentId: error.documentId
        }
      });
    }
    
    // Handle duplicate key error (unique index violation)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Evaluation already submitted for this instructor and course",
        error: 'DUPLICATE_EVALUATION'
      });
    }
    
    // Handle transaction errors
    if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
      console.warn('Transient transaction error, retry recommended');
      return res.status(503).json({
        success: false,
        message: "Temporary database conflict. Please try again.",
        error: 'TRANSACTION_RETRY',
        retry: true
      });
    }
    
    // Generic error handling
    console.error('Evaluation submission error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  } finally {
    // Always end the session
    session.endSession();
  }
});

// Get evaluations by instructor
router.get("/instructor/:instructorId", async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { course, semester, academicYear } = req.query;

    let query = { instructorId };
    if (course) query.course = course;
    if (semester) query.semester = semester;
    if (academicYear) query.academicYear = academicYear;

    const evaluations = await Evaluation.find(query)
      .populate('studentId', 'email')
      .sort({ submittedAt: -1 });

    res.json({ success: true, evaluations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.get("/instructor/:instructorId/sheet", async (req, res) => {
  try {
    const { instructorId } = req.params;
    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      return res.status(404).json({ success: false, message: "Instructor not found" });
    }

    const data = await fetchInstructorResponses(instructor);
    return res.json({ success: true, ...data });
  } catch (error) {
    if (error?.code === 401 || error?.code === 403) {
      return res.status(502).json({
        success: false,
        message: "Google Sheets authorization failed. Verify service account permissions.",
        error: error.message,
      });
    }
    if (error?.code === 404) {
      return res.status(404).json({ success: false, message: "Instructor sheet not found" });
    }
    console.error("Failed to fetch instructor sheet:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get evaluation statistics for instructor
router.get("/stats/:instructorId", async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { course, semester, academicYear } = req.query;

    let matchQuery = { instructorId };
    if (course) matchQuery.course = course;
    if (semester) matchQuery.semester = semester;
    if (academicYear) matchQuery.academicYear = academicYear;

    const stats = await Evaluation.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEvaluations: { $sum: 1 },
          avgTeachingEffectiveness: { $avg: "$ratings.teachingEffectiveness" },
          avgCommunicationSkills: { $avg: "$ratings.communicationSkills" },
          avgSubjectKnowledge: { $avg: "$ratings.subjectKnowledge" },
          avgPunctuality: { $avg: "$ratings.punctuality" },
          avgAvailability: { $avg: "$ratings.availability" },
          avgOverallRating: { $avg: "$ratings.overallRating" }
        }
      }
    ]);

    res.json({ success: true, stats: stats[0] || {} });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get student's evaluations
router.get("/student/:studentId", async (req, res) => {
  try {
    const evaluations = await Evaluation.find({ studentId: req.params.studentId })
      .populate('instructorId', 'name email department')
      .sort({ submittedAt: -1 });

    res.json({ success: true, evaluations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get all evaluations (Admin only)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, instructorId, course, semester } = req.query;
    
    let query = {};
    if (instructorId) query.instructorId = instructorId;
    if (course) query.course = course;
    if (semester) query.semester = semester;

    const evaluations = await Evaluation.find(query)
      .populate('instructorId', 'name email department')
      .populate('studentId', 'email')
      .sort({ submittedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Evaluation.countDocuments(query);

    res.json({
      success: true,
      evaluations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Delete evaluation by ID (Dean/Admin)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Evaluation.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Evaluation not found" });
    }
    return res.json({ success: true, message: "Evaluation deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get evaluation summaries from Google Sheets (Dean Dashboard)
router.get("/summary", async (req, res) => {
  try {
    const summaries = await getAllInstructorSummaries();
    
    // Calculate overall summary statistics
    const totalInstructors = summaries.length;
    const totalResponses = summaries.reduce((sum, s) => sum + s.totalResponses, 0);
    const avgOverallScore = summaries.length > 0
      ? summaries.reduce((sum, s) => sum + s.overallPerformanceScore, 0) / summaries.length
      : 0;

    return res.json({
      success: true,
      data: {
        instructors: summaries,
        summary: {
          totalInstructors,
          totalResponses,
          avgOverallScore: Math.round(avgOverallScore * 100) / 100,
        },
      },
    });
  } catch (error) {
    if (error?.code === 401 || error?.code === 403) {
      return res.status(502).json({
        success: false,
        message: "Google Sheets authorization failed. Verify service account permissions and spreadsheet sharing.",
        error: error.message,
      });
    }
    if (error?.message?.includes("misconfigured")) {
      return res.status(500).json({
        success: false,
        message: "Google Sheets integration not configured. Please set GOOGLE_SHEETS_SPREADSHEET_ID in environment variables.",
        error: error.message,
      });
    }
    console.error("Failed to fetch evaluation summaries:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching evaluation summaries",
      error: error.message,
    });
  }
});

// Get overall summary from Google Sheets (simple summary for Dean Dashboard)
router.get("/overall-summary", async (req, res) => {
  try {
    const { formId } = req.query; // Optional formId to filter by specific form
    const summary = await getOverallSummary(formId || null);

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    if (error?.code === 401 || error?.code === 403) {
      return res.status(502).json({
        success: false,
        message: "Google Sheets authorization failed. Verify service account permissions and spreadsheet sharing.",
        error: error.message,
      });
    }
    if (error?.message?.includes("misconfigured")) {
      return res.status(500).json({
        success: false,
        message: "Google Sheets integration not configured. Please set GOOGLE_SHEETS_SPREADSHEET_ID in environment variables.",
        error: error.message,
      });
    }
    console.error("Failed to fetch overall summary:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching overall summary",
      error: error.message,
    });
  }
});

module.exports = router;