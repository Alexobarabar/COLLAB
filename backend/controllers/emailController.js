const { google } = require("googleapis");

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error("Missing GOOGLE_* OAuth2 environment variables");
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  // Set Gmail scope explicitly
  oAuth2Client.setCredentials({ 
    refresh_token: refreshToken 
  });
  // Ensure Gmail scope is included
  oAuth2Client.scopes = ['https://www.googleapis.com/auth/gmail.send'];
  return oAuth2Client;
}

function createMimeMessage({ from, to, subject, html }) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ];
  const message = messageParts.join("\r\n");
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return encodedMessage;
}

exports.sendEvaluationEmails = async (req, res) => {
  try {
    const { formLink, recipients, subject, message } = req.body || {};

    if (!formLink || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: "formLink and non-empty recipients are required" });
    }

    const fromEmail = process.env.EMAIL_USER;
    if (!fromEmail) {
      return res.status(400).json({ success: false, error: "Missing EMAIL_USER in environment" });
    }

    const mailSubject = subject || "BukSU IT Evaluation Form";
    const mailHtml = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
        <p>${message || "Dear student, please fill out the evaluation form at the link below."}</p>
        <p><a href="${formLink}" target="_blank" rel="noopener noreferrer">Open Evaluation Form</a></p>
        <p style="margin-top:16px;color:#666;">Thank you.</p>
      </div>
    `;

    const auth = getOAuth2Client();
    const gmail = google.gmail({ version: "v1", auth });

    const results = { sent: [], failed: [] };
    for (const recipient of recipients) {
      try {
        const raw = createMimeMessage({ from: fromEmail, to: recipient, subject: mailSubject, html: mailHtml });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        results.sent.push(recipient);
      } catch (e) {
        results.failed.push({ recipient, error: e?.response?.data?.error?.message || e?.message || "send failed" });
      }
    }

    if (results.failed.length === 0) {
      return res.json({ success: true, message: "Emails sent successfully!", results });
    }
    if (results.sent.length === 0) {
      return res.status(500).json({ success: false, error: "All emails failed to send", results });
    }
    return res.status(207).json({ success: false, error: "Some emails failed", results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Unknown error" });
  }
};


