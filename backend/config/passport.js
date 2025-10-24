const dotenv = require("dotenv");
dotenv.config({ path: "./backend/.env" });


const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

// ✅ Ensure environment variables exist
console.log("Loaded GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL, // from .env
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if profile has emails
        if (!profile.emails || profile.emails.length === 0) {
          console.error('Google OAuth: No email found in profile');
          return done(new Error('No email found in Google profile'), null);
        }

        const email = profile.emails[0].value;
        console.log('Google OAuth: Processing user with email:', email);
        
        // First, try to find user by Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
          // If no user found by Google ID, check if user exists by email
          user = await User.findOne({ email: email });
          
          if (user) {
            // If user exists by email, update them to include Google ID
            user.googleId = profile.id;
            user.authProvider = "google";
            await user.save();
            console.log('Google OAuth: Updated existing user with Google ID');
          } else {
            // If no user exists at all, create a new one
            user = await User.create({
              googleId: profile.id,
              email: email,
              password: null,
              authProvider: "google",
            });
            console.log('Google OAuth: Created new user');
          }
        } else {
          console.log('Google OAuth: Found existing user by Google ID');
        }

        return done(null, user);
      } catch (err) {
        console.error('Google OAuth error:', err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
