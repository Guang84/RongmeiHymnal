import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, normalizeSearch, verificationMessage } from '../js/search-core.js';

test('normalizes spacing, compatibility forms and case', () => {
  assert.equal(normalizeSearch('  ＲONGMEI   SONG  '), 'rongmei song');
});
test('matches every token regardless of order', () => {
  assert.equal(matchesSearch('grace morning', 'Morning comes with grace'), true);
  assert.equal(matchesSearch('grace evening', 'Morning comes with grace'), false);
});
test('empty queries never match', () => {
  assert.equal(matchesSearch('   ', 'any lyric text'), false);
});
test('unverified records are not labeled verified', () => {
  assert.match(verificationMessage({ verification: { status: 'unverified' } }, 'Buanthanhlu'), /Not yet editor-reviewed/);
});
test('verified records retain editorial notes', () => {
  assert.equal(verificationMessage({ verification: { status: 'verified', note: 'Reviewed against print.' } }), 'Editor-reviewed · Reviewed against print.');
});
test('incomplete transcriptions are identified', () => {
  assert.match(verificationMessage({ verification: { status: 'incomplete' } }), /transcription incomplete/i);
});
test('correction requests are not represented as approved editions', () => {
  assert.match(verificationMessage({ verification: { status: 'needs_correction' } }), /Correction requested/);
});
