import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

/**
 * Generate a digital signature for a jsPDF document.
 * @param {Object} user - { name, email, role }
 * @param {ArrayBuffer} pdfArrayBuffer
 * @returns {{ footerText: string, signatureHash: string, signatureId: string, timestamp: string }}
 */
export function generateDigitalSignature(user, pdfArrayBuffer) {
  const timestamp = new Date().toISOString();
  const signatureId = uuidv4();

  const userInfo = {
    name: user?.name || user?.email || 'Unknown User',
    email: user?.email || 'unknown',
    role: user?.role || 'unknown',
    timestamp,
    signatureId,
  };

  // Convert ArrayBuffer to CryptoJS WordArray efficiently (avoids huge call stacks)
  const wordArray = CryptoJS.lib.WordArray.create(pdfArrayBuffer);
  const userInfoWordArray = CryptoJS.enc.Utf8.parse(JSON.stringify(userInfo));
  const combined = wordArray.concat(userInfoWordArray);

  const hash = CryptoJS.SHA256(combined).toString();

  const footerText = [
    `Digitally Signed By: ${userInfo.name}`,
    `Role: ${userInfo.role}`,
    `Timestamp: ${timestamp}`,
    `Signature ID: ${signatureId}`,
  ].join('  •  ');

  return {
    footerText,
    signatureHash: hash,
    signatureId,
    timestamp,
  };
}

/**
 * Helper to get current user info from localStorage.
 */
export function getCurrentUserForSignature() {
  const email = localStorage.getItem('userEmail') || 'unknown@local';
  const name = localStorage.getItem('userName') || email;
  const role = localStorage.getItem('selectedRole') || 'unknown';
  return { name, email, role };
}


