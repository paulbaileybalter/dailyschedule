// Rendering loop, events, menus, drag & drop, dialogs. State lives in core.js, markup in views.js.
import { CATS, parseTime } from '/ops.js';
import { S, hooks, esc, uid, todayISO, shortDate, longDate, nextWD, prevWD, addDays, mondayOf, dowOf, isWeekend, dayOf, findTask, dayStats, catOf,
  api, docFor, dispatch, upd, addTask, moveTask, deleteTask, ensureData, ensureWeek, loadConfig, saveConfigSoon, flush, startPolling, setStatus, touch, carryList, ls, scheduleFlush } from '/core.js';
import { loadExcelJS, addWeekSheet, addAllTasksSheet, downloadWorkbook } from '/xlsx.js';
import { viewDay, viewWeek, viewHistory, liquidY, I, legend } from '/views.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
let rendering = false, rq = false;

/* ---------- render ---------- */
hooks.render = () => { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; doRender(); }); };
function doRender() {
  if (S.dragging) { S.renderLater = true; return; }
  const keep = [...app.querySelectorAll('[data-keep]')].map((e) => ({ k: e.dataset.keep, v: e.value, s: e.selectionStart, e: e.selectionEnd, f: e === document.activeElement }));
  const y = window.scrollY, sx = $('.weekgrid') ? $('.weekgrid').scrollLeft : 0;
  rendering = true;
  app.innerHTML = S.view === 'day' ? viewDay() : S.view === 'week' ? viewWeek() : viewHistory();
  rendering = false;
  for (const k of keep) {
    const el = app.querySelector(`[data-keep="${k.k}"]`); if (!el) continue;
    el.value = k.v;
    if (k.f) { el.focus(); try { el.setSelectionRange(k.s, k.e); } catch (e) {} }
  }
  window.scrollTo(0, y); if ($('.weekgrid')) $('.weekgrid').scrollLeft = sx;
  if (S.inserting) { const el = $('#ins'); if (el && document.activeElement !== el) el.focus(); }
  if (S.editing) { const el = $('#edit'); if (el && document.activeElement !== el) { el.focus(); el.select(); } }
  const liq = $('#liquid');
  if (liq) { const pct = S.pct || 0; liq.getBoundingClientRect(); liq.style.opacity = pct > 0 ? 1 : 0; liq.style.transform = `translateY(${liquidY(pct)}px)`; S.lastPct = pct; }
  document.querySelectorAll('header .tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.view === S.view));
  $('#page').classList.toggle('wide', S.view !== 'history');
  $('#page').classList.toggle('fit', S.view === 'day');
  fitColumns();
  document.title = 'Task Dashboard - ' + { day: 'Day', week: 'Week', history: 'History' }[S.view];
  ensureData();
}

/* ---------- Day view: flow the tasks into as many columns as it takes to avoid scrolling ---------- */
function fitColumns() {
  const ul = $('.list.multi'); if (!ul) return;
  const side = $('.cols > aside');
  if (side) { // sidebar scrolls inside itself so the page never has to
    const top = side.getBoundingClientRect().top + scrollY;
    side.style.maxHeight = innerWidth > 900 ? Math.max(260, innerHeight - top - 14) + 'px' : '';
    side.style.overflowY = innerWidth > 900 ? 'auto' : '';
  }
  if (!ul.querySelector('.row')) { ul.style.columnCount = ''; return; }
  const maxCols = Math.max(1, Math.min(6, Math.floor(ul.clientWidth / 225)));
  let c = 1;
  for (; c <= maxCols; c++) {
    ul.style.columnCount = c;
    if (ul.getBoundingClientRect().bottom <= innerHeight - 14) break;
  }
  ul.style.columnCount = Math.min(c, maxCols);
}
let fitTimer = 0;
window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitColumns, 120); });

