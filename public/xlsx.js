// Builds a styled Excel workbook that looks like the Week view: coloured tiles, ticks, urgent flags, notes.
// Uses ExcelJS (vendor/exceljs.min.js, loaded on first export).
import { CATS, catOf, addDays } from '/ops.js';

const FONT = 'Lexend';
const INK = 'FF000000', MUTED = 'FF6B685D';
const PAL = { teal: '47D7AC', orange: 'FDAA63', purple: '7566A0', sky: '99D6EA', gold: 'FFD637', pale: 'F1EB9C', red: 'E5484D' };
const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();
// same "colour over white" blend the website uses for tinted tiles
const mix = (hex, pct) => {
  const h = hex.replace('#', ''), c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return c.map((v) => Math.round(v * pct + 255 * (1 - pct)).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const thin = { style: 'thin', color: { argb: 'FFE7E5DE' } };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hm = (ms) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: false });
const COLW = 40;

export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/vendor/exceljs.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the spreadsheet library'));
    document.head.appendChild(s);
  });
}

function tileStyle(t) {
  const meeting = /meeting/i.test(t.text);
  let bg = 'FFFFFF';
  if (t.cat && t.cat !== 'proj' && CATS[t.cat]) bg = mix(CATS[t.cat].color, 0.34);
  else if (meeting) bg = mix(PAL.pale, 0.65);
  if (t.done) bg = mix(PAL.teal, 0.3);
  else if (t.skip) bg = mix(PAL.orange, 0.28);
  return { bg, bar: t.urgent ? PAL.red : CATS[catOf(t)].color.replace('#', '') };
}

function taskCell(cell, t) {
  const { bg, bar } = tileStyle(t);
  const rt = [];
  const mark = t.done ? '✓ ' : t.skip ? '✗ ' : '';
  if (t.urgent) rt.push({ text: '! URGENT  ', font: { name: FONT, size: 9, bold: true, color: { argb: argb(PAL.red) } } });
  if (mark) rt.push({ text: mark, font: { name: FONT, size: 11, bold: true, color: { argb: t.done ? 'FF0E9E75' : 'FFD9731A' } } });
  if (t.time) rt.push({ text: t.time + '  ', font: { name: FONT, size: 10, bold: true, color: { argb: INK } } });
  rt.push({ text: t.text, font: { name: FONT, size: 11, bold: !!t.urgent, strike: !!t.done, italic: !!t.skip, color: { argb: t.done || t.skip ? MUTED : INK } } });
  const small = [];
  if (t.done && t.doneAt) small.push('Done ' + hm(t.doneAt));
  if (t.skip) small.push('Not needed');
  if (t.note) small.push(t.note);
  if (small.length) rt.push({ text: '\n' + small.join(' · '), font: { name: FONT, size: 9, color: { argb: MUTED } } });
  cell.value = { richText: rt };
  cell.fill = fill(bg);
  cell.alignment = { wrapText: true, vertical: 'top', indent: 1 };
  cell.border = { left: { style: t.urgent ? 'thick' : 'medium', color: { argb: argb(bar) } }, top: thin, bottom: thin, right: thin };
  const chars = (t.urgent ? 11 : 0) + (mark.length) + (t.time ? 7 : 0) + t.text.length;
  const lines = Math.max(1, Math.ceil(chars / (COLW * 0.8))) + (small.length ? Math.ceil(small.join(' · ').length / (COLW * 1.15)) : 0);
  return lines;
}

