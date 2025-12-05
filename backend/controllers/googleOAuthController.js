const fs = require("fs");
const { getOAuth2Client, getOAuthTokenPath } = require("../config/google");

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
];

exports.startAuth = (req, res) => {
  const client = getOAuth2Client(OAUTH_SCOPES);
  if (!client) {
    return res.status(400).json({ success: false, message: "Missing GOOGLE_OAUTH_* env vars" });
  }
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: OAUTH_SCOPES,
  });
  return res.json({ success: true, authUrl: url });
};

exports.oauthCallback = async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");
    const client = getOAuth2Client(OAUTH_SCOPES);
    if (!client) return res.status(400).send("OAuth not configured");
    const { tokens } = await client.getToken(code);
    fs.writeFileSync(getOAuthTokenPath(), JSON.stringify(tokens, null, 2), "utf8");
    return res.send("Google authorization complete. You can close this tab and retry form creation.");
  } catch (e) {
    console.error("OAuth callback error:", e);
    return res.status(500).send("OAuth error: " + (e?.message || "unknown"));
  }
};

exports.authStatus = (req, res) => {
  try {
    const tokenPath = getOAuthTokenPath();
    const exists = fs.existsSync(tokenPath);
    return res.json({ success: true, authorized: exists });
  } catch (e) {
    return res.json({ success: false, authorized: false });
  }
};


