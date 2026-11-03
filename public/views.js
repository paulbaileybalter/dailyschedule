// HTML builders for the three views. Pure functions of state -> string.
import { CATS } from '/ops.js';
import { S, esc, todayISO, longDate, shortDate, dm, wkday, wkdayLong, hm, nextWD, prevWD, isWeekend, docFor, dayOf, weekLoaded,
  mondayOf, addDays, dayStats, catOf, carryList, ls } from '/core.js';

const P = (d) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
export const I = {
  left: P('<path d="m15 18-6-6 6-6"/>'), right: P('<path d="m9 18 6-6-6-6"/>'),
  grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>', plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', cross: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>', dash: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  cal: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
};

const GLASS_BOTTOM = 158, GLASS_TOP = 36;
export const liquidY = (pct) => GLASS_BOTTOM - pct * (GLASS_BOTTOM - GLASS_TOP);
const SMILE = 'M136.3,70.4l-9.4-9.4c-1.6-1.6-4.3-1.6-6,0-1.6,1.6-1.6,4.3,0,6l2.3,2.3c-9.6,13.2-25.2,21.7-42.7,21.7s-33.1-8.6-42.7-21.8l2.3-2.3c1.6-1.6,1.6-4.3,0-6-1.6-1.6-4.3-1.6-6,0l-9.4,9.4c-1.6,1.6-1.6,4.3,0,6,.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2l1.1-1.1c11.2,14.7,28.9,24.2,48.7,24.2s37.5-9.5,48.7-24.2l1.1,1.1c.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2c1.6-1.6,1.6-4.3,0-6';

export function glass(pct, full) {
  return `<svg class="glass ${full ? 'full' : ''}" viewBox="0 0 120 172" role="img" aria-label="Pint glass that fills as tasks are completed">
  <defs><clipPath id="gclip"><path d="M16 16H104L94.5 154Q94 158 90 158H30Q26 158 25.5 154Z"/></clipPath>
  <linearGradient id="bgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD637"/><stop offset="1" stop-color="#FDAA63"/></linearGradient></defs>
  <g clip-path="url(#gclip)"><rect width="120" height="172" fill="#FAFAF7"/>
   <g id="liquid" data-pct="${pct}" style="transform:translateY(${liquidY(S.lastPct || 0)}px);opacity:${S.lastPct ? 1 : 0}">
    <rect width="120" height="172" fill="url(#bgrad)"/>
    <path d="M0 2V-10Q8 -20 18 -11T38 -11T58 -11T78 -11T98 -11T120 -12V2Z" fill="#F1EB9C"/>
    <path d="M0 2V-3Q10 -9 20 -3T40 -3T60 -3T80 -3T100 -3T120 -3V2Z" fill="#fff" opacity=".55"/>
    <circle class="bub" cx="36" cy="140" r="2.6" fill="#fff" opacity=".8" style="animation-duration:3.6s"/>
    <circle class="bub" cx="58" cy="150" r="1.8" fill="#fff" opacity=".8" style="animation-duration:4.4s;animation-delay:-1.2s"/>
    <circle class="bub" cx="76" cy="135" r="3" fill="#fff" opacity=".8" style="animation-duration:3.9s;animation-delay:-2.1s"/>
    <circle class="bub" cx="48" cy="145" r="1.5" fill="#fff" opacity=".8" style="animation-duration:5s;animation-delay:-.6s"/>
   </g>
   <g id="glassSmile" transform="translate(41,72) scale(.37)"><path fill="#000" stroke="none" d="${SMILE}"/></g></g>
  <path d="M12 12H108L97.6 154.6Q96.8 162 90 162H30Q23.2 162 22.4 154.6Z" fill="none" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/></svg>`;
}

