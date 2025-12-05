const mongoose = require("mongoose");

const subjectCodeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

subjectCodeSchema.pre("validate", function (next) {
  if (this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
  }
  next();
});

subjectCodeSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("SubjectCode", subjectCodeSchema);

