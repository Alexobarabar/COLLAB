const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, StandardFonts } = require('pdf-lib');

/**
 * Generate a digital signature for a PDF buffer.
 * The hash is computed over the raw PDF bytes concatenated with user info and timestamp.
 *
 * @param {Object} user - Authenticated user object (must have email and role if possible)
 * @param {Buffer} pdfBuffer - Raw PDF bytes
 * @returns {{ footerText: string, signatureHash: string, signatureId: string, timestamp: string }}
 */
function generateDigitalSignature(user, pdfBuffer) {
  const timestamp = new Date().toISOString();
  const signatureId = uuidv4();

  const userInfo = {
    id: user?._id ? String(user._id) : null,
    name: user?.name || user?.email || 'Unknown User',
    email: user?.email || 'unknown',
    role: user?.role || 'unknown',
    timestamp,
    signatureId,
  };

  const payload = Buffer.concat([
    pdfBuffer,
    Buffer.from(JSON.stringify(userInfo), 'utf8'),
  ]);

  const signatureHash = crypto.createHash('sha256').update(payload).digest('hex');

  const footerText = [
    `Digitally Signed By: ${userInfo.name}`,
    `Role: ${userInfo.role}`,
    `Timestamp: ${timestamp}`,
    `Signature ID: ${signatureId}`,
  ].join('  •  ');

  return {
    footerText,
    signatureHash,
    signatureId,
    timestamp,
  };
}

/**
 * Attach visible footer + metadata to an existing PDF buffer.
 * Returns a new signed PDF buffer.
 *
 * @param {Buffer} pdfBuffer
 * @param {Object} signature - result from generateDigitalSignature
 * @param {Object} [metaUser] - optional user info for metadata
 * @returns {Promise<Buffer>}
 */
async function attachSignatureToPdf(pdfBuffer, signature, metaUser = {}) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const footerText = signature.footerText || '';
  const pageCount = pages.length;

  pages.forEach((page) => {
    const { width } = page.getSize();
    const marginX = 20;
    const footerY = 20;

    page.drawText(footerText, {
      x: marginX,
      y: footerY,
      size: 7,
      font: helvetica,
      maxWidth: width - marginX * 2,
    });
  });

  // Basic metadata
  const existingKeywords = pdfDoc.getKeywords() || [];
  pdfDoc.setKeywords([
    ...existingKeywords,
    'digital-signature',
    'sha256',
    `SignatureID=${signature.signatureId}`,
    `SignatureHash=${signature.signatureHash}`,
  ]);

  if (metaUser?.email) {
    pdfDoc.setAuthor(metaUser.email);
  }
  pdfDoc.setProducer('Buksu IT Instructor Evaluation System');
  pdfDoc.setCreator('Buksu IT Instructor Evaluation System');

  const signedBytes = await pdfDoc.save();
  return Buffer.from(signedBytes);
}

/**
 * Verify a signed PDF.
 * Reads SignatureID and SignatureHash from keywords, recomputes hash, and compares.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{ valid: boolean, signatureId?: string, storedHash?: string, recomputedHash?: string }>}
 */
async function verifySignature(pdfBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const keywords = pdfDoc.getKeywords() || [];

    const sigIdEntry = keywords.find((kw) => kw.startsWith('SignatureID='));
    const hashEntry = keywords.find((kw) => kw.startsWith('SignatureHash='));

    if (!sigIdEntry || !hashEntry) {
      return { valid: false };
    }

    const signatureId = sigIdEntry.replace('SignatureID=', '');
    const storedHash = hashEntry.replace('SignatureHash=', '');

    const recomputedHash = crypto
      .createHash('sha256')
      .update(pdfBuffer)
      .digest('hex');

    return {
      valid: storedHash === recomputedHash,
      signatureId,
      storedHash,
      recomputedHash,
    };
  } catch (error) {
    console.error('Error verifying signature:', error);
    return { valid: false };
  }
}

module.exports = {
  generateDigitalSignature,
  attachSignatureToPdf,
  verifySignature,
};


