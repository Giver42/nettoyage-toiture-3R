(function initContentTracking(){
  'use strict';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentTracking, { once:true });
    return;
  }
  const states = [];
  const desktop = window.matchMedia('(min-width: 64rem)');
  let active = document.visibilityState === 'visible';
  let frame = null;
  const now = () => window.performance.now();

  function register(type, section, id, position, root, detail, button){
    if (!detail || !button) return;
    const state = { type, section, id, position, root, detail, button,
      clip:type === 'review' ? root.closest('.carousel-viewport') : null,
      open:false, index:0, elapsed:0, sent:0, started:null };
    states.push(state);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      setOpen(state, !state.open);
    });
    if (type === 'faq') {
      root.addEventListener('toggle', () => {
        if (root.open !== state.open) setOpen(state, root.open);
      });
    }
  }

  document.querySelectorAll('[data-s4-more]').forEach((button) => {
    register('risk', 'risks', button.dataset.croContentId,
      Number(button.dataset.croContentPosition), button.closest('article'),
      document.getElementById(button.getAttribute('aria-controls')), button);
  });
  document.querySelectorAll('.review-card').forEach((card, index) => {
    register('review', 'avis', card.dataset.croReviewId, index + 1, card,
      card.querySelector('.review-text'), card.querySelector('.more'));
  });
  document.querySelectorAll('.faq-item').forEach((item, index) => {
    register('faq', 'faq', item.dataset.croContentId, index + 1, item,
      item.querySelector('.faq-answer'), item.querySelector('summary'));
  });

  function emit(state, event, duration){
    const page = (window.dataLayer || []).find((entry) => entry.event === 'cro_page_view') || {};
    window.CroTracker.pushEvent(event, {
      lp_name:page.lp_name, lp_variant:page.lp_variant, page_type:page.page_type,
      section_id:state.section, content_type:state.type, content_id:state.id,
      content_position:state.position, content_open_index:state.index,
      content_open_type:state.index === 1 ? 'first' : 'reopen',
      // Clear the previous time value in GTM on each new expansion.
      content_engagement_time:duration === undefined ? null : duration
    });
  }

  function accrue(state, current){
    if (state.started === null) return;
    state.elapsed += Math.max(0, current - state.started);
    state.started = current;
  }

  function flush(state){
    const total = Math.floor(state.elapsed);
    const delta = total - state.sent;
    if (delta <= 0) return;
    state.sent = total;
    emit(state, 'cro_content_time', delta);
  }

  function render(state){
    if (state.type === 'faq') {
      state.root.open = state.open;
    } else {
      state.button.setAttribute('aria-expanded', String(state.open));
      if (state.type === 'risk') {
        state.detail.hidden = !state.open;
        state.button.textContent = state.open ? 'Masquer le d\u00e9tail' : 'Voir le d\u00e9tail';
      } else {
        state.root.classList.toggle('expanded', state.open);
        state.button.textContent = state.open ? 'Voir moins' : 'Voir plus';
      }
    }
  }

  function close(state, current){
    accrue(state, current);
    state.started = null;
    flush(state);
    state.open = false;
    render(state);
  }

  function setOpen(state, open){
    if (state.open === open) return;
    const current = now();
    states.forEach((entry) => accrue(entry, current));
    if (open) {
      const buttonTop = state.button.getBoundingClientRect().top;
      let closedPeer = false;
      states.forEach((entry) => {
        if (entry !== state && entry.type === state.type && entry.open) {
          close(entry, current);
          closedPeer = true;
        }
      });
      // Keep the selected control in place when a preceding panel collapses.
      if (closedPeer) {
        const shift = state.button.getBoundingClientRect().top - buttonTop;
        if (shift) window.scrollBy({ top:shift, behavior:'instant' });
      }
      state.open = true;
      state.index += 1;
      state.elapsed = 0;
      state.sent = 0;
      render(state);
      emit(state, 'cro_content_expand');
    } else {
      close(state, current);
    }
    evaluate();
  }

  function qualifies(state){
    if (!active || document.visibilityState !== 'visible' || !state.open
      || document.documentElement.classList.contains('estimate-modal-open')) return false;
    const rect = state.detail.getBoundingClientRect();
    const height = window.innerHeight;
    const width = window.innerWidth;
    const zoneTop = height * (desktop.matches ? 0.35 : 0.25);
    const zoneBottom = height * (desktop.matches ? 0.5 : 0.4);
    const detailHeight = rect.bottom - rect.top;
    if (detailHeight <= 0 || rect.right <= 0 || rect.left >= width) return false;
    let visibleTop = Math.max(rect.top, zoneTop);
    let visibleBottom = Math.min(rect.bottom, zoneBottom);
    if (state.type === 'review') {
      const card = state.root.getBoundingClientRect();
      const clip = state.clip ? state.clip.getBoundingClientRect() : null;
      const left = clip ? Math.max(0, clip.left) : 0;
      const right = clip ? Math.min(width, clip.right) : width;
      if (right <= left) return false;
      const center = (left + right) / 2;
      if (card.left > center || card.right <= center) return false;
      if (clip) {
        visibleTop = Math.max(visibleTop, clip.top);
        visibleBottom = Math.min(visibleBottom, clip.bottom);
      }
    }
    const overlap = Math.max(0, visibleBottom - visibleTop);
    return overlap >= Math.min(detailHeight, zoneBottom - zoneTop) * 0.4;
  }

  function evaluate(){
    if (!active) return;
    const current = now();
    states.forEach((state) => {
      if (!state.open) return;
      accrue(state, current);
      if (qualifies(state)) {
        state.started = current;
      } else {
        state.started = null;
        flush(state);
      }
    });
  }

  function schedule(){
    if (frame !== null || !active) return;
    frame = window.requestAnimationFrame(() => { frame = null; evaluate(); });
  }

  function pause(){
    if (!active) return;
    const current = now();
    states.forEach((state) => {
      accrue(state, current);
      state.started = null;
      flush(state);
    });
    active = false;
  }

  function resume(){
    if (active || document.visibilityState !== 'visible') return;
    active = true;
    evaluate();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume(); else pause();
  });
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  document.addEventListener('scroll', schedule, { capture:true, passive:true });
  window.addEventListener('resize', schedule);
  if (typeof desktop.addEventListener === 'function') desktop.addEventListener('change', schedule);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    states.forEach((state) => observer.observe(state.detail));
  }
  if ('MutationObserver' in window) {
    new MutationObserver(schedule).observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  }
  window.setInterval(evaluate, 250);
})();
