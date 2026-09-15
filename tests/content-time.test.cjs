const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = readFileSync(join(__dirname, '../assets/content-tracking.js'), 'utf8');

function browser({ desktop = false, type = 'risk', top = 300, bottom = 400 } = {}) {
  let time = 0, id = 0;
  const tasks = new Map();
  function element(rect = { top:0, bottom:1000, left:0, right:1000 }) {
    const callbacks = new Map(), classes = new Set(), attributes = new Map();
    return {
      rect, dataset:{}, open:false,
      getBoundingClientRect() { return this.rect; },
      addEventListener(n, cb) { if (!callbacks.has(n)) callbacks.set(n, []); callbacks.get(n).push(cb); },
      emit(n) { (callbacks.get(n) || []).forEach((cb) => cb({ preventDefault() {} })); },
      getAttribute(n) { return attributes.get(n); }, setAttribute(n, v) { attributes.set(n, v); },
      classList:{ contains:n => classes.has(n), toggle(n, on) { if (on) classes.add(n); else classes.delete(n); } }
    };
  }
  const cards = [0,1].map((i) => {
    const root = element(), detail = element({ top, bottom, left:0, right:1000 }), button = element();
    root.dataset = { croReviewId:`review_${i+1}`, croContentId:`faq_${i+1}` };
    button.dataset = { croContentId:`risk_${i+1}`, croContentPosition:String(i+1) };
    button.setAttribute('aria-controls', `panel_${i}`);
    button.closest = () => root;
    const clip = element(); root.closest = () => clip;
    root.querySelector = (s) => ['.more','summary'].includes(s) ? button : detail;
    return { root, detail, button, clip };
  });
  const document = element();
  document.visibilityState = 'visible'; document.documentElement = element();
  document.querySelectorAll = (s) => s === '[data-s4-more]' && type === 'risk' ? cards.map(c=>c.button)
    : s === '.review-card' && type === 'review' || s === '.faq-item' && type === 'faq' ? cards.map(c=>c.root) : [];
  document.getElementById = (s) => cards[Number(s.slice(-1))].detail;
  const window = element();
  window.innerHeight=1000; window.innerWidth=1000;
  window.performance={ now:()=>time }; window.matchMedia=()=>({ matches:desktop });
  window.dataLayer=[]; window.CroTracker={ pushEvent:(event,data)=>window.dataLayer.push({ event,...data }) };
  window.scrollBy=()=>{};
  window.requestAnimationFrame=cb=>{tasks.set(++id,{ at:time+16,cb });return id;};
  window.setInterval=(cb,delay)=>tasks.set(++id,{ at:time+delay, cb, repeat:delay });
  vm.runInNewContext(source,{ window,document });
  function advance(ms) {
    const end=time+ms;
    for (;;) {
      const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      const [key,t]=next;time=t.at;
      if(t.repeat)t.at+=t.repeat;else tasks.delete(key);
      t.cb();
    }
    time=end;
  }
  return { cards, window, document, advance,
    click:(i=0)=>cards[i].button.emit('click'),
    hide(){document.visibilityState='hidden';document.emit('visibilitychange');},
    show(){document.visibilityState='visible';document.emit('visibilitychange');},
    events:n=>window.dataLayer.filter(e=>e.event===n),
    total:()=>window.dataLayer.filter(e=>e.event==='cro_content_time').reduce((s,e)=>s+e.content_engagement_time,0)
  };
}

test('all content groups count openings, reopening and sub-4s durations', () => {
  for (const type of ['risk','review','faq']) {
    const b=browser({type});b.click();b.advance(1500);b.click();b.click();b.advance(500);b.click();
    assert.equal(b.total(),2000);
    assert.deepEqual(b.events('cro_content_expand').map(e=>e.content_open_type),['first','reopen']);
    assert.deepEqual(b.events('cro_content_time').map(e=>e.content_open_index),[1,2]);
    assert.equal(b.events('cro_content_expand')[1].content_engagement_time,null);
  }
});

test('opening a peer closes and flushes the previous item', () => {
  const b=browser();b.click();b.advance(1000);b.click(1);b.advance(500);b.hide();
  assert.equal(b.cards[0].detail.hidden,true);
  assert.equal(b.cards[1].detail.hidden,false);
  assert.equal(b.total(),1500);
  assert.equal(b.events('cro_content_time')[0].content_id,'risk_1');
});

test('mobile and desktop thresholds use 40% of the shorter height', () => {
  for(const desktop of [false,true]) {
    const zoneEnd=desktop?500:400;
    for(const size of [100,300]) {
      const needed=Math.min(size,150)*0.4;
      for(const offset of [0,1]) {
        const top=zoneEnd-needed+offset;
        const b=browser({desktop,top,bottom:top+size});b.click();b.advance(1000);b.hide();
        assert.equal(b.total(),offset?0:1000);
      }
    }
  }
});

test('moving outside the band pauses without closing and reentry keeps opening index', () => {
  const b=browser();b.click();b.advance(1000);
  b.cards[0].detail.rect.top=700;b.cards[0].detail.rect.bottom=800;
  b.document.emit('scroll');b.advance(16);
  const before=b.total();b.advance(20000);
  assert.equal(b.total(),before);assert.equal(b.cards[0].detail.hidden,false);
  b.cards[0].detail.rect.top=300;b.cards[0].detail.rect.bottom=400;
  b.document.emit('scroll');b.advance(16);b.advance(500);b.hide();
  assert.equal(b.total(),before+500);
  assert.ok(b.events('cro_content_time').every(e=>e.content_open_index===1));
});

test('hidden time and repeated lifecycle notifications never double count', () => {
  const b=browser();b.click();b.advance(600);b.hide();b.window.emit('pagehide');
  b.advance(15000);b.show();b.window.emit('pageshow');b.advance(400);b.hide();b.window.emit('pagehide');
  assert.equal(b.total(),1000);
  assert.equal(b.events('cro_content_time').length,2);
});

test('review must contain the horizontal viewport center inside carousel clipping', () => {
  for(const centered of [false,true]) {
    const b=browser({type:'review'});b.cards[0].root.rect.right=centered?600:499;
    b.click();b.advance(1000);b.hide();assert.equal(b.total(),centered?1000:0);
  }
  const b=browser({type:'review'});b.cards[0].clip.rect.left=501;
  b.click();b.advance(1000);b.hide();assert.equal(b.total(),0);
});

test('a form covering the page pauses content timing', () => {
  const b=browser();b.document.documentElement.classList.toggle('estimate-modal-open',true);
  b.click();b.advance(1000);b.hide();assert.equal(b.total(),0);
});
