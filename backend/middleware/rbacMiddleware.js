const RolePermission = require("../models/RolePermission");
const User = require("../models/User");

/**
 * Middleware to enforce RBAC permissions
 * @param {string} featureName - The feature name to check permission for
 * @returns {Function} Express middleware function
 */
function enforcePermission(featureName) {
  return async (req, res, next) => {
    try {
      // Extract user from token
      const authHeader = req.headers["authorization"] || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Missing Authorization token",
        });
      }

      const match = token.match(/^user_([a-f\d]{24})_\d+$/i);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid token format",
        });
      }

      const userId = match[1];
      const user = await User.findById(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      // Get role permissions
      const rolePermission = await RolePermission.findOne({ role: user.role });

      if (!rolePermission) {
        // If no permissions found, deny access (fail-safe)
        return res.status(403).json({
          success: false,
          message: "This feature is disabled by the Dean.",
          feature: featureName,
        });
      }

      // Check if user has permission for this feature
      const hasPermission = rolePermission.hasPermission(featureName);

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: "This feature is disabled by the Dean.",
          feature: featureName,
        });
      }

      // Permission granted, attach user to request and continue
      req.user = user;
      next();
    } catch (error) {
      console.error("Error in enforcePermission middleware:", error);
      return res.status(500).json({
        success: false,
        message: "Permission check error",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to check permission without blocking the request
 * Attaches permission status to req.hasFeaturePermission
 * @param {string} featureName - The feature name to check permission for
 * @returns {Function} Express middleware function
 */
function checkPermission(featureName) {
  return async (req, res, next) => {
    try {
      // Extract user from token
      const authHeader = req.headers["authorization"] || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

      if (!token) {
        req.hasFeaturePermission = false;
        return next();
      }

      const match = token.match(/^user_([a-f\d]{24})_\d+$/i);
      if (!match) {
        req.hasFeaturePermission = false;
        return next();
      }

      const userId = match[1];
      const user = await User.findById(userId);

      if (!user) {
        req.hasFeaturePermission = false;
        return next();
      }

      // Get role permissions
      const rolePermission = await RolePermission.findOne({ role: user.role });

      if (!rolePermission) {
        req.hasFeaturePermission = false;
        return next();
      }

      // Check if user has permission for this feature
      req.hasFeaturePermission = rolePermission.hasPermission(featureName);
      req.user = user;
      next();
    } catch (error) {
      console.error("Error in checkPermission middleware:", error);
      req.hasFeaturePermission = false;
      next();
    }
  };
}

module.exports = {
  enforcePermission,
  checkPermission,
};

