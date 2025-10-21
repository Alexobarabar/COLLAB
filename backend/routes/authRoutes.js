const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const User = require("../models/User"); // Adjust path if needed

const router = express.Router();

// ============ REGISTER (manual email & password) ============
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      authProvider: "local",
    });

    await user.save();

    res.status(201).json({ message: "Registration successful" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// ============ LOGIN (manual email & password) ============
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Login with passport
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      return res.json({ message: "Login successful", user });
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// ============ LOGOUT ============
router.get("/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logged out successfully" });
  });
});

// ============ GOOGLE AUTH ============
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-failed" }),
  (req, res) => {
    // ✅ SUCCESS LOGIN (Redirect to dashboard)
    res.redirect("/dashboard");
  }
);

// ============ LOGIN FAILED PAGE ============
router.get("/login-failed", (req, res) => {
  res.status(401).json({ message: "Google login failed" });
});

module.exports = router;
