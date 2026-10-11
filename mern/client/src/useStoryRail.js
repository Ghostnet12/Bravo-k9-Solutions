import { useEffect, useRef, useState } from 'react';
import { boundedIndex } from '../../shared/bravo-motion';
const noMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('.access-reduced-motion,.a11y-reduce-motion');
// Native scrolling owns touch/pinch. No drag library, copied cards or autoplay.
export default function useStoryRail(keys) {
  const rail = useRef(null), gesture = useRef(null);
  const [position, setPosition] = useState(0), [overflow, setOverflow] = useState(false);
  const key = keys.join('|');
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const cards = [...node.children], bounds = node.getBoundingClientRect();
      const hasOverflow = node.scrollWidth > node.clientWidth + 2;
      setOverflow(hasOverflow);
      if (!hasOverflow || !cards.length) { setPosition(0); return; }
      const center = bounds.left + bounds.width / 2;
      let nearest = 0, distance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect(), delta = Math.abs(rect.left + rect.width / 2 - center);
        if (delta < distance) { distance = delta; nearest = index; }
      });
      setPosition(nearest);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const size = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    size?.observe(node); [...node.children].forEach(card => size?.observe(card));
    node.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule); measure();
    return () => { cancelAnimationFrame(frame); size?.disconnect(); node.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [key]);
  function go(delta) {
    const node = rail.current;
    if (!node) return;
    const next = node.children[boundedIndex(position + delta, node.children.length)];
    if (!next) return;
    const x = next.getBoundingClientRect().left - node.getBoundingClientRect().left + node.scrollLeft - 6;
    node.scrollTo({ left: x, behavior: noMotion() ? 'instant' : 'smooth' });
  }
  return {
    rail, position: boundedIndex(position, keys.length), overflow, go,
    handlers: {
      onPointerDown: event => { gesture.current = { x: event.clientX, y: event.clientY, moved: event.isPrimary === false }; },
      onPointerMove: event => { const start = gesture.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) start.moved = true; },
      onPointerCancel: () => { if (gesture.current) gesture.current.moved = true; },
      onClickCapture: event => { if (event.detail !== 0 && gesture.current?.moved) { event.preventDefault(); event.stopPropagation(); } },
      onDragStart: event => { if (event.target.closest('img')) event.preventDefault(); },
    },
  };
}
