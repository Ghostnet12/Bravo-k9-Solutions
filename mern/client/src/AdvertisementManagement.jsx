import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import Accessibility from './Accessibility';
import { useBravo } from './context';
import { api } from './api';
import { isImageEditor } from '../../shared/site-images.js';
const AdEditor = lazy(() => import('./AdEditor'));

// Retain the existing authorized archive/editor without mounting public ads,
// polling the collection, playing ad media, or reserving a fixed dock.
export default function AdvertisementManagement() {
  const { user } = useBravo();
  const canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    if (!canEdit || loading) return;
    setLoading(true); setError('');
    try { setCollection(await api('/site-ads')); }
    catch { setError('Advertisements could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }
  return <>
    <Accessibility>{canEdit && <button type="button" onClick={open} disabled={loading}>{loading ? 'Loading advertisements…' : 'Manage advertisements'}</button>}{canEdit && error && <p role="alert">{error}</p>}</Accessibility>
    {canEdit && collection && createPortal(<Suspense fallback={<p role="status">Opening advertisements…</p>}><AdEditor collection={collection} publish={setCollection} close={() => setCollection(null)}/></Suspense>, document.body)}
  </>;
}
