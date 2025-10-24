# Google OAuth Setup Guide

## Issues Fixed

I've identified and fixed several issues with your Google login implementation:

### 1. **Missing Environment Variables**
- Created a `.env` file in the backend directory with all required variables
- Added proper error handling for missing Google OAuth credentials

### 2. **Improved Error Handling**
- Enhanced passport.js to handle cases where Google profile doesn't contain email
- Added comprehensive error handling in auth routes
- Updated frontend to display specific error messages for different failure scenarios

### 3. **Frontend Integration**
- Updated LoginPage to handle Google OAuth error parameters from URL
- Modified Dashboard to properly handle tokens from Google OAuth callback
- Added proper token storage and user ID extraction

## Required Setup Steps

### Step 1: Google Cloud Console Setup

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select Project**
   - Create a new project or select an existing one
   - Note your project ID

3. **Enable Google+ API**
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
   - Also enable "Google OAuth2 API" if available

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application" as the application type
   - Set the name (e.g., "Instructor Evaluation System")

5. **Configure Authorized Redirect URIs**
   - Add: `http://localhost:5000/api/auth/google/callback`
   - This is where Google will redirect after authentication

6. **Get Your Credentials**
   - Copy the Client ID and Client Secret
   - You'll need these for the .env file

### Step 2: Update Environment Variables

Edit the `backend/.env` file and replace the placeholder values:

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/instructor_evaluation

# Session Secret
SESSION_SECRET=your-super-secret-session-key-change-this-in-production

# Google OAuth Credentials (REPLACE THESE WITH YOUR ACTUAL VALUES)
GOOGLE_CLIENT_ID=your-actual-google-client-id-here
GOOGLE_CLIENT_SECRET=your-actual-google-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# reCAPTCHA (optional for testing)
RECAPTCHA_SECRET_KEY=your-recaptcha-secret-key-here

# Email Service (for password reset)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### Step 3: Start the Application

1. **Start MongoDB** (if not already running)
   ```bash
   mongod
   ```

2. **Start the Backend**
   ```bash
   cd backend
   npm start
   ```

3. **Start the Frontend** (in a new terminal)
   ```bash
   cd frontend
   npm start
   ```

### Step 4: Test Google Login

1. Navigate to `http://localhost:3000/login`
2. Click "Continue with Google"
3. You should be redirected to Google's OAuth consent screen
4. After authorization, you'll be redirected back to the dashboard

## Troubleshooting

### Common Issues:

1. **"Invalid client" error**
   - Check that your Google Client ID is correct in the .env file
   - Ensure the redirect URI matches exactly: `http://localhost:5000/api/auth/google/callback`

2. **"Redirect URI mismatch" error**
   - Go back to Google Cloud Console
   - Add the exact redirect URI: `http://localhost:5000/api/auth/google/callback`

3. **"Access blocked" error**
   - Your app might need verification for production use
   - For development, add your email to the test users list in Google Cloud Console

4. **MongoDB connection issues**
   - Ensure MongoDB is running on `mongodb://localhost:27017`
   - Check that the database name is correct

### Debug Steps:

1. **Check Backend Logs**
   - Look for console.log messages in the terminal running the backend
   - The passport.js file now includes detailed logging

2. **Check Browser Console**
   - Open browser developer tools
   - Look for any JavaScript errors

3. **Verify Environment Variables**
   - Make sure the .env file is in the backend directory
   - Check that all required variables are set

## Security Notes

- Never commit the .env file to version control
- Use strong, unique session secrets in production
- Consider using environment-specific OAuth credentials for production
- Implement proper JWT tokens instead of simple string tokens for production

## Next Steps

Once Google OAuth is working:

1. Test the complete login flow
2. Verify that users are properly created in MongoDB
3. Test the evaluation form functionality
4. Consider implementing proper JWT authentication for production use

The Google login should now work properly with these fixes!
