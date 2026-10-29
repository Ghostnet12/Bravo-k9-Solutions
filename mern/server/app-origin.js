// Trust deployment configuration, never a request's Host / forwarded headers.
// Preview credentials and origins are deliberately separate from production.
export function appOrigins(env = process.env) {
  if (env.VERCEL_ENV === 'preview') {
    const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL];
    return [...new Set(hosts.filter(host => typeof host === 'string' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(host)).map(host => `https://${host}`))];
  }
  const origin = env.APP_ORIGIN || (env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '');
  return origin ? [origin] : [];
}

export const appOrigin = (env = process.env) => appOrigins(env)[0] || '';
