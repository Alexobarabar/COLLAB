const express = require("express");
const RolePermission = require("../models/RolePermission");
const User = require("../models/User");
const {
  DEFAULT_DEAN_PERMISSIONS,
  DEFAULT_INSTRUCTOR_PERMISSIONS,
  FEATURE_LABELS,
  DEAN_FEATURE_CATEGORIES,
  INSTRUCTOR_FEATURE_CATEGORIES,
} = require("../config/permissions");
const router = express.Router();

// Middleware to require Dean authentication
function requireDeanAuth(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: "Missing Authorization token" });
    }
    const match = token.match(/^user_([a-f\d]{24})_\d+$/i);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid token format" });
    }
    const userId = match[1];
    User.findById(userId)
      .then((user) => {
        if (!user || user.role !== "dean") {
          return res.status(403).json({ success: false, message: "Forbidden: dean access required" });
        }
        req.user = user;
        next();
      })
      .catch((err) => {
        return res.status(500).json({ success: false, message: "Auth lookup error", details: err.message });
      });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Auth error", details: e.message });
  }
}

// GET /api/rbac/permissions/:role - Get permissions for a specific role
router.get("/permissions/:role", async (req, res) => {
  try {
    const { role } = req.params;

    if (!["dean", "instructor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'dean' or 'instructor'",
      });
    }

    let rolePermission = await RolePermission.findOne({ role });

    // If permissions don't exist, create them with defaults
    if (!rolePermission) {
      const defaultPermissions =
        role === "dean" ? DEFAULT_DEAN_PERMISSIONS : DEFAULT_INSTRUCTOR_PERMISSIONS;

      rolePermission = new RolePermission({
        role,
        permissions: new Map(Object.entries(defaultPermissions)),
      });
      await rolePermission.save();
    }

    // Convert Map to object for JSON response
    const permissionsObj = Object.fromEntries(rolePermission.permissions);

    // Get feature categories
    const categories =
      role === "dean" ? DEAN_FEATURE_CATEGORIES : INSTRUCTOR_FEATURE_CATEGORIES;

    res.json({
      success: true,
      role,
      permissions: permissionsObj,
      categories,
      labels: FEATURE_LABELS,
    });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PATCH /api/rbac/permissions/:role - Update permissions for a specific role
router.patch("/permissions/:role", requireDeanAuth, async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    if (!["dean", "instructor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'dean' or 'instructor'",
      });
    }

    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({
        success: false,
        message: "permissions object is required",
      });
    }

    let rolePermission = await RolePermission.findOne({ role });

    // If permissions don't exist, create them
    if (!rolePermission) {
      rolePermission = new RolePermission({
        role,
        permissions: new Map(),
      });
    }

    // Update permissions
    Object.entries(permissions).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        rolePermission.permissions.set(key, value);
      }
    });

    await rolePermission.save();

    // Convert Map to object for JSON response
    const permissionsObj = Object.fromEntries(rolePermission.permissions);

    res.json({
      success: true,
      message: `Permissions updated successfully for ${role} role`,
      role,
      permissions: permissionsObj,
    });
  } catch (error) {
    console.error("Error updating permissions:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// POST /api/rbac/seed - Seed default permissions (for first-time setup)
router.post("/seed", async (req, res) => {
  try {
    const results = [];

    // Seed Dean permissions
    let deanPermissions = await RolePermission.findOne({ role: "dean" });
    if (!deanPermissions) {
      deanPermissions = new RolePermission({
        role: "dean",
        permissions: new Map(Object.entries(DEFAULT_DEAN_PERMISSIONS)),
      });
      await deanPermissions.save();
      results.push({ role: "dean", status: "created" });
    } else {
      results.push({ role: "dean", status: "already exists" });
    }

    // Seed Instructor permissions
    let instructorPermissions = await RolePermission.findOne({ role: "instructor" });
    if (!instructorPermissions) {
      instructorPermissions = new RolePermission({
        role: "instructor",
        permissions: new Map(Object.entries(DEFAULT_INSTRUCTOR_PERMISSIONS)),
      });
      await instructorPermissions.save();
      results.push({ role: "instructor", status: "created" });
    } else {
      results.push({ role: "instructor", status: "already exists" });
    }

    res.json({
      success: true,
      message: "Permission seeding completed",
      results,
    });
  } catch (error) {
    console.error("Error seeding permissions:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// POST /api/rbac/check - Check if a user has permission for a feature
router.post("/check", async (req, res) => {
  try {
    const { role, feature } = req.body;

    if (!role || !feature) {
      return res.status(400).json({
        success: false,
        message: "role and feature are required",
      });
    }

    const rolePermission = await RolePermission.findOne({ role });

    if (!rolePermission) {
      return res.json({
        success: true,
        hasPermission: false,
        message: "Role permissions not found",
      });
    }

    const hasPermission = rolePermission.hasPermission(feature);

    res.json({
      success: true,
      hasPermission,
      feature,
      role,
    });
  } catch (error) {
    console.error("Error checking permission:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;

