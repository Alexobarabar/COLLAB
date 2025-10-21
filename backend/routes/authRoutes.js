const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User"); // adjust path if needed
const passport = require("../config/passport");
const express = require("express");
const passport = require("../config/passport");

const router = express.Router();


// Register Route
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });

    await newUser.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    res.json({ success: true, message: "Login successful", userId: user._id });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// Google OAuth (placeholder - to implement next)
router.get("/auth/google", (req, res) => {
  res.json({ success: true, message: "Google OAuth route coming soon" });
});

// Google Login Route
router.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google Callback
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.json({
      success: true,
      message: "Google Login Successful",
      user: req.user
    });
  }
);

module.exports = router;
