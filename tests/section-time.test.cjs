const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script id="cro-tracking-script">([\s\S]*?)<\/script>/)[1];

// Execute the actual page script with deterministic browser time and geometry.
function browser(desktop = false) {
  let clock = 0;
  let nextId = 0;
  const tasks = new Map();
  function events(target) {
    const listeners = new Map();
    target.addEventListener = (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    };
    target.emit = (name, event) => (listeners.get(name) || []).forEach((cb) => cb(event));
    return target;
  }
  const schedule = (callback, delay, repeat = false) => {
    const id = ++nextId;
    tasks.set(id, { callback, at: clock + delay, delay, repeat });
    return id;
  };
  const window = events({
    scrollY: 0, innerHeight: 1000, innerWidth: desktop ? 1400 : 390,
    performance: { now: () => clock },
    matchMedia: () => ({ matches: desktop }),
    setTimeout: (cb, delay) => schedule(cb, delay),
    clearTimeout: (id) => tasks.delete(id),
    setInterval: (cb, delay) => schedule(cb, delay, true),
    requestAnimationFrame: (cb) => schedule(cb, 16)
  });
  const sections = ['hero', 'risks'].map((id, index) => ({
    dataset: { croSection: id, croSectionIndex: String(index + 1) },
    querySelector() { return this; },
    getBoundingClientRect() {
      return { top: index * 1000 - window.scrollY, bottom: (index + 1) * 1000 - window.scrollY };
    }
  }));
  const document = events({
    readyState: 'complete', visibilityState: 'visible',
    documentElement: { clientHeight: 1000, scrollHeight: 4000, scrollTop: 0 },
    querySelectorAll: (selector) => selector === '[data-cro-section][data-cro-section-index]' ? sections : []
  });
  class Element {}
  vm.runInNewContext(script, { window, document, Element });
  function advance(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, task] = next;
      clock = task.at;
      if (task.repeat) task.at += task.delay;
      else tasks.delete(id);
      task.callback();
    }
    clock = end;
  }
  return {
    window, document, advance,
    get now() { return clock; },
    move(y) { window.scrollY = y; window.emit('scroll'); advance(16); },
    hide() { document.visibilityState = 'hidden'; document.emit('visibilitychange'); },
    show() { document.visibilityState = 'visible'; document.emit('visibilitychange'); },
    clickCta() {
      const target = new Element();
      target.dataset = { croCtaId:'hero_bilan', croCtaType:'bilan', croLocation:'hero', croDestination:'bilan_form' };
      target.closest = (selector) => selector === '[data-cro-cta-id]' ? target : null;
      document.emit('click', { target });
      return window.dataLayer.filter((e) => e.event === 'cro_cta_click').at(-1);
    },
    events(name, section = 'hero') {
      return Array.from(window.dataLayer).filter((e) => e.event === name && e.section_id === section);
    },
    times(section = 'hero') { return this.events('cro_section_time', section); }
  };
}

test('first passage starts at confirmation and records the final partial tick', () => {
  const b = browser();
  b.advance(816);
  b.advance(1234);
  b.move(2200);
  const [event] = b.times();
  assert.equal(event.section_engagement_time, 1250);
  assert.equal(event.section_visit_index, 1);
  assert.equal(event.section_visit_type, 'first');
  assert.equal(event.section_index, 1);
  assert.equal(event.lp_name, 'nettoyage_toiture_3r');
  b.advance(5000);
  assert.equal(b.times().length, 1);
});

test('hidden time is excluded and visibilitychange plus pagehide never duplicate time', () => {
  const b = browser();
  b.advance(816);
  b.advance(1200);
  b.hide();
  b.window.emit('pagehide');
  b.advance(30000);
  b.show();
  b.window.emit('pageshow');
  b.advance(800);
  b.move(2200);
  assert.deepEqual(b.times().map((e) => e.section_engagement_time), [1200, 816]);
  assert.ok(b.times().every((e) => e.section_visit_index === 1));
  assert.equal(b.events('cro_section_revisit').length, 0);
});

test('pagehide alone flushes and pageshow resumes after a cached-page restoration', () => {
  const b = browser();
  b.advance(816);
  b.advance(713);
  b.window.emit('pagehide');
  b.window.emit('pagehide');
  b.advance(10000);
  b.window.emit('pageshow');
  b.advance(401);
  b.hide();
  assert.deepEqual(b.times().map((e) => e.section_engagement_time), [713, 401]);
});

test('returns are classified as second, third, fourth+ with additive durations', () => {
  const b = browser();
  b.advance(816);
  for (let visit = 1; visit <= 5; visit++) {
    b.advance(1000);
    b.move(2200);
    b.advance(2100);
    if (visit < 5) {
      b.move(0);
      b.advance(800);
    }
  }
  assert.deepEqual(b.times().map((e) => e.section_visit_index), [1, 2, 3, '4_plus', '4_plus']);
  assert.deepEqual(b.times().map((e) => e.section_visit_type), ['first', 'return', 'return', 'return', 'return']);
  assert.equal(b.times().reduce((sum, e) => sum + e.section_engagement_time, 0), 5080);
  assert.equal(b.events('cro_section_view').length, 1);
  assert.equal(b.events('cro_section_revisit').length, 4);
});

