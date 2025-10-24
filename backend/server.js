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
const evaluationRoutes = require('./routes/evaluationRoutes');
const statsRoutes = require('./routes/statsRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/stats', statsRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB Connected");

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
