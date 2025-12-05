const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Instructor = require("../models/Instructor");
const bcrypt = require("bcrypt");
const { enforcePermission } = require("../middleware/rbacMiddleware");
const router = express.Router();

// Get instructor profile
router.get("/profile", enforcePermission("viewProfile"), async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email is required" 
      });
    }

    // Find user account - use case-insensitive lookup
    const emailLower = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailLower, role: "instructor" });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Instructor not found" 
      });
    }

    // Find instructor record by email - this MUST exist for instructors
    // (Google login verifies Instructor exists before creating User)
    const instructor = await Instructor.findOne({ 
      email: emailLower,
      isArchived: { $ne: true }
    });

    if (!instructor) {
      return res.status(404).json({ 
        success: false, 
        message: "No profile found for this Google account. Please contact the administrator." 
      });
    }

    // Return complete instructor profile
    res.json({ 
      success: true, 
      profile: {
        email: user.email,
        name: instructor.name,
        department: instructor.department || 'N/A',
        courses: instructor.courses || [],
        role: user.role,
        createdAt: instructor.createdAt || user.createdAt,
      },
      mvcc: {
        user: {
          version: user.version,
          lastModifiedAt: user.lastModifiedAt,
          lastModifiedBy: user.lastModifiedBy,
        },
        instructor: instructor ? {
          version: instructor.version,
          lastModifiedAt: instructor.lastModifiedAt,
          lastModifiedBy: instructor.lastModifiedBy,
        } : null,
      }
    });
  } catch (error) {
    console.error('Error fetching instructor profile:', error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Update instructor profile
router.put("/profile", enforcePermission("updateEmail"), async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      email,
      newEmail,
      newPassword,
      currentPassword,
      userVersion,
      instructorVersion,
    } = req.body || {};
    
    console.log('Profile update request:', { email, newEmail, hasNewPassword: !!newPassword });
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Current email is required" 
      });
    }

    if (userVersion === undefined || userVersion === null) {
      return res.status(400).json({
        success: false,
        message: "User version is required for MVCC profile updates",
        error: "USER_VERSION_REQUIRED",
      });
    }

    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });

    const emailLower = email.toLowerCase().trim();

    // Find user account - search without case sensitivity
    const user = await User.findOne({ email: emailLower, role: "instructor" })
      .session(session)
      .readConcern("snapshot");
    if (!user) {
      await session.abortTransaction();
      console.log('User not found with email:', email);
      return res.status(404).json({ 
        success: false, 
        message: "Instructor not found. Please ensure you are logged in correctly." 
      });
    }

    if (user.version !== userVersion) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "Your profile was updated by someone else. Refresh and try again.",
        error: "USER_VERSION_CONFLICT",
        conflict: {
          currentVersion: user.version,
          attemptedVersion: userVersion,
          documentId: user._id,
        },
      });
    }

    console.log('Found user:', user.email);

    let instructor = await Instructor.findOne({ email: emailLower, isArchived: { $ne: true } })
      .session(session)
      .readConcern("snapshot");

    if (instructor) {
      if (instructorVersion === undefined || instructorVersion === null) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Instructor version is required for MVCC profile updates",
          error: "INSTRUCTOR_VERSION_REQUIRED",
        });
      }

      if (instructor.version !== instructorVersion) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: "Instructor profile was updated elsewhere. Refresh and try again.",
          error: "INSTRUCTOR_VERSION_CONFLICT",
          conflict: {
            currentVersion: instructor.version,
            attemptedVersion: instructorVersion,
            documentId: instructor._id,
          },
        });
      }
    }

    // Verify current password if changing password
    if (newPassword) {
      if (!currentPassword) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: "Current password is required to change password" 
        });
      }

      // Check if user has a password set (some might have Google login only)
      if (user.password) {
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
          await session.abortTransaction();
          return res.status(400).json({ 
            success: false, 
            message: "Current password is incorrect" 
          });
        }
      }

      // Hash new password
      const saltRounds = 10;
      user.password = await bcrypt.hash(newPassword, saltRounds);
    }

    // Update email if provided (case-insensitive comparison)
    const newEmailLower = newEmail ? newEmail.toLowerCase().trim() : null;
    
    if (newEmailLower && newEmailLower !== emailLower) {
      // Check if new email already exists (exclude the current user)
      const existingUser = await User.findOne({ 
        email: newEmailLower,
        _id: { $ne: user._id } // Exclude current user
      }).session(session);
      
      if (existingUser) {
        await session.abortTransaction();
        console.log('Email already exists:', newEmailLower);
        return res.status(400).json({ 
          success: false, 
          message: "Email already exists in the system" 
        });
      }
      
      console.log('Updating email from', user.email, 'to', newEmailLower);
      user.email = newEmailLower;
      
      if (instructor) {
        instructor.email = newEmailLower;
      }
    }

    user.lastModifiedBy = req.user?._id || user.lastModifiedBy;

    if (instructor) {
      instructor.lastModifiedBy = req.user?._id || instructor.lastModifiedBy;
    }

    // Ensure changes are saved atomically
    await user.save({ session });
    if (instructor) {
      await instructor.save({ session });
    }

    await session.commitTransaction();
    console.log('User saved successfully:', user.email);

    res.json({ 
      success: true, 
      message: "Profile updated successfully. Changes have been saved to the database. You can now log in with your updated credentials.",
      profile: {
        email: user.email,
        role: user.role
      },
      mvcc: {
        user: {
          version: user.version,
          lastModifiedAt: user.lastModifiedAt,
        },
        instructor: instructor ? {
          version: instructor.version,
          lastModifiedAt: instructor.lastModifiedAt,
        } : null,
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error updating instructor profile:', error);

    if (
      error.code === "USER_VERSION_CONFLICT" ||
      error.name === "UserVersionConflictError"
    ) {
      return res.status(409).json({
        success: false,
        message: "Your profile was updated by someone else. Refresh and try again.",
        error: "USER_VERSION_CONFLICT",
        conflict: {
          currentVersion: error.currentVersion,
          attemptedVersion: error.attemptedVersion,
          documentId: error.documentId,
        },
      });
    }

    if (
      error.code === "INSTRUCTOR_VERSION_CONFLICT" ||
      error.name === "InstructorVersionConflictError"
    ) {
      return res.status(409).json({
        success: false,
        message: "Instructor profile was updated elsewhere. Refresh and try again.",
        error: "INSTRUCTOR_VERSION_CONFLICT",
        conflict: {
          currentVersion: error.currentVersion,
          attemptedVersion: error.attemptedVersion,
          documentId: error.documentId,
        },
      });
    }

    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;