test('brief exits remain the same visit and an unconfirmed return adds no time', () => {
  const b = browser();
  b.advance(816);
  b.advance(500);
  b.move(2200);
  b.advance(500);
  b.move(0);
  b.advance(500);
  b.move(2200);
  assert.deepEqual(b.times().map((e) => e.section_visit_index), [1, 1]);
  b.advance(2100);
  b.move(0);
  b.advance(400);
  b.move(2200);
  assert.equal(b.times().length, 2);
  assert.equal(b.events('cro_section_revisit').length, 0);
});

test('a hidden page during the first confirmation restarts the 800ms delay', () => {
  const b = browser();
  b.advance(400);
  b.hide();
  b.advance(10000);
  b.show();
  b.advance(799);
  assert.equal(b.events('cro_section_view').length, 0);
  b.advance(1);
  b.advance(100);
  b.hide();
  assert.equal(b.times()[0].section_engagement_time, 100);
});

test('engaged and reengaged events remain single and omit the obsolete bucket', () => {
  const b = browser();
  b.advance(816);
  b.advance(4500);
  b.move(2200);
  b.advance(2100);
  b.move(0);
  b.advance(800);
  b.advance(4500);
  b.hide();
  b.show();
  b.advance(4500);
  b.hide();
  assert.equal(b.events('cro_section_engaged').length, 1);
  assert.equal(b.events('cro_section_reengaged').length, 1);
  assert.ok(!script.includes('engagement_time_bucket'));
});

test('section boundary belongs to only one section on desktop and mobile', () => {
  for (const desktop of [false, true]) {
    const b = browser(desktop);
    b.advance(816);
    b.move(desktop ? 500 : 600);
    const heroTime = b.times()[0].section_engagement_time;
    b.advance(800);
    b.advance(500);
    b.hide();
    assert.equal(b.times().length, 1);
    assert.equal(heroTime, 16);
    assert.equal(b.times('risks')[0].section_engagement_time, 500);
  }
});

test('CTA rankings count 6s + 2s + 5s as 11s and two qualified passages', () => {
  const b = browser();
  b.advance(816);
  for (const duration of [6000, 2000, 5000]) {
    b.advance(duration - 16);
    b.move(2200);
    b.advance(2100);
    if (duration !== 5000) {
      b.move(0);
      b.advance(800);
    }
  }
  const event = b.clickCta();
  assert.equal(event.cta_most_time_section_id, 'hero');
  assert.equal(event.cta_most_time_section_time, 11000);
  assert.equal(event.cta_most_visited_section_id, 'hero');
  assert.equal(event.cta_most_visited_count, 2);
  assert.equal(b.times().reduce((sum, e) => sum + e.section_engagement_time, 0), 13000);
  assert.equal(event.cta_id, 'hero_bilan');
  assert.equal(event.destination, 'bilan_form');
  assert.ok(!('most_engaged_section' in event));
  assert.ok(!('most_reengaged_section' in event));
});

test('CTA at 3999ms has no winner; at 4000ms it credits the full current passage once', () => {
  const b = browser();
  b.advance(816);
  b.advance(3999);
  assert.ok(!('cta_most_time_section_id' in b.clickCta()));
  b.advance(1);
  const qualified = b.clickCta();
  assert.equal(qualified.cta_most_time_section_time, 4000);
  assert.equal(qualified.cta_most_visited_count, 1);
  const repeated = b.clickCta();
  assert.equal(repeated.cta_most_time_section_time, 4000);
  assert.equal(repeated.cta_most_visited_count, 1);
  b.advance(2000);
  assert.equal(b.clickCta().cta_most_time_section_time, 6000);
});

test('CTA ranking excludes hidden time, retains partial passage and counts it once', () => {
  const b = browser();
  b.advance(816);
  b.advance(3000);
  b.hide();
  b.advance(60000);
  b.show();
  b.advance(1000);
  assert.equal(b.clickCta().cta_most_time_section_time, 4000);
  b.hide();
  b.advance(60000);
  b.show();
  b.advance(2000);
  const event = b.clickCta();
  assert.equal(event.cta_most_time_section_time, 6000);
  assert.equal(event.cta_most_visited_count, 1);
});

test('CTA time and frequency rankings can select different sections', () => {
  const b = browser();
  b.advance(816);
  b.advance(20000 - 16);
  b.move(1000);
  b.advance(800);
  b.advance(4000 - 16);
  b.move(2200);
  b.advance(2100);
  b.move(1000);
  b.advance(800);
  b.advance(4000);
  const event = b.clickCta();
  assert.equal(event.cta_most_time_section_id, 'hero');
  assert.equal(event.cta_most_time_section_time, 20000);
  assert.equal(event.cta_most_visited_section_id, 'risks');
  assert.equal(event.cta_most_visited_count, 2);
});

test('CTA ranking ties favor the most recently qualified passage', () => {
  const b = browser();
  b.advance(816);
  b.advance(6000 - 16);
  b.move(1000);
  b.advance(800);
  b.advance(6000);
  const event = b.clickCta();
  assert.equal(event.cta_most_time_section_id, 'risks');
  assert.equal(event.cta_most_time_section_time, 6000);
  assert.equal(event.cta_most_visited_section_id, 'risks');
  assert.equal(event.cta_most_visited_count, 1);
});
