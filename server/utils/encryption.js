const crypto = require('crypto');

/**
 * AES-256-GCM Token 加密/解密工具
 *
 * 環境變數：NOTION_ENCRYPTION_KEY（64 hex chars = 32 bytes）
 * 產生方式：openssl rand -hex 32
 */

function getEncryptionKey() {
  const key = process.env.NOTION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('[encryption] NOTION_ENCRYPTION_KEY is not set');
  }
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error('[encryption] NOTION_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return buf;
}

/**
 * 加密 token
 * @param {string} plainToken - 明文 Notion API token
 * @returns {string} 格式 "iv:encrypted:authTag"（全部 hex）
 */
function encryptToken(plainToken) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainToken, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * 解密 token
 * @param {string} encryptedData - 格式 "iv:encrypted:authTag"
 * @returns {string} 明文 token
 */
function decryptToken(encryptedData) {
  const key = getEncryptionKey();
  const [ivHex, encrypted, authTagHex] = encryptedData.split(':');

  if (!ivHex || !encrypted || !authTagHex) {
    throw new Error('[encryption] Invalid encrypted data format');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encryptToken, decryptToken };
