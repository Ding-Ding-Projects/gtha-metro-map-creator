// Password hashing for the optional sign-in. Only the hash ever leaves the desktop tools: it is passed to the
// container as GMMC_PASSWORD_HASH, in the form pbkdf2-sha256:<iterations>:<salt>:<hash> (base64url, no padding).
// The server side is docker/auth/main.go and host.bat uses the same format.
'use strict';
const crypto = require('node:crypto');

const ITERATIONS = 600000;
const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

const passwordOk = (pw) => typeof pw === 'string' && pw.length >= MIN_LENGTH && pw.length <= MAX_LENGTH;

function hashPassword(pw, iterations = ITERATIONS) {
  if (!passwordOk(pw)) throw new Error('The password must be ' + MIN_LENGTH + ' to ' + MAX_LENGTH + ' characters.');
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pw, salt, iterations, 32, 'sha256');
  return ['pbkdf2-sha256', iterations, salt.toString('base64url'), key.toString('base64url')].join(':');
}

const hashOk = (h) => typeof h === 'string' && /^pbkdf2-sha256:\d{6,7}:[A-Za-z0-9_-]{22,}:[A-Za-z0-9_-]{43}$/.test(h);

// Async so the wizard and deploy app stay responsive while 600,000 rounds run.
function hashPasswordAsync(pw, iterations = ITERATIONS) {
  if (!passwordOk(pw)) return Promise.reject(new Error('The password must be ' + MIN_LENGTH + ' to ' + MAX_LENGTH + ' characters.'));
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => crypto.pbkdf2(pw, salt, iterations, 32, 'sha256', (e, key) => e ? reject(e)
    : resolve(['pbkdf2-sha256', iterations, salt.toString('base64url'), key.toString('base64url')].join(':'))));
}

module.exports = { hashPassword, hashPasswordAsync, hashOk, passwordOk, MIN_LENGTH, MAX_LENGTH };
