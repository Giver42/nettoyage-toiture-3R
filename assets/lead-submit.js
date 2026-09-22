(function () {
  'use strict';
  const endpoint = 'https://3r-formulaires.croizads.workers.dev/submit';
  const sitekey = '0x4AAAAAAE5OBU80ZUieL3O8';
  const requests = new Map();
  const acceptedAttribution = new Map();
  let loading;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => reject(new Error('security_unavailable')), 15000);
        window.onLeadTurnstileReady = () => { clearTimeout(timer); resolve(); };
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onLeadTurnstileReady';
        script.async = true;
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('security_unavailable')); };
        document.head.appendChild(script);
      }).catch((error) => { loading = null; throw error; });
    }
    return loading;
  }
  window.LeadSubmission = {
    analytics(type) {
      const attribution = acceptedAttribution.get(type) || {};
      const data = { visit_count:attribution.visit_count || null };
      // Only campaign dimensions, never click IDs, timestamps or contact details.
      for (const prefix of ['first_visit_', 'last_visit_']) {
        for (const key of ['utm_camp', 'utm_campaign', 'utm_ville', 'utm_ga', 'utm_ann', 'utm_term', 'utm_kw']) {
          data[prefix + key] = attribution[prefix + key] || null;
        }
      }
      return data;
    },
    async submit(type, payload) {
      const serialized = JSON.stringify({type,payload});
      if (!requests.has(serialized)) requests.set(serialized, {
        id:crypto.randomUUID(), attribution:window.LeadAttribution ? window.LeadAttribution.capture() : undefined
      });
      const attempt = requests.get(serialized);
      const submittedPayload = Object.assign({}, payload, { attribution:attempt.attribution });
      if (attempt.attribution) Object.entries(attempt.attribution).forEach(([key,value]) => {
        if (!key.startsWith('first_visit_') && !key.startsWith('last_visit_')) submittedPayload[key] = value;
      });
      const form = document.getElementById(type === 'bilan' ? 'expertise-form' : 'estimate-form');
      const panel = form.querySelector(type === 'bilan' ? '[data-expertise-step="contact"]' : '[data-estimate-step="contact"]');
      let widget, container;
      try {
        await loadTurnstile();
        const token = await new Promise((resolve, reject) => {
          container = document.createElement('div');
          panel.appendChild(container);
          const timer = setTimeout(() => reject(new Error('security_timeout')), 120000);
          const fail = () => { clearTimeout(timer); reject(new Error('security_failed')); };
          widget = window.turnstile.render(container, {
            sitekey, action:type, size:'flexible',
            callback:value => { clearTimeout(timer); resolve(value); },
            'error-callback':fail, 'expired-callback':fail, 'timeout-callback':fail
          });
          container.scrollIntoView({block:'nearest'});
        });
        const response = await fetch(endpoint, {
          method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(25000),
          body:JSON.stringify({ form_type:type, payload:submittedPayload, token, request_id:attempt.id })
        });
        const result = await response.json();
        if (!response.ok || result.ok !== true || result.accepted !== true) throw new Error('submit_failed');
        acceptedAttribution.set(type, attempt.attribution || {});
        if (window.LeadAttribution) window.LeadAttribution.accepted(result.time);
        return result;
      } finally {
        if (widget !== undefined) window.turnstile.remove(widget);
        if (container) container.remove();
      }
    }
  };
})();
