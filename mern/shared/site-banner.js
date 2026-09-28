export const DEFAULT_BANNER = {
  locationLabel: 'LOCATION', location: 'Aberdeen, South Dakota', showLocation: true,
  timeLabel: 'LOCAL TIME', timeOverride: '', showTime: true,
  weatherLabel: 'WEATHER · NWS', weatherOverride: '', showWeather: true,
  alertLabel: 'BRAVO ALERT', showAlerts: true,
  fallbackLabel: 'BRAVO', fallback: 'Trust. Train. Deploy.',
  textColor: '#101010', borderColor: '#ba9a64', centerColor: '#ba9a64', edgeColor: '#ba9a64',
  motion: 'always', speed: 1, fontSize: 14, borderWidth: 2,
};

export const bannerDate = date => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
}).format(date);
