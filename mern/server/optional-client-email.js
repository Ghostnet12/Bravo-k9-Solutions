import { User } from './models.js';

// Build the replacement constraint before removing the legacy constraint that
// permits only one missing email. Existing email addresses remain unique.
export async function prepareOptionalClientEmail() {
  await User.init();
  const indexes = await User.collection.indexes();
  if (!indexes.some(index => index.name === 'unique_contact_email' && index.unique && index.partialFilterExpression?.email?.$type === 'string')) throw new Error('Client account setup is not ready. Please try again.');
  for (const index of indexes.filter(index => index.name === 'email_1' && index.unique && !index.partialFilterExpression && !index.sparse && Object.keys(index.key).length === 1 && index.key.email === 1)) {
    try { await User.collection.dropIndex(index.name); }
    catch (error) { if (error.code !== 27) throw error; } // Another instance completed the same migration.
  }
}
