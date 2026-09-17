const ORIGIN = 'https://toiture.3rservices.fr';
const HOST = 'toiture.3rservices.fr';
const SENDER = { name:'3R Services', email:'y.freycenon@3rservices.fr' };
const RANGES = ['75_125','125_175','175_225','225_300','300_plus','under_75','unknown'];
const MATERIALS = ['terre_cuite_ste_foy','beton','unknown'];
const HYDRO = ['incolore','colore','colore_isolant','unknown'];
const SURFACES = { '75_125':'75 à moins de 125 m²', '125_175':'125 à moins de 175 m²', '175_225':'175 à moins de 225 m²', '225_300':'225 à 300 m²', '300_plus':'Plus de 300 m²', under_75:'Moins de 75 m²', unknown:'Je ne sais pas' };
const LABELS = { terre_cuite_ste_foy:'Terre cuite Ste Foy', beton:'Béton', unknown:'Je ne sais pas', incolore:'Incolore', colore:'Coloré', colore_isolant:'Coloré isolant' };
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function validate(body) {
  if (!body || !['bilan','estimation'].includes(body.form_type)) throw new Error('invalid');
  const p = body.payload;
  if (!p || typeof p !== 'object') throw new Error('invalid');
  const text = (value, max) => {
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('invalid');
    return value.trim();
  };
  const name = text(body.form_type === 'bilan' ? p.first_name : p.full_name, 120);
  const email = text(p.email, 254).toLowerCase();
  const phone = text(p.phone, 30).replace(/[\s().-]/g, '');
  const postcode = text(p.postcode, 5);
  if (!name || !EMAIL.test(email) || !/^\+?\d{9,15}$/.test(phone) || !/^\d{5}$/.test(postcode) || !RANGES.includes(p.roof_surface_range)) throw new Error('invalid');
  let material = null, hydrofuge = null;
  if (body.form_type === 'estimation') {
    if (!MATERIALS.includes(p.roof_material) || p.consent_contact !== true) throw new Error('invalid');
    material = p.roof_material;
    if (material === 'beton') {
      if (!HYDRO.includes(p.hydrofuge_type)) throw new Error('invalid');
      hydrofuge = p.hydrofuge_type;
    }
  }
  // Only retain necessary lead fields; never trust a price supplied by the browser.
  return { form_type:body.form_type, name, email, phone, postcode, surface:p.roof_surface_range, material, hydrofuge };
}

export function estimate(lead) {
  const i = RANGES.indexOf(lead.surface);
  if (lead.form_type !== 'estimation' || i < 0 || i > 4 || lead.material === 'unknown') return null;
  if (lead.material === 'terre_cuite_ste_foy') return { min:i >= 3 ? 16 : 18, max:22 };
  if (lead.material !== 'beton') return null;
  const prices = { incolore:[i === 4 ? 15 : 16,20], colore:[i === 4 ? 23 : 25,30], colore_isolant:[i === 4 ? 28 : 30,35], unknown:[i >= 3 ? 16 : 18,35] };
  const price = prices[lead.hydrofuge];
  return price ? { min:price[0], max:price[1] } : null;
}

