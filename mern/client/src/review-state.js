export function initialRecommendations() {
  if (typeof document === 'undefined') return [];
  try {
    const value = JSON.parse(document.querySelector('meta[name="bravo-reviews"]')?.content || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
