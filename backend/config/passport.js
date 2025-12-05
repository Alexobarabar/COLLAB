const dotenv = require("dotenv");
const path = require("path");

// Load .env file from backend directory (relative to this config file)
dotenv.config({ path: path.join(__dirname, "../.env") });

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const Instructor = require("../models/Instructor");

// ✅ Ensure environment variables exist
console.log("Loaded GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "✓ Set" : "✗ Missing");
console.log("Loaded GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "✓ Set" : "✗ Missing");
console.log("Loaded GOOGLE_CALLBACK_URL:", process.env.GOOGLE_CALLBACK_URL || "Not set");

// Validate required environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
  console.error("⚠️ WARNING: Google OAuth credentials are missing!");
  console.error("Please ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL are set in your .env file");
}

// Only set up Google Strategy if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if profile has emails
        if (!profile.emails || profile.emails.length === 0) {
          console.error('Google OAuth: No email found in profile');
          return done(new Error('No email found in Google profile'), null);
        }

        const email = profile.emails[0].value.toLowerCase().trim();
        console.log('Google OAuth: Processing user with email:', email);

        // Check if this is a dean email (special case)
        const isDeanEmail = email === '2001101476@student.buksu.edu.ph';

        // For instructors, check Instructor collection FIRST
        // This ensures we verify against the source of truth for instructor registration
        // Use case-insensitive email matching since Instructor emails may be stored in different cases
        const instructor = await Instructor.findOne({ 
          email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          isArchived: { $ne: true } 
        });

        let user = null;
        let userRole = null;

        if (instructor) {
          // Instructor exists in Instructor collection - this is an instructor account
          userRole = 'instructor';
          // Use the exact email from the instructor record (normalized to lowercase for consistency)
          const instructorEmail = instructor.email.toLowerCase().trim();
          console.log('Google OAuth: Found instructor in Instructor collection:', instructorEmail);
          
          // Find or create User record for this instructor using the instructor's email
          user = await User.findOne({ email: instructorEmail, isArchived: { $ne: true } });
          
          if (!user) {
            // Create User record if it doesn't exist (links Google account to instructor)
            // Use the instructor's email to ensure consistency
            user = new User({
              email: instructorEmail,
              role: 'instructor',
              authProvider: 'google',
              googleId: profile.id
            });
            await user.save();
            console.log('Google OAuth: Created User record for instructor:', instructorEmail);
          } else {
            // User exists - verify it's an instructor account
            if (user.role !== 'instructor') {
              console.warn('Google OAuth: User role mismatch. Expected instructor, got:', user.role);
              return done(null, false, { message: 'instructor_not_registered', error: 'INSTRUCTOR_NOT_REGISTERED' });
            }
            // Ensure email matches (in case of case differences)
            if (user.email.toLowerCase().trim() !== instructorEmail) {
              console.warn('Google OAuth: Email mismatch between User and Instructor records');
              // Update User email to match Instructor email for consistency
              user.email = instructorEmail;
              await user.save();
            }
          }
        } else if (isDeanEmail) {
          // Special case: dean email
          userRole = 'dean';
          user = await User.findOne({ email: email, isArchived: { $ne: true } });
          
          if (!user) {
            // Auto-create dean user
            user = new User({
              email: email,
              role: 'dean',
              authProvider: 'google',
              googleId: profile.id
            });
            await user.save();
            console.log('Google OAuth: Auto-created dean user for email:', email);
          }
        } else {
          // Not an instructor and not a dean - check if User exists (might be a dean with different email)
          user = await User.findOne({ email: email, isArchived: { $ne: true } });
          
          if (user && user.role === 'dean') {
            userRole = 'dean';
            console.log('Google OAuth: Found dean user:', email);
          } else {
            // No instructor found and not a dean - deny access
            console.warn('Google OAuth: Email not registered as instructor:', email);
            return done(null, false, { message: 'instructor_not_registered', error: 'INSTRUCTOR_NOT_REGISTERED' });
          }
        }

        // Verify user was found or created
        if (!user) {
          console.error('Google OAuth: Failed to find or create user for email:', email);
          return done(null, false, { message: 'account_not_found', error: 'ACCOUNT_NOT_FOUND' });
        }

        // Check if account is archived
        if (user.isArchived) {
          console.warn('Google OAuth: Account is archived:', email);
          return done(null, false, { message: 'account_archived', error: 'ACCOUNT_ARCHIVED' });
        }

        // Link Google ID to user account (if not already linked)
        if (!user.googleId) {
          user.googleId = profile.id;
          user.authProvider = "google";
          await user.save();
          console.log('Google OAuth: Linked Google account to user:', email);
        }

        console.log('Google OAuth: Successfully authenticated user:', email, 'Role:', user.role);
        return done(null, user);
      } catch (err) {
        console.error('Google OAuth error:', err);
        return done(err, null);
      }
    }
    )
  );
} else {
  console.warn("⚠️ Google OAuth Strategy not initialized due to missing credentials");
}

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
