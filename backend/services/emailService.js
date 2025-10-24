const nodemailer = require('nodemailer');
const { renderEmailToHTML } = require('../components/PasswordResetEmail');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  async initializeTransporter() {
    if (this.initialized) return;

    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify transporter configuration
      await this.transporter.verify();
      this.initialized = true;
      console.log('Email transporter is ready');
    } catch (error) {
      console.error('Email transporter verification failed:', error);
      throw new Error(`Email service configuration error: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(email, resetToken) {
    try {
      // Ensure transporter is initialized
      if (!this.initialized) {
        await this.initializeTransporter();
      }

      const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;
      console.log('Generated reset link:', resetLink);
      console.log('Reset link length:', resetLink.length);

      // Generate HTML using React component
      const htmlContent = renderEmailToHTML(resetLink);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset Request - Instructor Evaluation System',
        html: htmlContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

module.exports = EmailService;
