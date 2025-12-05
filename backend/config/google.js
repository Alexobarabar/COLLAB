const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

function getCredentialsPath() {
  const backendRoot = path.resolve(__dirname, "..");

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    // If absolute, use as-is
    if (path.isAbsolute(envPath)) return envPath;

    // Normalize and resolve relative to backend root, not process.cwd()
    const normalized = path.normalize(envPath);

    // If someone prefixed with "backend/", strip it to avoid backend/backend
    const prefix = "backend" + path.sep;
    const relativePath = normalized.startsWith(prefix)
      ? normalized.slice(prefix.length)
      : normalized;

    return path.join(backendRoot, relativePath);
  }

  // Default location inside backend/credentials
  return path.join(backendRoot, "credentials/google-service-account.json");
}

function getServiceAccountAuth(scopes = []) {
  const keyFile = getCredentialsPath();
  const subject = process.env.GOOGLE_IMPERSONATE_SUBJECT; // optional: domain-wide delegation
  return new google.auth.GoogleAuth({
    keyFile,
    scopes,
    clientOptions: subject ? { subject } : undefined,
  });
}

function getOAuthTokenPath() {
  const backendRoot = path.resolve(__dirname, "..");
  return path.join(backendRoot, "credentials/oauth_tokens.json");
}

function hasOAuthTokens() {
  try {
    return fs.existsSync(getOAuthTokenPath());
  } catch {
    return false;
  }
}

function getOAuth2Client(scopes = []) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (hasOAuthTokens()) {
    try {
      const token = JSON.parse(fs.readFileSync(getOAuthTokenPath(), "utf8"));
      oAuth2Client.setCredentials(token);
    } catch {
      // ignore bad token file; will require re-auth
    }
  }
  oAuth2Client.scopes = scopes;
  return oAuth2Client;
}

async function getFormsClient() {
  const scopes = [
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly",
  ];
  const oauth = getOAuth2Client(scopes);
  if (oauth && oauth.credentials && oauth.credentials.access_token) {
    return google.forms({ version: "v1", auth: oauth });
  }
  const auth = await getServiceAccountAuth(scopes).getClient();
  return google.forms({ version: "v1", auth });
}

async function getSheetsClient() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const oauth = getOAuth2Client(scopes);
  if (oauth && oauth.credentials && oauth.credentials.access_token) {
    return google.sheets({ version: "v4", auth: oauth });
  }
  const auth = await getServiceAccountAuth(scopes).getClient();
  return google.sheets({ version: "v4", auth });
}

module.exports = {
  getFormsClient,
  getSheetsClient,
  getOAuth2Client,
  getOAuthTokenPath,
  hasOAuthTokens,
};


