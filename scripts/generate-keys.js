#!/usr/bin/env node
/**
 * Generates RSA-2048 key pair for JWT RS256 signing.
 *
 * Usage:
 *   node scripts/generate-keys.js
 *
 * Output:
 *   Prints JWT_PRIVATE_KEY and JWT_PUBLIC_KEY values ready to paste into .env
 *   Keys are PEM-encoded with literal \n so they fit on a single .env line.
 */

import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Collapse PEM to single line by replacing newlines with literal \n
const collapse = (pem) => pem.replace(/\n/g, '\\n');

console.log('\nRSA key pair generated. Copy these into your .env file:\n');
console.log(`JWT_PRIVATE_KEY="${collapse(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${collapse(publicKey)}"`);
console.log('\nNever commit .env or these key values to version control.\n');