/* ---------- toast, menu, date picker ---------- */
let toastTimer = 0;
hooks.toast = (msg, action, fn) => {
  const t = $('#toast'); t.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}</div>`;
  if (action) t.querySelector('button').onclick = () => { t.innerHTML = ''; fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.innerHTML = ''), action ? 7000 : 3500);
};
const toast = hooks.toast;

// The four tile colours offered in the menu (site palette): green, orange, yellow, blue.
const PICK = [['stock', 'Green'], ['plan', 'Orange'], ['meet', 'Yellow'], ['gen', 'Blue']];
const menuEl = $('#menu');
function openMenu(anchor, items) {
  menuEl.innerHTML = items.map((it, i) => it.sep ? '<hr>' : it.cats
    ? `<div class="catrow">Colour ${PICK.map(([k, label]) => `<button class="catdot" style="--c:${CATS[k].color}" title="${label}" aria-label="${label}" aria-pressed="${it.cur === k}" data-cat="${k}"></button>`).join('')}</div>`
    : `<button class="${it.danger ? 'danger' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('');
  menuEl.hidden = false;
  const r = anchor.getBoundingClientRect(), m = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8)) + 'px';
  menuEl.style.top = (r.bottom + m.height + 12 > innerHeight ? Math.max(8, r.top - m.height - 4) : r.bottom + 4) + 'px';
  menuEl._items = items;
}
const closeMenu = () => { menuEl.hidden = true; };
menuEl.addEventListener('click', (e) => {
  const items = menuEl._items || []; const cat = e.target.closest('[data-cat]'); const b = e.target.closest('[data-i]');
  if (cat) { const it = items.find((x) => x.cats); closeMenu(); it.fn(cat.dataset.cat); }
  else if (b) { const it = items[+b.dataset.i]; closeMenu(); it.fn(); }
});
function pickDate(cb, start) {
  const inp = document.createElement('input'); inp.type = 'date'; inp.value = start || todayISO();
  Object.assign(inp.style, { position: 'fixed', left: '50%', top: '30%', opacity: 0, pointerEvents: 'none' });
  document.body.appendChild(inp);
  inp.addEventListener('change', () => { if (inp.value) cb(inp.value); inp.remove(); });
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 300));
  try { inp.showPicker(); } catch (e) { inp.style.opacity = 1; inp.style.pointerEvents = 'auto'; inp.focus(); }
}

/* ---------- navigation ---------- */
function setView(v) {
  S.view = v; S.editing = null;
  if (v === 'week') S.weekStart = mondayOf(S.date);
  if (v === 'history') { Object.assign(S.history, { weeks: [], oldest: null, exhausted: false, all: null, query: '' }); loadHistory(); }
  hooks.render(); window.scrollTo(0, 0);
}
const goDay = (d) => { S.date = d; S.view = 'day'; S.editing = null; hooks.render(); window.scrollTo(0, 0); };

async function loadHistory() {
  const h = S.history; if (h.loading) return;
  h.loading = true; hooks.render();
  const to = h.oldest ? addDays(h.oldest, -7) : mondayOf(todayISO());
  const r = await api(`/api/weeks?to=${to}&n=8`); h.loading = false;
  if (r.ok) {
    h.weeks.push(...r.data.weeks); h.oldest = r.data.weeks[7].start;
    if (r.data.weeks.every((x) => !Object.values(x.doc.days).some((d) => d.tasks.length))) h.exhausted = true;
  }
  hooks.render();
}
async function loadSearchPool() {
  const h = S.history; if (h.all || h.allLoading) return;
  h.allLoading = true; hooks.render();
  const r = await api(`/api/weeks?to=${mondayOf(todayISO())}&n=40`); h.allLoading = false;
  if (r.ok) h.all = r.data.weeks;
  hooks.render();
}