/* ---------- a task row (day view and week columns) ---------- */
export function rowHtml(t, date) {
  const col = CATS[catOf(t)].color;
  const editing = S.editing && S.editing.id === t.id && S.editing.date === date;
  const state = t.done ? 'done' : t.skip ? 'skip' : '';
  const meeting = /meeting/i.test(t.text) ? ' meeting' : '';
  const qm = qMatch(t), qcls = qActive() ? (qm ? ' qhit' : ' qdim') : '';
  const noteHit = qm && t.note && t.note.toLowerCase().includes(S.q.trim().toLowerCase());
  const bits = [];
  if (t.done && t.doneAt) bits.push(`<span>Done ${hm(t.doneAt)}</span>`);
  if (t.skip) bits.push('<span>Not needed</span>');
  const line = editing
    ? `<input id="edit" class="edit" data-keep="edit" value="${esc((t.time ? t.time + ' ' : '') + t.text)}" maxlength="320" aria-label="Edit task">`
    : `${t.time ? `<span class="time">${t.time}</span>` : ''}<span class="txt" data-act="edit" tabindex="0">${qActive() ? markIt(t.text, S.q) : esc(t.text)}</span>`;
  return `<li class="row ${state}${meeting}${qcls}" data-id="${t.id}" data-date="${date}" style="--cat:${col}">
    <span class="grip" aria-hidden="true" title="Drag to reorder, or drop on another day">${I.grip}</span>
    <div class="marks">
      <button class="mk xpa" data-act="xpa" aria-pressed="${t.done}" title="Done" aria-label="Done: ${esc(t.text)}">${I.check}</button>
      <button class="mk hazy" data-act="hazy" aria-pressed="${t.skip}" title="Not needed" aria-label="Not needed: ${esc(t.text)}">${I.cross}</button>
    </div>
    <div class="body"><div class="line">${line}</div>
      <input class="tnote-in${noteHit ? ' qnote' : ''}" data-keep="n-${date}-${t.id}" data-note="${t.id}" data-date="${date}" placeholder="Add a note…" value="${esc(t.note)}" maxlength="500" aria-label="Note for: ${esc(t.text)}">
      ${bits.length ? `<div class="sub">${bits.join('')}</div>` : ''}</div>
    <button class="kebab" data-act="menu" aria-label="Task options">${I.dots}</button>
    <button class="plus" data-act="ins" title="Add a task underneath" aria-label="Add a task below: ${esc(t.text)}">${I.plus}</button></li>`;
}
export function searchBar(date0, dates) {
  let n = 0;
  if (qActive()) for (const d of dates) n += dayOf(d).tasks.filter(qMatch).length;
  return `<div class="qbar mini"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input type="search" data-keep="q" data-q placeholder="Search…" value="${esc(S.q)}" aria-label="Search tasks and notes" autocomplete="off">
    ${qActive() ? `<span class="count">${n} match${n === 1 ? '' : 'es'} here</span><button class="btn small ghost" data-act="q-hist" title="Search all history">All history</button><button class="btn small ghost icon" data-act="q-clear" aria-label="Clear search" style="width:28px;height:28px">✕</button>` : ''}</div>`;
}
export const legend = () => `<span class="legend"><i class="mk xpa" aria-pressed="true">${I.check}</i> Done <i class="mk hazy" aria-pressed="true">${I.cross}</i> Not needed</span>`;

