#!/usr/bin/env node
// Creates the KV "auth" record for a password, so the password lives in Cloudflare KV instead of a secret.
//
//   node tools/hash-password.mjs "my new password"
//
// then run the printed command (or paste the JSON into the KV dashboard as key "auth").
import { webcrypto as crypto } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 8) { console.error('Usage: node tools/hash-password.mjs "password (8+ characters)"'); process.exit(1); }
const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt.match(/../g).map((h) => parseInt(h, 16))), iterations: 100000 }, key, 256);
const hash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
const record = JSON.stringify({ salt, hash });
console.log(record);
console.log(`\nnpx wrangler kv key put auth '${record}' --binding SCHEDULE --remote`);