/* ---------- menus for tasks / days / projects ---------- */
function taskMenu(btn) {
  const row = btn.closest('.row'), id = row.dataset.id, date = row.dataset.date, t = findTask(date, id); if (!t) return;
  const nwd = nextWD(date), today = todayISO();
  openMenu(btn, [
    { label: t.urgent ? 'Clear urgent' : 'Mark urgent', fn: () => upd(date, id, { urgent: !t.urgent }) },
    { label: 'Edit text or time', fn: () => { S.editing = { id, date }; hooks.render(); } },
    { sep: true },
    date !== today && { label: 'Move to today', fn: () => doMove(id, date, today) },
    { label: `Move to ${shortDate(nwd)}`, fn: () => doMove(id, date, nwd) },
    { label: 'Move to another date…', fn: () => pickDate((d) => doMove(id, date, d), date) },
    { label: `Copy to ${shortDate(nwd)}`, fn: () => { addTask(nwd, { text: t.text, time: t.time, cat: t.cat, note: t.note }); toast(`Copied to ${shortDate(nwd)}`); } },
    t.done && { label: 'Change completed time…', fn: () => editDoneTime(date, id) },
    { sep: true },
    { cats: true, cur: catOf(t), fn: (c) => upd(date, id, { cat: c === t.cat ? '' : c }) },
    { sep: true },
    { label: 'Delete task', danger: true, fn: () => deleteTask(date, id) },
  ].filter(Boolean));
}
function editDoneTime(date, id) {
  const t = findTask(date, id); if (!t || !t.done) return;
  const base = t.doneAt ? new Date(t.doneAt) : new Date(date + 'T12:00:00');
  const p = (n) => String(n).padStart(2, '0');
  const inp = document.createElement('input'); inp.type = 'datetime-local';
  inp.value = `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}T${p(base.getHours())}:${p(base.getMinutes())}`;
  Object.assign(inp.style, { position: 'fixed', left: '50%', top: '30%', opacity: 0, pointerEvents: 'none' });
  document.body.appendChild(inp);
  inp.addEventListener('change', () => { const ms = new Date(inp.value).getTime(); if (Number.isFinite(ms)) upd(date, id, { doneAt: ms }); inp.remove(); });
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 300));
  try { inp.showPicker(); } catch (e) { inp.style.opacity = 1; inp.style.pointerEvents = 'auto'; inp.focus(); }
}
function doMove(id, from, to, opts) {
  const idx = dayOf(from).tasks.findIndex((t) => t.id === id);
  moveTask(id, from, to, opts);
  if (from !== to) toast(`Moved to ${shortDate(to)}`, 'Undo', () => moveTask(id, to, from, { index: idx }));
}
function dayMenu(btn) {
  const date = S.date, nwd = nextWD(date);
  openMenu(btn, [
    { label: 'Add routine tasks that are missing', fn: () => dispatch(date, { op: 'seed', date, addMissing: true }) },
    { label: 'Sort timed tasks into time order', fn: () => {
      const tasks = dayOf(date).tasks, slots = tasks.map((t, i) => (t.time ? i : -1)).filter((i) => i >= 0);
      const sorted = slots.map((i) => tasks[i]).sort((a, b) => a.time.localeCompare(b.time)); const out = tasks.slice();
      slots.forEach((i, k) => (out[i] = sorted[k]));
      dispatch(date, { op: 'order', date, ids: out.map((t) => t.id) });
    } },
    { label: `Push unfinished one-off tasks to ${shortDate(nwd)}`, fn: () => {
      const l = dayOf(date).tasks.filter((t) => !t.done && !t.skip && (!t.src || t.src.startsWith('p:')));
      if (!l.length) return toast('No unfinished one-off tasks');
      l.forEach((t) => moveTask(t.id, date, nwd)); toast(`Moved ${l.length} task${l.length > 1 ? 's' : ''} to ${shortDate(nwd)}`);
    } },
    { sep: true },
    { label: 'Print this day', fn: () => window.print() },
  ]);
}
function projMenu(btn) {
  const pid = btn.closest('.proj').dataset.pid, pr = S.config.projects.find((p) => p.id === pid);
  openMenu(btn, [
    { label: 'Rename', fn: () => { const v = prompt('Project name', pr.text); if (v && v.trim()) { pr.text = v.trim(); saveConfigSoon({ projects: S.config.projects }); } } },
    { label: 'Delete project', danger: true, fn: () => { S.config.projects = S.config.projects.filter((p) => p.id !== pid); saveConfigSoon({ projects: S.config.projects }); } },
  ]);
}
function settingsMenu(btn) {
  openMenu(btn, [
    { label: 'Edit weekly routine…', fn: openRoutine },
    { label: 'Change password…', fn: openPassword },
    !S.config.imported && { label: 'Import spreadsheet history…', fn: importHistory },
    { label: 'Export this week (Excel)', fn: exportWeekXlsx },
    { label: 'Export all history (Excel)', fn: () => exportAllXlsx() },
    { label: 'Export this week (CSV)', fn: exportWeek },
    { label: 'Export all history (CSV)', fn: exportAll },
    { label: 'Print', fn: () => window.print() },
    { sep: true },
    { label: 'Sign out', fn: () => (location.href = '/logout') },
  ].filter(Boolean));
}

