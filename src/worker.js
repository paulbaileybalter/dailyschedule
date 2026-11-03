// Paul's Daily Schedule Checklist — Cloudflare Worker.
//
//  * Password gate in front of the whole site (nothing is served until you're signed in).
//  * Your schedule lives in Workers KV (binding: SCHEDULE).
//  * The password can come from either place:
//      - KV key "auth" (a salted hash — set by "Change password" inside the app, or with tools/hash-password.mjs), or
//      - the SITE_PASSWORD secret (used until a KV password exists).
//
// Environment (Worker -> Settings -> Variables and Secrets):
//   SITE_PASSWORD   secret — the starting password
//   SESSION_SECRET  secret, optional — long random string used to sign login cookies
//
// KV keys:
//   wk:<Monday>   one week of tasks      {ver, days:{date:{tasks,note,seeded}}}
//   config        {routine, projects, imported}
//   auth          {salt, hash}  (PBKDF2-SHA256)

import { stripNecessary, applyOps, normaliseWeek, emptyWeek, isMonday, validDate, addDays, validId } from '../public/ops.js';
import { DEFAULT_ROUTINE, DEFAULT_PROJECTS } from './defaults.js';

const COOKIE = 'bal_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30; // stay signed in for 30 days
const PUBLIC_PATHS = new Set(['/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.json', '/robots.txt']);
const PUBLIC_PREFIXES = ['/fonts/'];
const PBKDF2_ITER = 100000;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function pbkdf2Hex(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
const randomHex = (bytes) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

async function getAuth(env) {
  if (!env.SCHEDULE) return null;
  try {
    const a = await env.SCHEDULE.get('auth', 'json');
    return a && a.salt && a.hash ? a : null;
  } catch (e) { return null; }
}
async function passwordOk(input, env, auth) {
  if (auth) return safeEqual(await pbkdf2Hex(input, auth.salt), auth.hash);
  if (env.SITE_PASSWORD) {
    const [x, y] = await Promise.all([hmacHex('balter-compare', input), hmacHex('balter-compare', env.SITE_PASSWORD)]);
    return safeEqual(x, y);
  }
  return false;
}
// Changing the password (salt) automatically signs every other device out.
const sessionSecret = (env, auth) => (env.SESSION_SECRET || env.SITE_PASSWORD || 'kv-only') + ':' + (auth ? auth.salt : '');

function getCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
async function makeToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return `${exp}.${await hmacHex(secret, 'bal-session:' + exp)}`;
}
async function tokenValid(token, secret) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, await hmacHex(secret, 'bal-session:' + exp));
}
const cookieHeader = (value, maxAge) => `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

function loginPage(error) {
  const smile = 'M136.3,70.4l-9.4-9.4c-1.6-1.6-4.3-1.6-6,0-1.6,1.6-1.6,4.3,0,6l2.3,2.3c-9.6,13.2-25.2,21.7-42.7,21.7s-33.1-8.6-42.7-21.8l2.3-2.3c1.6-1.6,1.6-4.3,0-6-1.6-1.6-4.3-1.6-6,0l-9.4,9.4c-1.6,1.6-1.6,4.3,0,6,.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2l1.1-1.1c11.2,14.7,28.9,24.2,48.7,24.2s37.5-9.5,48.7-24.2l1.1,1.1c.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2c1.6-1.6,1.6-4.3,0-6';
  const box = 'M152.5,8.5v144H8.5V8.5h144M161,0H0v161h161V0h0Z';
  return `<!DOCTYPE html>
