const mongoose = require("mongoose");

const googleFormSchema = new mongoose.Schema({
  formId: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
  },
  formUrl: {
    type: String,
    required: true,
  },
  spreadsheetId: {
    type: String,
    // Optional: linked Google Sheet for responses
  },
  spreadsheetUrl: {
    type: String,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  instructorEmail: {
    type: String,
    required: true,
  },
  instructorName: {
    type: String,
    required: true,
  },
  yearLevel: {
    type: String,
    required: true,
  },
  section: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  studentsSent: [{
    email: String,
    name: String,
    sentAt: Date,
  }],
  totalSent: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
googleFormSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("GoogleForm", googleFormSchema);

