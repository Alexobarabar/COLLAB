const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const User = require("./models/User"); // make sure this path is correct
const passport = require("./config/passport");
const session = require("express-session");




const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json()); // allows JSON body
app.use(
  session({
    secret: process.env.SESSION_SECRET || "yourSecretKey",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Routes
const authRoutes = require('./routes/authRoutes');
const instructorRoutes = require('./routes/instructorRoutes');
const deanRoutes = require('./routes/deanRoutes');
const instructorProfileRoutes = require('./routes/instructorProfileRoutes');
const evaluationRoutes = require('./routes/evaluationRoutes');
const evaluationFormRoutes = require('./routes/evaluationFormRoutes');
const statsRoutes = require('./routes/statsRoutes');
const studentRoutes = require('./routes/studentRoutes');
const googleFormsRoutes = require('./routes/googleFormsRoutes');
const emailRoutes = require('./routes/emailRoutes');
const reportRoutes = require('./routes/reportRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const subjectCodeRoutes = require('./routes/subjectCodeRoutes');
const rbacRoutes = require('./routes/rbacRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/dean', deanRoutes);
app.use('/api/instructor-profile', instructorProfileRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/evaluation-forms', evaluationFormRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/instructor', studentRoutes);
app.use('/api/google-forms', googleFormsRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/subject-codes', subjectCodeRoutes);
app.use('/api/rbac', rbacRoutes);

// Auto-seed RBAC permissions on startup
async function seedRBACPermissions() {
  try {
    const RolePermission = require("./models/RolePermission");
    const {
      DEFAULT_DEAN_PERMISSIONS,
      DEFAULT_INSTRUCTOR_PERMISSIONS,
    } = require("./config/permissions");

    // Seed Dean permissions
    let deanPermissions = await RolePermission.findOne({ role: "dean" });
    if (!deanPermissions) {
      deanPermissions = new RolePermission({
        role: "dean",
        permissions: new Map(Object.entries(DEFAULT_DEAN_PERMISSIONS)),
      });
      await deanPermissions.save();
      console.log("✅ Dean permissions seeded");
    } else {
      console.log("✓ Dean permissions already exist");
    }

    // Seed Instructor permissions
    let instructorPermissions = await RolePermission.findOne({ role: "instructor" });
    if (!instructorPermissions) {
      instructorPermissions = new RolePermission({
        role: "instructor",
        permissions: new Map(Object.entries(DEFAULT_INSTRUCTOR_PERMISSIONS)),
      });
      await instructorPermissions.save();
      console.log("✅ Instructor permissions seeded");
    } else {
      console.log("✓ Instructor permissions already exist");
    }
  } catch (error) {
    console.error("❌ Error seeding RBAC permissions:", error);
  }
}

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");

    // Auto-seed RBAC permissions
    await seedRBACPermissions();

    // Default route (API only, no HTML)
    app.get("/", (req, res) => {
      res.json({ success: true, message: "Backend API is running 🚀" });
    });

    // Start Server only after DB connection
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Error:", err);
    process.exit(1); // Exit if DB connection fails
  });
