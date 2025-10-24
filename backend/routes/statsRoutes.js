const express = require("express");
const Evaluation = require("../models/Evaluation");
const Instructor = require("../models/Instructor");
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

module.exports = router;
