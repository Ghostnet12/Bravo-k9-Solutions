(() => {
  const applyAshleyPortrait = () => {
    const image = [...document.querySelectorAll('.home-team-grid img')].find((img) =>
      /^Ashley Northrop,/i.test(img.alt || '')
    );
    if (!image) return false;
    image.src = '/images/ashley-northrop.webp';
    return true;
  };

  if (applyAshleyPortrait()) return;
  const observer = new MutationObserver(() => {
    if (applyAshleyPortrait()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 30000);
})();
