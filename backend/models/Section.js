const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema({
  sectionCode: {
    type: String,
    required: true,
    trim: true,
  },
  course: {
    type: String,
    required: true,
    trim: true,
  },
  yearLevel: {
    type: String,
    required: true,
    trim: true,
    enum: ["1st Year", "2nd Year", "3rd Year", "4th Year"],
  },
  subjectCode: {
    type: String,
    required: false,
    trim: true,
  },
  // The instructor who owns this section
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // MVCC metadata
  version: {
    type: Number,
    default: 0,
    required: true,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now,
  },
  conflictResolution: {
    strategy: {
      type: String,
      enum: ["none", "last-write-wins", "manual"],
      default: "none",
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
});

// Ensure unique section code per instructor
sectionSchema.index({ sectionCode: 1, instructorId: 1 }, { unique: true });
sectionSchema.index({ version: 1 });

sectionSchema.pre("save", async function handleSectionMvcc(next) {
  if (this.isNew) {
    this.version = 0;
    this.lastModifiedAt = new Date();
    return next();
  }

  if (!this.isModified()) {
    return next();
  }

  const current = await this.constructor.findById(this._id);

  if (current && current.version !== this.version) {
    const error = new Error("Section version conflict detected");
    error.name = "SectionVersionConflictError";
    error.code = "SECTION_VERSION_CONFLICT";
    error.currentVersion = current.version;
    error.attemptedVersion = this.version;
    error.documentId = this._id;
    return next(error);
  }

  this.version += 1;
  this.lastModifiedAt = new Date();
  return next();
});

sectionSchema.statics.findWithVersion = async function findWithVersion(query, expectedVersion) {
  const doc = await this.findOne(query);

  if (!doc) {
    return null;
  }

  if (expectedVersion !== undefined && doc.version !== expectedVersion) {
    const error = new Error("Section version mismatch");
    error.name = "SectionVersionMismatchError";
    error.code = "SECTION_VERSION_MISMATCH";
    error.currentVersion = doc.version;
    error.expectedVersion = expectedVersion;
    throw error;
  }

  return doc;
};

module.exports = mongoose.model("Section", sectionSchema);

