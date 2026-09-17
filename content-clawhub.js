(function () {
  'use strict';
  if (window.__JEP_CLAWHUB_ENHANCED) return;
  window.__JEP_CLAWHUB_ENHANCED = true;
  let observer;
  function clear() {
    observer?.disconnect();
    document.querySelectorAll('[data-jep-note]').forEach(el => el.remove());
  }
  function annotate() {
    document.querySelectorAll('[data-testid="skill-card"],.skill-card,[class*="SkillCard"]').forEach(card => {
      if (card.querySelector('[data-jep-note]')) return;
      const note = document.createElement('div');
      note.dataset.jepNote = 'true';
      note.className = 'jep-card-badge';
      note.textContent = 'JEP companion — review the security audit';
      note.title = 'The companion does not verify this skill or trace its installation.';
      card.appendChild(note);
    });
  }
  function refresh() {
    chrome.runtime.sendMessage({type:'GET_PUBLIC_CONFIG'}, cfg => {
      clear();
      if (!cfg?.consentGiven || !cfg.clawhubEnhance || !cfg.clawhubBadge) return;
      annotate();
      observer = new MutationObserver(annotate);
      observer.observe(document.body, {childList:true,subtree:true});
    });
  }
  // Only text is added; page-provided manifest fields never become HTML or permissions.
  window.addEventListener('focus', refresh);
  chrome.runtime.onMessage.addListener(msg => {if (msg.type === 'PUBLIC_CONFIG_CHANGED') refresh();});
  refresh();
})();
