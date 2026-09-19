import { z } from 'zod';
const label = z.string().trim().max(50), text = z.string().trim().max(280);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const bannerSettingsInput = z.object({
  locationLabel: label, location: text, showLocation: z.boolean(),
  timeLabel: label, timeOverride: text, showTime: z.boolean(),
  weatherLabel: label, weatherOverride: text, showWeather: z.boolean(),
  alertLabel: label, showAlerts: z.boolean(), fallbackLabel: label, fallback: text,
  textColor: color, borderColor: color, centerColor: color, edgeColor: color,
  motion: z.enum(['alerts', 'always', 'never']).default('always'),
  speed: z.number().min(.25).max(3), fontSize: z.number().int().min(12).max(24), borderWidth: z.number().int().min(0).max(6),
}).strict();
