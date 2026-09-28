export const DEFAULT_BANNER = {
  locationLabel: 'LOCATION', location: 'Aberdeen, South Dakota', showLocation: true,
  timeLabel: 'LOCAL TIME', timeOverride: '', showTime: true,
  weatherLabel: 'WEATHER · NWS', weatherOverride: '', showWeather: true,
  alertLabel: 'BRAVO ALERT', showAlerts: true,
  fallbackLabel: 'BRAVO', fallback: 'Trust. Train. Deploy.',
  textColor: '#101010', borderColor: '#ba9a64', centerColor: '#ba9a64', edgeColor: '#ba9a64',
  motion: 'always', speed: 1, fontSize: 14, borderWidth: 2,
};

const LEGACY_DEFAULT_BANNER_COLORS = {
  textColor: '#101010', borderColor: '#101010', centerColor: '#ffe8a4', edgeColor: '#f58a24',
};

export const bannerSettingsWithDefaults = settings => {
  const saved = settings && typeof settings === 'object' ? settings : {};
  const merged = { ...DEFAULT_BANNER, ...saved };
  const legacyDefaultPalette = Object.entries(LEGACY_DEFAULT_BANNER_COLORS)
    .every(([key, value]) => typeof saved[key] === 'string' && saved[key].toLowerCase() === value);
  return legacyDefaultPalette
    ? { ...merged, textColor: DEFAULT_BANNER.textColor, borderColor: DEFAULT_BANNER.borderColor, centerColor: DEFAULT_BANNER.centerColor, edgeColor: DEFAULT_BANNER.edgeColor }
    : merged;
};

export const bannerDate = date => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
}).format(date);
