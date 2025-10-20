// dashboard.js
const express = require("express");
const router = express.Router();

// Escape HTML helper
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Dashboard Page
router.get("/", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login-page");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard - BukSU IT Evaluation</title>
<style>
:root {
  --primary: #0025d4;
  --secondary: #0047ff;
  --light-bg: #f3f6ff;
  --text-dark: #111;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Segoe UI', sans-serif;
  display: flex;
  height: 100vh;
  background: var(--light-bg);
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: linear-gradient(180deg, var(--secondary), var(--primary));
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 20px 15px;
  box-shadow: 3px 0 10px rgba(0,0,0,0.15);
}

.sidebar .logo {
  width: 70px;
  height: 70px;
  margin: 0 auto 20px;
  display: block;
}

.sidebar h2 {
  font-size: 20px;
  text-align: center;
  width: 100%;
  margin-bottom: 25px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.sidebar a {
  text-decoration: none;
  color: #fff;
  padding: 12px 18px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  margin: 8px 0;
  transition: background 0.2s ease;
  font-size: 15px;
  width: 100%;
}
.sidebar a:hover {
  background: rgba(255, 255, 255, 0.15);
}

.create-btn {
  background: #1b1b1bff;
  color: var(--primary);
  font-weight: 600;
  text-align: center;
  border-radius: 8px;
  padding: 12px;
  margin-top: 25px;
  text-decoration: none;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  transition: all 0.3s ease;
  width: 100%;
}
.create-btn:hover {
  transform: scale(1.05);
  background: #f0f3ff;
}

/* Main Content */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 40px;
  overflow-y: auto;
}
.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #dde3ff;
  padding-bottom: 15px;
}
.main-header h1 {
  color: var(--primary);
  font-size: 24px;
  font-weight: 600;
}
.logout-btn {
  background: linear-gradient(90deg, var(--secondary), var(--primary));
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}
.logout-btn:hover {
  transform: scale(1.05);
}
.content {
  margin-top: 40px;
  text-align: center;
}
.content p {
  font-size: 16px;
  color: #333;
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}
footer {
  text-align: center;
  font-size: 12px;
  color: #666;
  margin-top: auto;
  padding-top: 30px;
}
</style>
</head>
<body>
  <div class="sidebar">
    <img src="/buksu-logo.png" alt="BUKSU Logo" class="logo">
    <h2>College of Technology</h2>

    <a href="#" class="create-btn">+ Create Survey</a>
  </div>

  <div class="main">
    <div class="main-header">
      <h1>BukSU College of Technology IT Evaluation System</h1>
      <button class="logout-btn" onclick="window.location.href='/logout'">Log Out</button>
    </div>

    <div class="content">
      <p>You have successfully logged in to the <b>BukSU College of Technology IT Evaluation System</b>.<br><br>
      Use the sidebar to create surveys, view your submissions, or manage your account.</p>
    </div>

    <footer>&copy; 2025 BukSU College of Technology — IT Evaluation System</footer>
  </div>
</body>
</html>`);
});

module.exports = router;
