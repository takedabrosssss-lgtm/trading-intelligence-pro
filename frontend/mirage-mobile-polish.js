/* MIRAGE mobile polish: visible naming cleanup + decorative atmosphere only. */
(() => {
  'use strict';
  if (window.__MIRAGE_MOBILE_POLISH__) return;
  window.__MIRAGE_MOBILE_POLISH__ = true;
  const cleanVisibleBranding = () => {
    document.querySelectorAll('.nexus-brand-stamp').forEach(node => node.remove());
    document.querySelectorAll('.nexus-kicker').forEach(node => {
      const value = (node.textContent || '').trim();
      if (/^NEXUS\s*\//i.test(value)) node.textContent = value.replace(/^NEXUS\s*\/\s*/i, 'MIRAGE / ');
    });
    document.querySelectorAll('[aria-label],[title]').forEach(node => {
      for (const attr of ['aria-label','title']) {
        const value = node.getAttribute(attr);
        if (value && /NEXUS/i.test(value)) node.setAttribute(attr, value.replace(/NEXUS/gi,'MIRAGE'));
      }
    });
  };
  const addAtmosphere = () => {
    if (!document.querySelector('.mirage-atmosphere')) {
      const layer = document.createElement('div');
      layer.className = 'mirage-atmosphere';
      layer.setAttribute('aria-hidden','true');
      document.body.prepend(layer);
    }
  };
  const init = () => { addAtmosphere(); cleanVisibleBranding(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
  const observer = new MutationObserver(() => cleanVisibleBranding());
  observer.observe(document.documentElement, {subtree:true,childList:true,characterData:true});
  document.addEventListener('mirage:modechange', cleanVisibleBranding);
})();
