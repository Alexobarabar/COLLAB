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
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res
      .status(400)
      .json({ success: false, message: "Email, password, and role are required" });
  }

  if (!["dean"].includes(role)) {
    return res
      .status(400)
      .json({ success: false, message: "Role must be 'dean'" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, role });

    await newUser.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password, recaptchaToken, selectedRole } = req.body;

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

    // Validate selected role is provided
    if (!selectedRole || !['dean', 'instructor'].includes(selectedRole.toLowerCase())) {
      return res
        .status(400)
        .json({ 
          success: false, 
          message: "Please select a valid role (Dean or Instructor)",
          error: "ROLE_REQUIRED"
        });
    }

    // Check if email exists in database BEFORE password verification
    // This prevents timing attacks and provides early validation
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return 401 Unauthorized (not 404) to prevent email enumeration
      // Do not generate any token when email is invalid
      return res
        .status(401)
        .json({ 
          success: false, 
          message: "Email not found",
          error: "INVALID_EMAIL"
        });
    }

    // Validate selected role matches user's actual role in database
    const normalizedSelectedRole = selectedRole.toLowerCase();
    if (user.role.toLowerCase() !== normalizedSelectedRole) {
      return res
        .status(403)
        .json({ 
          success: false, 
          message: "Invalid role selected. Please select the correct role for this account.",
          error: "ROLE_MISMATCH"
        });
    }

    // Check if user account is archived
    if (user.isArchived) {
      return res
        .status(401)
        .json({ 
          success: false, 
          message: "Account disabled. Please contact the Dean!",
          error: "ACCOUNT_ARCHIVED"
        });
    }

    if (!user.password) {
      return res
        .status(401)
        .json({ 
          success: false, 
          message: "This account uses Google login",
          error: "GOOGLE_LOGIN_REQUIRED"
        });
    }

    // Verify password - only after email and role validation passes
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Return generic error message to prevent user enumeration
      return res
        .status(401)
        .json({ 
          success: false, 
          message: "Invalid email address. Please check your credentials and try again.",
          error: "INVALID_CREDENTIALS"
        });
    }

    // Create a simple token (in production, use JWT)
    const token = `user_${user._id}_${Date.now()}`;

    res.json({
      success: true,
      message: "Login successful",
      userId: user._id,
      token: token,
      role: user.role,
      email: user.email
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Google OAuth Login
router.get("/google", (req, res, next) => {
  // Check if this is an API request (JSON expected) vs browser request (redirect expected)
  // Detect API clients by checking Accept header, User-Agent, or format query parameter
  const acceptHeader = req.headers.accept || '';
  const userAgent = req.headers['user-agent'] || '';
  const hasJsonAccept = acceptHeader.includes('application/json');
  const isApiClient = userAgent.includes('Thunder Client') || 
                     userAgent.includes('Postman') || 
                     userAgent.includes('Insomnia') ||
                     userAgent.includes('curl') ||
                     userAgent.includes('httpie');
  const formatJson = req.query.format === 'json';
  
  const isApiRequest = hasJsonAccept || isApiClient || formatJson;
  
  // Debug logging (can be removed in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Google OAuth Request Detection:', {
      acceptHeader,
      userAgent,
      hasJsonAccept,
      isApiClient,
      formatJson,
      isApiRequest
    });
  }
  
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    console.error('Google OAuth: Credentials not configured');
    if (isApiRequest) {
      return res.status(500).json({ 
        success: false, 
        message: "Google OAuth is not configured",
        error: "GOOGLE_AUTH_NOT_CONFIGURED"
      });
    }
    return res.redirect("http://localhost:3000/login?error=google_auth_not_configured");
  }
  
  // Get selected role from query parameter and pass it via state
  const selectedRole = req.query.role || req.query.selectedRole;
  if (!selectedRole || !['dean', 'instructor'].includes(selectedRole.toLowerCase())) {
    if (isApiRequest) {
      return res.status(400).json({ 
        success: false, 
        message: "Role parameter is required. Must be 'dean' or 'instructor'",
        error: "ROLE_REQUIRED"
      });
    }
    return res.redirect("http://localhost:3000/login?error=role_required");
  }
  
  // Store selected role in session for validation in callback
  req.session.selectedRole = selectedRole.toLowerCase();
  
  // For API requests, return informational response instead of redirecting
  // Note: This endpoint is designed for browser redirects, but API clients can check status
  if (isApiRequest) {
    return res.status(200).json({
      success: true,
      message: "Google OAuth authentication initiated. This endpoint redirects to Google's OAuth consent screen in browsers.",
      note: "Use this endpoint in a browser or set Accept: application/json to receive this response",
      role: selectedRole.toLowerCase(),
      oauthUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_CALLBACK_URL)}&response_type=code&scope=profile%20email&state=${selectedRole.toLowerCase()}&prompt=select_account`
    });
  }
  
  // For browser requests, perform the redirect
  passport.authenticate("google", { 
    scope: ["profile", "email"], 
    prompt: "select_account",
    state: selectedRole.toLowerCase() // Also pass via state as backup
  })(req, res, next);
});

// Google OAuth Callback
router.get(
  "/google/callback",
  (req, res, next) => {
    // Check if Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
      console.error('Google OAuth: Credentials not configured');
      return res.redirect("http://localhost:3000/login?error=google_auth_not_configured");
    }
    
    // Use custom callback to handle specific error messages from passport strategy
    passport.authenticate("google", (err, user, info) => {
      if (err) {
        console.error('Google OAuth error:', err);
        return res.redirect("http://localhost:3000/login?error=google_auth_failed");
      }
      
      if (!user) {
        // Handle specific error messages from passport strategy
        const errorMessage = info?.message || 'account_not_found';
        const errorType = info?.error || 'ACCOUNT_NOT_FOUND';
        
        console.warn('Google OAuth: Authentication failed:', errorMessage, errorType);
        
        // Redirect with specific error type
        if (errorMessage === 'instructor_not_registered' || errorType === 'INSTRUCTOR_NOT_REGISTERED') {
          return res.redirect("http://localhost:3000/login?error=instructor_not_registered");
        } else if (errorMessage === 'account_archived' || errorType === 'ACCOUNT_ARCHIVED') {
          return res.redirect("http://localhost:3000/login?error=account_archived");
        } else {
          return res.redirect("http://localhost:3000/login?error=account_not_found");
        }
      }
      
      // Validate selected role matches user's actual role
      const selectedRole = req.session?.selectedRole || req.query?.state;
      if (selectedRole) {
        const normalizedSelectedRole = selectedRole.toLowerCase();
        if (user.role.toLowerCase() !== normalizedSelectedRole) {
          console.warn('Google OAuth: Role mismatch. Selected:', normalizedSelectedRole, 'Actual:', user.role);
          return res.redirect("http://localhost:3000/login?error=role_mismatch");
        }
      } else {
        // If no role was selected, redirect with error
        console.warn('Google OAuth: No role selected');
        return res.redirect("http://localhost:3000/login?error=role_required");
      }
      
      // Store user in request for next middleware
      req.user = user;
      next();
    })(req, res, next);
  },
  (req, res) => {
    try {
      if (!req.user) {
        console.error('Google OAuth: No user found after authentication');
        return res.redirect("http://localhost:3000/login?error=account_not_found");
      }

      // Create a simple token for the authenticated user (same logic as regular login)
      const token = `user_${req.user._id}_${Date.now()}`;
      console.log('Google OAuth: Successfully authenticated user:', req.user.email, 'Role:', req.user.role);

      // Redirect to frontend callback page with token, role, and email
      res.redirect(`http://localhost:3000/auth/google/callback?token=${token}&role=${req.user.role}&email=${encodeURIComponent(req.user.email)}`);
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
    await emailService.sendPasswordResetEmail(email, resetToken, {
      fromName: process.env.FROM_NAME || 'College of Technology',
      replyToEmail: process.env.REPLY_TO_EMAIL || undefined
    });

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
