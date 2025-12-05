const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    trim: true,
  },
  firstName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  yearLevel: {
    type: String,
    required: true,
    trim: true,
  },
  section: {
    type: String,
    trim: true,
  },
  subject: {
    type: String,
    trim: true,
  },
  // Reference to Section model
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Section",
    required: true,
  },
  // The instructor who owns this student record
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Optional legacy field retained for backward compatibility
  course: {
    type: String,
    required: true,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Normalize empty studentId to undefined so it won't be indexed
studentSchema.pre("save", function (next) {
  // If studentId is an empty string, whitespace, or null, don't index it
  if (this.studentId === null) {
    this.studentId = undefined;
  } else if (typeof this.studentId === "string" && this.studentId.trim() === "") {
    this.studentId = undefined;
  } else if (typeof this.studentId === "string") {
    this.studentId = this.studentId.trim();
  }
  next();
});

module.exports = mongoose.model("Student", studentSchema);

