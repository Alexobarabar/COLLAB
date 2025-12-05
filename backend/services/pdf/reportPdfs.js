const FPDF = require('node-fpdf');
const { generateDigitalSignature, attachSignatureToPdf } = require('../../utils/signature');
const { formatDateTime, formatScore, describeScore } = require('./shared');

// NOTE: This file is a placeholder to show how we would move PDF building logic
// into /services/pdf. For now, the routes still build PDFs directly but call
// the signature utilities so all reports are signed.

module.exports = {};


