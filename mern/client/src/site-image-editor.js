import { HOME_HERO_KEY } from '../../shared/home-hero.js';
import { api } from './api.js';
import { isEditableMediaKey, SITE_IMAGE_MAX_BYTES, SITE_VIDEO_MAX_BYTES, MEDIA_CHUNK_BYTES, defaultSiteImage, sourceImageKey, sourceVideoKey, videoTarget, normalizeFraming, mediaSettingsChanged } from '../../shared/site-images.js';
import { applyFraming, videoControls } from './media-framing.js';
import { getSiteImages, setSiteImages } from './site-image-state.js';
const slug = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('This file could not be read.')); reader.readAsDataURL(file); });
export async function optimizeSitePhoto(file) {
  if (!file?.size || file.size > 32 * 1024 * 1024) throw new Error('Choose a photo smaller than 32 MB.');
  if (/svg/i.test(file.type) || /\.svgz?$/i.test(file.name) || !(/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name))) throw new Error('Choose a photo. JPEG, PNG and WebP work best.');
  const image = new Image(), source = await readFile(file);
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Export this photo as JPEG or PNG and try again.')); image.src = source; });
  if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('Choose a smaller copy of this photo.');
  const canvas = document.createElement('canvas'), scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  for (let attempt = 0; attempt < 6; attempt++) {
    const context = canvas.getContext('2d'); if (!context) throw new Error('Photo processing is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL('image/webp', Math.max(0.65, 0.88 - attempt * 0.04)), data = dataURL.split(',')[1];
    if (data.length * 3 / 4 <= SITE_IMAGE_MAX_BYTES) return { dataURL, data, contentType: dataURL.slice(5, dataURL.indexOf(';')), filename: `${(file.name.replace(/\.[^.]*$/, '') || 'photo').slice(0, 140)}.${dataURL.startsWith('data:image/webp;') ? 'webp' : 'png'}` };
    canvas.width = Math.max(1, Math.round(canvas.width * 0.8)); canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
  }
  throw new Error('Choose a smaller photo.');
}
function base64(buffer) { let value = ''; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); }
const styleKeys = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'clipPath'];
export function mountSiteImages({ canEdit = false } = {}) {
  let allowed = canEdit, disposed = false, images = getSiteImages(), ready = false, loading = null, frame = 0, gesture, suppressUntil = 0, editMode = false;
  let selected = null, pending = null, busy = false, preparing = false, generation = 0, previewCleanup = null, blobURL = null;
  const abort = new AbortController(), records = new Map();
  let dialog, toolbar, fields, status, statusTimer;
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: abort.signal });
  const sourceOf = element => element.getAttribute('src') || element.querySelector('source')?.getAttribute('src') || '';
  const framed = saved => saved?.framed ?? !!saved?.src;
  function keyFor(element, source) {
    if (element.tagName === 'VIDEO') return element.dataset.siteMediaKey || sourceVideoKey(source, location.origin);
    if (element.dataset.siteImageKey && isEditableMediaKey(element.dataset.siteImageKey)) return element.dataset.siteImageKey;
    if (!sourceImageKey(source, location.origin)) return null;
    const person = element.closest('.home-team-grid article')?.querySelector('.home-person h3')?.textContent;
    if (person) return `team-${slug(person)}`;
    if (element.matches('.home-hero-image')) return HOME_HERO_KEY;
    if (element.closest('.home-method-photo')) return 'home-method';
    if (element.closest('.home-lesson-preview')) return 'home-learning';
    if (element.closest('.learn-banner')) return 'learning-banner';
    const lesson = element.closest('.member-lesson')?.querySelector('h3')?.textContent;
    if (lesson) return `lesson-${slug(lesson)}`;
    return element.dataset.siteImageKey || sourceImageKey(source, location.origin);
  }
  function scan() {
    frame = 0; if (disposed) return;
    for (const [element, record] of records) if (!element.isConnected) { record.cleanup?.(); records.delete(element); }
    for (const element of document.querySelectorAll('img,video')) {
      if (element.closest('[data-site-image-editor],[data-site-image-ignore]')) continue;
      const source = sourceOf(element), old = records.get(element);
      const original = old && source === old.applied ? old.original : element.dataset.siteImageOriginal && !old ? element.dataset.siteImageOriginal : source;
      const key = keyFor(element, original);
      if (!isEditableMediaKey(key)) {
        old?.cleanup?.(); records.delete(element);
        element.removeAttribute('data-site-image-editable');
        if (old) {
          element.removeAttribute('aria-keyshortcuts');
          if (old.tabIndex == null) element.removeAttribute('tabindex'); else element.setAttribute('tabindex', old.tabIndex);
        }
        continue;
      }
      let record = old;
      if (!record || record.key !== key || (source !== record.applied && source !== record.original)) {
        record?.cleanup?.();
        const styles = element.dataset.siteMediaOriginalStyles ? JSON.parse(element.dataset.siteMediaOriginalStyles) : Object.fromEntries(styleKeys.map(k => [k, element.style[k]]));
        const alt = element.dataset.siteImageOriginalAlt ?? element.getAttribute('alt') ?? element.getAttribute('aria-label') ?? '';
        record = { key, original, alt, styles, srcset: element.getAttribute('srcset'), tabIndex: element.getAttribute('tabindex'), isVideo: element.tagName === 'VIDEO' };
        records.set(element, record); element.dataset.siteImageOriginal = original; element.dataset.siteImageOriginalAlt = alt; element.dataset.siteMediaOriginalStyles = JSON.stringify(styles);
      }
      const saved = images[key], custom = framed(saved);
      const fallback = key === 'team-ashley-northrop' ? '/images/ashley-northrop.webp' : defaultSiteImage(record.original);
      const next = !record.isVideo && saved?.src ? saved.src : fallback;
      if (source !== next) element.setAttribute('src', next);
      record.applied = next;
      if (!record.isVideo) {
        if (next !== record.original) element.removeAttribute('srcset'); else if (record.srcset && element.getAttribute('srcset') !== record.srcset) element.setAttribute('srcset', record.srcset);
        const alt = custom ? saved.alt : record.alt;
        if (element.alt !== alt) element.alt = alt;
      } else { const label = custom ? saved.alt : record.alt; if (label) element.setAttribute('aria-label', label); else element.removeAttribute('aria-label'); }
      const signature = JSON.stringify([next, custom ? normalizeFraming(saved) : null]);
      if (record.signature !== signature) {
        if (custom) applyFraming(element, saved); else Object.assign(element.style, record.styles);
        if (record.isVideo && custom && (saved.zoom || 1) > 1 && !record.cleanup) record.cleanup = videoControls(element);
        if ((!custom || (saved.zoom || 1) === 1) && record.cleanup) { record.cleanup(); record.cleanup = null; }
        record.signature = signature;
      }
      element.dataset.siteImageKey = key; element.dataset.siteImageCustom = String(custom);
      element.toggleAttribute('data-site-image-editable', allowed);
      if (allowed) { element.setAttribute('tabindex', '0'); element.setAttribute('aria-keyshortcuts', 'F2'); }
    }
    if (toolbar) {
      const slot = document.querySelector('[data-site-media-tools]');
      if (slot && toolbar.parentElement !== slot) slot.appendChild(toolbar);
      toolbar.hidden = true;
      if (toolbar.hidden && editMode) {
        editMode = false; document.documentElement.classList.remove('site-photo-edit-mode');
        const toggle = toolbar.querySelector('button'); toggle.setAttribute('aria-pressed', 'false'); toggle.textContent = 'Edit photos & videos';
      }
    }
  }
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(scan); };
  async function refresh() {
    if (loading) return loading;
    loading = api('/site-images').then(data => { if (disposed) return; images = data.images || {}; setSiteImages(images); ready = true; schedule(); sync(); }).catch(error => { if (selected) showError(error.message); }).finally(() => { loading = null; });
    return loading;
  }
  function values() { return normalizeFraming({ alt: fields.alt.value, x: fields.x.value, y: fields.y.value, zoom: fields.zoom.value, fit: fields.fit.value }); }
  function sync() {
    if (!fields) return;
    fields.publish.disabled = !allowed || !ready || busy || preparing || !selected || !(pending || mediaSettingsChanged(selected.baseline, values()));
    fields.publish.textContent = busy ? 'Saving…' : 'Publish changes';
    for (const name of ['x', 'y', 'zoom']) fields[`${name}Value`].textContent = name === 'zoom' ? `${Number(fields[name].value).toFixed(2)}×` : `${Number(fields[name].value).toFixed(1)}%`;
  }
  function showError(message) { if (fields) { fields.error.textContent = message; fields.error.hidden = !message; } }
  function setBusy(value) { busy = value; if (fields) { for (const el of dialog.querySelectorAll('button,input,select')) el.disabled = value; dialog.setAttribute('aria-busy', String(value)); sync(); } }
  function clearPreview() { previewCleanup?.(); previewCleanup = null; fields?.preview?.pause?.(); if (blobURL) URL.revokeObjectURL(blobURL); blobURL = null; }
  function previewFraming() {
    if (!selected || !fields.preview) return;
    const settings = values(); applyFraming(fields.preview, settings);
    if (selected.isVideo && settings.zoom > 1 && !previewCleanup) previewCleanup = videoControls(fields.preview, fields.frame);
    if (selected.isVideo && settings.zoom === 1 && previewCleanup) { previewCleanup(); previewCleanup = null; }
    sync();
  }
  function makePreview(source) {
    previewCleanup?.(); previewCleanup = null; fields.preview?.pause?.();
    fields.frame.replaceChildren(); fields.preview = document.createElement(selected.isVideo ? 'video' : 'img');
    fields.preview.className = 'site-media-preview';
    if (selected.isVideo) { fields.preview.controls = true; fields.preview.muted = true; fields.preview.playsInline = true; fields.preview.preload = 'metadata'; }
    else fields.preview.alt = 'Photo crop preview';
    fields.frame.appendChild(fields.preview); fields.preview.src = source;
    previewFraming();
  }
  function close(force = false) {
    if (busy && !force) return;
    generation++; clearPreview(); const element = selected?.element;
    selected = null; pending = null; preparing = false; dialog?.close(); element?.focus({ preventScroll: true });
  }
  function cancelGesture() { clearTimeout(gesture?.timer); gesture = null; }
  async function open(element) {
    if (!allowed || busy || dialog.open) return;
    if (!ready) { await refresh(); if (!ready || disposed || !allowed || dialog.open) return; }
    cancelGesture(); scan(); const record = records.get(element); if (!record) return;
    const saved = images[record.key], style = getComputedStyle(element), position = style.objectPosition.split(' ').map(Number.parseFloat);
    const baseline = normalizeFraming(framed(saved) ? saved : { alt: record.alt, fit: style.objectFit, x: position[0], y: position[1] });
    selected = { ...record, element, baseline, revision: saved?.revision || 0, source: sourceOf(element) };
    pending = null; generation++; clearPreview(); showError(''); preparing = false;
    for (const name of ['alt', 'x', 'y', 'zoom', 'fit']) fields[name].value = baseline[name];
    const rect = element.getBoundingClientRect(); fields.frame.style.aspectRatio = String(Math.max(0.3, Math.min(4, rect.width / (rect.height || 1))));
    fields.title.textContent = record.isVideo ? 'Edit this video' : 'Edit this photo';
    fields.undo.textContent = record.isVideo ? 'Restore previous framing' : 'Restore previous edit'; fields.undo.hidden = !saved?.canUndo;
    fields.library.accept = record.isVideo ? 'video/mp4,video/webm' : 'image/*';
    fields.library.value = ''; fields.files.value = ''; fields.filename.textContent = 'Adjust the existing media, or choose a replacement.';
    fields.note.textContent = record.isVideo ? 'Framing changes keep the existing video and its publication status. A replacement MP4/WebM (up to 80 MB) is saved as a lesson draft for caption/transcript review. Keep your original video; Restore previous framing does not undo a video-file replacement.' : 'Slider changes save without uploading or recompressing the photo. A replacement stays private until you publish.';
    const replaceable = !record.isVideo || !!videoTarget(record.key)?.lessonId; fields.pickers.hidden = !replaceable;
    setBusy(false); makePreview(selected.source); dialog.showModal(); fields.close.focus();
    if (!ready) { await refresh(); if (selected) { selected.revision = images[record.key]?.revision || 0; sync(); } }
  }
  async function choose(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !selected || busy) return;
    const operation = ++generation; pending = null; preparing = true; clearPreview(); showError(''); fields.filename.textContent = 'Preparing preview…'; sync();
    try {
      if (selected.isVideo) {
        const type = file.type || (/\.webm$/i.test(file.name) ? 'video/webm' : /\.mp4$/i.test(file.name) ? 'video/mp4' : '');
        if (!file.size || file.size > SITE_VIDEO_MAX_BYTES || !['video/mp4', 'video/webm'].includes(type)) throw new Error('Choose an MP4 or WebM video no larger than 80 MB.');
        blobURL = URL.createObjectURL(file); makePreview(blobURL);
        const video = fields.preview;
        await new Promise((resolve, reject) => {
          const done = error => { clearTimeout(timer); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); error ? reject(error) : resolve(); };
          const loaded = () => done();
          const failed = () => done(new Error('This browser cannot preview that video. Choose a supported MP4 or WebM file.'));
          const timer = setTimeout(() => done(new Error('Video preview timed out. Choose a smaller or supported MP4/WebM file.')), 15000);
          video.addEventListener('loadedmetadata', loaded, { once: true }); video.addEventListener('error', failed, { once: true });
          if (video.readyState >= 1) loaded();
        });
        if (disposed || generation !== operation || !selected) return;
        pending = { file, contentType: type };
      } else {
        const photo = await optimizeSitePhoto(file); if (disposed || generation !== operation || !selected) return;
        pending = photo; makePreview(photo.dataURL);
      }
      fields.filename.textContent = file.name;
    } catch (error) { if (generation === operation && selected) { pending = null; makePreview(selected.source); showError(error.message); } }
    finally { if (generation === operation) { preparing = false; sync(); } }
  }
  async function publish(undo = false) {
    if (!selected || busy || preparing || !allowed || !ready) return;
    if (undo && !window.confirm(selected.isVideo ? 'Restore the previous video framing?' : 'Restore the previous photo edit for everyone?')) return;
    const target = selected, replacement = pending, settings = values(); let videoUploaded = false;
    setBusy(true); showError('');
    try {
      if (!undo && target.isVideo && replacement) {
        const lessonId = videoTarget(target.key)?.lessonId;
        if (!lessonId) throw new Error('This video has no lesson upload destination.');
        const { file, contentType } = replacement, chunks = Math.ceil(file.size / MEDIA_CHUNK_BYTES);
        const start = await api('/admin/media/start', { method: 'POST', body: { lessonId, kind: 'video', filename: file.name.slice(0, 160), contentType, size: file.size, chunks } });
        for (let i = 0; i < chunks; i++) {
          const data = base64(await file.slice(i * MEDIA_CHUNK_BYTES, (i + 1) * MEDIA_CHUNK_BYTES).arrayBuffer());
          await api(`/admin/media/${start.uploadId}/chunks/${i}`, { method: 'PUT', body: { data } });
          if (disposed) return;
          fields.filename.textContent = `Uploading video: ${Math.round((i + 1) / chunks * 100)}%`;
        }
        await api(`/admin/media/${start.uploadId}/complete`, { method: 'POST', body: {} }); videoUploaded = true; pending = null;
        for (const [element, record] of records) if (record.key === target.key) { element.load(); }
        window.dispatchEvent(new CustomEvent('bravo-media-updated', { detail: { lessonId } }));
      }
      const body = undo ? { expectedRevision: target.revision } : { ...settings, expectedRevision: target.revision, ...(!target.isVideo && replacement ? { data: replacement.data, contentType: replacement.contentType, filename: replacement.filename } : {}) };
      const result = await api(`/site-images/${target.key}${undo ? '/undo' : ''}`, { method: undo ? 'POST' : !target.isVideo && replacement ? 'PUT' : 'PATCH', body });
      if (disposed) return;
      images[target.key] = result.image; setSiteImages(images); scan(); setBusy(false); close();
      clearTimeout(statusTimer);
      status.textContent = videoUploaded ? 'Video replaced and saved as a lesson draft. Review captions/transcript in Lesson studio before publishing the lesson.' : undo ? 'Previous edit restored.' : 'Changes published for everyone.';
      statusTimer = setTimeout(() => { status.textContent = ''; }, 10000);
    } catch (error) {
      if (disposed) return;
      setBusy(false); showError(videoUploaded ? `Video uploaded as a draft, but framing was not saved. ${error.message}` : error.message);
      if ([401, 403].includes(error.status)) { allowed = false; toolbar.hidden = true; sync(); }
      await refresh();
    }
  }
  function hit(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-site-image-editor],[data-site-image-ignore],.home-hero-gallery')) return null;
    const direct = target.closest('img[data-site-image-key],video[data-site-image-key]'); if (direct && records.has(direct)) return direct;
    if (target.closest('button,input,textarea,select,summary,a,[role="button"],[data-site-content-key]')) return null;
    return [...records.keys()].reverse().find(element => { const r = element.getBoundingClientRect(); return element.parentElement?.contains(target) && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; }) || null;
  }
  if (allowed) {
    on(window, 'bravo-edit-photo', event => { const key = event.detail?.key; if (!isEditableMediaKey(key)) return; const element = [...records.keys()].find(element => records.get(element).key === key); if (element) open(element); });
    toolbar = document.createElement('div'); toolbar.className = 'site-photo-tools'; toolbar.dataset.siteImageEditor = '';
    toolbar.hidden = true;
    toolbar.innerHTML = '<button type="button" class="site-photo-toggle" aria-pressed="false" aria-describedby="site-photo-help">Edit photos & videos</button><span id="site-photo-help" class="site-photo-hint">Turn on editing, then select a photo or video. Keyboard: focus the media and press F2.</span><span class="site-photo-status" role="status" aria-live="polite"></span>';
    status = toolbar.querySelector('[role="status"]'); document.body.appendChild(status);
    dialog = document.createElement('dialog'); dialog.className = 'site-photo-dialog'; dialog.dataset.siteImageEditor = ''; dialog.setAttribute('aria-labelledby', 'site-photo-title');
    dialog.innerHTML = `<div class="site-photo-heading"><div><p>BRAVO · ADMINISTRATOR MEDIA EDITOR</p><h2 id="site-photo-title" data-field="title">Edit media</h2></div><button type="button" data-field="close" aria-label="Close media editor">×</button></div>
      <p class="site-photo-intro">Even a small slider adjustment can be published—no replacement file needed.</p>
      <div class="site-photo-pickers" data-field="pickers"><label>Photo / Video Library<input data-field="library" type="file" aria-label="Choose a replacement from your library"></label><label>Browse Files<input data-field="files" type="file" aria-label="Choose a replacement from files"></label></div>
      <p class="site-photo-filename" data-field="filename"></p><div class="site-photo-frame" data-field="frame"></div>
      <div class="site-photo-crop"><label>Fit<select data-field="fit"><option value="cover">Fill the frame</option><option value="contain">Show whole image / video</option></select></label>
      <label>Left / right <output data-field="xValue"></output><input data-field="x" type="range" min="0" max="100" step="0.1" value="50"></label>
      <label>Up / down <output data-field="yValue"></output><input data-field="y" type="range" min="0" max="100" step="0.1" value="50"></label>
      <label class="site-photo-zoom">Zoom out / in <output data-field="zoomValue"></output><input data-field="zoom" type="range" min="1" max="3" step="0.01" value="1"></label></div>
      <label class="site-photo-description">Description<input data-field="alt" type="text" maxlength="240" placeholder="Describe this photo or video"></label>
      <p class="site-photo-note" data-field="note"></p><p class="site-photo-error" data-field="error" role="alert" hidden></p>
      <div class="site-photo-actions"><button type="button" data-field="undo" hidden>Restore previous edit</button><button type="button" data-field="cancel">Cancel</button><button type="button" data-field="publish" class="site-photo-publish" disabled>Publish changes</button></div>`;
    document.body.appendChild(dialog); fields = Object.fromEntries([...dialog.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el]));
    for (const name of ['x', 'y', 'zoom', 'fit', 'alt']) { on(fields[name], 'input', previewFraming); on(fields[name], 'change', previewFraming); }
    on(fields.library, 'change', choose); on(fields.files, 'change', choose);
    on(fields.close, 'click', () => close()); on(fields.cancel, 'click', () => close()); on(fields.publish, 'click', () => publish()); on(fields.undo, 'click', () => publish(true));
    on(dialog, 'cancel', e => { e.preventDefault(); close(); });
    on(toolbar.querySelector('button'), 'click', e => { editMode = !editMode; e.currentTarget.setAttribute('aria-pressed', String(editMode)); e.currentTarget.textContent = editMode ? 'Done editing' : 'Edit photos & videos'; document.documentElement.classList.toggle('site-photo-edit-mode', editMode); window.dispatchEvent(new CustomEvent('bravo-media-edit-mode', { detail: { active: editMode } })); });
    on(document, 'pointerdown', e => {
      cancelGesture(); if (!allowed || e.button !== 0 || e.isPrimary === false || dialog.open) return;
      const element = hit(e); if (!element) return;
      if (element.tagName === 'VIDEO' && !editMode && e.clientY > element.getBoundingClientRect().bottom - 48) return;
      gesture = { x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => { suppressUntil = Date.now() + 1000; open(element); }, 600) };
    }, { capture: true, passive: true });
    on(document, 'pointermove', e => { if (gesture && (e.pointerId !== gesture.id || Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 12)) cancelGesture(); }, { capture: true, passive: true });
    for (const type of ['pointerup', 'pointercancel', 'scroll']) on(document, type, cancelGesture, { capture: true, passive: true });
    on(window, 'blur', cancelGesture);
    on(document, 'contextmenu', e => { const element = allowed && hit(e); if (element) { e.preventDefault(); suppressUntil = Date.now() + 1000; open(element); } }, { capture: true });
    on(document, 'click', e => { if (!allowed) return; const element = hit(e); if (element && (Date.now() < suppressUntil || editMode)) { e.preventDefault(); e.stopPropagation(); if (editMode) open(element); } }, { capture: true });
    on(document, 'keydown', e => { if (!allowed) return; const element = e.target.closest?.('[data-site-image-key]'); if (element && (e.key === 'F2' || editMode && ['Enter', ' '].includes(e.key))) { e.preventDefault(); open(element); } }, { capture: true });
  }
  const observer = new MutationObserver(schedule); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
  scan(); refresh(); on(window, 'focus', refresh); on(document, 'visibilitychange', () => { if (!document.hidden) refresh(); else cancelGesture(); });
  const interval = setInterval(() => { if (!document.hidden && !selected) refresh(); }, 60000);
  return () => {
    disposed = true; generation++; cancelGesture(); abort.abort(); observer.disconnect(); clearInterval(interval); cancelAnimationFrame(frame); clearPreview();
    clearTimeout(statusTimer); status?.remove(); dialog?.remove(); toolbar?.remove(); document.documentElement.classList.remove('site-photo-edit-mode');
    window.dispatchEvent(new CustomEvent('bravo-media-edit-mode', { detail: { active: false } }));
    for (const [element, record] of records) { record.cleanup?.(); element.removeAttribute('data-site-image-editable'); element.removeAttribute('aria-keyshortcuts'); if (record.tabIndex == null) element.removeAttribute('tabindex'); else element.setAttribute('tabindex', record.tabIndex); }
  };
}
