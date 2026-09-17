(function () {
  'use strict';
  const keys = ['gclid', 'gbraid', 'wbraid', 'utm_camp', 'utm_campaign', 'utm_ville', 'utm_ga', 'utm_ann', 'utm_term', 'utm_kw'];
  const storageKey = '3r_lead_attribution_v1';
  const timeout = 30 * 60 * 1000;
  const retention = 90 * 86400000;
  const forms = Array.from(document.querySelectorAll('#estimate-form, #expertise-form'));
  let state;
  let lastWrite = 0;
  const formatTime = now => new Date(now).toISOString().slice(0, 19).replace('T', ' ') + '+0000';
  const clean = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160);

  function load(now) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && saved.version === 1 && Number.isSafeInteger(saved.count) && saved.count > 0 &&
          Number.isFinite(saved.active) && saved.active <= now && now - saved.active < retention &&
          saved.first && saved.last && typeof saved.first.time === 'string' && typeof saved.last.time === 'string') state = saved;
    } catch (_) { /* Storage may be unavailable in private or restricted browsers. */ }
    if (state && now - state.active >= retention) state = null;
  }

  function save(now) {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {}
    lastWrite = now;
  }

  function touch(arrival) {
    const now = Date.now();
    load(now);
    if (!state || now - state.active >= timeout) {
      // A return within an already-open page is not a new advertising click.
      const params = new URLSearchParams(arrival ? location.search : '');
      const visit = { time: formatTime(now) };
      keys.forEach(key => { visit[key] = clean(params.get(key)); });
      state = { version: 1, first: state ? state.first : visit, last: visit,
        count: state ? state.count + 1 : 1, active: now };
      save(now);
    } else {
      state.active = now;
      if (now - lastWrite >= 1000) save(now);
    }
    inject(snapshot(now));
  }

  function snapshot(now) {
    const data = { time: formatTime(now), first_visit_time: state.first.time,
      last_visit_time: state.last.time, visit_count: state.count };
    keys.forEach(key => {
      data['first_visit_' + key] = clean(state.first[key]);
      data['last_visit_' + key] = clean(state.last[key]);
      data[key] = data['last_visit_' + key];
    });
    return data;
  }

  function inject(data) {
    forms.forEach(form => Object.entries(data).forEach(([name, value]) => {
      let input = form.querySelector('input[data-lead-attribution][name="' + name + '"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.dataset.leadAttribution = '';
        form.appendChild(input);
      }
      input.value = String(value);
    }));
  }

  touch(true);
  // Only real activity extends a visit; background timers never do.
  ['pointerdown', 'keydown', 'input', 'scroll'].forEach(name => document.addEventListener(name, () => {
    if (Date.now() - lastWrite >= 1000) touch(false);
  }, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') touch(false);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) touch(false); });
  window.addEventListener('storage', event => {
    if (event.key === storageKey && event.newValue) { load(Date.now()); if (state) inject(snapshot(Date.now())); }
    if (event.key === storageKey && !event.newValue) state = null;
  });
  window.LeadAttribution = {
    capture() { touch(false); save(Date.now()); return snapshot(Date.now()); },
    accepted(time) {
      if (typeof time === 'string') forms.forEach(form => {
        const input = form.querySelector('input[data-lead-attribution][name="time"]');
        if (input) input.value = time;
      });
    }
  };
})();
