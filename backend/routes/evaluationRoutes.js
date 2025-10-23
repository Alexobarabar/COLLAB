const express = require("express");
const Evaluation = require("../models/Evaluation");
const Instructor = require("../models/Instructor");
const router = express.Router();

// Submit evaluation
router.post("/", async (req, res) => {
  try {
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
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Validate ratings
    const requiredRatings = ['teachingEffectiveness', 'communicationSkills', 'subjectKnowledge', 'punctuality', 'availability', 'overallRating'];
    for (const rating of requiredRatings) {
      if (!ratings[rating] || ratings[rating] < 1 || ratings[rating] > 5) {
        return res.status(400).json({
          success: false,
          message: `Invalid rating for ${rating}. Must be between 1 and 5.`
        });
      }
    }

    // Check if instructor exists
    const instructor = await Instructor.findById(instructorId);
    if (!instructor) {
      return res.status(404).json({
        success: false,
        message: "Instructor not found"
      });
    }

    // Check if evaluation already exists for this student-instructor-course-semester combination
    const existingEvaluation = await Evaluation.findOne({
      instructorId,
      studentId,
      course,
      semester
    });

    if (existingEvaluation) {
      return res.status(400).json({
        success: false,
        message: "Evaluation already submitted for this instructor and course"
      });
    }

    const evaluation = new Evaluation({
      instructorId,
      studentId,
      course,
      semester,
      academicYear,
      ratings,
      feedback: feedback || {},
      isAnonymous: isAnonymous || false
    });

    await evaluation.save();
    res.status(201).json({ success: true, evaluation });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
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

module.exports = router;