<html lang="en-AU"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in — Balter Brewing</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#47D7AC">
<style>
@font-face{font-family:'Lexend';src:local('Lexend'),url('/fonts/lexend-latin-wght-normal.woff2') format('woff2');font-weight:100 900;font-display:swap;}
*{box-sizing:border-box;}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#000;font-family:'Lexend','Segoe UI',system-ui,Arial,sans-serif;padding:20px;overflow:hidden;}
.bubbles{position:fixed;inset:0;pointer-events:none;overflow:hidden;}
.bubbles span{position:absolute;bottom:-40px;border-radius:50%;background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.95),rgba(71,215,172,.12));border:1px solid rgba(71,215,172,.28);animation:rise linear infinite;}
@keyframes rise{0%{transform:translateY(0);opacity:0}10%{opacity:.7}100%{transform:translateY(-115vh) scale(1.15);opacity:0}}
@media (prefers-reduced-motion:reduce){.bubbles{display:none}}
.card{position:relative;width:min(400px,100%);background:#fff;border:1px solid #E7E5DE;border-radius:18px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.08);overflow:hidden;}
.stripe{display:flex;height:6px}.stripe i{flex:1}
.in{padding:30px 30px 28px;text-align:center}
.logo{width:72px;height:72px;margin:0 auto 14px;display:block}
.kicker{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#7566A0;font-weight:600}
h1{font-size:21px;margin:6px 0 4px;font-weight:700;letter-spacing:-.01em}
p{margin:0 0 20px;font-size:13.5px;color:#6B685D}
label{display:block;text-align:left;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#6B685D;font-weight:600;margin-bottom:6px}
input{width:100%;border:1.5px solid #E7E5DE;background:#FAFAF7;border-radius:10px;padding:12px 14px;font:inherit;font-size:16px}
input:focus{outline:none;border-color:#47D7AC;background:#fff}
button{margin-top:14px;width:100%;border:none;background:#000;color:#fff;border-radius:10px;padding:13px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s}
button:hover{background:#7566A0}
button:focus-visible,input:focus-visible{outline:2px solid #7566A0;outline-offset:2px}
.err{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:rgba(253,170,99,.25);font-size:13px;font-weight:500;color:#000}
</style></head>
<body>
<div class="bubbles" aria-hidden="true">${[...Array(10)].map((_, i) => `<span style="width:${10 + ((i * 7) % 24)}px;height:${10 + ((i * 7) % 24)}px;left:${(i * 11 + 4) % 100}%;animation-duration:${16 + ((i * 5) % 14)}s;animation-delay:-${(i * 3) % 14}s"></span>`).join('')}</div>
<form class="card" method="POST" action="/login">
  <div class="stripe"><i style="background:#47D7AC"></i><i style="background:#FDAA63"></i><i style="background:#7566A0"></i><i style="background:#99D6EA"></i></div>
  <div class="in">
    <svg class="logo" viewBox="0 0 161 161" aria-hidden="true"><path fill="#47D7AC" d="${smile}"/><path fill="#47D7AC" d="${box}"/></svg>
    <div class="kicker">Balter Brewing</div>
    <h1>Paul’s Daily Schedule</h1>
    <p>Enter the password to continue.</p>
    ${error ? `<div class="err" role="alert">${error}</div>` : ''}
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required maxlength="200">
    <button type="submit">Sign in</button>
  </div>
</form>
</body></html>`;
}

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...extra },
  });

/* ------------------------------------------------------------------ *
 * Schedule API
 * ------------------------------------------------------------------ */
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);

function cleanRoutine(r) {
  const out = {};
  for (let d = 1; d <= 5; d++) {
    const list = r && Array.isArray(r[String(d)]) ? r[String(d)] : [];
    out[String(d)] = list.slice(0, 80).map((it, i) => {
      const o = {
        id: validId(it && it.id) ? it.id : `x${d}${Date.now().toString(36)}${i}`.slice(0, 20),
        text: stripNecessary(clean(it && it.text, 300)),
      };
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test((it && it.time) || '')) o.time = it.time;
      if (it && ['meet', 'stock', 'plan', 'proj', 'gen'].includes(it.cat)) o.cat = it.cat;
      return o;
    }).filter((it) => it.text);
  }
  return out;
}
function cleanProjects(p) {
  return (Array.isArray(p) ? p : []).slice(0, 100)
    .map((it, i) => ({ id: validId(it && it.id) ? it.id : `p${Date.now().toString(36)}${i}`.slice(0, 20), text: stripNecessary(clean(it && it.text, 300)), done: !!(it && it.done) }))
    .filter((it) => it.text);
}
async function loadConfig(env) {
  const c = (await env.SCHEDULE.get('config', 'json')) || {};
  return {
    routine: c.routine ? cleanRoutine(c.routine) : DEFAULT_ROUTINE,
    projects: c.projects ? cleanProjects(c.projects) : DEFAULT_PROJECTS,
    imported: !!c.imported,
  };
}
async function loadWeek(env, monday) {
  return normaliseWeek(await env.SCHEDULE.get('wk:' + monday, 'json'));
}

async function handleConfig(request, env, url) {
  if (request.method === 'GET') return json(await loadConfig(env));
  if (request.method === 'PUT') {
    const body = await readJson(request, url);
    if (body.error) return body.error;
    const cur = await loadConfig(env);
    const next = {
      routine: body.data.routine ? cleanRoutine(body.data.routine) : cur.routine,
      projects: body.data.projects ? cleanProjects(body.data.projects) : cur.projects,
      imported: cur.imported || !!body.data.imported,
    };
    await env.SCHEDULE.put('config', JSON.stringify(next));
    return json(next);
  }
  return json({ error: 'Method not allowed' }, 405);
}

async function readJson(request, url, limit = 120000) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return { error: json({ error: 'Forbidden' }, 403) };
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return { error: json({ error: 'Expected JSON' }, 415) };
  const text = await request.text();
  if (text.length > limit) return { error: json({ error: 'Too large' }, 413) };
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('bad');
    return { data };
  } catch (e) { return { error: json({ error: 'Bad JSON' }, 400) }; }
}

async function handleWeek(request, env, url, monday) {
  if (request.method === 'GET') {
    const doc = await loadWeek(env, monday);
    const ver = url.searchParams.get('ver');
    if (ver && ver === doc.ver) return json({ unchanged: true, ver: doc.ver });
    return json(doc);
  }
  if (request.method === 'PUT') {
    const body = await readJson(request, url);
    if (body.error) return body.error;
    const ops = Array.isArray(body.data.ops) ? body.data.ops.slice(0, 300) : [];
    const doc = await loadWeek(env, monday);
    const routine = ops.some((o) => o && o.op === 'seed') ? (await loadConfig(env)).routine : {};
    applyOps(doc, ops, { monday, routine });
    doc.ver = crypto.randomUUID();
    await env.SCHEDULE.put('wk:' + monday, JSON.stringify(doc));
    return json(doc);
  }
  return json({ error: 'Method not allowed' }, 405);
}

// GET /api/weeks?to=<Monday>&n=8  -> the n weeks ending at <Monday>, newest first (history / search).
async function handleWeeks(env, url) {
  const to = url.searchParams.get('to');
  const n = Math.min(Math.max(parseInt(url.searchParams.get('n') || '8', 10) || 8, 1), 40); // KV reads per request are capped by Cloudflare
  if (!isMonday(to)) return json({ error: 'Bad week' }, 400);
  const mondays = Array.from({ length: n }, (_, i) => addDays(to, -7 * i));
  const docs = await Promise.all(mondays.map((m) => loadWeek(env, m)));
  return json({ weeks: mondays.map((m, i) => ({ start: m, doc: docs[i] })) });
}

// POST /api/import  { weeks:{<Monday>:{days}}, final:bool } — writes only weeks that are still empty, never overwrites.
async function handleImport(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await readJson(request, url, 200000);
  if (body.error) return body.error;
  let written = 0, skipped = 0;
  for (const [monday, w] of Object.entries(body.data.weeks || {}).slice(0, 8)) {
    if (!isMonday(monday)) continue;
    const doc = await loadWeek(env, monday);
    const incoming = normaliseWeek({ days: (w && w.days) || {} });
    let changed = 0;
    for (const [date, day] of Object.entries(incoming.days)) {
      const cur = doc.days[date];
      // keep anything already worked on; only replace days that are empty or hold untouched routine tasks
      const untouched = !cur || (!cur.note && cur.tasks.every((t) => t.src && !t.done && !t.skip && !t.note));
      if (untouched) { doc.days[date] = day; changed++; }
    }
    if (!changed) { skipped++; continue; }
    doc.ver = crypto.randomUUID();
    await env.SCHEDULE.put('wk:' + monday, JSON.stringify(doc));
    written++;
  }
  if (body.data.final) {
    const cur = await loadConfig(env);
    await env.SCHEDULE.put('config', JSON.stringify({ ...cur, imported: true }));
  }
  return json({ written, skipped });
}

async function handlePassword(request, env, url, auth) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await readJson(request, url, 2000);
  if (body.error) return body.error;
  const cur = String(body.data.current || ''), next = String(body.data.next || '');
  if (!(await passwordOk(cur, env, auth))) { await new Promise((r) => setTimeout(r, 800)); return json({ error: 'Current password is incorrect.' }, 403); }
  if (next.length < 8 || next.length > 200) return json({ error: 'New password must be at least 8 characters.' }, 400);
  const salt = randomHex(16);
  const record = { salt, hash: await pbkdf2Hex(next, salt), changed: Date.now() };
  await env.SCHEDULE.put('auth', JSON.stringify(record));
  // sign this device straight back in with the new secret; every other device is signed out
  const token = await makeToken(sessionSecret(env, record));
  return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(token, SESSION_SECONDS) });
}

async function handleApi(request, env, url, auth) {
  if (!env.SCHEDULE) return json({ error: 'KV namespace SCHEDULE is not bound' }, 503);
  try {
    const p = url.pathname;
    if (p === '/api/config') return await handleConfig(request, env, url);
    if (p === '/api/weeks') return await handleWeeks(env, url);
    if (p === '/api/import') return await handleImport(request, env, url);
    if (p === '/api/password') return await handlePassword(request, env, url, auth);
    const m = p.match(/^\/api\/week\/(\d{4}-\d{2}-\d{2})$/);
    if (m && isMonday(m[1])) return await handleWeek(request, env, url, m[1]);
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    return json({ error: 'Storage error — try again', detail: String((e && e.message) || e).slice(0, 200) }, 503);
  }
}

async function handle(request, env, next) {
  const url = new URL(request.url);
  const path = url.pathname;
  const auth = await getAuth(env);

  if (!auth && !env.SITE_PASSWORD) {
    return html('<h1 style="font-family:sans-serif">Site not configured</h1><p style="font-family:sans-serif">Add a <b>SITE_PASSWORD</b> secret in the Worker’s Settings → Variables and Secrets (or store a password hash in KV). See the README.</p>', 500);
  }
  const secret = sessionSecret(env, auth);

  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return next();

  if (path === '/logout') {
    return new Response(null, { status: 303, headers: { Location: '/login', 'Set-Cookie': cookieHeader('', 0), 'Cache-Control': 'no-store' } });
  }

  const signedIn = await tokenValid(getCookie(request, COOKIE), secret);

  if (path === '/login') {
    if (request.method === 'POST') {
      let password = '';
      try { password = String((await request.formData()).get('password') || ''); } catch (e) {}
      if (password && password.length <= 200 && (await passwordOk(password, env, auth))) {
        return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookieHeader(await makeToken(secret), SESSION_SECONDS), 'Cache-Control': 'no-store' } });
      }
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return html(loginPage('That password didn’t work. Please try again.'), 401);
    }
    if (signedIn) return new Response(null, { status: 303, headers: { Location: '/' } });
    return html(loginPage(''));
  }

  if (!signedIn) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return new Response(null, { status: 303, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
    }
    return new Response('Unauthorised', { status: 401 });
  }

  if (path.startsWith('/api/')) return handleApi(request, env, url, auth);

  const response = await next();
  const out = new Response(response.body, response);
  out.headers.set('Cache-Control', 'private, no-cache');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

export default {
  fetch(request, env) {
    return handle(request, env, () => env.ASSETS.fetch(request));
  },
};