/* ---------- export to CSV (opens in Excel / Sheets) ---------- */
const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
function downloadCsv(name, rows) {
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const dmy = (iso) => iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const cellText = (t) => (t.urgent ? '! ' : '') + (t.done ? '✓ ' : t.skip ? '✗ ' : '') + (t.time ? t.time.replace(':', '') + ' ' : '') + t.text + (t.note ? ' — ' + t.note : '');
// Same shape as your spreadsheet: Monday–Friday columns with dates underneath, then Ongoing / Projects.
function exportWeek() {
  const ws = S.weekStart;
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i)).filter((d, i) => i < 5 || dayOf(d).tasks.length);
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const cols = days.map((d) => dayOf(d).tasks.map(cellText));
  const proj = S.config.projects.map((p) => (p.done ? '✓ ' : '') + p.text);
  const height = Math.max(...cols.map((c) => c.length), proj.length - 1, 0);
  const rows = [[...days.map((d, i) => names[i]), 'Ongoing / Projects'], [...days.map(dmy), proj[0] || '']];
  for (let r = 0; r < height; r++) rows.push([...cols.map((c) => c[r] || ''), proj[r + 1] || '']);
  const notes = days.map((d) => dayOf(d).note);
  if (notes.some(Boolean)) rows.push([...notes.map((n) => (n ? 'Notes: ' + n : '')), '']);
  downloadCsv(`Task Dashboard WC ${ws.slice(8)}.${ws.slice(5, 7)}.${ws.slice(2, 4)}.csv`, rows);
  toast('Week exported — ✓ done, ✗ not needed');
}
// One row per task, every week on record.
async function exportAll() {
  toast('Preparing export…');
  const rows = [['Date', 'Day', 'Time', 'Task', 'Status', 'Urgent', 'Done at', 'Note', 'Day notes']]; let to = mondayOf(todayISO()), empty = 0;
  for (let page = 0; page < 6 && empty < 2; page++) {
    const r = await api(`/api/weeks?to=${to}&n=40`); if (!r.ok) return toast('Export failed — please try again');
    for (const { start, doc } of r.data.weeks) {
      const d = S.weeks[start] !== undefined ? dayOfWeekDoc(start) : doc;
      for (const [date, day] of Object.entries(d.days)) for (const t of day.tasks)
        rows.push([date, new Date(date + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' }), t.time, t.text, t.done ? 'Done' : t.skip ? 'Not needed' : 'Open', t.urgent ? 'Urgent' : '', t.doneAt ? new Date(t.doneAt).toLocaleString('en-AU') : '', t.note, '']);
    }
    empty = r.data.weeks.every((x) => !Object.values(x.doc.days).some((d) => d.tasks.length)) ? empty + 1 : 0;
    to = addDays(to, -280);
  }
  const body = rows.slice(1).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  downloadCsv(`Task Dashboard — all history.csv`, [rows[0], ...body]);
  toast(`Exported ${body.length} tasks`);
}
const wcName = (mon) => `WC ${mon.slice(8)}.${mon.slice(5, 7)}.${mon.slice(2, 4)}`;
async function exportWeekXlsx() {
  try {
    toast('Building spreadsheet…'); await loadExcelJS();
    const ws = S.weekStart, days = {};
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i); days[d] = { tasks: dayOf(d).tasks, note: dayOf(d).note }; }
    const wb = new ExcelJS.Workbook(); wb.creator = 'Task Dashboard';
    addWeekSheet(wb, wcName(ws), { start: ws, days }, S.config.projects, todayISO());
    await downloadWorkbook(wb, `Task Dashboard ${wcName(ws)}.xlsx`); toast('Week exported');
  } catch (e) { toast('Export failed — ' + e.message); }
}
async function exportAllXlsx(view) {
  try {
    toast('Building spreadsheet…'); await loadExcelJS();
    const weeks = []; let to = mondayOf(todayISO()), empty = 0;
    for (let page = 0; page < 6 && empty < 2; page++) {
      const r = await api(`/api/weeks?to=${to}&n=40`); if (!r.ok) return toast('Export failed — please try again');
      for (const { start, doc } of r.data.weeks) { const d = S.weeks[start] !== undefined ? dayOfWeekDoc(start) : doc; if (Object.values(d.days).some((x) => x.tasks.length)) weeks.push({ start, days: d.days }); }
      empty = r.data.weeks.every((x) => !Object.values(x.doc.days).some((d) => d.tasks.length)) ? empty + 1 : 0;
      to = addDays(to, -280);
    }
    // the week you're looking at comes first, then every earlier week, newest to oldest; the flat "All tasks" list is last
    const cur = view === 'week' ? S.weekStart : mondayOf(todayISO());
    if (!weeks.some((w) => w.start === cur)) { const d = {}; for (let i = 0; i < 7; i++) { const x = addDays(cur, i); d[x] = { tasks: dayOf(x).tasks, note: dayOf(x).note }; } weeks.push({ start: cur, days: d }); }
    weeks.sort((a, b) => (a.start < b.start ? 1 : -1));
    weeks.sort((a, b) => (b.start === cur) - (a.start === cur));
    const wb = new ExcelJS.Workbook(); wb.creator = 'Task Dashboard';
    weeks.forEach((w) => addWeekSheet(wb, wcName(w.start), w, w.start === mondayOf(todayISO()) ? S.config.projects : [], todayISO()));
    const n = addAllTasksSheet(wb, weeks);
    await downloadWorkbook(wb, 'Task Dashboard — all history.xlsx'); toast(`Exported ${n} tasks across ${weeks.length} weeks`);
  } catch (e) { toast('Export failed — ' + e.message); }
}
const dayOfWeekDoc = (w) => docFor(w);

/* ---------- import ---------- */
async function importHistory() {
  const src = await fetch('/data/history.json').then((r) => r.json()).catch(() => null);
  if (!src) return toast('Couldn’t load the history file');
  const keys = Object.keys(src.weeks); let w = 0;
  for (let i = 0; i < keys.length; i += 4) {
    const part = {}; keys.slice(i, i + 4).forEach((k) => (part[k] = src.weeks[k]));
    toast(`Importing… ${Math.min(i + 4, keys.length)} of ${keys.length} weeks`);
    const r = await api('/api/import', { method: 'POST', body: { weeks: part, final: i + 4 >= keys.length } });
    if (!r.ok) return toast('Import stopped — please try again');
    w += r.data.written;
  }
  S.weeks = {}; S.config.imported = true; touch(); S.history.weeks = []; hooks.render();
  toast(`Imported ${w} weeks of history`);
}

/* ---------- dialogs ---------- */
const modalEl = $('#modal');
const closeModal = () => { modalEl.innerHTML = ''; S.modal = null; };
function openRoutine() { S.modal = { type: 'routine', day: Math.min(Math.max(dowOf(S.date), 1), 5), draft: structuredClone(S.config.routine) }; renderModal(); }
const DN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
function renderModal() {
  const m = S.modal; if (!m) return;
  if (m.type === 'routine') {
    const items = m.draft[m.day] || (m.draft[m.day] = []);
    modalEl.innerHTML = `<div class="modal-back" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Weekly routine">
      <div class="mhead"><div><div class="kicker">Weekly routine</div><h3>What lands on each day automatically</h3></div><span class="sp"></span><button class="btn ghost icon" data-act="modal-close" aria-label="Close">✕</button></div>
      <p class="mhint">These are added to a day the first time you open it. Changing the routine never alters days that already exist.</p>
      <nav class="tabs small">${[1, 2, 3, 4, 5].map((d) => `<button class="tab" data-act="r-day" data-d="${d}" aria-selected="${d === m.day}">${DN[d].slice(0, 3)}</button>`).join('')}</nav>
      <ul class="rlist">${items.map((it, i) => `<li class="rrow" data-i="${i}"><span class="num">${i + 1}</span><input class="rt" data-f="text" value="${esc(it.text)}" maxlength="300" aria-label="Task"><input class="rtime" type="time" data-f="time" value="${it.time || ''}" aria-label="Time (optional)"><button data-act="r-up" aria-label="Move up">↑</button><button data-act="r-down" aria-label="Move down">↓</button><button data-act="r-del" aria-label="Remove">✕</button></li>`).join('')}</ul>
      <div class="radd"><input id="radd" data-ra placeholder="Add a ${DN[m.day]} task…" maxlength="300"><button class="btn" data-act="r-add">Add</button></div>
      <div class="mfoot"><span class="sp"></span><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="r-save">Save routine</button></div></div></div>`;
  } else if (m.type === 'password') {
    modalEl.innerHTML = `<div class="modal-back" data-act="modal-bg"><form class="modal" id="pwform" style="width:min(420px,100%)"><div class="mhead"><div><div class="kicker">Security</div><h3>Change password</h3></div><span class="sp"></span><button type="button" class="btn ghost icon" data-act="modal-close" aria-label="Close">✕</button></div>
      <label class="field"><span>Current password</span><input type="password" name="cur" autocomplete="current-password" required></label>
      <label class="field"><span>New password (8+ characters)</span><input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
      <label class="field"><span>Repeat new password</span><input type="password" name="again" autocomplete="new-password" minlength="8" required></label>
      ${m.error ? `<div class="err">${esc(m.error)}</div>` : ''}<div class="mfoot"><span class="sp"></span><button type="button" class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary">Change password</button></div></form></div>`;
  }
}
function openPassword() { S.modal = { type: 'password' }; renderModal(); }
modalEl.addEventListener('input', (e) => {
  const m = S.modal; if (!m || m.type !== 'routine') return;
  const row = e.target.closest('.rrow'); if (!row || !e.target.dataset.f) return;
  const it = m.draft[m.day][+row.dataset.i]; const v = e.target.value;
  if (e.target.dataset.f === 'time') { if (v) it.time = v; else delete it.time; } else it.text = v;
});
modalEl.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target; const m = S.modal;
  if (f.next.value !== f.again.value) { m.error = 'The new passwords don’t match.'; return renderModal(); }
  const r = await api('/api/password', { method: 'POST', body: { current: f.cur.value, next: f.next.value } });
  if (r.ok) { closeModal(); toast('Password changed — other devices are signed out'); } else { m.error = (r.data && r.data.error) || 'Something went wrong.'; renderModal(); }
});
function routineAct(act, el) {
  const m = S.modal, list = m.draft[m.day], row = el.closest('.rrow'), i = row ? +row.dataset.i : -1;
  if (act === 'r-day') m.day = +el.dataset.d;
  else if (act === 'r-up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  else if (act === 'r-down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
  else if (act === 'r-del') list.splice(i, 1);
  else if (act === 'r-add') { const inp = $('#radd'); const p = parseTime(inp.value); if (p.text) { const it = { id: 'x' + uid().slice(1, 9), text: p.text }; if (p.time) it.time = p.time; list.push(it); } }
  else if (act === 'r-save') {
    const clean = {}; for (const d of [1, 2, 3, 4, 5]) clean[d] = (m.draft[d] || []).filter((x) => x.text.trim());
    S.config.routine = clean; saveConfigSoon({ routine: clean }); closeModal(); toast('Routine saved — it applies to days you open from now on'); return;
  }
  renderModal(); if (act === 'r-add') $('#radd').focus();
}

/* ---------- commit helpers ---------- */
function commitEdit() {
  const ed = S.editing, el = $('#edit'); if (!ed) return;
  S.editing = null;
  if (el) { const t = findTask(ed.date, ed.id); const p = parseTime(el.value); if (t && p.text && (p.text !== t.text || p.time !== t.time)) upd(ed.date, ed.id, { text: p.text, time: p.time }); }
  hooks.render();
}
// Add the typed task right under the tile whose + was clicked; keep the box open under the new one for rapid entry.
function commitInsert(input, keepGoing) {
  const ins = S.inserting; if (!ins) return;
  const p = parseTime(input.value);
  if (!p.text) { S.inserting = null; return hooks.render(); }
  const tasks = dayOf(ins.date).tasks;
  const at = ins.after === '__end' ? tasks.length : tasks.findIndex((t) => t.id === ins.after) + 1;
  const t = addTask(ins.date, { text: p.text, time: p.time }, at);
  S.inserting = keepGoing ? { date: ins.date, after: t.id } : null;
  input.value = ''; input.dataset.keepGoing = '';
  hooks.render();
}
let noteTimer = 0;

/* ---------- click handling ---------- */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu') && !e.target.closest('[data-act="menu"],[data-act="daymenu"],[data-act="proj-menu"],[data-act="settings"]')) closeMenu();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, row = el.closest('.row');
  if (act === 'modal-bg') { if (e.target === el) closeModal(); return; }
  if (act === 'modal-close') return closeModal();
  if (act.startsWith('r-')) return routineAct(act, el);
  switch (act) {
    case 'view': return setView(el.dataset.view);
    case 'goto': return goDay(el.dataset.date);
    case 'goto-day': return goDay(el.dataset.date);
    case 'today': return goDay(todayISO());
    case 'pickdate': return pickDate(goDay, S.date);
    case 'xpa': { const t = findTask(row.dataset.date, row.dataset.id); return t && upd(row.dataset.date, t.id, { done: !t.done }); }
    case 'hazy': { const t = findTask(row.dataset.date, row.dataset.id); return t && upd(row.dataset.date, t.id, { skip: !t.skip }); }
    case 'urgent': { const t = findTask(row.dataset.date, row.dataset.id); return t && upd(row.dataset.date, t.id, { urgent: !t.urgent }); }
    case 'donetime': return editDoneTime(row.dataset.date, row.dataset.id);
    case 'edit': if (!S.editing) { S.editing = { id: row.dataset.id, date: row.dataset.date }; hooks.render(); } return;
    case 'menu': return taskMenu(el);
    case 'daymenu': return dayMenu(el);
    case 'settings': return settingsMenu(el);
    case 'hidedone': S.hideDone = !S.hideDone; ls.set('pds.hideDone', S.hideDone ? '1' : '0'); return hooks.render();
    case 'ins': S.inserting = { date: row.dataset.date, after: row.dataset.id }; return hooks.render();
    case 'ins-end': S.inserting = { date: el.dataset.date, after: '__end' }; return hooks.render();
    case 'week-step': S.weekStart = addDays(S.weekStart, +el.dataset.n); return hooks.render();
    case 'week-now': S.weekStart = mondayOf(todayISO()); return hooks.render();
    case 'weekend': S.showWeekend = !S.showWeekend; return hooks.render();
    case 'open-week': S.weekStart = el.dataset.w; S.view = 'week'; S.date = el.dataset.w; hooks.render(); return window.scrollTo(0, 0);
    case 'hist-more': return loadHistory();
    case 'hist-filter': S.history.filter = el.dataset.f; return hooks.render();
    case 'carry-one': doMove(el.dataset.id, el.dataset.date, todayISO()); return;
    case 'carry-all': { const l = carryList() || []; l.forEach((x) => moveTask(x.t.id, x.date, todayISO())); return toast(`Brought ${l.length} task${l.length > 1 ? 's' : ''} to today`); }
    case 'carry-dismiss': ls.set('pds.carry.' + todayISO(), '1'); return hooks.render();
    case 'q-clear': S.q = ''; return hooks.render();
    case 'q-hist': { const q = S.q; setView('history'); S.history.query = q; loadSearchPool(); return hooks.render(); }
    case 'export-week': return exportAllXlsx('week');
    case 'export-all': return exportAll();
    case 'import': return importHistory();
    case 'import-dismiss': S.importDismissed = true; ls.set('pds.importDismissed', '1'); return hooks.render();
    case 'proj-done': { const pr = S.config.projects.find((p) => p.id === el.closest('.proj').dataset.pid); pr.done = !pr.done; return saveConfigSoon({ projects: S.config.projects }); }
    case 'proj-today': { const pr = S.config.projects.find((p) => p.id === el.closest('.proj').dataset.pid); addTask(S.date, { text: pr.text, src: 'p:' + pr.id, cat: 'proj' }); return; }
    case 'proj-menu': return projMenu(el);
    case 'proj-add': { const inp = el.previousElementSibling; const v = inp.value.trim(); if (!v) return; inp.value = ''; S.config.projects.push({ id: 'p' + uid().slice(1, 9), text: v, done: false }); return saveConfigSoon({ projects: S.config.projects }); }
  }
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Escape') { closeMenu(); if (S.modal) closeModal(); if (S.editing) { S.editing = null; hooks.render(); } if (S.inserting) { S.inserting = null; hooks.render(); } return; }
  if (e.key === 'Enter') {
    if (t.id === 'edit') { e.preventDefault(); return commitEdit(); }
    if (t.dataset && t.dataset.note) { e.preventDefault(); return t.blur(); }
    if (t.dataset && t.dataset.ins) { e.preventDefault(); return commitInsert(t, true); }
    if (t.dataset && 'pa' in t.dataset) { e.preventDefault(); return t.nextElementSibling.click(); }
    if (t.id === 'radd') { e.preventDefault(); return t.nextElementSibling.click(); }
    if (t.classList && t.classList.contains('txt')) { S.editing = { id: t.closest('.row').dataset.id, date: t.closest('.row').dataset.date }; return hooks.render(); }
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || S.modal;
  if (!typing && S.view === 'day') {
    if (e.key === 'ArrowLeft') goDay(prevWD(S.date)); else if (e.key === 'ArrowRight') goDay(nextWD(S.date)); else if (e.key === 't') goDay(todayISO());
  }
});
document.addEventListener('focusout', (e) => {
  if (rendering) return;
  if (e.target.id === 'edit') commitEdit();
  else if (e.target.id === 'ins') commitInsert(e.target, false);
  else if (e.target.dataset && e.target.dataset.dnote) { clearTimeout(noteTimer); saveDayNote(e.target); }
});
function saveDayNote(el) { const date = el.dataset.dnote; if (el.value !== dayOf(date).note) dispatch(date, { op: 'note', date, text: el.value }); }
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.note) { const task = findTask(t.dataset.date, t.dataset.note); if (task && t.value.trim() !== task.note) upd(t.dataset.date, task.id, { note: t.value.trim() }); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.dnote) { clearTimeout(noteTimer); noteTimer = setTimeout(() => saveDayNote(t), 900); }
  if (t.dataset && 'q' in t.dataset) { S.q = t.value; clearTimeout(t._d); t._d = setTimeout(() => hooks.render(), 150); }
  if (t.dataset && 'hsearch' in t.dataset) { S.history.query = t.value; if (t.value.trim().length >= 2) loadSearchPool(); clearTimeout(t._d); t._d = setTimeout(() => hooks.render(), 200); }
});

