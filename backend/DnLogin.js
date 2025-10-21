// DnLogin.js - Express server with bcrypt + MongoDB Atlas + Passport Google OAuth + session

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("./models/User");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static assets from frontend/public so images resolve
app.use(express.static(path.join(__dirname, "../frontend/public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "some_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ---------- MongoDB Connection ----------
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    ensureDefaultAdmin();
  })
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ---------- Default Admin ----------
async function ensureDefaultAdmin() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
      const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";
      const hashed = await bcrypt.hash(adminPassword, 10);
      await User.create({ email: adminEmail, password: hashed, authProvider: "local" });
      console.log(`🛡️ Default admin created -> ${adminEmail}`);
    } else {
      console.log("Users exist — skipping default admin creation.");
    }
  } catch (err) {
    console.error("Error ensuring default admin:", err);
  }
}

// ---------- Passport Google OAuth ----------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL || `http://localhost:${PORT}`}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = (profile.emails && profile.emails[0] && profile.emails[0].value || "").toLowerCase();
        const googleId = profile.id;
        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({ email, googleId, authProvider: "google" });
        } else {
          // upgrade existing local account with googleId if missing
          if (!user.googleId) {
            user.googleId = googleId;
            user.authProvider = user.authProvider || "google";
            await user.save();
          }
        }
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ---------- Utility ----------
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- Routes ----------

// Main Page
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BukSU IT Evaluation</title>
<style>
body{margin:0;padding:0;font-family:Arial,sans-serif;background:url('/buksu-bg.png') no-repeat center center fixed;background-size:cover;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;color:white;text-align:center;backdrop-filter:blur(3px);}
.logo img{width:250px;margin-bottom:30px;}
.login-btn{background:linear-gradient(90deg,#ffffff,#f4f4f4);color:#111;border:none;padding:12px 100px;border-radius:50px;font-size:18px;font-weight:600;cursor:pointer;transition:all 0.3s ease;box-shadow:0 4px 10px rgba(0,0,0,0.2);letter-spacing:1px;}
.login-btn:hover{background:linear-gradient(90deg,#020068,#171c66);color:#fff;transform:scale(1.05);box-shadow:0 6px 15px rgba(0,0,0,0.3);}
footer{position:absolute;bottom:15px;font-size:12px;color:#ccc;}
footer a{color:#ccc;text-decoration:underline;}
</style>
</head>
<body>
<div class="logo"><img src="/buksu-logo.png" alt="BUKSU Logo"></div>
<button class="login-btn" onclick="window.location.href='/login-page'">LOG IN</button>
<footer>By continuing you agree to COT - IT Evaluation & Feedback System<br><a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></footer>
</body>
</html>`);
});

// Login Options Page
app.get("/login-page", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - BukSU IT Evaluation</title>
<style>
body{margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:url('/buksu-bg.png') no-repeat center center fixed;background-size:cover;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;color:white;text-align:center;backdrop-filter:blur(4px);position:relative;}
.logo img{width:180px;margin-bottom:40px;}
.google-btn{display:flex;align-items:center;justify-content:center;gap:10px;background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:40px;padding:12px 20px;width:280px;cursor:pointer;font-size:16px;font-weight:500;transition:all 0.3s ease;}
.google-btn:hover{background:rgba(255,255,255,0.2);}
.divider{display:flex;align-items:center;text-align:center;margin:20px 0;width:280px;color:#ccc;}
.divider::before,.divider::after{content:"";flex:1;border-bottom:1px solid rgba(255,255,255,0.3);}
.login-btn{background:linear-gradient(90deg,#0047ff,#001e99);color:white;border:none;border-radius:40px;padding:12px 20px;width:280px;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);}
.login-btn:hover{transform:scale(1.05);background:linear-gradient(90deg,#1b3cff,#0025d9);}
footer{position:absolute;bottom:20px;font-size:13px;color:#ccc;text-align:center;}
footer a{color:#8cb8ff;text-decoration:none;}
footer a:hover{text-decoration:underline;}
</style>
</head>
<body>
<div class="logo"><img src="/buksu-logo.png" alt="BUKSU Logo"></div>

<!-- Google Login -->
<button class="google-btn" onclick="window.location.href='/auth/google'">
<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="Google logo"> Connect with Google
</button>

<div class="divider">or</div>

<button class="login-btn" onclick="window.location.href='/password-login'">Sign in with password</button>

<footer>By continuing you agree to COT - IT Evaluation & Feedback System<br><a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></footer>
</body>
</html>`);
});

// Password Login Page
app.get("/password-login", (req, res) => {
  const error = req.query.error ? decodeURIComponent(req.query.error) : "";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Password Login - BukSU IT Evaluation</title>
<style>
body{margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:url('/buksu-bg.png') no-repeat center center fixed;background-size:cover;display:flex;justify-content:center;align-items:center;height:100vh;color:white;text-align:center;}
.modal-container{background:rgba(0,0,0,0.6);padding:30px 40px;border-radius:15px;box-shadow:0 8px 32px rgba(0,0,0,0.4);backdrop-filter:blur(6px);width:350px;}
h1{margin-bottom:10px;font-size:26px;}
.error{background:rgba(255,20,20,0.12);color:#ffb3b3;padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px;border:1px solid rgba(255,20,20,0.15);}
input{width:100%;padding:12px;margin:10px 0;border:none;border-radius:8px;font-size:15px;}
input:focus{outline:none;box-shadow:0 0 8px rgba(0,123,255,0.7);}
.login-btn{width:100%;background:linear-gradient(90deg,#0047ff,#001e99);color:white;padding:12px;border:none;border-radius:8px;cursor:pointer;font-size:16px;font-weight:bold;margin-top:10px;}
.login-btn:hover{transform:scale(1.02);background:linear-gradient(90deg,#1b3cff,#0025d4);}
.back-link{display:block;margin-top:14px;color:#8cb8ff;text-decoration:none;}
.back-link:hover{text-decoration:underline;}
</style>
</head>
<body>
<div class="modal-container">
<h1>Sign In</h1>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
<form action="/login" method="POST">
<input type="email" name="email" placeholder="Email Address" required>
<input type="password" name="password" placeholder="Password" required>
<button type="submit" class="login-btn">Login</button>
</form>
<a href="/login-page" class="back-link">← Back to Login Options</a>
</div>
</body>
</html>`);
});

// Password Login POST
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    const failRedirect = () =>
      res.redirect("/password-login?error=" + encodeURIComponent("Invalid email or password."));
    if (!user || !user.password) return failRedirect();
    const match = await bcrypt.compare(password, user.password);
    if (!match) return failRedirect();
    req.login(user, (err) => {
      if (err) return failRedirect();
      res.redirect("/dashboard");
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error.");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// ---------- Google Auth Routes ----------
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-page" }),
  (req, res) => res.redirect("/dashboard")
);

// ---------- Dashboard Route Import ----------
const dashboardRoute = require("./routes/dashboard");
app.use("/dashboard", dashboardRoute);

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
