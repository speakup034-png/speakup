// Minimal smoke tests for the OTP auth flow. Run with `npm test` after
// starting Postgres/Redis locally (see README). Extend with the full
// matching / report / block / premium scenarios described in the master spec.
const test = require('node:test');
const assert = require('node:assert');
const otpService = require('../server/services/otpService');

test('normalizePhone requires a country code', () => {
  assert.throws(() => otpService.normalizePhone('9876543210'));
});

test('normalizePhone accepts E.164-style input', () => {
  assert.strictEqual(otpService.normalizePhone('+91 98765 43210'), '+919876543210');
});

// TODO (integration, needs a running Postgres):
// - requestOtp() inserts a hashed row, never the raw code
// - verifyOtp() rejects expired / already-consumed / wrong codes
// - verifyOtp() enforces MAX_ATTEMPTS
//
// TODO (integration, needs a running Postgres + Redis):
// - two users starting match_request concurrently produce exactly one match, no duplicates
// - a banned user cannot be matched
// - a blocked pair is never matched
// - free-tier user is blocked at the 8th call of the day; premium is never blocked
