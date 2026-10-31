(function () {
  'use strict';
  const bar = document.querySelector('.lp-sticky');
  const heroActions = document.querySelector('.hero-impeccable__actions');
  if (!bar || !heroActions || bar.dataset.initialized) return;
  bar.dataset.initialized = 'true';
  const mobile = window.matchMedia('(max-width: 759px)');
  const groups = Array.from(document.querySelectorAll('main .hero-impeccable__actions, main .roof-service__actions'));
  const links = Array.from(bar.querySelectorAll('a'));
  let scheduled = false;

  function update() {
    scheduled = false;
    document.body.style.setProperty('--lp-sticky-height', Math.ceil(bar.getBoundingClientRect().height) + 'px');
    const availableHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const heroPassed = heroActions.getBoundingClientRect().bottom <= 68;
    const anotherVisible = groups.some(group => {
      const rect = group.getBoundingClientRect();
      return rect.bottom > 68 && rect.top < availableHeight && rect.height > 0;
    });
    const modalOpen = document.documentElement.classList.contains('estimate-modal-open');
    const visible = mobile.matches && heroPassed && !anotherVisible && !modalOpen && document.visibilityState === 'visible';
    bar.dataset.visible = String(visible);
    bar.setAttribute('aria-hidden', String(!visible));
    bar.inert = !visible;
    links.forEach(link => { link.tabIndex = visible ? 0 : -1; });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(schedule, { threshold: [0, 1], rootMargin: '-68px 0px 0px 0px' });
    groups.forEach(group => observer.observe(group));
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  update();
})();

(function () {
  'use strict';
  document.querySelectorAll('.lp-google-review').forEach(card => {
    const text = card.querySelector('.lp-google-review__text');
    const button = card.querySelector('.lp-google-review__more');
    if (!text || !button) return;
    function refresh() {
      if (card.dataset.expanded === 'true') return;
      button.hidden = text.scrollHeight <= text.clientHeight + 1;
    }
    button.addEventListener('click', () => {
      const expanded = card.dataset.expanded !== 'true';
      card.dataset.expanded = String(expanded);
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Voir moins' : 'Voir plus';
      refresh();
    });
    if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(text);
    window.addEventListener('resize', refresh);
    if (document.fonts) document.fonts.ready.then(refresh);
    refresh();
  });
})();
