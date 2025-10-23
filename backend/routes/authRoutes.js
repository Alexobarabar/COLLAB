const express = require("express");
const bcrypt = require("bcrypt");
const axios = require("axios");
const User = require("../models/User"); // adjust path if needed
const passport = require("../config/passport");

const router = express.Router();

// Register Route
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email and password are required" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
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
  const { email, password, recaptchaToken } = req.body;

  try {
    // Verify reCAPTCHA (temporarily disabled for testing)
    if (!recaptchaToken) {
      return res
        .status(400)
        .json({ success: false, message: "reCAPTCHA verification required" });
    }

    // For testing, skip reCAPTCHA verification if using test token
    if (recaptchaToken !== "test") {
      // Verify reCAPTCHA with Google
      const recaptchaResponse = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
      );

      if (!recaptchaResponse.data.success) {
        return res
          .status(400)
          .json({ success: false, message: "reCAPTCHA verification failed" });
      }
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Create a simple token (in production, use JWT)
    const token = `user_${user._id}_${Date.now()}`;

    res.json({
      success: true,
      message: "Login successful",
      userId: user._id,
      token: token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// Google OAuth Login
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "http://localhost:3000/login?error=google_auth_failed" }),
  (req, res) => {
    // Create a simple token for the authenticated user
    const token = `user_${req.user._id}_${Date.now()}`;
    
    // Redirect to frontend with token as query parameter
    res.redirect(`http://localhost:3000/dashboard?token=${token}`);
  }
);

module.exports = router;
