#!/usr/bin/env node
/**
 * Creates the ADMIN_PASSWORD_HASH value for .env.local (Bay Design Base administrator).
 *
 *   npm run hash-password              → asks for a password (hidden as you type)
 *   npm run hash-password -- --generate → makes a strong random password for you
 *
 * Same algorithm as src/lib/base/password.ts — keep them in sync.
 */
import { randomBytes, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline';

const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function hash(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 256 * N * R }, (err, key) =>
      err ? reject(err) : resolve(['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join(':')),
    ),
  );
}

function generate() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b, i) => (i > 0 && i % 5 === 0 ? '-' : '') + alphabet[b % alphabet.length]).join('');
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

let password;
if (process.argv.includes('--generate')) {
  password = generate();
  console.log(`\nGenerated administrator password (store it in a password manager):\n\n  ${password}\n`);
} else {
  password = await askHidden('New administrator password: ');
  const again = await askHidden('Repeat it: ');
  if (password !== again) {
    console.error('Passwords did not match.');
    process.exit(1);
  }
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error('Use at least 12 characters with letters and numbers.');
    process.exit(1);
  }
}

console.log('Put this line in .env.local (replacing any existing ADMIN_PASSWORD_HASH):\n');
console.log(`ADMIN_PASSWORD_HASH=${await hash(password)}\n`);
