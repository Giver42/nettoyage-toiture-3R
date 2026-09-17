(function () {
  'use strict';
  const forms = new Map();
  let suspended = false;

  function flush(state) {
    if (!state || state.since === null) return;
    const current = Math.max(state.since, Date.now());
    const delta = current - state.since;
    state.since = current;
    if (!delta) return;
    const context = {
      form_type:state.type,
      source_cta_id:state.source.source_cta_id,
      source_section:state.source.source_section
    };
    window.CroTracker.pushEvent('cro_form_time', {
      ...context, form_elapsed_time:delta,
      form_step_id:null, form_step_index:null, form_step_elapsed_time:null
    });
    window.CroTracker.pushEvent('cro_form_step_time', {
      ...context, form_step_id:state.stepId, form_step_index:state.stepIndex,
      form_step_elapsed_time:delta, form_elapsed_time:null
    });
  }

  window.FormElapsedTracker = {
    page(type, stepIndex, stepId, source) {
      const previous = forms.get(type);
      if (previous && previous.stepId === stepId && previous.stepIndex === stepIndex) return;
      flush(previous);
      forms.set(type, { type, stepId, stepIndex, source:{...source}, since:suspended ? null : Date.now() });
    },
    end(type) {
      flush(forms.get(type));
      forms.delete(type);
    }
  };

  function flushAll() { forms.forEach(flush); }
  // Hiding the tab flushes a checkpoint but does NOT stop the elapsed clock.
  document.addEventListener('visibilitychange', flushAll);
  window.addEventListener('pagehide', () => {
    flushAll();
    forms.forEach(state => { state.since = null; });
    suspended = true;
  });
  window.addEventListener('pageshow', () => {
    if (!suspended) return;
    suspended = false;
    forms.forEach(state => { state.since = Date.now(); });
  });
  // Checkpoints limit losses on abrupt exits. GA4 delivery at page exit is best effort.
  window.setInterval(() => {
    if (!suspended && document.visibilityState === 'visible') flushAll();
  }, 15000);
})();
