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
    target.emit = (name) => (listeners.get(name) || []).forEach((cb) => cb());
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
  vm.runInNewContext(script, { window, document, Element: class {} });
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