export function carryBanner() {
  const today = todayISO();
  if (ls.get('pds.carry.' + today) === '1') return '';
  const list = carryList();
  if (!list || !list.length) return '';
  return `<section class="banner" aria-label="Unfinished tasks">
      <div class="txt2"><b>Left in the fermenter — ${list.length} unfinished task${list.length > 1 ? 's' : ''} from earlier</b>
      <ul class="carry">${list.slice(0, 6).map((x) => `<li><span>${esc(x.t.text)}</span><small class="muted">${shortDate(x.date)}</small><button class="btn small" data-act="carry-one" data-date="${x.date}" data-id="${x.t.id}">Bring to today</button></li>`).join('')}${list.length > 6 ? `<li class="muted">…and ${list.length - 6} more</li>` : ''}</ul></div>
      <div style="display:flex;gap:8px"><button class="btn small primary" data-act="carry-all">Bring all to today</button><button class="btn small ghost" data-act="carry-dismiss">Dismiss</button></div></section>`;
}
export const importBanner = () => (!S.config.imported && S.configLoaded && !S.importDismissed
  ? `<section class="banner teal"><div class="txt2"><b>Bring in your spreadsheet history</b>Your past weeks (March – November) are ready to import so you can look back on what you did. Nothing is overwritten.</div>
       <div style="display:flex;gap:8px"><button class="btn small primary" data-act="import">Import history</button><button class="btn small ghost" data-act="import-dismiss">Not now</button></div></section>` : '');
const visibleTasks = (day) => day.tasks.filter((t) => !(S.hideDone && (t.done || t.skip)));
// The task list for one day, with the "new task" box opened under whichever tile's + was clicked.
const draftRow = (date) => `<li class="row draft"><input id="ins" class="edit" data-keep="ins" data-ins="${date}" placeholder="New task… e.g. 1330 Team catch-up" maxlength="300" aria-label="New task"></li>`;
function listHtml(day, date) {
  const ins = S.inserting && S.inserting.date === date ? S.inserting.after : undefined;
  const out = visibleTasks(day).map((t) => rowHtml(t, date) + (ins === t.id ? draftRow(date) : '')).join('');
  const tail = ins === '__end' ? draftRow(date) : '';
  const empty = !day.tasks.length && !tail ? `<li class="addfirst"><button class="btn small ghost" data-act="ins-end" data-date="${date}">${I.plus} Add a task</button></li>` : '';
  return `<ul class="list" data-zone="${date}">${out}${tail}${empty}</ul>`;
}

