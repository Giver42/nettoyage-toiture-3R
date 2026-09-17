import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { validate, estimate, messages, deliver } from '../worker/index.mjs';

function setup() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  function statement(sql, args=[]) {
    return {
      bind(...values) { return statement(sql, values); },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return {results:db.prepare(sql).all(...args)}; },
      async run() { return {meta:{changes:db.prepare(sql).run(...args).changes}}; }
    };
  }
  const DB={prepare:statement};
  DB.batch=async statements=>{db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  return {db,env:{DB,BREVO_API_KEY:'test-only',TURNSTILE_SECRET_KEY:'test-only',DELIVERY_MODE:'test',TEST_RECIPIENT:'tester@example.org'}};
}
const payload={full_name:'Test Person',email:'prospect@example.org',phone:'0612345678',postcode:'69001',roof_surface_range:'125_175',roof_material:'beton',hydrofuge_type:'incolore',consent_contact:true};
const input=(overrides={})=>({form_type:'estimation',payload:{...payload,...overrides}});
const request=(body,origin='https://toiture.3rservices.fr')=>new Request('https://example.org/submit',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)});

test('all 25 price combinations and unknown material/surface use the agreed HT grid',()=>{
  const ranges=['75_125','125_175','175_225','225_300','300_plus'];
  for(const [i,surface] of ranges.entries()) {
    assert.deepEqual(estimate(validate(input({roof_surface_range:surface,roof_material:'terre_cuite_ste_foy'}))),{min:i>=3?16:18,max:22});
    for(const [hydro,min,max] of [['incolore',i===4?15:16,20],['colore',i===4?23:25,30],['colore_isolant',i===4?28:30,35],['unknown',i>=3?16:18,35]]) {
      assert.deepEqual(estimate(validate(input({roof_surface_range:surface,hydrofuge_type:hydro}))),{min,max});
    }
  }
  for(const change of [{roof_material:'unknown'},{roof_surface_range:'unknown'},{roof_surface_range:'under_75'}])assert.equal(estimate(validate(input(change))),null);
  assert.throws(()=>validate(input({roof_surface_range:'225_plus'})));
});

test('client prices are ignored; recipients fixed; messages and test mode correct',()=>{
  const lead=validate(input({price_min:1,price_max:2,to:'attacker@example.org'}));
  const mail=messages(lead,{DELIVERY_MODE:'live'},'id');
  assert.equal(mail[0].textContent,mail[1].textContent);
  assert.deepEqual(mail.map(m=>m.to[0].email),['croizads@outlook.com','y.freycenon@3rservices.fr','prospect@example.org']);
  assert.match(mail[2].textContent,/16 et 20 €/);
  assert.equal(mail[2].replyTo.email,'y.freycenon@3rservices.fr');
  const testMail=messages(lead,{DELIVERY_MODE:'test',TEST_RECIPIENT:'tester@example.org'},'id');
  assert.ok(testMail.every(m=>m.to[0].email==='tester@example.org' && m.replyTo.email==='tester@example.org'));
  assert.throws(()=>messages(lead,{},'id'));
});

test('bilan email is different and never includes a price',()=>{
  const lead=validate({form_type:'bilan',payload:{...payload,first_name:'Test'}});
  const mail=messages(lead,{DELIVERY_MODE:'live'},'id');
  assert.doesNotMatch(mail[2].textContent,/€/);
  assert.match(mail[2].textContent,/demande d’expertise/);
});

test('reject malformed fields and missing consent',()=>{
  for(const change of [{email:'bad'},{phone:'123'},{postcode:'x'},{full_name:'a\nb'},{consent_contact:false},{roof_material:'metal'}]) assert.throws(()=>validate(input(change)));
});

test('acceptance persists 3 jobs; same request cannot duplicate; changed payload conflicts',async(t)=>{
  const {db,env}=setup();t.after(()=>db.close());
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({success:true,hostname:'toiture.3rservices.fr',action:'estimation'});};
  const body={...input(),token:'valid',request_id:crypto.randomUUID()};const waits=[];const ctx={waitUntil:p=>waits.push(p)};
  // Keep outbox dispatch separate to test the acknowledgement boundary.
  globalThis.fetch=async(url)=>url.includes('siteverify')?(calls++,Response.json({success:true,hostname:'toiture.3rservices.fr',action:'estimation'})):Response.json({messageId:'test'});
  assert.equal((await worker.fetch(request(body),env,ctx)).status,202);
  await Promise.all(waits);
  assert.equal((await worker.fetch(request(body),env,ctx)).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mail_jobs').get().n,3);
  assert.equal(calls,1);
  assert.equal((await worker.fetch(request({...body,payload:{...body.payload,email:'other@example.org'}}),env,ctx)).status,409);
});

test('Turnstile hostname/action and origin are enforced, no database entry on rejection',async(t)=>{
  const {db,env}=setup();t.after(()=>db.close());const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const body={...input(),token:'bad',request_id:crypto.randomUUID()};
  for(const check of [{success:false},{success:true,hostname:'evil.example',action:'estimation'},{success:true,hostname:'toiture.3rservices.fr',action:'bilan'}]){
    globalThis.fetch=async()=>Response.json(check);
    assert.equal((await worker.fetch(request(body),env,{})).status,403);
  }
  assert.equal((await worker.fetch(request(body,'https://evil.example'),env,{})).status,403);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM leads').get().n,0);
});

test('outbox sends once and isolates uncertain failures without unsafe automatic retry',async(t)=>{
  const {db,env}=setup();t.after(()=>db.close());const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  db.prepare('INSERT INTO mail_jobs(id,lead_id,message,next_attempt,updated) VALUES(?,?,?,?,?)').run('one','lead','{}',0,0);
  let sends=0;globalThis.fetch=async()=>{sends++;throw new Error('network');};
  await deliver(env);await deliver(env);
  assert.equal(sends,1);assert.equal(db.prepare('SELECT status FROM mail_jobs').get().status,'review');
});

test('explicit rate limit schedules a later attempt instead of losing request',async(t)=>{
  const {db,env}=setup();t.after(()=>db.close());const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  db.prepare('INSERT INTO mail_jobs(id,lead_id,message,next_attempt,updated) VALUES(?,?,?,?,?)').run('one','lead','{}',0,0);
  globalThis.fetch=async()=>new Response('',{status:429});await deliver(env);
  const job=db.prepare('SELECT * FROM mail_jobs').get();assert.equal(job.status,'pending');assert.ok(job.next_attempt>Date.now());
});
