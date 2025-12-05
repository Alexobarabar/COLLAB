const mongoose = require("mongoose");

const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["dean", "instructor"],
      required: true,
      unique: true,
    },
    permissions: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to get permission value
rolePermissionSchema.methods.hasPermission = function (featureName) {
  return this.permissions.get(featureName) === true;
};

// Helper method to set permission
rolePermissionSchema.methods.setPermission = function (featureName, value) {
  this.permissions.set(featureName, value);
  return this.save();
};

const RolePermission = mongoose.model("RolePermission", rolePermissionSchema);

module.exports = RolePermission;

