const express = require("express");
const bcrypt = require("bcrypt");
const axios = require("axios");
const crypto = require("crypto");
const User = require("../models/User"); // adjust path if needed
const passport = require("../config/passport");
const EmailService = require("../services/emailService");

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

    if (!user.password) {
      return res
        .status(401)
        .json({ success: false, message: "This account uses Google login" });
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
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Google OAuth Login
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "http://localhost:3000/login?error=google_auth_failed" }),
  (req, res) => {
    try {
      if (!req.user) {
        console.error('Google OAuth: No user found after authentication');
        return res.redirect("http://localhost:3000/login?error=no_user_found");
      }

      // Create a simple token for the authenticated user
      const token = `user_${req.user._id}_${Date.now()}`;
      console.log('Google OAuth: Successfully authenticated user:', req.user.email);

      // Redirect to frontend with token as query parameter
      res.redirect(`http://localhost:3000/dashboard?token=${token}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect("http://localhost:3000/login?error=callback_error");
    }
  }
);

// Forgot Password Route
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal if email exists or not
      return res.json({ success: true, message: "If the email exists, a reset link has been sent." });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send email using EmailService
    const emailService = new EmailService();
    await emailService.sendPasswordResetEmail(email, resetToken);

    res.json({ success: true, message: "If the email exists, a reset link has been sent." });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      details: error.message 
    });
  }
});

// Reset Password Route
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  console.log('Reset password request received:', { token: token ? 'present' : 'missing', newPassword: newPassword ? 'present' : 'missing' });

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Token and new password are required" });
  }

  try {
    console.log('Looking for user with reset token:', token);
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      console.log('No user found with valid reset token');
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset token" });
    }

    console.log('Found user for password reset:', user.email);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    
    console.log('Saving user with new password...');
    await user.save();
    console.log('Password reset successful for user:', user.email);

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: "Server error", details: error.message });
  }
});

module.exports = router;