/* ---------- DAY ---------- */
export function viewDay() {
  const date = S.date, w = mondayOf(date), today = todayISO(), isToday = date === today;
  const day = dayOf(date), st = dayStats(day), loaded = weekLoaded(w);
  const pct = st.pct, allDone = st.total > 0 && st.open === 0;
  S.pct = pct;
  const now = new Date(); const nowHM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const next = isToday ? day.tasks.filter((t) => t.time && !t.done && !t.skip && t.time >= nowHM).sort((a, b) => a.time.localeCompare(b.time))[0] : null;
  const p = prevWD(date), n = nextWD(date);

  const list = visibleTasks(day);
  const hidden = day.tasks.length - list.length;
  const tasksCard = `<section class="card c-teal"><div class="bar"></div>
    <div class="head"><h3>Tasks</h3><span class="count">${st.done + st.skip} / ${st.total}</span><span class="sp"></span>
      <button class="btn small ghost" data-act="hidedone" aria-pressed="${S.hideDone}">${S.hideDone ? 'Show completed' : 'Hide completed'}</button>
      <button class="btn small ghost icon" data-act="daymenu" aria-label="Day options" style="width:32px;height:32px">${I.dots}</button></div>
    ${!loaded ? '<div class="empty">Loading…</div>' : `${listHtml(day, date)}
      ${!day.tasks.length ? '<div class="empty">Nothing on tap for this day yet.</div>' : hidden && !list.length ? `<div class="empty">All ${hidden} tasks are complete.</div>` : ''}`}
</section>`;

  const projs = S.config.projects;
  const side = `<aside class="stack">
    <section class="card c-purple"><div class="bar"></div><div class="head"><h3>Ongoing brews</h3><span class="muted" style="font-size:12px">projects</span></div>
      ${projs.map((pr) => { const on = day.tasks.some((t) => t.src === 'p:' + pr.id);
        return `<div class="proj ${pr.done ? 'done' : ''}" data-pid="${pr.id}"><button class="chk" role="checkbox" aria-checked="${pr.done}" data-act="proj-done" aria-label="Mark project complete">${pr.done ? I.check : ''}</button>
        <span class="ptxt">${esc(pr.text)}</span><button class="btn small ${on ? 'ghost' : ''}" data-act="proj-today" ${on || pr.done ? 'disabled' : ''}>${on ? 'On list ✓' : '+ Day'}</button>
        <button class="kebab" data-act="proj-menu" aria-label="Project options">${I.dots}</button></div>`; }).join('')}
      <div class="addrow"><input data-keep="proj-add" data-pa placeholder="Add an ongoing project…" maxlength="300" aria-label="Add project"><button class="btn small teal" data-act="proj-add">Add</button></div></section>
    <section class="card c-sky"><div class="bar"></div><div class="head"><h3>Brewer’s log</h3><span class="muted" style="font-size:12px">notes for the day</span></div>
      <textarea class="notes" data-keep="dnote" data-dnote="${date}" placeholder="Handover notes, decisions, things to remember…" maxlength="2000" aria-label="Notes for the day">${esc(day.note)}</textarea></section></aside>`;

  return `<div class="daynav">
    <button class="nbtn" data-zone="${p}" data-act="goto" data-date="${p}" aria-label="Previous day">${I.left}<span>${shortDate(p)}</span></button>
    <div class="title"><h2>${longDate(date)}</h2>${isToday ? '<span class="tag">Today</span>' : `<button class="tag alt" data-act="today" style="border:0;cursor:pointer">Back to today</button>`}
      <button class="btn small ghost icon" data-act="pickdate" aria-label="Pick a date" style="width:30px;height:30px;vertical-align:middle">${I.cal}</button></div>
    <button class="nbtn" data-zone="${n}" data-act="goto" data-date="${n}" aria-label="Next day"><span>${shortDate(n)}</span>${I.right}</button></div>
  <div style="display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-bottom:12px">${legend()}${searchBar(date, [date])}</div>
  <section class="card c-gold"><div class="bar"></div><div class="hero-body">${glass(pct, allDone)}
    <div class="hero-main"><div class="kicker">${isToday ? 'On tap today' : 'On tap'}</div>
      <div class="counter"><span class="big">${st.done}<small>/${st.total}</small></span><span class="lbl">tasks done</span>
        <span class="status ${allDone ? 'ok' : ''}">${allDone ? 'Pint’s full' : st.open + ' to go'}</span></div>
      <div class="beerbar"><i style="width:${pct * 100}%"></i></div>
      <div class="chips">${st.skip ? `<span class="chip">${st.skip} not needed</span>` : ''}${next ? `<span class="chip next">Next up · ${next.time} ${esc(next.text.slice(0, 40))}</span>` : ''}</div></div></div></section>
  ${allDone ? `<div class="done-banner"><svg viewBox="0 0 161 161" width="30" height="30"><path fill="#47D7AC" stroke="none" d="${SMILE}"/></svg>Cheers — everything for this day is sorted.</div>` : ''}
  ${importBanner()}${isToday ? carryBanner() : ''}<div class="cols">${tasksCard}${side}</div>`;
}

