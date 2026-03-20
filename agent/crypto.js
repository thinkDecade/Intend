#!/usr/bin/env node
// Intend Crypto — AES-256-GCM encryption for mnemonics at rest
'use strict';
const crypto = require('crypto');

const KEY_HEX = process.env.INTEND_ENCRYPTION_KEY;
if (!KEY_HEX) throw new Error('INTEND_ENCRYPTION_KEY environment variable not set');
const KEY = Buffer.from(KEY_HEX, 'hex');
if (KEY.length !== 32) throw new Error('INTEND_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.split(':').length === 3 && value.length > 80;
}

module.exports = { encrypt, decrypt, isEncrypted };
