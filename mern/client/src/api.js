export async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('This is taking longer than expected. Your input is still here; please try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}