/* ---------- drag & drop (works with mouse and touch) ---------- */
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest('.grip'); if (!grip || e.button > 0) return;
  const row = grip.closest('.row'); if (!row) return;
  e.preventDefault(); closeMenu();
  const r = row.getBoundingClientRect(), ghost = row.cloneNode(true);
  ghost.classList.add('ghost'); Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', pointerEvents: 'none', zIndex: 200 });
  document.body.appendChild(ghost); row.classList.add('dragging'); document.body.classList.add('is-dragging');
  drag = { id: row.dataset.id, from: row.dataset.date, ghost, row, dx: e.clientX - r.left, dy: e.clientY - r.top, to: null, before: null };
  S.dragging = true;
});
function clearMarks() { document.querySelectorAll('.drop-before,.drop-after,.drop-empty,.zone-hot').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-empty', 'zone-hot')); }
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.ghost.style.left = e.clientX - drag.dx + 'px'; drag.ghost.style.top = e.clientY - drag.dy + 'px';
  if (e.clientY < 70) window.scrollBy(0, -14); else if (e.clientY > innerHeight - 70) window.scrollBy(0, 14);
  clearMarks(); drag.to = null; drag.before = null;
  const zone = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-zone]'); if (!zone) return;
  drag.to = zone.dataset.zone;
  if (zone.classList.contains('list')) {
    const rows = [...zone.querySelectorAll('.row:not(.dragging):not(.draft)')];
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.row:not(.dragging):not(.draft)');
    if (!rows.length) zone.classList.add('drop-empty');
    else if (over && zone.contains(over)) {
      const bb = over.getBoundingClientRect();
      if (e.clientY < bb.top + bb.height / 2) { over.classList.add('drop-before'); drag.before = over.dataset.id; }
      else { const nx = rows[rows.indexOf(over) + 1]; if (nx) { nx.classList.add('drop-before'); drag.before = nx.dataset.id; } else over.classList.add('drop-after'); }
    } else rows[rows.length - 1].classList.add('drop-after');
  } else zone.classList.add('zone-hot');
});
function endDrag(cancel, e) {
  if (!drag) return; const d = drag; drag = null;
  d.ghost.remove(); d.row.classList.remove('dragging'); document.body.classList.remove('is-dragging'); clearMarks(); S.dragging = false;
  if (!cancel && d.to) { if (d.to === d.from) moveTask(d.id, d.from, d.to, { beforeId: d.before }); else doMove(d.id, d.from, d.to, { beforeId: d.before }); }
  hooks.render();
}
document.addEventListener('pointerup', (e) => endDrag(false, e));
document.addEventListener('pointercancel', (e) => endDrag(true, e));

