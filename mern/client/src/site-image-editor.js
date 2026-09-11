import { api } from './api.js';
import { SITE_IMAGE_KEY, SITE_IMAGE_MAX_BYTES, defaultSiteImage, sourceImageKey } from '../../shared/site-images.js';

let cachedImages = {};
const slug = text => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('This file could not be read. Try another photo.')); reader.readAsDataURL(file); });
export async function optimizeSitePhoto(file) {
  if (!file || !file.size || file.size > 32 * 1024 * 1024) throw new Error('Choose a photo smaller than 32 MB.');
  if (/svg/i.test(file.type) || /\.svgz?$/i.test(file.name) || !(/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name))) throw new Error('Choose a photo, not a document. JPEG, PNG and WebP work best.');
  const source = await readFile(file), image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Your browser could not open this format. Export the photo as JPEG or PNG and try again.')); image.src = source; });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('This photo is too large to process. Choose a smaller copy.');
  const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  let dataURL;
  for (let attempt = 0; attempt < 6; attempt++) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Re-encoding strips embedded location metadata and never publishes raw SVG.
    dataURL = canvas.toDataURL('image/webp', Math.max(0.65, 0.88 - attempt * 0.04));
    const data = dataURL.split(',')[1], bytes = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (bytes <= SITE_IMAGE_MAX_BYTES) return { dataURL, data, contentType: dataURL.slice(5, dataURL.indexOf(';')), filename: `${(file.name.replace(/\.[^.]*$/, '') || 'photo').slice(0, 140)}.${dataURL.startsWith('data:image/webp;') ? 'webp' : 'png'}` };
    canvas.width = Math.max(1, Math.round(canvas.width * 0.8)); canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
  }
  throw new Error('The optimized photo is still too large. Choose a smaller image.');
}

