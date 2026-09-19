export const CONTENT_FONTS = { montserrat: 'Montserrat, sans-serif', bebas: '"Bebas Neue", sans-serif', system: 'system-ui, sans-serif', georgia: 'Georgia, serif' };
export function contentStyle(value = {}) {
  const out = {};
  if (value.font) out.fontFamily = CONTENT_FONTS[value.font];
  if (value.fontSize) out.fontSize = `clamp(12px, ${value.fontSize / 12}vw, ${value.fontSize}px)`;
  if (value.color) out.color = value.color;
  if (value.background === 'solid') out.background = value.backgroundColor || '#101010';
  if (value.background === 'gradient') out.background = `linear-gradient(${value.angle ?? 90}deg, ${value.backgroundColor || '#101010'}, ${value.gradientEnd || '#ba9a64'})`;
  if (value.background === 'transparent') out.background = 'transparent';
  if (value.textAlign) out.textAlign = value.textAlign;
  if (value.paddingY !== undefined) { out.paddingTop = `${value.paddingY}px`; out.paddingBottom = `${value.paddingY}px`; }
  if (value.opacity !== undefined) out.opacity = value.opacity;
  return out;
}
export const styleString = value => Object.entries(contentStyle(value)).map(([key, val]) => `${key.replace(/[A-Z]/g, char => '-' + char.toLowerCase())}:${val}`).join(';');
export function themeCss(value = {}) {
  let css = `body{${styleString(value)}}`;
  if (value.background) css += '.bravo-home,.app-page{background:transparent}';
  if (value.font) css += `body :where(h1,h2,h3,h4,h5,h6,p,span,a,button,label,input,select,textarea,li,strong,em,small):not([data-site-custom-font]){font-family:${CONTENT_FONTS[value.font]} !important}`;
  if (value.color) css += `body :where(h1,h2,h3,h4,h5,h6,p,span,a,label,li,strong,em,small):not([data-site-custom-color]){color:${value.color} !important}`;
  return css;
}

export function safeContentLink(value) {
  if (typeof value !== 'string' || /[\\\r\n]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value) || /^#[a-zA-Z0-9_-]+$/.test(value)) return true;
  if (/^tel:[+0-9(). -]+$/.test(value) || /^mailto:[^\s@]+@[^\s@]+$/.test(value)) return true;
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password; } catch { return false; }
}
