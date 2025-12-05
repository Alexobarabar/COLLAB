const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String, // optional for Google login users
  },
  googleId: {
    type: String, // stores Google profile ID
    default: null,
  },
  authProvider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },
  role: {
    type: String,
    enum: ["dean", "instructor"],
    required: true,
    default: "dean",
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
  resetToken: {
    type: String,
    default: null,
  },
  resetTokenExpiry: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  version: {
    type: Number,
    default: 0,
    required: true,
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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

userSchema.index({ version: 1 });

userSchema.pre("save", async function handleUserMvcc(next) {
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
    const error = new Error("User version conflict detected");
    error.name = "UserVersionConflictError";
    error.code = "USER_VERSION_CONFLICT";
    error.currentVersion = current.version;
    error.attemptedVersion = this.version;
    error.documentId = this._id;
    return next(error);
  }

  this.version += 1;
  this.lastModifiedAt = new Date();
  return next();
});

userSchema.statics.findWithVersion = async function findWithVersion(query, expectedVersion) {
  const doc = await this.findOne(query);

  if (!doc) {
    return null;
  }

  if (expectedVersion !== undefined && doc.version !== expectedVersion) {
    const error = new Error("User version mismatch");
    error.name = "UserVersionMismatchError";
    error.code = "USER_VERSION_MISMATCH";
    error.currentVersion = doc.version;
    error.expectedVersion = expectedVersion;
    throw error;
  }

  return doc;
};

module.exports = mongoose.model("User", userSchema);
