import { useEffect } from 'react';

// Native scrolling, progressive enhancement, and one animation frame per scroll.
// Content is readable even when scripting, observers, or animation is unavailable.
export default function useCinematicMotion(root, { enabled = true, selector = '[data-reveal]' } = {}) {
  useEffect(() => {
    const node = root.current;
    if (!node || !enabled) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const reduced = () => preference.matches || document.documentElement.matches('.access-reduced-motion,.a11y-reduce-motion');
    const render = () => {
      frame = 0;
      node.dataset.motion = reduced() || !observer ? 'off' : 'on';
      if (node.classList.contains('bravo-redesign')) node.style.setProperty('--page-progress', String(Math.max(0, Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)))));
      if (reduced()) node.querySelectorAll('[data-reveal]').forEach(reveal);
      const hero = node.querySelector('.cinema-hero');
      if (hero) {
        const progress = reduced() ? 0 : Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / hero.offsetHeight));
        hero.style.setProperty('--hero-progress', String(progress));
      }
      const story = node.querySelector('.cinema-story');
      if (story) {
        const bounds = story.getBoundingClientRect();
        const progress = Math.max(0, Math.min(0.999, -bounds.top / Math.max(1, bounds.height - innerHeight)));
        story.dataset.step = String(reduced() ? 0 : Math.floor(progress * 3));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    const reveal = element => { element.classList.add('is-revealed'); observer?.unobserve(element); };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    }, { threshold: 0.08 }) : null;
    const observe = element => {
      element.dataset.reveal = '';
      const bounds = element.getBoundingClientRect();
      // Never hide already-readable content when the enhancement starts.
      if (reduced() || !observer || element.classList.contains('is-revealed') || bounds.top < innerHeight) reveal(element);
      else observer.observe(element);
    };
    node.querySelectorAll(selector).forEach(observe);
    const focus = event => {
      let element = event.target instanceof Element ? event.target.closest('[data-reveal]') : null;
      while (element && node.contains(element)) {
        element.classList.add('is-focus-revealed'); reveal(element);
        element = element.parentElement?.closest('[data-reveal]');
      }
    };
    node.addEventListener('focusin', focus);
    // Team records arrive after the initial render and replace fallback nodes.
    const additions = new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) {
        if (!(added instanceof Element)) continue;
        if (added.matches(selector)) observe(added);
        added.querySelectorAll(selector).forEach(observe);
      }
    });
    additions.observe(node, { childList: true, subtree: true });
    const accessibility = new MutationObserver(schedule);
    accessibility.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    preference.addEventListener('change', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    render();
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); additions.disconnect();
      node.removeEventListener('focusin', focus); node.dataset.motion = 'off'; accessibility.disconnect();
      preference.removeEventListener('change', schedule);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
    };
  }, [root, enabled, selector]);
}
