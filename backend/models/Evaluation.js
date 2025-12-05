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
  // MVCC (Multi-Version Concurrency Control) fields
  version: {
    type: Number,
    default: 0,
    required: true,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now,
  },
  conflictResolution: {
    strategy: {
      type: String,
      enum: ['none', 'last-write-wins', 'merge', 'manual'],
      default: 'none',
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
});

// Ensure one evaluation per student per instructor per course per semester
evaluationSchema.index({ instructorId: 1, studentId: 1, course: 1, semester: 1 }, { unique: true });

// Index for version tracking (helps with conflict detection)
evaluationSchema.index({ version: 1 });

// Middleware to handle version tracking and conflict detection
evaluationSchema.pre('save', async function(next) {
  // Only increment version on updates, not on new documents
  if (this.isModified() && !this.isNew) {
    // Check if document was modified by another transaction (optimistic locking)
    const current = await this.constructor.findById(this._id);
    
    if (current && current.version !== this.version) {
      const error = new Error('Version conflict detected: Document was modified by another transaction');
      error.name = 'VersionConflictError';
      error.code = 'VERSION_CONFLICT';
      error.currentVersion = current.version;
      error.attemptedVersion = this.version;
      error.documentId = this._id;
      return next(error);
    }
    
    // Increment version for updates
    this.version += 1;
    this.lastModifiedAt = new Date();
  } else if (this.isNew) {
    // New documents start at version 0
    this.version = 0;
    this.lastModifiedAt = new Date();
  }
  
  next();
});

// Static method to find with version check
evaluationSchema.statics.findWithVersion = async function(query, expectedVersion) {
  const doc = await this.findOne(query);
  
  if (!doc) {
    return null;
  }
  
  if (expectedVersion !== undefined && doc.version !== expectedVersion) {
    const error = new Error('Version mismatch');
    error.name = 'VersionMismatchError';
    error.code = 'VERSION_MISMATCH';
    error.currentVersion = doc.version;
    error.expectedVersion = expectedVersion;
    throw error;
  }
  
  return doc;
};

module.exports = mongoose.model("Evaluation", evaluationSchema);
