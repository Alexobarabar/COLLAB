const express = require("express");
const Evaluation = require("../models/Evaluation");
const Instructor = require("../models/Instructor");
const { getFormSpecificSummary, getInstructorSectionSummary, getInstructorIndividualResponses } = require("../services/googleSheetsService");
const router = express.Router();

// Get overall evaluation statistics
router.get("/", async (req, res) => {
  try {
    const totalEvaluations = await Evaluation.countDocuments();
    const totalInstructors = await Instructor.countDocuments();

    // Get average ratings across all evaluations
    const ratingStats = await Evaluation.aggregate([
      {
        $group: {
          _id: null,
          avgTeachingEffectiveness: { $avg: "$ratings.teachingEffectiveness" },
          avgCommunicationSkills: { $avg: "$ratings.communicationSkills" },
          avgSubjectKnowledge: { $avg: "$ratings.subjectKnowledge" },
          avgPunctuality: { $avg: "$ratings.punctuality" },
          avgAvailability: { $avg: "$ratings.availability" },
          avgOverallRating: { $avg: "$ratings.overallRating" }
        }
      }
    ]);

    // Get evaluations by semester
    const evaluationsBySemester = await Evaluation.aggregate([
      {
        $group: {
          _id: "$semester",
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Get top rated instructors
    const topInstructors = await Evaluation.aggregate([
      {
        $group: {
          _id: "$instructorId",
          avgRating: { $avg: "$ratings.overallRating" },
          evaluationCount: { $sum: 1 }
        }
      },
      { $sort: { avgRating: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "instructors",
          localField: "_id",
          foreignField: "_id",
          as: "instructor"
        }
      },
      { $unwind: "$instructor" },
      {
        $project: {
          name: "$instructor.name",
          department: "$instructor.department",
          avgRating: 1,
          evaluationCount: 1
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalEvaluations,
        totalInstructors,
        averageRatings: ratingStats[0] || {},
        evaluationsBySemester,
        topInstructors
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get detailed instructor statistics for dean dashboard
router.get("/instructors", async (req, res) => {
  try {
    // First, get all instructors from the database
    const allInstructors = await Instructor.find({});
    
    // Get evaluation statistics for instructors who have evaluations
    const evaluationStats = await Evaluation.aggregate([
      {
        $group: {
          _id: "$instructorId",
          totalEvaluations: { $sum: 1 },
          avgTeachingEffectiveness: { $avg: "$ratings.teachingEffectiveness" },
          avgCommunicationSkills: { $avg: "$ratings.communicationSkills" },
          avgSubjectKnowledge: { $avg: "$ratings.subjectKnowledge" },
          avgPunctuality: { $avg: "$ratings.punctuality" },
          avgAvailability: { $avg: "$ratings.availability" },
          avgOverallRating: { $avg: "$ratings.overallRating" },
          minOverallRating: { $min: "$ratings.overallRating" },
          maxOverallRating: { $max: "$ratings.overallRating" },
          // Get recent evaluations (last 3)
          recentEvaluations: {
            $push: {
              studentId: "$studentId",
              course: "$course",
              semester: "$semester",
              academicYear: "$academicYear",
              overallRating: "$ratings.overallRating",
              submittedAt: "$submittedAt"
            }
          }
        }
      },
      {
        $lookup: {
          from: "instructors",
          localField: "_id",
          foreignField: "_id",
          as: "instructor"
        }
      },
      { $unwind: "$instructor" },
      {
        $project: {
          instructorId: "$_id",
          name: "$instructor.name",
          email: "$instructor.email",
          department: "$instructor.department",
          courses: "$instructor.courses",
          totalEvaluations: 1,
          avgTeachingEffectiveness: { $round: ["$avgTeachingEffectiveness", 2] },
          avgCommunicationSkills: { $round: ["$avgCommunicationSkills", 2] },
          avgSubjectKnowledge: { $round: ["$avgSubjectKnowledge", 2] },
          avgPunctuality: { $round: ["$avgPunctuality", 2] },
          avgAvailability: { $round: ["$avgAvailability", 2] },
          avgOverallRating: { $round: ["$avgOverallRating", 2] },
          minOverallRating: 1,
          maxOverallRating: 1,
          recentEvaluations: { $slice: ["$recentEvaluations", 3] },
          // Calculate performance grade
          performanceGrade: {
            $switch: {
              branches: [
                { case: { $gte: ["$avgOverallRating", 4.5] }, then: "Excellent" },
                { case: { $gte: ["$avgOverallRating", 4.0] }, then: "Very Good" },
                { case: { $gte: ["$avgOverallRating", 3.5] }, then: "Good" },
                { case: { $gte: ["$avgOverallRating", 3.0] }, then: "Satisfactory" },
                { case: { $gte: ["$avgOverallRating", 2.5] }, then: "Needs Improvement" }
              ],
              default: "Poor"
            }
          }
        }
      }
    ]);

    // Create a map of evaluation stats by instructor ID for quick lookup
    const evaluationMap = new Map();
    evaluationStats.forEach(stat => {
      evaluationMap.set(stat.instructorId.toString(), stat);
    });

    // Combine all instructors with their evaluation stats (if any)
    const instructorStats = allInstructors.map(instructor => {
      const evaluationData = evaluationMap.get(instructor._id.toString());
      
      if (evaluationData) {
        // Instructor has evaluations
        return {
          instructorId: instructor._id,
          name: instructor.name,
          email: instructor.email,
          department: instructor.department,
          courses: instructor.courses,
          totalEvaluations: evaluationData.totalEvaluations,
          avgTeachingEffectiveness: evaluationData.avgTeachingEffectiveness,
          avgCommunicationSkills: evaluationData.avgCommunicationSkills,
          avgSubjectKnowledge: evaluationData.avgSubjectKnowledge,
          avgPunctuality: evaluationData.avgPunctuality,
          avgAvailability: evaluationData.avgAvailability,
          avgOverallRating: evaluationData.avgOverallRating,
          minOverallRating: evaluationData.minOverallRating,
          maxOverallRating: evaluationData.maxOverallRating,
          recentEvaluations: evaluationData.recentEvaluations,
          performanceGrade: evaluationData.performanceGrade
        };
      } else {
        // Instructor has no evaluations yet
        return {
          instructorId: instructor._id,
          name: instructor.name,
          email: instructor.email,
          department: instructor.department,
          courses: instructor.courses,
          totalEvaluations: 0,
          avgTeachingEffectiveness: 0,
          avgCommunicationSkills: 0,
          avgSubjectKnowledge: 0,
          avgPunctuality: 0,
          avgAvailability: 0,
          avgOverallRating: 0,
          minOverallRating: 0,
          maxOverallRating: 0,
          recentEvaluations: [],
          performanceGrade: "No Evaluations"
        };
      }
    });

    // Sort by overall rating (instructors with evaluations first, then by rating)
    instructorStats.sort((a, b) => {
      if (a.totalEvaluations === 0 && b.totalEvaluations === 0) {
        return a.name.localeCompare(b.name); // Sort alphabetically if both have no evaluations
      }
      if (a.totalEvaluations === 0) return 1; // No evaluations go to bottom
      if (b.totalEvaluations === 0) return -1; // No evaluations go to bottom
      return b.avgOverallRating - a.avgOverallRating; // Sort by rating descending
    });

    // Get summary statistics
    const summaryStats = await Evaluation.aggregate([
      {
        $group: {
          _id: null,
          totalEvaluations: { $sum: 1 },
          avgOverallRating: { $avg: "$ratings.overallRating" }
        }
      },
      {
        $project: {
          totalEvaluations: 1,
          avgOverallRating: { $round: ["$avgOverallRating", 2] }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        instructors: instructorStats,
        summary: {
          totalEvaluations: summaryStats[0]?.totalEvaluations || 0,
          avgOverallRating: summaryStats[0]?.avgOverallRating || 0,
          totalInstructors: allInstructors.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching instructor statistics:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Get form-specific summary statistics
router.get("/form/:formId", async (req, res) => {
  try {
    const { formId } = req.params;

    if (!formId) {
      return res.status(400).json({
        success: false,
        message: "Form ID is required"
      });
    }

    const summary = await getFormSpecificSummary(formId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching form-specific summary:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// Get instructor section summary for print report
router.get("/form/:formId/instructor-section-summary", async (req, res) => {
  try {
    const { formId } = req.params;
    const { instructorEmail, subjectCode } = req.query;

    if (!formId) {
      return res.status(400).json({
        success: false,
        message: "Form ID is required"
      });
    }

    if (!instructorEmail) {
      return res.status(400).json({
        success: false,
        message: "Instructor email is required"
      });
    }

    console.log(`[Stats Route] Getting section summary for formId: ${formId}, instructorEmail: ${instructorEmail}, subjectCode: ${subjectCode || 'none'}`);
    
    const sectionSummary = await getInstructorSectionSummary(
      formId,
      instructorEmail,
      subjectCode || null
    );

    console.log(`[Stats Route] Section summary result:`, JSON.stringify(sectionSummary, null, 2));

    res.json({
      success: true,
      data: sectionSummary
    });
  } catch (error) {
    console.error('Error fetching instructor section summary:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// Get all individual student responses for an instructor
router.get("/form/:formId/instructor-responses", async (req, res) => {
  try {
    const { formId } = req.params;
    const { instructorEmail } = req.query;

    if (!formId) {
      return res.status(400).json({
        success: false,
        message: "Form ID is required"
      });
    }

    if (!instructorEmail) {
      return res.status(400).json({
        success: false,
        message: "Instructor email is required"
      });
    }

    console.log(`[Stats Route] Getting individual responses for formId: ${formId}, instructorEmail: ${instructorEmail}`);
    
    const responses = await getInstructorIndividualResponses(formId, instructorEmail);

    console.log(`[Stats Route] Found ${responses.length} individual responses`);

    res.json({
      success: true,
      data: responses
    });
  } catch (error) {
    console.error('Error fetching individual responses:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

module.exports = router;
