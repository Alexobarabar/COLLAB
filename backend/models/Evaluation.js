const mongoose = require("mongoose");

const evaluationSchema = new mongoose.Schema({
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Instructor",
    required: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  course: {
    type: String,
    required: true,
  },
  semester: {
    type: String,
    required: true,
  },
  academicYear: {
    type: String,
    required: true,
  },
  ratings: {
    teachingEffectiveness: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    communicationSkills: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    subjectKnowledge: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    punctuality: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    availability: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    overallRating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
  },
  feedback: {
    strengths: {
      type: String,
      maxlength: 500,
    },
    areasForImprovement: {
      type: String,
      maxlength: 500,
    },
    additionalComments: {
      type: String,
      maxlength: 1000,
    },
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure one evaluation per student per instructor per course per semester
evaluationSchema.index({ instructorId: 1, studentId: 1, course: 1, semester: 1 }, { unique: true });

module.exports = mongoose.model("Evaluation", evaluationSchema);
