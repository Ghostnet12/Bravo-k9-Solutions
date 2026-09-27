import { ServiceSetting, LessonLibrary } from './models.js';
import { readLessonLibrary } from './lesson-library.js';
import { SERVICES } from '../shared/catalog.js';
import { publishedServiceSetting } from './service-pricing.js';

export async function effectiveServices({ includeDisabled = false, readOnly = false } = {}) {
  // HTML rendering must never wait for Stripe checkout cleanup. Normal API
  // requests still reconcile closed lesson checkouts through readLessonLibrary.
  const library = readOnly ? await LessonLibrary.findById('library').select('open').maxTimeMS(2000).lean() || {open:false} : await readLessonLibrary();
  const query = ServiceSetting.find({ _id: { $in: SERVICES.map(service => service.id) } });
  if (readOnly) query.maxTimeMS(2000);
  const stored = await query.lean();
  const overrides = new Map(stored.map(setting => [setting._id, setting]));
  return SERVICES.map(service => {
    const setting = publishedServiceSetting(service.id, overrides.get(service.id));
    return { ...service, name: setting?.name ?? service.name, description: setting?.description ?? service.description,
      cents: setting?.cents ?? service.cents, revision: setting?.revision || 0,
      ...(service.id === 'training' ? { additionalDogCents: setting?.additionalDogCents ?? service.additionalDogCents } : {}),
      ...(service.id === 'online' ? { bundleCents: setting?.bundleCents ?? service.bundleCents } : {}),
      enabled: service.id === 'online' ? library.open : setting?.enabled !== false };
  }).filter(service => includeDisabled || service.enabled);
}