export function mountSiteImages({ canEdit = false } = {}) {
  let disposed = false, images = cachedImages, ready = false, loadError = '', refreshInFlight = null, frame = 0;
  let selected = null, preview = null, busy = false, generation = 0, editMode = false, gesture = null, suppressClickUntil = 0;
  const records = new WeakMap(), lifecycle = new AbortController();
  const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: lifecycle.signal });
  let dialog, toolbar, status, fields;

  function imageKey(image) {
    if (SITE_IMAGE_KEY.test(image.dataset.siteImageKey || '')) return image.dataset.siteImageKey;
    const person = image.closest('.home-team-grid article')?.querySelector('.home-person h3')?.textContent;
    if (person) return `team-${slug(person)}`;
    if (image.matches('.home-hero-image')) return 'home-hero';
    if (image.closest('.home-method-photo')) return 'home-method';
    if (image.closest('.home-lesson-preview')) return 'home-learning';
    if (image.closest('.learn-banner')) return 'learning-banner';
    const lesson = image.closest('.member-lesson')?.querySelector('h3')?.textContent;
    if (lesson) return `lesson-${slug(lesson)}`;
    return sourceImageKey(image.getAttribute('src'), location.origin);
  }
  function scan() {
    frame = 0; if (disposed) return;
    for (const image of document.querySelectorAll('img')) {
      if (image.closest('[data-site-image-editor], [data-site-image-ignore]')) continue;
      let record = records.get(image);
      const key = imageKey(image); if (!key) continue;
      if (!record || record.key !== key) {
        if (!image.dataset.siteImageOriginal) {
          image.dataset.siteImageOriginal = image.getAttribute('src');
          image.dataset.siteImageOriginalAlt = image.getAttribute('alt') || '';
          image.dataset.siteImageOriginalPosition = image.style.objectPosition;
          image.dataset.siteImageOriginalFit = image.style.objectFit;
        }
        record = { key, original: image.dataset.siteImageOriginal, srcset: image.getAttribute('srcset'), alt: image.dataset.siteImageOriginalAlt, position: image.dataset.siteImageOriginalPosition, fit: image.dataset.siteImageOriginalFit, tabIndex: image.getAttribute('tabindex'), lastApplied: image.getAttribute('src') };
        records.set(image, record);
      } else if (image.getAttribute('src') !== record.lastApplied && image.getAttribute('src') !== record.original && !image.getAttribute('src')?.startsWith('/api/site-images/')) {
        // React may legitimately supply a new lesson thumbnail without remounting.
        record.original = image.getAttribute('src'); record.alt = image.getAttribute('alt') || '';
        image.dataset.siteImageOriginal = record.original; image.dataset.siteImageOriginalAlt = record.alt;
      }
      const override = images[key];
      const ashley = /^Ashley Northrop,/i.test(record.alt) ? '/images/ashley-northrop.webp' : null;
      const fallback = ashley || defaultSiteImage(record.original);
      const source = override?.src || fallback;
      record.lastApplied = source;
      if (image.getAttribute('src') !== source) image.setAttribute('src', source);
      const custom = !!override?.src, changed = source !== record.original;
      image.dataset.siteImageKey = key; image.dataset.siteImageCustom = String(custom);
      if (changed) image.removeAttribute('srcset'); else if (record.srcset) image.setAttribute('srcset', record.srcset);
      const alt = custom ? override.alt : fallback !== record.original && !ashley ? 'David Northrop with a Bravo K9 dog' : record.alt;
      if (image.getAttribute('alt') !== alt) image.setAttribute('alt', alt);
      const position = custom ? `${override.x}% ${override.y}%` : fallback !== record.original && !ashley ? '75% 50%' : record.position;
      const fit = custom ? override.fit : record.fit;
      if (image.style.objectPosition !== position) image.style.objectPosition = position;
      if (image.style.objectFit !== fit) image.style.objectFit = fit;
      image.toggleAttribute('data-site-image-editable', canEdit);
      if (canEdit) { image.setAttribute('tabindex', '0'); image.setAttribute('aria-keyshortcuts', 'F2'); }
      else { image.removeAttribute('aria-keyshortcuts'); if (record.tabIndex === null) image.removeAttribute('tabindex'); else image.setAttribute('tabindex', record.tabIndex); }
    }
  }
  function scheduleScan() { if (!frame && !disposed) frame = requestAnimationFrame(scan); }
  async function refresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = api('/site-images').then(data => {
      if (disposed) return;
      images = data.images || {}; cachedImages = images; ready = true; loadError = '';
      if (selected?.needsRevision) { selected.revision = images[selected.key]?.revision || 0; selected.needsRevision = false; fields.undo.hidden = !images[selected.key]?.canUndo; }
      scheduleScan();
    }).catch(error => { if (!disposed) { loadError = error.message; if (selected) showError(loadError); } }).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }
  function showError(message) { if (fields) { fields.error.textContent = message; fields.error.hidden = !message; } }
  function announce(message) { if (status) status.textContent = message; }
  function cancelGesture() { if (gesture) clearTimeout(gesture.timer); gesture = null; }
  function hitImage(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-site-image-editor]')) return null;
    const direct = target.closest('img[data-site-image-key]'); if (direct) return direct;
    if (target.closest('button, input, textarea, select, summary, a, [role="button"]')) return null;
    // Hero shading/copy sits above its image: a hold in that image area still works.
    return [...document.querySelectorAll('img[data-site-image-key]')].reverse().find(image => {
      const rect = image.getBoundingClientRect();
      return image.parentElement?.contains(target) && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom && rect.width > 0 && rect.height > 0;
    }) || null;
  }
  function setBusy(value) {
    busy = value;
    if (!fields) return;
    for (const element of dialog.querySelectorAll('button,input,select')) element.disabled = value;
    fields.publish.disabled = value || !preview;
    fields.publish.textContent = value ? 'Saving…' : 'Publish photo';
    dialog.setAttribute('aria-busy', String(value));
  }
  function updatePreview() {
    if (!selected) return;
    fields.preview.src = preview?.dataURL || selected.source;
    fields.preview.style.objectFit = fields.fit.value;
    fields.preview.style.objectPosition = `${fields.x.value}% ${fields.y.value}%`;
  }
  function closeEditor() {
    if (busy) return;
    const image = selected?.element;
    generation++; selected = null; preview = null;
    if (dialog.open) dialog.close();
    image?.focus({ preventScroll: true });
  }
  function openEditor(image) {
    if (!canEdit || busy || dialog?.open) return;
    const record = records.get(image); if (!record) return;
    cancelGesture();
    const saved = images[record.key];
    selected = { key: record.key, element: image, source: image.getAttribute('src'), revision: saved?.revision || 0, needsRevision: !ready };
    preview = null; generation++;
    const rect = image.getBoundingClientRect();
    fields.frame.style.aspectRatio = String(Math.max(0.3, Math.min(4, rect.width / (rect.height || 1))));
    fields.alt.value = image.alt || ''; fields.x.value = saved?.x ?? 50; fields.y.value = saved?.y ?? 50; fields.fit.value = saved?.fit || (getComputedStyle(image).objectFit === 'contain' ? 'contain' : 'cover');
    fields.undo.hidden = !saved?.canUndo; fields.filename.textContent = 'Choose a replacement to preview it here.';
    fields.library.value = ''; fields.files.value = '';
    setBusy(false); showError(loadError); updatePreview();
    dialog.showModal();
    fields.close.focus();
    if (!ready) refresh();
  }
  async function choosePhoto(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !selected || busy) return;
    const operation = ++generation;
    preview = null; fields.publish.disabled = true; showError('');
    fields.filename.textContent = 'Preparing your photo…';
    try {
      const result = await optimizeSitePhoto(file);
      if (disposed || operation !== generation || !selected) return;
      preview = result; fields.filename.textContent = file.name;
      fields.publish.disabled = false; updatePreview();
    } catch (error) { if (!disposed && operation === generation) { fields.filename.textContent = 'Choose another photo.'; showError(error.message); } }
  }
  async function publish(undo = false) {
    if (!selected || busy || (!undo && !preview)) return;
    if (undo && !window.confirm('Restore the previous image for everyone on the website?')) return;
    const target = selected, photo = preview;
    if (!ready) { await refresh(); if (!ready) { showError(loadError || 'Image storage is not connected. Try again.'); return; } }
    setBusy(true); showError('');
    try {
      const result = await api(`/site-images/${target.key}${undo ? '/undo' : ''}`, { method: undo ? 'POST' : 'PUT', body: undo ? { expectedRevision: target.revision } : { expectedRevision: target.revision, data: photo.data, contentType: photo.contentType, filename: photo.filename, alt: fields.alt.value, x: Number(fields.x.value), y: Number(fields.y.value), fit: fields.fit.value } });
      if (disposed) return;
      images[target.key] = result.image; cachedImages = images; scan(); setBusy(false); closeEditor();
      announce(undo ? 'Previous image restored for everyone.' : 'Photo published. Everyone sees this replacement.');
    } catch (error) {
      if (disposed) return;
      setBusy(false); showError(error.message);
      if ([401, 403].includes(error.status)) { fields.publish.disabled = true; fields.undo.disabled = true; }
      await refresh();
    }
  }

  if (canEdit) {
    toolbar = document.createElement('div'); toolbar.className = 'site-photo-tools'; toolbar.dataset.siteImageEditor = '';
    toolbar.innerHTML = '<button type="button" class="site-photo-toggle" aria-pressed="false">Edit photos</button><span class="site-photo-hint">Hold a photo to replace it</span><span class="site-photo-status" role="status" aria-live="polite"></span>';
    document.body.appendChild(toolbar); status = toolbar.querySelector('[role="status"]');
    dialog = document.createElement('dialog'); dialog.className = 'site-photo-dialog'; dialog.dataset.siteImageEditor = '';
    dialog.setAttribute('aria-labelledby', 'site-photo-title');
    dialog.innerHTML = `<div class="site-photo-heading"><div><p>BRAVO · STAFF PHOTO EDITOR</p><h2 id="site-photo-title">Replace this photo</h2></div><button type="button" data-field="close" aria-label="Close photo editor">×</button></div>
      <p class="site-photo-intro">Choose a photo, check the crop, then publish it for everyone.</p>
      <div class="site-photo-pickers"><label>Photo Library<input data-field="library" type="file" accept="image/*" aria-label="Choose a replacement from Photo Library"></label><label>Browse Files<input data-field="files" type="file" aria-label="Choose a replacement from files or folders"></label></div>
      <p class="site-photo-filename" data-field="filename"></p><div class="site-photo-frame" data-field="frame"><img data-field="preview" alt="Replacement crop preview"></div>
      <div class="site-photo-crop"><label>Fit<select data-field="fit"><option value="cover">Fill the frame</option><option value="contain">Show the whole photo</option></select></label><label>Left / right<input data-field="x" type="range" min="0" max="100" value="50"></label><label>Up / down<input data-field="y" type="range" min="0" max="100" value="50"></label></div>
      <label class="site-photo-description">Photo description<input data-field="alt" type="text" maxlength="240" placeholder="Describe the photo for screen readers"></label>
      <p class="site-photo-note">Your current photo stays live until you publish. Photos are optimized; animated images become still photos.</p><p class="site-photo-error" data-field="error" role="alert" hidden></p>
      <div class="site-photo-actions"><button type="button" data-field="undo" hidden>Restore previous</button><button type="button" data-field="cancel">Cancel</button><button type="button" data-field="publish" class="site-photo-publish" disabled>Publish photo</button></div>`;
    document.body.appendChild(dialog);
    fields = Object.fromEntries([...dialog.querySelectorAll('[data-field]')].map(element => [element.dataset.field, element]));
    on(toolbar.querySelector('button'), 'click', event => {
      editMode = !editMode; event.currentTarget.setAttribute('aria-pressed', String(editMode));
      event.currentTarget.textContent = editMode ? 'Done editing' : 'Edit photos';
      document.documentElement.classList.toggle('site-photo-edit-mode', editMode);
      toolbar.querySelector('.site-photo-hint').textContent = editMode ? 'Tap a photo to replace it' : 'Hold a photo to replace it';
    });
    on(fields.library, 'change', choosePhoto); on(fields.files, 'change', choosePhoto);
    on(fields.x, 'input', updatePreview); on(fields.y, 'input', updatePreview); on(fields.fit, 'change', updatePreview);
    on(fields.close, 'click', closeEditor); on(fields.cancel, 'click', closeEditor);
    on(fields.publish, 'click', () => publish()); on(fields.undo, 'click', () => publish(true));
    on(dialog, 'cancel', event => { event.preventDefault(); closeEditor(); });
    on(document, 'pointerdown', event => {
      cancelGesture(); if (event.button !== 0 || event.isPrimary === false || dialog.open) return;
      const image = hitImage(event); if (!image) return;
      gesture = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, timer: setTimeout(() => { suppressClickUntil = Date.now() + 1000; openEditor(image); }, 600) };
    }, { capture: true, passive: true });
    on(document, 'pointermove', event => { if (gesture && (event.pointerId !== gesture.pointerId || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12)) cancelGesture(); }, { capture: true, passive: true });
    on(document, 'pointerup', cancelGesture, { capture: true, passive: true }); on(document, 'pointercancel', cancelGesture, { capture: true, passive: true });
    on(document, 'scroll', cancelGesture, { capture: true, passive: true }); on(window, 'blur', cancelGesture);
    on(document, 'contextmenu', event => { const image = hitImage(event); if (image) { event.preventDefault(); suppressClickUntil = Date.now() + 1000; openEditor(image); } }, { capture: true });
    on(document, 'click', event => {
      if (event.target.closest?.('[data-site-image-editor]')) return;
      const image = hitImage(event); if (!image) return;
      if (Date.now() < suppressClickUntil || editMode) { event.preventDefault(); event.stopPropagation(); if (editMode) openEditor(image); }
    }, { capture: true });
    on(document, 'keydown', event => {
      const image = event.target.closest?.('img[data-site-image-key]');
      if (image && (event.key === 'F2' || editMode && ['Enter', ' '].includes(event.key))) { event.preventDefault(); openEditor(image); }
    }, { capture: true });
  }
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'alt'] });
  scan(); refresh();
  on(window, 'focus', refresh);
  on(document, 'visibilitychange', () => { if (!document.hidden) refresh(); else cancelGesture(); });
  const interval = setInterval(() => { if (!document.hidden && !selected) refresh(); }, 60000);
  return () => {
    disposed = true; generation++; cancelGesture(); lifecycle.abort(); observer.disconnect(); clearInterval(interval); cancelAnimationFrame(frame);
    dialog?.remove(); toolbar?.remove(); document.documentElement.classList.remove('site-photo-edit-mode');
    for (const image of document.querySelectorAll('[data-site-image-editable]')) {
      image.removeAttribute('data-site-image-editable'); image.removeAttribute('aria-keyshortcuts');
      const record = records.get(image); if (record?.tabIndex === null) image.removeAttribute('tabindex'); else if (record) image.setAttribute('tabindex', record.tabIndex);
    }
  };
}
