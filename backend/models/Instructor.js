const mongoose = require("mongoose");

const instructorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
  },
  department: {
    type: String,
    required: false,
  },
  courses: [{
    type: String,
  }],
  isArchived: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
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
      enum: ["none", "last-write-wins", "merge", "manual"],
      default: "none",
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
});

// Index assists with MVCC conflict lookups
instructorSchema.index({ version: 1 });

// Optimistic locking middleware similar to Evaluation model
instructorSchema.pre("save", async function handleInstructorMvcc(next) {
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
    const error = new Error("Instructor version conflict detected");
    error.name = "InstructorVersionConflictError";
    error.code = "INSTRUCTOR_VERSION_CONFLICT";
    error.currentVersion = current.version;
    error.attemptedVersion = this.version;
    error.documentId = this._id;
    return next(error);
  }

  this.version += 1;
  this.lastModifiedAt = new Date();
  return next();
});

instructorSchema.statics.findWithVersion = async function findWithVersion(query, expectedVersion) {
  const doc = await this.findOne(query);
  if (!doc) {
    return null;
  }

  if (expectedVersion !== undefined && doc.version !== expectedVersion) {
    const error = new Error("Instructor version mismatch");
    error.name = "InstructorVersionMismatchError";
    error.code = "INSTRUCTOR_VERSION_MISMATCH";
    error.currentVersion = doc.version;
    error.expectedVersion = expectedVersion;
    throw error;
  }

  return doc;
};

module.exports = mongoose.model("Instructor", instructorSchema);
