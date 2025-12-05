const mongoose = require("mongoose");

const evaluationFormSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  questions: [
    {
      questionText: {
        type: String,
        required: true,
        trim: true,
      },
      questionType: {
        type: String,
        enum: ["rating", "text", "multiple_choice"],
        default: "rating",
      },
      ratingScale: {
        min: {
          type: Number,
          default: 0,
        },
        max: {
          type: Number,
          default: 5,
        },
        labels: {
          min: {
            type: String,
            default: "Poor",
          },
          max: {
            type: String,
            default: "Excellent",
          },
        },
      },
      options: [String], // For multiple choice questions
      required: {
        type: Boolean,
        default: true,
      },
      order: {
        type: Number,
        required: true,
      },
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // Google Form integration fields
  googleFormId: {
    type: String,
    trim: true,
  },
  googleFormLink: {
    type: String,
    trim: true,
  },
  // Official responder URL returned by Google Forms API (preferred for emailing)
  googleResponderLink: {
    type: String,
    trim: true,
  },
  responseSheetId: {
    type: String,
    trim: true,
  },
  responseSheetTabId: {
    type: String,
    trim: true,
  },
  responseSheetName: {
    type: String,
    trim: true,
    default: "Form Responses 1",
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
evaluationFormSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("EvaluationForm", evaluationFormSchema);