export function messages(lead, env, id) {
  const price = estimate(lead);
  const priceText = price ? `Entre ${price.min} et ${price.max} €/m² HT (estimation indicative).` : 'Vos réponses ne nous permettent pas d’établir une estimation. Nous vous rappellerons sous peu pour préciser votre besoin et répondre à vos questions.';
  const isEstimate = lead.form_type === 'estimation';
  const opening = isEstimate
    ? `Votre demande d’estimation est bien reçue.\n\n${priceText}\n\nPour connaître le prix exact, nous proposons une expertise toiture gratuite et sans engagement.`
    : 'Votre demande d’expertise toiture gratuite et sans engagement est bien reçue.';
  const availability = ' Il nous reste quelques places pour cette expertise ce mois-ci avant d’être complets.';
  const prospect = `Bonjour,\n\n${opening}${availability}\n\nNous vous appellerons depuis le 07 83 06 09 72 pour répondre à vos questions et voir si elle serait utile pour vous.\n\nÀ quels horaires préférez-vous être rappelé ? Vous pouvez nous les indiquer en réponse à cet email pour éviter que nous vous dérangions.\n\nÀ bientôt,\nL’équipe 3R Services`;
  const summary = `Nouvelle demande : ${isEstimate ? 'estimation' : 'expertise'}\nRéférence : ${id}\n\nNom : ${lead.name}\nEmail : ${lead.email}\nTéléphone : ${lead.phone}\nCode postal : ${lead.postcode}\nSurface : ${SURFACES[lead.surface]}\nMatériau : ${LABELS[lead.material] || 'Non demandé'}\nHydrofuge : ${LABELS[lead.hydrofuge] || 'Non demandé'}${isEstimate ? `\nEstimation : ${priceText}` : ''}`;
  const live = env.DELIVERY_MODE === 'live';
  if (!live && !EMAIL.test(env.TEST_RECIPIENT || '')) throw new Error('test_recipient_required');
  return [
    { to:'croizads@outlook.com', subject:'Nouvelle demande toiture — 3R Services', text:summary, reply:lead.email },
    { to:SENDER.email, subject:'Nouvelle demande toiture — 3R Services', text:summary, reply:lead.email },
    { to:lead.email, subject:isEstimate ? 'Votre estimation toiture — 3R Services' : 'Votre demande d’expertise toiture — 3R Services', text:prospect, reply:SENDER.email }
  ].map((m, i) => ({ sender:SENDER, to:[{ email:live ? m.to : env.TEST_RECIPIENT }], replyTo:{ email:live ? m.reply : env.TEST_RECIPIENT }, subject:(live ? '' : `[TEST ${i + 1}/3] `) + m.subject, textContent:m.text, tags:['lp-toiture',live ? 'production' : 'test'] }));
}

async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
}

export async function deliver(env) {
  const now = Date.now();
  // A terminated send may already have reached Brevo. Never blindly resend it.
  await env.DB.prepare("UPDATE mail_jobs SET status='review', error='interrupted_send' WHERE status='sending' AND updated < ?").bind(now - 120000).run();
  const { results } = await env.DB.prepare("SELECT * FROM mail_jobs WHERE status='pending' AND next_attempt <= ? ORDER BY next_attempt LIMIT 6").bind(now).all();
  for (const job of results) {
    const lock = await env.DB.prepare("UPDATE mail_jobs SET status='sending', attempts=attempts+1, updated=? WHERE id=? AND status='pending'").bind(Date.now(), job.id).run();
    if (!lock.meta.changes) continue;
    let status='review', error='uncertain_delivery', provider=null, delay=0;
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'api-key':env.BREVO_API_KEY },
        body:job.message, signal:AbortSignal.timeout(15000)
      });
      if (response.ok) {
        status='sent'; error=null;
        try { provider=(await response.json()).messageId || null; } catch {}
      } else if (response.status === 429 && job.attempts < 12) {
        status='pending'; error='rate_limit'; delay=3600000;
      } else {
        error=`brevo_${response.status}`;
      }
    } catch { /* Ambiguous network outcomes require checking Brevo logs before retrying. */ }
    await env.DB.prepare('UPDATE mail_jobs SET status=?, error=?, provider_id=?, next_attempt=?, updated=? WHERE id=?')
      .bind(status,error,provider,Date.now()+delay,Date.now(),job.id).run();
  }
}

