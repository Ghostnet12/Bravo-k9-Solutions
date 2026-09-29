import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Review, AuditEvent } from './models.js';
import { WebsiteReview, websiteReviews } from './review-store.js';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { transaction } from './db.js';
import { requireUser, isPrimaryOwner, rateLimit } from './auth.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const revision = z.number().int().min(0);
const reviewInput = z.object({
  authorName: z.string().trim().min(2).max(100), body: z.string().trim().min(10).max(4000),
  rating: z.number().int().min(1).max(5).nullable(),
  source: z.enum(['Google review', 'Facebook recommendation', 'Facebook comment', 'Client review']),
});
const editInput = reviewInput.partial().extend({ expectedRevision: revision, hidden: z.boolean().optional() }).strict();
const managedCustomer = row => ({ id: `customer-${row._id}`, authorName: row.authorName, body: row.body, rating: row.rating, source: 'Verified Bravo account', kind: 'customer', hidden: !!row.hidden, revision: row.revision || 0 });
const managedWebsite = row => ({ ...row, kind: 'website' });
function ownerOnly(req, _res, next) {
  if (req.user?.role !== 'owner' || !isPrimaryOwner(req.user)) throw fail('Only the Owner can manage website reviews.', 403);
  next();
}
export function reviewManagementRoutes(app) {
  const base = '/api/admin/reviews';
  app.use(base, requireUser, ownerOnly);
  app.get(base, async (_req, res) => {
    const [website, customers] = await Promise.all([websiteReviews(), Review.find().sort({ createdAt: -1 }).lean()]);
    res.json({ reviews: [...website.map(managedWebsite), ...customers.map(managedCustomer)] });
  });
  app.post(base, rateLimit('owner-review-write', 120, 3600000), async (req, res) => {
    const input = reviewInput.strict().parse(req.body), id = `review-${randomUUID()}`;
    await WebsiteReview.init();
    let row;
    await transaction(async session => {
      [row] = await WebsiteReview.create([{ _id: id, ...input, hidden: false, order: Date.now(), revision: 1, updatedBy: req.user._id }], { session });
      await AuditEvent.create([{ actorId: req.user._id, action: 'review.created', targetType: 'website-review', targetId: id, details: { after: input } }], { session });
    });
    res.status(201).json({ review: managedWebsite({ ...row.toObject(), id }) });
  });
  const save = removing => async (req, res) => {
    const input = removing ? z.object({ expectedRevision: revision }).strict().parse(req.body) : editInput.parse(req.body);
    const id = z.string().regex(/^(?:imported-[a-z-]+|review-[a-f0-9-]{36}|customer-[a-f0-9]{24}|[a-f0-9]{24})$/).parse(req.params.id);
    const customer = id.startsWith('customer-') || /^[a-f0-9]{24}$/.test(id), key = customer ? id.replace(/^customer-/, '') : id;
    const Model = customer ? Review : WebsiteReview;
    await Model.init();
    let result;
    await transaction(async session => {
      let row = await Model.findById(key).session(session);
      const previous = row?.toObject() || DEFAULT_REVIEWS.find(review => review.id === key);
      if (!previous) throw fail('Review not found.', 404);
      if ((previous.revision || 0) !== input.expectedRevision) throw fail('This review changed. Reload the reviews before saving.');
      const { expectedRevision, ...fields } = input;
      if (removing) fields.hidden = true;
      if (customer && (fields.source !== undefined || fields.rating === null)) throw fail('Customer reviews keep their account source and a 1–5 star rating.', 400);
      if (customer && fields.body?.length > 1200) throw fail('Keep customer account reviews within 1,200 characters.', 400);
      if (!Object.keys(fields).length) throw fail('Choose a change to save.', 400);
      if (!row) row = new WebsiteReview({ _id: key, ...previous });
      Object.assign(row, fields);
      if (customer) {
        row.moderatedAt = new Date(); row.moderatedBy = req.user._id;
        if (['authorName', 'body', 'rating'].some(field => fields[field] !== undefined)) row.editedByOwner = true;
      } else {
        row.updatedBy = req.user._id;
        if (fields.body !== undefined) row.excerpt = '';
      }
      row.revision = expectedRevision + 1;
      await row.save({ session });
      await AuditEvent.create([{ actorId: req.user._id, action: removing ? 'review.removed' : fields.hidden === false ? 'review.restored' : 'review.edited', targetType: customer ? 'review' : 'website-review', targetId: key, details: { before: { authorName: previous.authorName, body: previous.body, rating: previous.rating, hidden: previous.hidden }, after: fields, revision: row.revision } }], { session });
      result = customer ? managedCustomer(row) : managedWebsite({ ...row.toObject(), id: key });
    });
    res.json({ review: result });
  };
  app.patch(`${base}/:id`, rateLimit('owner-review-write', 120, 3600000), save(false));
  app.delete(`${base}/:id`, rateLimit('owner-review-write', 120, 3600000), save(true));
}
