import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIALIST_LINKS, specialistInquiryPath, contactInquiryContext } from '../shared/contact-interest.js';
import { TRAINING_FOCUSES, isSpecialistFocus } from '../shared/catalog.js';

test('every specialist goal reaches contact with recognizable context instead of a membership quote', () => {
  for (const focus of TRAINING_FOCUSES.filter(item => isSpecialistFocus(item.id))) {
    const path = specialistInquiryPath(focus.id);
    assert.ok(path.startsWith('/contact?interest='), focus.id);
    const context = contactInquiryContext(path.split('?')[1]);
    assert.ok(context?.subject, focus.id);
    assert.equal('price' in context, false);
  }
  assert.equal(SPECIALIST_LINKS.length, 5);
  assert.equal(contactInquiryContext('?interest=advanced-training').subject, 'advanced obedience');
});

test('hunting context keeps a valid selected goal and safe return path', () => {
  const context = contactInquiryContext('?interest=hunting&goal=recall');
  assert.equal(context.goal, 'Recall & steadiness');
  assert.equal(context.backPath, '/hunting-dog-training');
});

test('unknown input cannot supply reflected copy or an external return link', () => {
  for (const interest of ['', 'unknown', '__proto__', 'constructor', '<script>alert(1)</script>', 'https://example.com']) {
    assert.equal(contactInquiryContext(`?interest=${encodeURIComponent(interest)}`), null);
    assert.equal(specialistInquiryPath(interest), '/contact');
  }
  const context = contactInquiryContext('?interest=service-dog&goal=private-info&return=https://example.com');
  assert.equal(context.goal, '');
  assert.equal(context.backPath, '/#specialist-training');
});
