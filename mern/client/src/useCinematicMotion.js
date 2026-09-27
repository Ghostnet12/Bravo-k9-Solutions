import { useEffect } from 'react';

// Native scrolling, progressive enhancement, and one animation frame per scroll.
// Content is readable even when scripting, observers, or animation is unavailable.
export default function useCinematicMotion(root) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const reduced = () => preference.matches || document.documentElement.classList.contains('access-reduced-motion');
    const render = () => {
      frame = 0;
      node.dataset.motion = reduced() ? 'off' : 'on';
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
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed'); observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    node.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    // Team records arrive after the initial render and replace fallback nodes.
    const additions = new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) {
        if (!(added instanceof Element)) continue;
        if (added.matches('[data-reveal]')) observer.observe(added);
        added.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
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
      cancelAnimationFrame(frame); observer.disconnect(); additions.disconnect(); accessibility.disconnect();
      preference.removeEventListener('change', schedule);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
    };
  }, [root]);
}
