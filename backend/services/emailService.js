const nodemailer = require('nodemailer');
const { google } = require('googleapis');
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

  async sendPasswordResetEmail(email, resetToken, options = {}) {
    try {
      // Ensure transporter is initialized
      if (!this.initialized) {
        await this.initializeTransporter();
      }

      const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetLink = `${frontendBaseUrl.replace(/\/$/, '')}/reset-password/${resetToken}`;
      console.log('Generated reset link:', resetLink);
      console.log('Reset link length:', resetLink.length);

      // Generate HTML using React component
      const htmlContent = renderEmailToHTML(resetLink);

      const fromName = options.fromName || process.env.FROM_NAME || undefined;
      const fromHeader = fromName ? `${fromName} <${process.env.EMAIL_USER}>` : process.env.EMAIL_USER;
      const mailOptions = {
        from: fromHeader,
        to: email,
        subject: 'Password Reset Request - Instructor Evaluation System',
        html: htmlContent,
        replyTo: options.replyToEmail || undefined
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendInstructorCredentialsEmail(email, name, password, options = {}) {
    try {
      if (!this.initialized) {
        await this.initializeTransporter();
      }

      const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const loginUrl = `${frontendBaseUrl.replace(/\/$/, '')}/login`;

      const username = options.username || email;
      const htmlContent = `
        <div style="font-family:Arial, Helvetica, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <div style="background:#f8f9fa; padding:24px; border-radius:10px;">
            <h2 style="margin:0 0 12px 0; color:#333;">Your Instructor Account</h2>
            <p style="color:#555;">Hello ${name || 'Instructor'},</p>
            <p style="color:#555;">An account has been created for you in the IT Instructor Evaluation System.</p>
            <div style="background:#fff; border:1px solid #e9ecef; border-radius:8px; padding:14px; margin:12px 0;">
              <div style="margin-bottom:8px;"><strong>Username:</strong> ${username}</div>
              <div><strong>Password:</strong> ${password}</div>
            </div>
            <p style="color:#555;">You can sign in using the button below and change your password after logging in.</p>
            <div style="margin:18px 0; text-align:center;">
              <a href="${loginUrl}" style="background:#0d6efd; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; display:inline-block;">Go to Login</a>
            </div>
            <p style="color:#888; font-size:12px;">If you did not expect this email, you can ignore it.</p>
          </div>
        </div>`;

      const fromName = options.fromName || process.env.FROM_NAME || undefined;
      const fromHeader = fromName ? `${fromName} <${process.env.EMAIL_USER}>` : process.env.EMAIL_USER;
      const mailOptions = {
        from: fromHeader,
        to: email,
        subject: 'Your Instructor Account Credentials',
        html: htmlContent,
        replyTo: options.replyToEmail || undefined
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Instructor credentials email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send instructor credentials email:', error);
      throw new Error(`Failed to send credentials email: ${error.message}`);
    }
  }

  // Helper function to get Gmail API OAuth2 client
  getGmailOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
      return null; // Gmail API not configured, fall back to Nodemailer
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    return oAuth2Client;
  }

  // Helper function to create MIME message for Gmail API
  createMimeMessage({ from, to, subject, html }) {
    const messageParts = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
    ];
    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return encodedMessage;
  }

  async sendEvaluationFormEmail(studentEmail, studentName, subjectName, instructorName, evaluationFormLink, options = {}) {
    try {
      const htmlContent = `
        <div style="font-family:Arial, Helvetica, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <div style="background:#f8f9fa; padding:24px; border-radius:10px;">
            <h2 style="margin:0 0 12px 0; color:#333;">Course Evaluation Form</h2>
            <p style="color:#555;">Hello ${studentName || 'Student'},</p>
            <p style="color:#555;">You are requested to complete the evaluation form for <strong>${subjectName || 'the course'}</strong>.</p>
            <p style="color:#555;">Please click the link below to submit your feedback:</p>
            <div style="margin:20px 0; text-align:center;">
              <a href="${evaluationFormLink}" style="background:#667eea; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:500;">Complete Evaluation Form</a>
            </div>
            <p style="color:#555;">Or copy and paste this link into your browser:</p>
            <p style="color:#667eea; word-break:break-all; font-size:14px;">${evaluationFormLink}</p>
            <p style="color:#555; margin-top:20px;">Thank you,<br><strong>${instructorName || 'Instructor'}</strong></p>
            <p style="color:#888; font-size:12px; margin-top:20px;">If you did not expect this email, you can ignore it.</p>
          </div>
        </div>`;

      const fromEmail = process.env.EMAIL_USER;
      if (!fromEmail) {
        throw new Error('EMAIL_USER is not configured');
      }

      const fromName = options.fromName || process.env.FROM_NAME || undefined;
      const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
      const subject = 'Course Evaluation Form';

      // Try Gmail API first if configured
      const gmailAuth = this.getGmailOAuth2Client();
      if (gmailAuth) {
        try {
          const gmail = google.gmail({ version: 'v1', auth: gmailAuth });
          const raw = this.createMimeMessage({ from: fromHeader, to: studentEmail, subject, html: htmlContent });
          
          const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw },
          });

          console.log('Evaluation form email sent via Gmail API:', response.data.id);
          return { success: true, messageId: response.data.id, method: 'gmail-api' };
        } catch (gmailError) {
          console.error('Gmail API send failed, falling back to Nodemailer:', gmailError.message);
          // Fall through to Nodemailer
        }
      }

      // Fall back to Nodemailer if Gmail API is not configured or failed
      if (!this.initialized) {
        await this.initializeTransporter();
      }

      const mailOptions = {
        from: fromHeader,
        to: studentEmail,
        subject,
        html: htmlContent,
        replyTo: options.replyToEmail || undefined
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Evaluation form email sent via Nodemailer:', info.messageId);
      return { success: true, messageId: info.messageId, method: 'nodemailer' };
    } catch (error) {
      console.error('Failed to send evaluation form email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

module.exports = EmailService;
