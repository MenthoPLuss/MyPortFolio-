import test from 'node:test';
import assert from 'node:assert/strict';
import { contactEntries, contactProblems } from '../src/content/contact.ts';

const empty = { linkedin: null, instagram: null, whatsapp: null, email: null };
// Synthetic test destinations only; never written into the portfolio configuration.
const valid = { linkedin: 'https://www.linkedin.com/in/test-owner/', instagram: 'https://www.instagram.com/test.owner/', whatsapp: '+1 (202) 555-0123', email: 'test+portfolio@example.org' };

test('four methods retain the required order even when unconfigured', () => {
  const entries = contactEntries(empty);
  assert.deepEqual(entries.map(e => e.key), ['linkedin', 'instagram', 'whatsapp', 'email']);
  assert.ok(entries.every(e => e.href === null));
  assert.equal(contactProblems(empty).length, 4);
});
test('valid contact values resolve to https, international wa.me and mailto destinations', () => {
  assert.deepEqual(contactEntries(valid).map(e => e.href), [valid.linkedin, valid.instagram, 'https://wa.me/12025550123', 'mailto:test+portfolio@example.org']);
  assert.deepEqual(contactProblems(valid), []);
});
test('profile validation rejects homepages, unrelated routes, spoofed hosts and credentials', () => {
  for (const url of ['https://linkedin.com/', 'https://linkedin.com/jobs/', 'https://linkedin.com.evil.test/in/test/', 'https://user:password@linkedin.com/in/test/', 'http://linkedin.com/in/test/', 'https://linkedin.com:8443/in/test/', 'javascript:alert(1)']) {
    assert.equal(contactEntries({ ...valid, linkedin: url })[0].href, null, url);
  }
  for (const path of ['accounts', 'direct', 'explore', 'reel', 'p/test', '']) {
    assert.equal(contactEntries({ ...valid, instagram: `https://instagram.com/${path}/` })[1].href, null, path);
  }
});
test('phone and email inputs cannot create malformed or injected links', () => {
  for (const whatsapp of ['0123456789', '123', '+91123abc4567', '1234567890123456']) {
    assert.equal(contactEntries({ ...valid, whatsapp })[2].href, null);
  }
  for (const email of ['a@b.com?bcc=other@example.org', 'a@b.com\r\nBcc: other@example.org', 'a%0d%0a@b.com', 'a..b@example.org', '@example.org']) {
    assert.equal(contactEntries({ ...valid, email })[3].href, null);
  }
  assert.equal(contactEntries({ ...valid, email: 'mailto:owner@example.org' })[3].href, 'mailto:owner@example.org');
});
