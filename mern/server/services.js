import { ServiceSetting } from './models.js';
import { readLessonLibrary } from './lesson-library.js';
import { SERVICES } from '../shared/catalog.js';

export async function effectiveServices({ includeDisabled = false } = {}) {
  const library = await readLessonLibrary();
  const stored = await ServiceSetting.find({ _id: { $in: SERVICES.map(service => service.id) } }).lean();
  const overrides = new Map(stored.map(setting => [setting._id, setting]));
  return SERVICES.map(service => {
    const setting = overrides.get(service.id);
    if (service.id === 'online') return { ...service, enabled: library.open };
    return { ...service, cents: Number.isInteger(setting?.cents) ? setting.cents : service.cents, enabled: setting?.enabled !== false };
  }).filter(service => includeDisabled || service.enabled);
}