/* ---------- WEEK ---------- */
export function viewWeek() {
  const ws = S.weekStart, today = todayISO(), n = S.showWeekend ? 7 : 5;
  const days = Array.from({ length: n }, (_, i) => addDays(ws, i));
  const loaded = weekLoaded(ws);
  let done = 0, total = 0;
  const cols = days.map((d) => {
    const day = dayOf(d), st = dayStats(day); done += st.done + st.skip; total += st.total;
    return `<section class="col ${d === today ? 'today' : ''}" data-col="${d}">
      <button class="colhead" data-zone="${d}" data-act="goto" data-date="${d}"><b>${wkdayLong(d)}</b><span>${dm(d)}</span><span style="float:right">${st.done + st.skip}/${st.total}</span><div class="mini"><i style="width:${st.pct * 100}%"></i></div></button>
      ${listHtml(day, d)}</section>`;
  }).join('');
  const thisWk = mondayOf(today) === ws;
  return `<div class="weeknav"><button class="btn ghost" data-act="week-step" data-n="-7" aria-label="Previous week">${I.left}</button>
    <h2>${dm(ws)} – ${dm(addDays(ws, n - 1))} ${addDays(ws, 4).slice(0, 4)}</h2>
    <button class="btn ghost" data-act="week-step" data-n="7" aria-label="Next week">${I.right}</button>
    ${thisWk ? '' : '<button class="btn small" data-act="week-now">This week</button>'}
    <span class="sp"></span>${legend()}${searchBar(ws, days)}<span class="count">${done} / ${total} done</span>
    <button class="btn small" data-act="export-week" title="Download this week as a spreadsheet (CSV)">Export CSV</button>
    <button class="btn small ghost" data-act="weekend" aria-pressed="${S.showWeekend}">${S.showWeekend ? 'Hide' : 'Show'} weekend</button>
    <button class="btn small ghost" data-act="hidedone">${S.hideDone ? 'Show completed' : 'Hide completed'}</button></div>
  ${importBanner()}${thisWk ? carryBanner() : ''}
  ${loaded ? `<div class="weekgrid" style="--n:${n}">${cols}</div>` : '<div class="empty">Loading…</div>'}`;
}

/* ---------- HISTORY ---------- */
const hasTasks = (doc) => Object.values(doc.days).some((d) => d.tasks.length);
const weekDoc = (start, fetched) => (weekLoaded(start) ? docFor(start) : fetched);
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const markIt = (text, q) => { q = (q || '').trim(); return q.length < 1 ? esc(text) : String(text).split(new RegExp('(' + reEsc(q) + ')', 'ig')).map((part, i) => (i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part))).join(''); };
const qActive = () => S.q.trim().length >= 2;
const qMatch = (t) => qActive() && (t.text + ' ' + t.note).toLowerCase().includes(S.q.trim().toLowerCase());

function searchResults() {
  const h = S.history, q = h.query.trim();
  if (h.allLoading || !h.all) return '<div class="card"><div class="empty">Searching…</div></div>';
  const hits = [];
  for (const { start, doc } of h.all) {
    const d = weekDoc(start, doc);
    for (const [date, day] of Object.entries(d.days)) {
      for (const t of day.tasks) {
        const state = t.done ? 'done' : t.skip ? 'skip' : 'open';
        if (h.filter !== 'all' && h.filter !== state) continue;
        if ((t.text + ' ' + t.note).toLowerCase().includes(q.toLowerCase())) hits.push({ date, t, state });
      }
      if (h.filter === 'all' && day.note && day.note.toLowerCase().includes(q.toLowerCase())) hits.push({ date, note: day.note });
    }
  }
  hits.sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!hits.length) return `<div class="card"><div class="empty">Nothing found for “${esc(q)}”.</div></div>`;
  return `<section class="card"><div class="head"><h3>${hits.length}${hits.length > 200 ? '+' : ''} result${hits.length > 1 ? 's' : ''}</h3><span class="muted" style="font-size:12px">last 40 weeks</span></div>
    ${hits.slice(0, 200).map((x) => `<button class="hit" data-act="goto-day" data-date="${x.date}">${x.t ? `<span class="m ${x.state === 'done' ? 'd' : ''}">${x.state === 'done' ? '✓' : x.state === 'skip' ? '–' : '○'}</span> ${x.t.time ? x.t.time + ' ' : ''}${markIt(x.t.text, q)}` : `📝 ${markIt(x.note, q)}`}<br><small>${longDate(x.date)}${x.t && x.t.done && x.t.doneAt ? ' · done ' + hm(x.t.doneAt) : ''}</small></button>`).join('')}</section>`;
}

