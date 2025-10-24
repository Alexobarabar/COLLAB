# TODO: Improve Dashboard

- [ ] Add 'Stats' tab to Dashboard.js with evaluation summaries
- [ ] Create backend route /api/stats for fetching stats (total evaluations, average ratings)
- [ ] Fix hardcoded student ID to dynamic from localStorage
- [ ] Add better error handling and validation for forms
- [ ] Improve UI styling and responsiveness
- [ ] Test DB connection and data persistence
- [ ] Test frontend tabs and backend APIs
- [ ] Run the app and verify all features work

# TODO: Implement Password Reset Feature

- [x] Update User.js model to add resetToken and resetTokenExpiry fields
- [x] Add "Forgot Password?" link in LoginPage.js to navigate to /forgot-password
- [x] Create ForgotPassword.js component for entering email to request password reset
- [x] Update authRoutes.js with POST /forgot-password route (generate reset token, send real email via Gmail SMTP)
- [x] Update authRoutes.js with POST /reset-password route (verify token and update password)
- [x] Add /forgot-password and /reset-password routes in App.js
- [x] Create ResetPassword.js component for entering new password with reset token
- [x] Install nodemailer for email sending
- [x] Configure Gmail SMTP with app password
- [x] Fix nodemailer.createTransport method name
- [x] Test the password reset flow end-to-end with real email sending
