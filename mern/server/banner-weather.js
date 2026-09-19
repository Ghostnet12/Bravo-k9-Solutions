// Fixed Aberdeen station: no visitor location or user-controlled upstream URLs.
export function observation(data, now = Date.now()) {
  const p = data?.properties, value = p?.temperature?.value, stamp = Date.parse(p?.timestamp);
  if (!Number.isFinite(value) || p.temperature.unitCode !== 'wmoUnit:degC' || !Number.isFinite(stamp) || now - stamp > 2 * 3600000 || stamp > now + 300000) return null;
  return { temperature: Math.round(value * 9 / 5 + 32), description: String(p.textDescription || 'Latest observation').slice(0, 100), observedAt: new Date(stamp).toISOString() };
}
export function createWeatherReader(fetcher = fetch, clock = Date.now) {
  let cache, until = 0, pending;
  return async () => {
    if (clock() < until) return cache;
    if (!pending) pending = (async () => {
      try {
        const response = await fetcher('https://api.weather.gov/stations/KABR/observations/latest', { headers: { 'User-Agent': 'BravoK9 (https://bravounleashed.com)', Accept: 'application/geo+json' }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Weather unavailable');
        cache = observation(await response.json(), clock());
      } catch { cache = null; }
      until = clock() + (cache ? 300000 : 60000);
      return cache;
    })().finally(() => { pending = null; });
    return pending;
  };
}
export const readWeather = createWeatherReader();
