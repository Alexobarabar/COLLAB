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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