export function viewHistory() {
  const h = S.history, today = todayISO();
  const shown = h.weeks.map((x) => ({ start: x.start, doc: weekDoc(x.start, x.doc) }));
  const sum = (doc) => Object.values(doc.days).reduce((a, d) => { const s = dayStats(d); a.done += s.done; a.skip += s.skip; a.total += s.total; return a; }, { done: 0, skip: 0, total: 0 });
  const tw = shown[0] ? sum(shown[0].doc) : { done: 0, total: 0 }, lw = shown[1] ? sum(shown[1].doc) : { done: 0, total: 0 };
  const four = shown.slice(0, 4).reduce((a, x) => a + sum(x.doc).done, 0);
  const stats = `<div class="stats"><div class="card stat"><b>${tw.done}</b><span>tasks done this week · ${tw.total} planned</span></div><div class="card stat"><b>${lw.done}</b><span>done last week · ${lw.total} planned</span></div><div class="card stat"><b>${four}</b><span>done in the last 4 weeks</span></div></div>`;
  const filters = ['all', 'done', 'skip', 'open'].map((f) => `<button data-act="hist-filter" data-f="${f}" aria-pressed="${h.filter === f}">${{ all: 'All', done: 'Done', skip: 'Not needed', open: 'Not done' }[f]}</button>`).join('');
  const bar = `<div class="searchbar"><input type="search" data-keep="hsearch" data-hsearch placeholder="Search everything you’ve done — e.g. “Orora” or “newsletter”" value="${esc(h.query)}" aria-label="Search history"><div class="seg" role="group" aria-label="Filter">${filters}</div></div>`;
  if (h.query.trim().length >= 2) return stats + bar + searchResults();

  const cards = shown.filter((x) => hasTasks(x.doc) || x.start === mondayOf(today)).map(({ start, doc }) => {
    const s = sum(doc); const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i)).filter((d, i) => i < 5 || (doc.days[d] && doc.days[d].tasks.length));
    return `<article class="card wk"><div class="head"><h3>Week of ${dm(start)}</h3><span class="muted" style="font-size:12px">${dm(start)} – ${dm(addDays(start, 4))}</span><span class="sp"></span>
      <span class="count">${s.done} done${s.skip ? ` · ${s.skip} not needed` : ''}${s.total - s.done - s.skip ? ` · ${s.total - s.done - s.skip} not done` : ''}</span><button class="btn small" data-act="open-week" data-w="${start}">Open week</button></div>
      <div class="daycells">${dates.slice(0, 5).map((d) => { const st = dayStats(doc.days[d]); return `<button class="daycell" style="--p:${st.pct}" data-act="goto-day" data-date="${d}"><b>${wkday(d)} ${dm(d)}</b><span>${st.total ? st.done + st.skip + ' / ' + st.total : '—'}</span></button>`; }).join('')}</div>
      <details><summary>Show what I did</summary>${dates.map((d) => { const day = doc.days[d]; if (!day || (!day.tasks.length && !day.note)) return ''; return `<h4>${shortDate(d)}</h4>${day.note ? `<p class="muted" style="margin:2px 0;font-size:13px">📝 ${esc(day.note)}</p>` : ''}<ul class="hl">${day.tasks.map((t) => `<li><span class="m ${t.done ? 'd' : ''}">${t.done ? '✓' : t.skip ? '–' : '○'}</span><span style="${t.done ? '' : 'color:var(--muted)'}">${t.time ? t.time + ' ' : ''}${esc(t.text)}</span></li>`).join('')}</ul>`; }).join('')}</details></article>`;
  }).join('');
  return stats + bar + (cards || (h.loading ? '' : '<div class="card"><div class="empty">No history yet.</div></div>')) +
    (h.loading ? '<div class="empty">Loading…</div>' : h.exhausted ? '<p class="empty">That’s everything on record.</p>' : '<div style="text-align:center"><button class="btn" data-act="hist-more">Load earlier weeks</button></div>');
}
