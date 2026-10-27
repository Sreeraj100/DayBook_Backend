import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from './password.service.js';

test('password hashes verify only for the matching password', async () => {
  const encoded = await hashPassword('a secure passphrase');
  assert.notEqual(encoded, 'a secure passphrase');
  assert.equal(await verifyPassword('a secure passphrase', encoded), true);
  assert.equal(await verifyPassword('the wrong password', encoded), false);
});