/* ---------- date + weather (Open-Meteo, no key needed) — Varsity Lakes, Gold Coast ---------- */
const WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'], 61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'] };
const wxInfo = (c) => WX[c] || (c >= 71 && c <= 77 ? ['🌨️', 'Snow'] : c >= 56 && c <= 67 ? ['🌧️', 'Rain'] : c >= 80 ? ['🌧️', 'Showers'] : ['🌡️', '']);
function paintDate() {}
function paintWeather(w) {
  const el = $('#wx'); if (!w) return;
  const [icon, label] = wxInfo(w.code);
  el.innerHTML = `<span class="wi" aria-hidden="true">${icon}</span><span class="wt">${Math.round(w.temp)}°C</span><small>${label}</small><small class="extra">· H ${Math.round(w.max)}° L ${Math.round(w.min)}°${w.rain != null ? ` · ${w.rain}% rain` : ''}</small>`;
  el.title = `Feels like ${Math.round(w.feels)}°C — updated ${new Date(w.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`;
  el.hidden = false;
}
async function loadWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-28.08&longitude=153.41&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Australia%2FBrisbane&forecast_days=1');
    const j = await r.json(); const c = j.current, d = j.daily;
    const w = { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, max: d.temperature_2m_max[0], min: d.temperature_2m_min[0], rain: d.precipitation_probability_max[0], at: Date.now() };
    ls.set('pds.wx', JSON.stringify(w)); paintWeather(w);
  } catch (e) { try { const w = JSON.parse(ls.get('pds.wx') || 'null'); if (w && Date.now() - w.at < 3 * 3600e3) paintWeather(w); } catch (e2) {} }
}

