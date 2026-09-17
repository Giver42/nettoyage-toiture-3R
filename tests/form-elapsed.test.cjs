const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const source = readFileSync(require('node:path').join(__dirname,'../assets/form-elapsed-tracking.js'),'utf8');

function setup() {
  let now=0, checkpoint;
  const events=[], handlers={};
  const listen=(name,fn)=>{ handlers[name]=fn; };
  const document={visibilityState:'visible',addEventListener:listen};
  const window={addEventListener:listen,setInterval(fn,ms){assert.equal(ms,15000);checkpoint=fn;},CroTracker:{pushEvent:(event,data)=>events.push({event,...data})}};
  vm.runInNewContext(source,{window,document,Date:{now:()=>now}});
  const context={source_cta_id:'hero_bilan',source_section:'hero'};
  return {events, advance:ms=>{now+=ms;},tick:()=>checkpoint(),
    page:(step='postcode',index=1,type='bilan')=>window.FormElapsedTracker.page(type,index,step,context),
    end:(type='bilan')=>window.FormElapsedTracker.end(type),
    visibility(value){document.visibilityState=value;handlers.visibilitychange();},
    lifecycle:event=>handlers[event](),
    sum:(key)=>events.reduce((s,e)=>s+(e[key]||0),0)
  };
}

test('10s visible + 30s hidden + 5s visible equals 45s, not just active time',()=>{
  const b=setup();b.page();b.advance(10000);b.visibility('hidden');b.advance(30000);b.tick();b.visibility('visible');b.advance(5000);b.end();
  assert.equal(b.sum('form_elapsed_time'),45000);
  assert.equal(b.sum('form_step_elapsed_time'),45000);
});

test('step returns accumulate and repeated renders do not reset or duplicate time',()=>{
  const b=setup();b.page();b.advance(600);b.page();b.advance(400);b.page('roof_surface',2);b.advance(2000);b.page();b.advance(3000);b.end();
  assert.equal(b.sum('form_elapsed_time'),6000);
  const steps=b.events.filter(e=>e.event==='cro_form_step_time');
  assert.deepEqual(steps.map(e=>[e.form_step_id,e.form_step_elapsed_time]),[['postcode',1000],['roof_surface',2000],['postcode',3000]]);
});

test('closing pauses time; reopening same page resumes; forms are independent',()=>{
  const b=setup();b.page();b.advance(1000);b.end();b.advance(60000);b.tick();b.page();b.advance(500);b.end();
  b.page('roof_material',2,'estimation');b.advance(2000);b.end('estimation');
  assert.equal(b.sum('form_elapsed_time'),3500);
  assert.deepEqual(b.events.filter(e=>e.event==='cro_form_time').map(e=>[e.form_type,e.form_elapsed_time]),[['bilan',1000],['bilan',500],['estimation',2000]]);
});

test('success and repeated close stop timing; source metadata only, no entered values',()=>{
  const b=setup();b.page();b.advance(123);b.end();b.end();b.advance(90000);b.visibility('hidden');b.tick();
  assert.equal(b.sum('form_elapsed_time'),123);
  assert.equal(b.events.length,2);
  assert.equal(b.events[0].source_cta_id,'hero_bilan');
  assert.equal(b.events[0].form_step_elapsed_time,null);
  assert.equal(b.events[1].form_elapsed_time,null);
  assert.equal(b.events[0].email,undefined);
});

test('checkpoints and final flush are additive with no duplicates or minimum duration',()=>{
  const b=setup();b.page();b.advance(15000);b.tick();b.tick();b.advance(7);b.end();
  assert.equal(b.sum('form_elapsed_time'),15007);
  assert.equal(b.sum('form_step_elapsed_time'),15007);
});

test('pagehide flushes once; BFCache absence is excluded; restore resumes',()=>{
  const b=setup();b.page();b.advance(1000);b.visibility('hidden');b.lifecycle('pagehide');b.lifecycle('pagehide');b.advance(60000);b.tick();
  b.lifecycle('pageshow');b.visibility('visible');b.advance(2000);b.end();
  assert.equal(b.sum('form_elapsed_time'),3000);
});

test('a page load with no open form emits no duration',()=>{
  const b=setup();b.advance(60000);b.tick();b.visibility('hidden');b.lifecycle('pagehide');assert.equal(b.events.length,0);
});