async function handle(request, env, ctx) {
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
  if (origin === ORIGIN) headers['Access-Control-Allow-Origin'] = ORIGIN;
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
  if (origin !== ORIGIN) return reply(403,{ ok:false });
  if (new URL(request.url).pathname !== '/submit') return reply(404,{ ok:false });
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ ...headers, 'Access-Control-Allow-Methods':'POST', 'Access-Control-Allow-Headers':'Content-Type' } });
  if (request.method !== 'POST') return reply(405,{ ok:false });
  if (!env.DB || !env.BREVO_API_KEY || !env.TURNSTILE_SECRET_KEY || !['live','test'].includes(env.DELIVERY_MODE)) return reply(503,{ ok:false });
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return reply(415,{ ok:false });
  if (Number(request.headers.get('Content-Length')) > 16000) return reply(413,{ ok:false });
  let body, lead;
  try {
    // Bound actual bytes even when Content-Length is missing.
    const reader=request.body.getReader(); let size=0; const chunks=[];
    for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>16000){await reader.cancel();return reply(413,{ok:false});} chunks.push(value); }
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    body=JSON.parse(new TextDecoder().decode(bytes)); lead=validate(body);
    if (!/^[a-f0-9-]{36}$/.test(body.request_id) || typeof body.token !== 'string' || !body.token || body.token.length>2048) throw new Error('invalid');
  } catch { return reply(400,{ ok:false }); }
  const fingerprint=await hash(JSON.stringify(lead));
  const old=await env.DB.prepare('SELECT fingerprint FROM leads WHERE id=?').bind(body.request_id).first();
  if (old) return old.fingerprint===fingerprint ? reply(200,{ok:true,accepted:true}) : reply(409,{ok:false});
  const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash=await hash(env.TURNSTILE_SECRET_KEY+ip);
  const emailHash=await hash(env.TURNSTILE_SECRET_KEY+lead.email);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE (ip_hash=? AND created>?) OR (email_hash=? AND created>?)')
    .bind(ipHash,Date.now()-3600000,emailHash,Date.now()-86400000).first();
  if (count.n >= 5) return reply(429,{ok:false});
  const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(10000),
    body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:body.token,remoteip:ip})
  });
  const check=await verification.json();
  if (!verification.ok || !check.success || check.hostname!==HOST || check.action!==lead.form_type) return reply(403,{ok:false});
  const mail=messages(lead,env,body.request_id);
  const now=Date.now();
  // Atomic persistence: acceptance means the lead AND all three outbox jobs exist.
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO leads(id,fingerprint,email_hash,ip_hash,payload,created) VALUES(?,?,?,?,?,?)').bind(body.request_id,fingerprint,emailHash,ipHash,JSON.stringify(lead),now),
      ...mail.map((m,i)=>env.DB.prepare('INSERT INTO mail_jobs(id,lead_id,message,next_attempt,updated) VALUES(?,?,?,?,?)').bind(`${body.request_id}-${i}`,body.request_id,JSON.stringify(m),now,now))
    ]);
  } catch (e) {
    const existing=await env.DB.prepare('SELECT fingerprint FROM leads WHERE id=?').bind(body.request_id).first();
    if (!existing || existing.fingerprint!==fingerprint) throw e;
  }
  ctx.waitUntil(deliver(env).catch(()=>console.error('outbox_delivery_failed')));
  return reply(202,{ok:true,accepted:true});
}

export default {
  async fetch(request,env,ctx) {
    try { return await handle(request,env,ctx); }
    catch { return new Response(JSON.stringify({ok:false}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(request.headers.get('Origin')===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN}:{})}}); }
  },
  async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      await deliver(env);
      const cutoff=Date.now()-30*86400000;
      await env.DB.batch([
        env.DB.prepare('DELETE FROM mail_jobs WHERE lead_id IN (SELECT id FROM leads WHERE created < ?)').bind(cutoff),
        env.DB.prepare('DELETE FROM leads WHERE created < ?').bind(cutoff)
      ]);
      const issues=await env.DB.prepare("SELECT COUNT(*) AS n FROM mail_jobs WHERE status='review'").first();
      if(issues.n) console.error('outbox_manual_review_required',issues.n);
    })());
  }
};
