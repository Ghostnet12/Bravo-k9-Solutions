import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { chatScope } from '../../shared/selection-state.js';

// Generation + sequence guards stop a pre-reset or previous-thread response
// from restoring old history after a clear or a navigation.
export function useChatHistory(path) {
  const [history, setHistory] = useState({ path: null, messages: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [clearing, setClearing] = useState(false);
  const generation = useRef(0), sequence = useRef(0), mutating = useRef(false);
  const load = useCallback(async () => {
    if (!path || mutating.current) return;
    const epoch = generation.current, ticket = ++sequence.current;
    try {
      const result = await api(path);
      if (epoch === generation.current && ticket === sequence.current) { setHistory({ path, messages: result.messages || [] }); setLoading(false); setError(''); }
    } catch (err) {
      if (epoch === generation.current && ticket === sequence.current) { setError(err.message); setLoading(false); }
    }
  }, [path]);
  useEffect(() => {
    generation.current++; sequence.current++; mutating.current = false;
    setHistory({ path, messages: [] }); setLoading(!!path); setError(''); setClearing(false);
    const refresh = () => { if (!document.hidden) void load(); };
    refresh(); const timer = setInterval(refresh, 10000);
    return () => { generation.current++; sequence.current++; clearInterval(timer); };
  }, [path, load]);
  const clear = useCallback(async (mode = 'clear') => {
    if (!path || mutating.current) return false;
    mutating.current = true;
    const epoch = ++generation.current; sequence.current++;
    setClearing(true); setError('');
    try {
      await api('/chat/reset', { method: 'POST', body: { ...chatScope(path), mode, ...(mode === 'delete' ? { confirmDelete: true } : {}) } });
      if (epoch !== generation.current) return false;
      setHistory({ path, messages: [] }); setLoading(false);
      return true;
    } catch (err) {
      if (epoch === generation.current) setError(err.message);
      return false;
    } finally {
      if (epoch === generation.current) { mutating.current = false; setClearing(false); }
    }
  }, [path]);
  return { messages: history.path === path ? history.messages : [], loading, error, clearing, load, clear };
}