/* ---------- start ---------- */
paintDate(); loadWeather(); setInterval(loadWeather, 15 * 60 * 1000); setInterval(paintDate, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { paintDate(); loadWeather(); } });
$('#settingsBtn').innerHTML = I.gear;
$('.bubbles').innerHTML = [...Array(10)].map((_, i) => `<span style="width:${10 + ((i * 7) % 24)}px;height:${10 + ((i * 7) % 24)}px;left:${(i * 11 + 4) % 100}%;animation-duration:${16 + ((i * 5) % 14)}s;animation-delay:-${(i * 3) % 14}s"></span>`).join('');
let lastDay = todayISO();
setInterval(() => { const n = todayISO(); if (n !== lastDay) { if (S.date === lastDay) S.date = n; lastDay = n; hooks.render(); } }, 60000);
hooks.render(); startPolling();
(async () => {
  await loadConfig();
  // one-off clean-up: Green Beacon is retired, so remove it from the routine, projects and today onwards (past days keep their history)
  if (S.configLoaded && !(S.config.purged || []).includes('green-beacon-fwd')) {
    const r = await api('/api/purge', { method: 'POST', body: { key: 'green-beacon-fwd', from: todayISO() } });
    if (r.ok && r.data.removed) { location.reload(); return; }
  }
  if (S.pending.length) flush();
})();
