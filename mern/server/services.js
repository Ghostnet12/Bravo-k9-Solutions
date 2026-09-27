import { ServiceSetting } from './models.js';
import { readLessonLibrary } from './lesson-library.js';
import { SERVICES } from '../shared/catalog.js';

export async function effectiveServices({ includeDisabled = false } = {}) {
  const library = await readLessonLibrary();
  const stored = await ServiceSetting.find({ _id: { $in: SERVICES.map(service => service.id) } }).lean();
  const overrides = new Map(stored.map(setting => [setting._id, setting]));
  return SERVICES.map(service => {
    const setting = overrides.get(service.id);
    return { ...service, name: setting?.name ?? service.name, description: setting?.description ?? service.description,
      cents: setting?.cents ?? service.cents, revision: setting?.revision || 0,
      ...(service.id === 'training' ? { additionalDogCents: setting?.additionalDogCents ?? service.additionalDogCents } : {}),
      ...(service.id === 'online' ? { bundleCents: setting?.bundleCents ?? service.bundleCents } : {}),
      enabled: service.id === 'online' ? library.open : setting?.enabled !== false };
  }).filter(service => includeDisabled || service.enabled);
}
