const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const User = require("./models/User"); // make sure this path is correct

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json()); // allows JSON body

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// Default route (API only, no HTML)
app.get("/", (req, res) => {
  res.json({ success: true, message: "Backend API is running 🚀" });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Backend is healthy", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Dashboard data endpoint (JSON API)
app.get("/api/dashboard", (req, res) => {
  // Sample dashboard data - replace with real database queries
  const dashboardData = {
    totalSurveys: 12,
    totalInstructors: 40,
    totalResponses: 432,
    instructors: [
      { name: "Prof. Santos", rating: 4.3 },
      { name: "Dr. Reyes", rating: 3.8 },
      { name: "Prof. Cruz", rating: 4.7 },
      { name: "Ms. Ortega", rating: 4.1 },
      { name: "Mr. Dela Torre", rating: 3.9 }
    ],
    recentSurveys: [
      { id: 1, title: "Faculty Development Needs", submittedAt: "2025-10-17 14:23", responses: 18 },
      { id: 2, title: "IT Services Feedback", submittedAt: "2025-10-15 09:40", responses: 25 },
      { id: 3, title: "Course Delivery Evaluation", submittedAt: "2025-10-12 11:12", responses: 12 }
    ]
  };
  
  res.json({ success: true, data: dashboardData });
});

// Register Route
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;

  // Input validation
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
app.post("/api/login", async (req, res) => {
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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