// week = { start:'YYYY-MM-DD' (Monday), days:{ date:{tasks,note} } }
export function addWeekSheet(wb, name, week, projects, today) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week.start, i)).filter((d, i) => i < 5 || (week.days[d] && week.days[d].tasks.length));
  const nCols = dates.length + 1;
  ws.columns = [...dates.map(() => ({ width: COLW })), { width: 36 }];
  // row 1: palette stripe like the site header
  ws.getRow(1).height = 5;
  [PAL.teal, PAL.orange, PAL.purple, PAL.sky].forEach((c, i) => { for (let k = 1; k <= nCols; k++) if (Math.floor(((k - 1) * 4) / nCols) === i) ws.getCell(1, k).fill = fill(c); });
  // row 2: title
  ws.mergeCells(2, 1, 2, nCols);
  const tt = ws.getCell(2, 1);
  tt.value = { richText: [{ text: 'BALTER BREWING   ', font: { name: FONT, size: 9, bold: true, color: { argb: argb(PAL.purple) } } }, { text: 'Task Dashboard', font: { name: FONT, size: 18, bold: true } }, { text: `    Week of ${fmtDate(week.start)}`, font: { name: FONT, size: 12, color: { argb: MUTED } } }] };
  tt.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(2).height = 34;
  // row 3: legend
  ws.getRow(3).height = 20;
  [['✓ Done', mix(PAL.teal, 0.3)], ['✗ Not needed', mix(PAL.orange, 0.28)], ['Meeting', mix(PAL.pale, 0.65)], ['! Urgent', 'FFFFFF']].forEach(([txt, bg], i) => {
    const c = ws.getCell(3, i + 1); c.value = txt; c.fill = fill(bg); c.font = { name: FONT, size: 9, bold: txt.startsWith('!'), color: { argb: txt.startsWith('!') ? argb(PAL.red) : INK } };
    c.alignment = { vertical: 'middle', indent: 1 };
    c.border = { left: { style: txt.startsWith('!') ? 'thick' : 'medium', color: { argb: argb(txt.startsWith('!') ? PAL.red : bg === 'FFFFFF' ? PAL.sky : PAL.teal) } } };
  });
  // row 5/6: day headers
  const stripe = [PAL.teal, PAL.orange, PAL.purple, PAL.sky, PAL.gold, PAL.sky, PAL.sky];
  ws.getRow(5).height = 24; ws.getRow(6).height = 20;
  dates.forEach((d, i) => {
    const tasks = (week.days[d] && week.days[d].tasks) || [], done = tasks.filter((t) => t.done || t.skip).length;
    const isToday = d === today;
    const h = ws.getCell(5, i + 1);
    h.value = DAYS[i]; h.font = { name: FONT, size: 13, bold: true, color: { argb: isToday ? INK : 'FFFFFFFF' } }; h.fill = fill(isToday ? PAL.teal : '000000');
    h.alignment = { vertical: 'middle', indent: 1 }; h.border = { bottom: { style: 'thick', color: { argb: argb(stripe[i]) } } };
    const s = ws.getCell(6, i + 1);
    s.value = `${fmtDate(d)}   ·   ${done}/${tasks.length} done`; s.font = { name: FONT, size: 9, color: { argb: MUTED } }; s.fill = fill('FAFAF7'); s.alignment = { vertical: 'middle', indent: 1 };
  });
  const ph = ws.getCell(5, nCols); ph.value = 'Projects'; ph.font = { name: FONT, size: 13, bold: true, color: { argb: 'FFFFFFFF' } }; ph.fill = fill(PAL.purple); ph.alignment = { vertical: 'middle', indent: 1 };
  const ps = ws.getCell(6, nCols); ps.value = 'ongoing'; ps.font = { name: FONT, size: 9, color: { argb: MUTED } }; ps.fill = fill('FAFAF7'); ps.alignment = { vertical: 'middle', indent: 1 };
  // task rows
  const colTasks = dates.map((d) => (week.days[d] && week.days[d].tasks) || []);
  const rows = Math.max(...colTasks.map((c) => c.length), projects.length, 0);
  for (let r = 0; r < rows; r++) {
    const row = ws.getRow(7 + r); let lines = 1;
    colTasks.forEach((tasks, i) => { if (tasks[r]) lines = Math.max(lines, taskCell(ws.getCell(7 + r, i + 1), tasks[r])); });
    const p = projects[r];
    if (p) {
      const c = ws.getCell(7 + r, nCols); c.value = (p.done ? '✓ ' : '') + p.text;
      c.font = { name: FONT, size: 10, strike: !!p.done, color: { argb: p.done ? MUTED : INK } }; c.alignment = { wrapText: true, vertical: 'top', indent: 1 };
      c.fill = fill(p.done ? mix(PAL.teal, 0.3) : 'FFFFFF'); c.border = { left: { style: 'medium', color: { argb: argb(PAL.purple) } }, top: thin, bottom: thin, right: thin };
      lines = Math.max(lines, Math.ceil(c.value.length / 34));
    }
    row.height = Math.max(22, lines * 15 + 8);
  }
  // day notes
  const notes = dates.map((d) => (week.days[d] && week.days[d].note) || '');
  if (notes.some(Boolean)) {
    const r = 7 + rows + 1; ws.getRow(r).height = 48;
    notes.forEach((n, i) => { if (!n) return; const c = ws.getCell(r, i + 1); c.value = { richText: [{ text: 'Brewer’s log\n', font: { name: FONT, size: 9, bold: true, color: { argb: MUTED } } }, { text: n, font: { name: FONT, size: 10 } }] }; c.alignment = { wrapText: true, vertical: 'top', indent: 1 }; c.fill = fill(mix(PAL.sky, 0.3)); c.border = { left: { style: 'medium', color: { argb: argb(PAL.sky) } } }; });
  }
  return ws;
}

// flat, filterable list of every task (for searching / pivoting in Excel)
export function addAllTasksSheet(wb, weeks) {
  const ws = wb.addWorksheet('All tasks', { views: [{ state: 'frozen', ySplit: 1 }] });
  const head = ['Date', 'Day', 'Time', 'Task', 'Status', 'Urgent', 'Done at', 'Note'];
  ws.columns = [12, 12, 8, 60, 12, 9, 16, 44].map((width) => ({ width }));
  const hr = ws.addRow(head); hr.height = 24;
  hr.eachCell((c) => { c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill('000000'); c.alignment = { vertical: 'middle', indent: 1 }; c.border = { bottom: { style: 'thick', color: { argb: argb(PAL.teal) } } }; });
  const all = [];
  for (const w of weeks) for (const [date, day] of Object.entries(w.days)) for (const t of day.tasks) all.push([date, t]);
  all.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [date, t] of all) {
    const r = ws.addRow([new Date(date + 'T00:00:00Z'), DAYS[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7], t.time, t.text, t.done ? 'Done' : t.skip ? 'Not needed' : 'Open', t.urgent ? 'Urgent' : '', t.doneAt ? new Date(t.doneAt) : '', t.note || '']);
    r.getCell(1).numFmt = 'dd/mm/yyyy'; r.getCell(7).numFmt = 'dd/mm/yyyy hh:mm';
    const bg = t.done ? mix(PAL.teal, 0.3) : t.skip ? mix(PAL.orange, 0.28) : /meeting/i.test(t.text) ? mix(PAL.pale, 0.65) : 'FFFFFF';
    r.eachCell((c) => { c.font = { name: FONT, size: 10, strike: false, color: { argb: INK } }; c.fill = fill(bg); c.alignment = { vertical: 'top', wrapText: true }; c.border = { bottom: thin }; });
    if (t.urgent) { r.getCell(6).font = { name: FONT, size: 10, bold: true, color: { argb: argb(PAL.red) } }; }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };
  return all.length;
}

export async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
