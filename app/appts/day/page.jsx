// app/appts/day/page.jsx
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import ClientFilterBar from './ClientFilterBar';
import ScheduleTabs from './ScheduleTabs';
import {Fragment} from 'react';

/* =========================
   Env + quoting helpers
   ========================= */
const pick = (obj, ...keys) => keys.map((k) => obj[k]).find((v) => v !== undefined && v !== '');
const DB_SCHEMA = pick(process.env, 'DB_NAME', 'MYSQL_DB') || 'easyopti';

const QI = (id) => `\`${id}\``;
const QT = (tbl) =>
  tbl.includes('.') ? tbl.split('.').map(QI).join('.') : `${QI(DB_SCHEMA)}.${QI(tbl)}`;

const INI_TABLE = process.env.INI_TABLE || `${DB_SCHEMA}.ini_files`;
const INI_FID = process.env.INI_FID || '14';
const APPTS_TABLE = process.env.APPTS_TABLE || `${DB_SCHEMA}.appts`;
const PAT_TABLE = process.env.PATIENTS_TABLE || `${DB_SCHEMA}.patients`;
const EMP_TABLE = process.env.EMP_TABLE || `${DB_SCHEMA}.employees`;
const LOG_TABLE = process.env.LOG_TABLE || `${DB_SCHEMA}.appt_log`;

/* =========================
   Tunables (thresholds)
   ========================= */
const PRELIM_PUNCTUALITY_THRESH_MIN = 5; // ±5m vs CHECK-IN => on-time
const CHECKIN_EARLY_THRESHOLD_MIN = 15; // solid blue when ≤ -15m

/* =========================
   General helpers
   ========================= */
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, d) => {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};
const coerceDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : todayStr());
const normKey = (x) =>
  String(x ?? '')
    .trim()
    .replace(/^0+(\d)/, '$1');
const parseCSVSet = (s) =>
  new Set(
    (s || '')
      .split(/[\,\s]+/)
      .map((v) => v.trim().replace(/^0+(\d)/, '$1'))
      .filter(Boolean)
  );

const toTime12 = (s) => {
  if (!s) return '';
  const [H, M] = String(s).split(':');
  let h = Number(H);
  let a = 'a';
  if (h === 0) h = 12;
  else if (h === 12) a = 'p';
  else if (h > 12) {
    h -= 12;
    a = 'p';
  }
  return `${h}:${String(M || '00').padStart(2, '0')}${a}`;
};

const fmtDateMDY = (v) => {
  const s = toDateOnly(v);
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${m}/${d}/${y}`;
};
const fmtDateTimeMDYHM = (v) => {
  if (!v) return '';
  const dt = v instanceof Date ? v : new Date(normalizeIsoish(String(v)));
  if (Number.isNaN(dt.getTime())) return String(v ?? '');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  let h = dt.getHours();
  const m = String(dt.getMinutes()).padStart(2, '0');
  const a = h >= 12 ? 'p' : 'a';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${mm}/${dd}/${yyyy} ${h}:${m}${a}`;
};

/* ===== Local-day safe helpers (no UTC drift) ===== */
function dayStrLocal(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}
function combineLocal(dayStr, timeStr = '00:00:00') {
  const [y, m, d] = String(dayStr || '')
    .split('-')
    .map((n) => parseInt(n, 10));
  const [hh, mm, ss] = String(timeStr || '00:00:00')
    .split(':')
    .map((n) => parseInt(n, 10) || 0);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mm, ss, 0);
}
const toDateOnly = (v) => dayStrLocal(v);
const asDayStr = (v) => dayStrLocal(v);
/* ================================================ */

const diffDays = (dateStr, created) => {
  const a = new Date(`${toDateOnly(dateStr)}T00:00:00`);
  const b = new Date(`${toDateOnly(created)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86400000);
};

function parseTag(xml, tag) {
  if (!xml) return '';
  const re = new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\s*/\\s*${tag}\\s*>`, 'i');
  const m = re.exec(String(xml));
  return m ? (m[1] || '').trim() : '';
}
function parsePath(xml, path) {
  if (!xml) return '';
  let chunk = String(xml);
  for (const t of path.split('>').map((s) => s.trim())) {
    const re = new RegExp(`<\\s*${t}\\s*>([\\s\\S]*?)<\\s*/\\s*${t}\\s*>`, 'i');
    const m = re.exec(chunk);
    if (!m) return '';
    chunk = m[1];
  }
  return (chunk || '').trim();
}

const badgeYN = (v) => {
  const yes = Number(v) === 1 || String(v).toLowerCase() === 'yes';
  const base = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid #d1d5db',
    fontSize: 12,
    color: yes ? '#065f46' : '#374151',
    background: yes ? '#dcfce7' : '#f3f4f6',
  };
  return <span style={base}>{yes ? 'Yes' : 'No'}</span>;
};

function StatusBadge({status}) {
  const s = String(status || '').toLowerCase();
  const palette = {
    scheduled: {fg: '#1f2937', bg: '#e5e7eb', bd: '#d1d5db'},
    'signed in': {fg: '#1e3a8a', bg: '#dbeafe', bd: '#bfdbfe'},
    kept: {fg: '#065f46', bg: '#dcfce7', bd: '#bbf7d0'},
    'signed out': {fg: '#7c2d12', bg: '#ffedd5', bd: '#fed7aa'},
    cancelled: {fg: '#374151', bg: '#e5e7eb', bd: '#d1d5db'},
  };
  const c = palette[s] || palette.scheduled;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        color: c.fg,
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}

// Patient cell with green check for confirmed
function PatientCell({name, confirmedAt}) {
  return (
    <span>
      {confirmedAt ? (
        <span
          title={`Confirmed ${fmtDateTimeMDYHM(confirmedAt)}`}
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#22c55e',
            color: '#fff',
            textAlign: 'center',
            lineHeight: '16px',
            fontSize: 12,
            marginRight: 6,
          }}
        >
          ✓
        </span>
      ) : null}
      {name}
    </span>
  );
}

// Appt Time + compact indicators (with W/U minutes in the label)
function ApptTimeWithIndicators({
  time,
  sameDay,
  urgent,
  deleted,
  yearOut,
  schedOutDays,
  apptVarExpr,
  wuFlag,
  wuDeltaMin,
  showCancelled,
}) {
  const wuStyle =
    wuFlag === 'early'
      ? {background: '#e0f2fe', borderColor: '#bae6fd', color: '#075985'}
      : wuFlag === 'late'
      ? {background: '#fee2e2', borderColor: '#fecaca', color: '#991b1b'}
      : {background: '#dcfce7', borderColor: '#bbf7d0', color: '#065f46'};

  const wuText = (() => {
    if (wuFlag === 'early' || wuFlag === 'late') {
      const m = Math.abs(Number(wuDeltaMin) || 0);
      return `W/U ${m}m ${wuFlag === 'late' ? 'Late' : 'Early'}`;
    }
    return 'W/U On-time';
  })();

  const pill = (text, title, styles) => (
    <span
      title={title}
      style={{
        display: 'inline-block',
        fontSize: 10,
        lineHeight: '14px',
        padding: '0 6px',
        borderRadius: 999,
        border: '1px solid #e5e7eb',
        marginLeft: 6,
        ...styles,
      }}
    >
      {text}
    </span>
  );

  return (
    <span>
      {time}
      {sameDay &&
        pill('SD', 'Same-day', {background: '#eef2ff', borderColor: '#c7d2fe', color: '#3730a3'})}
      {urgent &&
        pill('URG', 'Urgent', {background: '#fee2e2', borderColor: '#fecaca', color: '#991b1b'})}
      {deleted &&
        pill('X', 'Deleted', {background: '#ffe4e6', borderColor: '#fecdd3', color: '#9f1239'})}
      {yearOut &&
        pill('YT', 'Year-out', {background: '#f3e8ff', borderColor: '#e9d5ff', color: '#6b21a8'})}
      {Number.isFinite(Number(schedOutDays)) && (
        <span
          title="Days between created_date and appointment date"
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            marginLeft: 6,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 4,
          }}
        >
          <span style={{fontSize: 11, fontWeight: 600, color: '#9a3412'}}>
            {Number(schedOutDays)}
          </span>
        </span>
      )}
      {/* PT timing chip */}
      {(() => {
        const v = Number(apptVarExpr);
        if (!Number.isFinite(v) || v === 0) return null;
        if (v > 0) {
          return (
            <span
              title={`Patient checked in ${v}m late`}
              style={{
                display: 'inline-block',
                marginLeft: 6,
                padding: '0 6px',
                lineHeight: '16px',
                borderRadius: 999,
                background: '#ea580c',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
              }}
            >{`PT ${v}m Late`}</span>
          );
        }
        const solid = v <= -CHECKIN_EARLY_THRESHOLD_MIN;
        return (
          <span
            title={`Patient checked in ${Math.abs(v)}m early`}
            style={{
              display: 'inline-block',
              marginLeft: 6,
              padding: '0 6px',
              lineHeight: '16px',
              borderRadius: 999,
              background: solid ? '#2563eb' : 'transparent',
              color: solid ? '#fff' : '#2563eb',
              border: solid ? '1px solid #2563eb' : '1px solid #93c5fd',
              fontSize: 10,
              fontWeight: 700,
            }}
          >{`PT ${Math.abs(v)}m Early`}</span>
        );
      })()}
      {pill(wuText, 'First clinical touch vs CHECK-IN (±5m window)', wuStyle)}
      {showCancelled &&
        pill('CANCEL', 'Cancelled (appt_log)', {
          background: '#e5e7eb',
          borderColor: '#d1d5db',
          color: '#374151',
        })}
    </span>
  );
}

/* =========================
   Time stack visual (Waiting, Prelim, Lane, Dilation, Optical)
   ========================= */
function TimeStackBar({
  waiting = 0,
  prelim = 0,
  lane = 0,
  dilation = 0,
  optical = 0,
  service = 0,
  total = 0,
  scaleMax = 1,
}) {
  const w0 = Math.max(0, Number(waiting) || 0);
  const p = Math.max(0, Number(prelim) || 0);
  const l = Math.max(0, Number(lane) || 0);
  const d = Math.max(0, Number(dilation) || 0);
  const o = Math.max(0, Number(optical) || 0);
  const T = Math.max(0, Number(total) || w0 + p + l + d + o);
  const S = Math.max(0, Number(service) || 0);

  const MAX_PX = 180;
  const widthPx = Math.max(24, Math.round((T / Math.max(1, scaleMax)) * MAX_PX));

  const pct = (x) => (T > 0 ? x / T : 0);
  const w = {
    w0: Math.round(widthPx * pct(w0)),
    p: Math.round(widthPx * pct(p)),
    l: Math.round(widthPx * pct(l)),
    d: Math.round(widthPx * pct(d)),
    o: Math.round(widthPx * pct(o)),
  };
  const drift = widthPx - (w.w0 + w.p + w.l + w.d + w.o);
  if (drift !== 0) w.o += drift;

  const seg = (px, bg, text) => (
    <div
      style={{
        width: px,
        background: bg,
        height: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {px >= 24 ? <span style={{fontSize: 10, fontWeight: 600, color: '#111'}}>{text}</span> : null}
    </div>
  );

  return (
    <div>
      <div
        title={`Waiting ${w0} + Prelim ${p} + Lane ${l} + Dil ${d} + Optical ${o} = Office ${T} min`}
        style={{
          display: 'inline-flex',
          border: '1px solid #e5e7eb',
          borderRadius: 7,
          overflow: 'hidden',
        }}
      >
        {seg(w.w0, '#e5e5e5', w0)}
        {seg(w.p, '#bfdbfe', p)}
        {seg(w.l, '#fde68a', l)}
        {seg(w.d, '#e9d5ff', d)}
        {seg(w.o, '#ddd6fe', o)}
      </div>
      <div style={{fontSize: 10, color: '#374151', textAlign: 'left', marginTop: 2}}>
        {`Office: ${T}m`} {'•'} {`Service: ${S}m`}
      </div>
    </div>
  );
}

/* =========================
   Small debug log table
   ========================= */
function LogMiniTable({rows = []}) {
  if (!rows.length) return null;
  return (
    <div
      style={{
        display: 'inline-block',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        padding: 6,
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 110px 1fr',
          gap: 8,
          fontSize: 12,
          color: '#111',
        }}
      >
        <strong>ID</strong>
        <strong>Time</strong>
        <strong>Note</strong>
        {rows.map((r, i) => (
          <Fragment key={i}>
            <span>{r.logid ?? ''}</span>
            <span>{fmtDateTimeMDYHM(r.dt)}</span>
            <span style={{whiteSpace: 'nowrap'}}>
              {(r.notes || '').replace(/\s+/g, ' ').trim()}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* =========================
   Timeout helper
   ========================= */
async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label || 'operation'} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/* =========================
   INI maps (labels + minutes), cached
   ========================= */
let _atp = {ts: 0, labelMap: {}, durationMap: {}, choices: [], indexByLabel: {}};
const ATP_CACHE_MS = 5 * 60 * 1000;

async function loadApptTypeMapsTimed(pool, timeoutMs = 4000) {
  const now = Date.now();
  if (now - _atp.ts < ATP_CACHE_MS) return _atp;

  const [rs] = await withTimeout(
    pool.query(`SELECT ${QI('data')} AS j FROM ${QT(INI_TABLE)} WHERE ${QI('fid')}=? LIMIT 1`, [
      INI_FID,
    ]),
    timeoutMs,
    'INI map query'
  );
  const txt = String(rs?.[0]?.j || '');

  const labelRe = /<\s*(\d+)\s*>([^<]+)<\s*\/\s*\1\s*>/g;
  const codeRe = /<\s*(\d+)n\s*>([^<]+)<\s*\/\s*\1n\s*>/g;
  const minsRe = /<\s*(\d+)t\s*>([^<]+)<\s*\/\s*\1t\s*>/g;

  const labelsByIndex = {};
  const minsByIndex = {};
  let m;
  while ((m = labelRe.exec(txt))) labelsByIndex[m[1]] = (m[2] || '').trim();
  while ((m = minsRe.exec(txt))) {
    const n = parseInt((m[2] || '').trim(), 10);
    if (!Number.isNaN(n)) minsByIndex[m[1]] = n;
  }

  const labelMap = {};
  const durationMap = {};

  for (const [idx, label] of Object.entries(labelsByIndex)) {
    const k = normKey(idx);
    labelMap[k] = label;
    if (minsByIndex[idx] !== undefined) durationMap[k] = minsByIndex[idx];
  }
  while ((m = codeRe.exec(txt))) {
    const idx = m[1];
    const code = normKey(m[2]);
    const label = labelsByIndex[idx];
    if (code && label) {
      labelMap[code] = label;
      if (minsByIndex[idx] !== undefined) durationMap[code] = minsByIndex[idx];
    }
  }

  const indexByLabel = {};
  for (const [idx, label] of Object.entries(labelsByIndex)) indexByLabel[label] = normKey(idx);

  const choices = Object.keys(labelsByIndex)
    .sort((a, b) => +a - +b)
    .map((i) => ({key: normKey(i), label: labelsByIndex[i]}));

  _atp = {ts: now, labelMap, durationMap, choices, indexByLabel};
  return _atp;
}

/* =========================
   KPI time parsing (robust)
   ========================= */
function clockToMinutes(str) {
  if (!str) return NaN;
  const s = String(str).trim().toLowerCase();
  const ap = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])m?$/i);
  if (ap) {
    let h = parseInt(ap[1], 10);
    const m = parseInt(ap[2], 10);
    const ampm = ap[4];
    if (h === 12) h = 0;
    if (ampm === 'p') h += 12;
    return h * 60 + m;
  }
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    return h * 60 + m;
  }
  return NaN;
}
function normalizeIsoish(s) {
  const str = String(s).trim();
  if (str.includes('T')) return str;
  const m = str.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
  if (m) return `${m[1]}T${m[2]}`;
  return str;
}
function parseFlexibleDate(val, fallbackDateStr) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?\s*([ap]m?)?$/i.test(s)) {
    if (!fallbackDateStr) return null;
    const minutes = clockToMinutes(s);
    if (!Number.isFinite(minutes)) return null;
    const [y, m, d] = toDateOnly(fallbackDateStr)
      .split('-')
      .map((n) => parseInt(n, 10));
    const h = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return new Date(y, m - 1, d, h, mm, 0, 0);
  }
  const norm = normalizeIsoish(s);
  const t = Date.parse(norm);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}
function minutesBetween(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return '';
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 60000);
}

/* =========================
   Banner (debug-only)
   ========================= */
function Banner({mapsErr, apptErr, fatal, date, counts, choicesPreview, debug, logsTotal}) {
  if (!debug) return null;
  const base = {
    margin: '8px 0',
    padding: '6px 10px',
    fontSize: 12,
    border: '1px dashed #bbb',
    color: '#333',
    background: '#f9fafb',
    borderRadius: 6,
    lineHeight: 1.35,
  };
  const row = (k, v) => (
    <div>
      <strong>{k}:</strong> {String(v ?? '')}
    </div>
  );
  if (fatal) {
    return (
      <div style={{...base, borderColor: '#f0aaaa', background: '#fdecec', color: '#932'}}>
        <div>
          <strong>FATAL during render</strong>
        </div>
        {row('Message', fatal)}
      </div>
    );
  }
  return (
    <div style={base}>
      {row('Rendered at', new Date().toISOString())}
      {row('Date', date)}
      {row('Rows', counts.rows)}
      {row('Choices', counts.choices)}
      {row('Logs rows fetched', logsTotal)}
      {choicesPreview?.length
        ? row('First choices', choicesPreview.map((c) => `${c.key}:${c.label}`).join(' | '))
        : null}
      {mapsErr ? row('INI map', mapsErr) : null}
      {apptErr ? row('Appointments', apptErr) : null}
    </div>
  );
}

/* =========================
   Logs parsing & classification
   ========================= */
function canon(s) {
  const x = String(s || '')
    .toLowerCase()
    .trim();
  if (!x) return '';
  const hasConfirm = x.includes('confirm');
  const hasUnconfirm = x.includes('unconfirm');
  if (hasConfirm && !hasUnconfirm) return 'confirmed';
  if (x.includes('cancel')) return 'cancelled';
  if (x.includes('ready for prelim')) return 'ready_prelim';
  if (x.includes('prelim')) return 'prelim';
  if (x.includes('lane')) return 'lane';
  if (x.includes('dilating') || x.includes('dilation')) return 'dilation';
  if (x.includes('optical') || x.includes('contacts')) return 'optical';
  if (x.includes('signed-in') || x === 'signed-in' || x === 'signed in') return 'signed_in';
  if (x.includes('signed-out') || x === 'signed-out' || x === 'signed out') return 'signed_out';
  return x;
}
function parseNoteTransitions(notes) {
  const raw = String(notes || '');
  const parts = raw.split('>').map((t) => canon(t));
  const trans = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const b = parts[i + 1];
    if (b) trans.push(['enter', b]);
  }
  if (/signed[- ]in/i.test(raw)) trans.push(['enter', 'signed_in']);
  if (/signed[- ]out/i.test(raw)) trans.push(['enter', 'signed_out']);
  if (/ready for prelim/i.test(raw)) trans.push(['enter', 'ready_prelim']);
  if (/(^|[^n])confirm/i.test(raw) && !/unconfirm/i.test(raw)) trans.push(['enter', 'confirmed']);
  if (/cancel/i.test(raw)) trans.push(['enter', 'cancelled']);
  return trans;
}

/* =========================
   Page
   ========================= */
export default async function DayApptsPage({searchParams}) {
  const sp = await searchParams;
  const selParam = String(sp?.sel || '');
  const includeSet = parseCSVSet(selParam);
  const debug = String(sp?.debug || '') === '1';
  const schedParam = String(sp?.sched || '');
  const showLogs = String(sp?.log || '') === '1';
  const includeCancelledProd = String(sp?.xcancel || '') === '1';

  // Always fetch logs to compute Time Stack and statuses accurately.
  const needLogs = true;

  let fatal = '';
  let mapsErr = '';
  let apptErr = '';
  let date = '';
  let rows = [];
  let maps = {choices: [], labelMap: {}, durationMap: {}, indexByLabel: {}};
  let logRows = [];

  try {
    date = coerceDate(sp?.date);

    const {pool} = await import('@/lib/db').catch((e) => {
      throw new Error('Importing db pool failed: ' + (e?.message || e));
    });

    const TIMEOUT_MS = 4000;

    const mapsP = loadApptTypeMapsTimed(pool, TIMEOUT_MS).catch((e) => {
      mapsErr = String(e?.message || e);
      return {choices: [], labelMap: {}, durationMap: {}, indexByLabel: {}};
    });

    const apptsSql = `
      SELECT
        a.${QI('schedid')}      AS appt_fpid,
        a.${QI('acctid')}       AS acctid,
        a.${QI('mdate')}        AS mDate,
        a.${QI('mtime')}        AS mTime,
        a.${QI('xml')}          AS xml,
        a.${QI('empid')}        AS empid,
        a.${QI('locid')}        AS locid,
        a.${QI('showed')}       AS showed,
        a.${QI('si')}           AS si,
        a.${QI('signedout')}    AS signedout,
        a.${QI('yearout')}      AS yearout,
        a.${QI('roomtime')}     AS roomtime,
        a.${QI('created_date')} AS created_date,
        a.${QI('deleted')}      AS deleted,
        CONCAT_WS(', ', p.${QI('patient_last_name')}, p.${QI('patient_first_name')}) AS patientName,
        e.${QI('xml')}          AS empXml
      FROM ${QT(APPTS_TABLE)} a
      LEFT JOIN ${QT(PAT_TABLE)} p ON p.${QI('acctid')} = a.${QI('acctid')}
      LEFT JOIN ${QT(EMP_TABLE)} e ON e.${QI('empid')}  = a.${QI('empid')}
      WHERE a.${QI('mdate')} = ?
        AND (a.${QI('deleted')} IS NULL OR a.${QI('deleted')} = 0)
      ORDER BY a.${QI('mtime')} ASC
    `;
    const apptsP = withTimeout(
      pool.query(apptsSql, [date]).then(([r]) => r || []),
      TIMEOUT_MS,
      'Appointments query'
    ).catch((e) => {
      apptErr = String(e?.message || e);
      return [];
    });

    const logsP = needLogs
      ? apptsP.then(async (list) => {
          const fpids = (list || []).map((r) => r.appt_fpid).filter(Boolean);

          async function fetchLogs(sql, params) {
            return withTimeout(
              pool.query(sql, params).then(([r]) =>
                (r || []).map((x) => ({
                  fpid: x.fpid,
                  acctid: x.acctid,
                  logid: x.logid,
                  day_s: x.day_s,
                  time_s: x.time_s,
                  type: x.type,
                  notes: x.notes,
                }))
              ),
              TIMEOUT_MS,
              'Logs query'
            ).catch(() => []);
          }

          let byFpid = [];
          if (fpids.length) {
            const placeholders = fpids.map(() => '?').join(',');
            byFpid = await fetchLogs(
              `
              SELECT ${QI('fpid')} AS fpid, ${QI('acctid')} AS acctid,
                     ${QI('logid')} AS logid,
                     DATE_FORMAT(${QI('day')}, '%Y-%m-%d')  AS day_s,
                     TIME_FORMAT(${QI('dtime')}, '%H:%i:%s') AS time_s,
                     ${QI('type')} AS type, ${QI('notes')} AS notes
              FROM ${QT(LOG_TABLE)}
              WHERE ${QI('fpid')} IN (${placeholders})
              `,
              fpids
            );
          }

          const byDay = await fetchLogs(
            `
            SELECT ${QI('fpid')} AS fpid, ${QI('acctid')} AS acctid,
                   ${QI('logid')} AS logid,
                   DATE_FORMAT(${QI('day')}, '%Y-%m-%d')  AS day_s,
                   TIME_FORMAT(${QI('dtime')}, '%H:%i:%s') AS time_s,
                   ${QI('type')} AS type, ${QI('notes')} AS notes
            FROM ${QT(LOG_TABLE)}
            WHERE ${QI('day')} = ?
            `,
            [date]
          );

          const key = (x) =>
            `${x.fpid || '0'}::${x.logid || '0'}::${x.day_s || ''}::${x.time_s || ''}`;
          const map = new Map();
          for (const r of [...byDay, ...byFpid]) map.set(key(r), r);
          return Array.from(map.values());
        })
      : Promise.resolve([]);

    [maps, rows, logRows] = await Promise.all([mapsP, apptsP, logsP]);
  } catch (e) {
    fatal = String(e?.message || e);
  }

  // Index logs
  const logsByFpid = {};
  const logsByAcctDay = {};
  for (const lr of logRows || []) {
    const dayKey = lr.day_s || '';
    if (lr.fpid != null) (logsByFpid[String(lr.fpid)] ||= []).push(lr);
    (logsByAcctDay[`${lr.acctid}::${dayKey}`] ||= []).push(lr);
  }
  for (const m of [logsByFpid, logsByAcctDay]) {
    for (const k in m)
      m[k].sort((a, b) => {
        const ta = `${a.day_s || ''}T${a.time_s || '00:00:00'}`;
        const tb = `${b.day_s || ''}T${b.time_s || '00:00:00'}`;
        const d = ta.localeCompare(tb);
        return d !== 0 ? d : (a.logid || 0) - (b.logid || 0);
      });
  }

  const baseRows = (rows || []).map((r) => {
    const rawKey = normKey(parseTag(r.xml, 'n'));
    const typeLabel = maps.labelMap?.[rawKey] ?? rawKey ?? '';
    const idxKey = maps.indexByLabel && typeLabel ? maps.indexByLabel[typeLabel] ?? rawKey : rawKey;

    const SIS_xml = parsePath(r.xml, 'q>si');
    const SOS_xml = parsePath(r.xml, 'q>so');

    let schedName = '';
    if (r.empXml) {
      const last = parseTag(r.empXml, 'b');
      const first = parseTag(r.empXml, 'c');
      schedName = [last, first].filter(Boolean).join(', ');
    }

    let status =
      String(SOS_xml) === '1' || r.signedout == 1
        ? 'Signed Out'
        : String(SIS_xml) === '1' || r.si == 1
        ? 'Signed In'
        : r.showed == 1
        ? 'Kept'
        : 'Scheduled';

    const schedOutDays = diffDays(r.mDate, r.created_date);

    // XML fallbacks
    const fPTS = parsePath(r.xml, 'q>f') || parseTag(r.xml, 'f');
    const uU = parsePath(r.xml, 'q>u') || parseTag(r.xml, 'u');
    const vV = parsePath(r.xml, 'q>v') || parseTag(r.xml, 'v');
    const jSITD = parsePath(r.xml, 'q>j') || parseTag(r.xml, 'j');
    const kTOT = parsePath(r.xml, 'q>k') || parseTag(r.xml, 'k');
    const pFLG = parsePath(r.xml, 'q>p') || parseTag(r.xml, 'p');

    const dateOnly = toDateOnly(r.mDate) || '';
    const roomDT = parseFlexibleDate(r.roomtime, dateOnly);
    const vDT_xml = parseFlexibleDate(vV, dateOnly);
    const jDT_xml = parseFlexibleDate(jSITD, dateOnly);
    const apptDT = parseFlexibleDate(String(r.mTime), dateOnly);

    // logs for this appt
    const apptFpid = r.appt_fpid;
    const keyAcctDay = `${r.acctid}::${toDateOnly(r.mDate)}`;
    const rowsLFpid = (apptFpid && logsByFpid[String(apptFpid)]) || [];
    const rowsLDay = logsByAcctDay[keyAcctDay] || [];
    const rowsL = [...rowsLDay, ...rowsLFpid];
    const sig = (x) => `${x.logid || ''}|${x.day_s || ''}|${x.time_s || ''}|${x.notes || ''}`;
    const uniq = Array.from(new Map(rowsL.map((x) => [sig(x), x])).values());
    uniq.sort((a, b) => {
      const ta = `${a.day_s || ''}T${a.time_s || '00:00:00'}`;
      const tb = `${b.day_s || ''}T${b.time_s || '00:00:00'}`;
      const d = ta.localeCompare(tb);
      return d !== 0 ? d : (a.logid || 0) - (b.logid || 0);
    });

    // Event times (track multiple lanes)
    let tConfirmed = null,
      tCancelled = null,
      tArrived = null,
      tPre = null,
      tLane1 = null,
      tLane2 = null,
      tDil = null,
      tOpt = null,
      tIn = null,
      tOut = null;

    for (const row of uniq) {
      const ts = combineLocal(row.day_s, row.time_s);
      if (!ts) continue;
      const transitions = parseNoteTransitions(row.notes);
      for (const [, what] of transitions) {
        if (what === 'confirmed') tConfirmed = ts; // keep latest confirmed
        if (what === 'cancelled' && !tCancelled) tCancelled = ts;
        if (what === 'signed_in' && !tIn) tIn = ts;
        if (what === 'ready_prelim' && !tArrived) tArrived = ts;
        if (what === 'prelim' && !tPre) tPre = ts;
        if (what === 'lane') {
          if (!tLane1) tLane1 = ts;
          else if (!tLane2) tLane2 = ts;
        }
        if (what === 'dilation' && !tDil) tDil = ts;
        if (what === 'optical' && !tOpt) tOpt = ts;
        if (what === 'signed_out' && !tOut) tOut = ts;
      }
    }

    // Compose key moments
    const signedInDT = tIn || jDT_xml;
    const arrivedDT = tArrived || signedInDT;
    const prelimStartDT = tPre || vDT_xml || null;
    const laneStart1DT = tLane1 || null;
    const laneStart2DT = tLane2 || null; // after dilation
    const dilationStartDT = tDil || null;
    const opticalStartDT = tOpt || null;
    const signedOutDT = tOut || roomDT;

    // Status override if cancelled and no later check-in
    if (tCancelled && !signedInDT) status = 'Cancelled';

    // --- durations (split lane & dilation) ---
    let laneMins = 0;

    if (laneStart1DT) {
      if (dilationStartDT) {
        laneMins += Math.max(0, minutesBetween(dilationStartDT, laneStart1DT)); // Lane A
        if (laneStart2DT) {
          laneMins += Math.max(0, minutesBetween(opticalStartDT || signedOutDT, laneStart2DT)); // Lane B
        }
      } else {
        laneMins += Math.max(0, minutesBetween(opticalStartDT || signedOutDT, laneStart1DT)); // Lane w/o dilation
      }
    }

    const dilationMins = dilationStartDT
      ? Math.max(0, minutesBetween(laneStart2DT || opticalStartDT || signedOutDT, dilationStartDT))
      : 0;

    const waitingFirst = prelimStartDT || laneStart1DT || opticalStartDT || signedOutDT;
    const waitingMins = Number.isFinite(minutesBetween(waitingFirst, signedInDT))
      ? Math.max(0, minutesBetween(waitingFirst, signedInDT))
      : 0;

    const prelimEnd = laneStart1DT || opticalStartDT || signedOutDT;
    const prelimMins = Number.isFinite(minutesBetween(prelimEnd, prelimStartDT))
      ? Math.max(0, minutesBetween(prelimEnd, prelimStartDT))
      : 0;

    const opticalMins = Number.isFinite(minutesBetween(signedOutDT, opticalStartDT))
      ? Math.max(0, minutesBetween(signedOutDT, opticalStartDT))
      : 0;

    const officeMins = Number.isFinite(minutesBetween(signedOutDT, signedInDT))
      ? Math.max(0, minutesBetween(signedOutDT, signedInDT))
      : 0;

    // PROD fallback: fill Lane from remainder if lane markers missing
    if (!laneStart1DT) {
      const remainder = Math.max(
        0,
        officeMins - waitingMins - prelimMins - dilationMins - opticalMins
      );
      laneMins += remainder;
    }

    // Service time = first W/U start -> Out
    const firstWUStartDT = prelimStartDT || laneStart1DT || opticalStartDT || null;
    const serviceMins =
      firstWUStartDT && Number.isFinite(minutesBetween(signedOutDT, firstWUStartDT))
        ? Math.max(0, minutesBetween(signedOutDT, firstWUStartDT))
        : 0;

    // Check-in deltas
    const apptVar = Number.isFinite(minutesBetween(signedInDT, apptDT))
      ? minutesBetween(signedInDT, apptDT)
      : '';
    // W/U punctuality vs CHECK-IN
    const wuStartDeltaCheckin = Number.isFinite(minutesBetween(firstWUStartDT, signedInDT))
      ? minutesBetween(firstWUStartDT, signedInDT)
      : '';
    let wuFlag = 'on';
    if (
      wuStartDeltaCheckin !== '' &&
      Math.abs(wuStartDeltaCheckin) > PRELIM_PUNCTUALITY_THRESH_MIN
    ) {
      wuFlag = wuStartDeltaCheckin < 0 ? 'early' : 'late';
    }
    const wuStartDeltaAppt = Number.isFinite(minutesBetween(firstWUStartDT, apptDT))
      ? minutesBetween(firstWUStartDT, apptDT)
      : '';

    const isUrgent = (() => {
      const s = String(pFLG || '').toLowerCase();
      return s === '1' || s === 'y' || s.includes('urgent');
    })();

    const sameApptTxt = diffDays(r.mDate, r.created_date) === 0 ? 'Sameday' : 'Scheduled';
    const isSameDay = sameApptTxt === 'Sameday';

    // Compact log table rows
    const logMini = uniq.map((L) => ({
      logid: L.logid,
      dt: combineLocal(L.day_s, L.time_s),
      notes: L.notes || '',
    }));

    return {
      // Prod
      patient: <PatientCell name={r.patientName || ''} confirmedAt={tConfirmed} />,
      apptTime: (
        <ApptTimeWithIndicators
          time={toTime12(r.mTime)}
          sameDay={isSameDay}
          urgent={isUrgent}
          deleted={r.deleted ? 1 : 0}
          yearOut={r.yearout}
          schedOutDays={schedOutDays}
          apptVarExpr={apptVar}
          wuFlag={wuFlag}
          wuDeltaMin={wuStartDeltaCheckin}
          showCancelled={!!tCancelled}
        />
      ),
      typeLabel,
      status,

      // Time stack inputs
      waitingExpr: waitingMins,
      prelimExpr: prelimMins,
      laneExpr: laneMins,
      dilationExpr: dilationMins,
      opticalExpr: opticalMins,
      officeExpr: officeMins,
      serviceExpr: serviceMins,
      wuFlag,

      // Debug metrics/deltas
      yearout: r.yearout,
      deletedDisp: r.deleted ? 1 : 0,
      sameApptExpr: sameApptTxt,
      schedOutDays: schedOutDays,
      apptVarExpr: apptVar,
      wuDeltaCheckin: wuStartDeltaCheckin,
      wuDeltaAppt: wuStartDeltaAppt,

      // Debug timestamps
      scheduleName: schedName,
      kept: r.showed,
      SIS: SIS_xml !== '' ? SIS_xml : r.si,
      SOS: SOS_xml !== '' ? SOS_xml : r.signedout,
      mdateDisp: fmtDateMDY(r.mDate),
      locid: r.locid,
      typeIndexKey: idxKey,
      roomtimeDisp: fmtDateTimeMDYHM(r.roomtime),
      createdDisp: fmtDateTimeMDYHM(r.created_date),
      atpIndex: rawKey,
      atpMin: maps.durationMap?.[rawKey] ?? '',
      ptsF: fPTS,
      uU,
      vV,
      sitdJ: jSITD,
      totK: kTOT,
      flgP: pFLG,

      // Logs (ordered)
      logsFound: uniq.length,
      logTableRows: logMini,
      log_confirmed: tConfirmed ? fmtDateTimeMDYHM(tConfirmed) : '',
      log_cancelled: tCancelled ? fmtDateTimeMDYHM(tCancelled) : '',
      log_signed_in: signedInDT ? fmtDateTimeMDYHM(signedInDT) : '',
      log_ready_prelim: tArrived ? fmtDateTimeMDYHM(tArrived) : '',
      log_prelim: prelimStartDT ? fmtDateTimeMDYHM(prelimStartDT) : '',
      log_lane_start: laneStart1DT ? fmtDateTimeMDYHM(laneStart1DT) : '',
      log_dilation: dilationStartDT ? fmtDateTimeMDYHM(dilationStartDT) : '',
      log_lane2_start: laneStart2DT ? fmtDateTimeMDYHM(laneStart2DT) : '',
      log_optical: opticalStartDT ? fmtDateTimeMDYHM(opticalStartDT) : '',
      log_signed_out: signedOutDT ? fmtDateTimeMDYHM(signedOutDT) : '',
      log_join_key: `fpid:${apptFpid} | acctDay:${keyAcctDay}`,
    };
  });

  // schedule tabs & filters
  const scheduleList = Array.from(
    new Set(baseRows.map((v) => v.scheduleName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const scheduleActive = schedParam && scheduleList.includes(schedParam) ? schedParam : 'All';

  const typeFiltered =
    includeSet.size === 0 ? baseRows : baseRows.filter((r) => includeSet.has(r.typeIndexKey));

  // Cancelled filter: always keep in Debug; in Prod respect checkbox
  const viewPre =
    debug || includeCancelledProd
      ? typeFiltered
      : typeFiltered.filter((r) => String(r.status).toLowerCase() !== 'cancelled');

  const view =
    scheduleActive === 'All' ? viewPre : viewPre.filter((r) => r.scheduleName === scheduleActive);

  // STABLE SCALE: compute against all rows for the day (not just filtered)
  const maxOffice = Math.max(1, ...baseRows.map((r) => Number(r.officeExpr) || 0));

  const counts = {rows: view.length, choices: maps?.choices?.length ?? 0};
  const choicesPreview = (maps?.choices || []).slice(0, 5);
  const logsTotal = (logRows || []).length;

  const mk = (over = {}) => {
    const base = {
      date,
      ...(selParam ? {sel: selParam} : {}),
      ...(debug ? {debug: '1'} : {}),
      ...(scheduleActive !== 'All' ? {sched: scheduleActive} : {}),
      ...(showLogs ? {log: '1'} : {}),
      ...(includeCancelledProd ? {xcancel: '1'} : {}),
    };
    const sp2 = new URLSearchParams({...base, ...over});
    return `/appts/day?${sp2.toString()}`;
  };

  /* =========================
     Columns
     ========================= */
  const COLS = [
    // ---- Prod ----
    {key: 'patient', label: 'Patient', prod: true, render: (v) => v},
    {key: 'apptTime', label: 'Appt Time', prod: true, render: (v) => v},
    {key: 'typeLabel', label: 'Type', prod: true, render: (v) => v},
    {key: 'status', label: 'Status', prod: true, render: (v) => <StatusBadge status={v} />},
    {
      key: 'timeStack',
      label: 'Time Stack',
      prod: true,
      render: (_v, row) => (
        <TimeStackBar
          waiting={row.waitingExpr || 0}
          prelim={row.prelimExpr || 0}
          lane={row.laneExpr || 0}
          dilation={row.dilationExpr || 0}
          optical={row.opticalExpr || 0}
          service={row.serviceExpr || 0}
          total={row.officeExpr || 0}
          scaleMax={maxOffice}
        />
      ),
    },

    // ---- Debug: timeline ----
    {key: 'createdDisp', label: 'Created', prod: false, render: (v) => v},
    {key: 'log_confirmed', label: 'Confirmed', prod: false, render: (v) => v},
    {key: 'log_cancelled', label: 'Cancelled', prod: false, render: (v) => v},
    {key: 'log_signed_in', label: 'Signed-in', prod: false, render: (v) => v},
    {key: 'log_ready_prelim', label: 'Ready Prelim', prod: false, render: (v) => v},
    {key: 'log_prelim', label: 'Prelim', prod: false, render: (v) => v},
    {key: 'log_lane_start', label: 'Lane 1', prod: false, render: (v) => v},
    {key: 'log_dilation', label: 'Dilation', prod: false, render: (v) => v},
    {key: 'log_lane2_start', label: 'Lane 2', prod: false, render: (v) => v},
    {key: 'log_optical', label: 'Optical', prod: false, render: (v) => v},
    {key: 'log_signed_out', label: 'Signed-out', prod: false, render: (v) => v},

    // ---- Debug: durations ----
    {key: 'waitingExpr', label: 'Waiting (m)', prod: false, render: (v) => v},
    {key: 'prelimExpr', label: 'Prelim (m)', prod: false, render: (v) => v},
    {key: 'laneExpr', label: 'Lane (m)', prod: false, render: (v) => v},
    {key: 'dilationExpr', label: 'Dilation (m)', prod: false, render: (v) => v},
    {key: 'opticalExpr', label: 'Optical (m)', prod: false, render: (v) => v},
    {key: 'serviceExpr', label: 'Service (m)', prod: false, render: (v) => v},
    {key: 'officeExpr', label: 'Office (m)', prod: false, render: (v) => v},

    // ---- Debug: deltas ----
    {key: 'wuDeltaCheckin', label: 'W/U Δ vs Check-in', prod: false, render: (v) => v},
    {key: 'wuDeltaAppt', label: 'W/U Δ vs Appt', prod: false, render: (v) => v},
    {key: 'apptVarExpr', label: 'Check-in Δ (m)', prod: false, render: (v) => v},
    {key: 'schedOutDays', label: 'Sched Out (days)', prod: false, render: (v) => v},
    {key: 'yearout', label: 'YearOut', prod: false, render: (v) => badgeYN(v)},
    {key: 'deletedDisp', label: 'Deleted', prod: false, render: (v) => badgeYN(v)},
    {key: 'sameApptExpr', label: 'Same Appt', prod: false, render: (v) => v},

    // ---- Debug: logs block ----
    {key: 'logsFound', label: 'logsFound', prod: false, render: (v) => v},
    {
      key: 'logTableRows',
      label: 'log.table',
      prod: false,
      render: (v) => <LogMiniTable rows={v || []} />,
    },
    {key: 'log_join_key', label: 'log.join_key', prod: false, render: (v) => v},

    // ---- Debug: misc meta ----
    {key: 'scheduleName', label: 'Schedule', prod: false, render: (v) => v},
    {key: 'SIS', label: 'SIS', prod: false, render: (v) => badgeYN(v)},
    {key: 'SOS', label: 'SOS', prod: false, render: (v) => badgeYN(v)},
    {key: 'mdateDisp', label: 'mdate', prod: false, render: (v) => v},
    {key: 'locid', label: 'LocID', prod: false, render: (v) => v},
    {key: 'typeIndexKey', label: 'ApptTypeIndex', prod: false, render: (v) => v},
    {key: 'atpIndex', label: 'Atp Index', prod: false, render: (v) => v},
    {key: 'atpMin', label: 'Atp Min', prod: false, render: (v) => v},
    {key: 'ptsF', label: 'PTS <f>', prod: false, render: (v) => v},
    {key: 'uU', label: 'U <u>', prod: false, render: (v) => v},
    {key: 'vV', label: 'V <v>', prod: false, render: (v) => v},
    {key: 'sitdJ', label: 'SITD <j>', prod: false, render: (v) => v},
    {key: 'totK', label: 'TOT <k>', prod: false, render: (v) => v},
    {key: 'flgP', label: 'FLG <p>', prod: false, render: (v) => v},
    {key: 'roomtimeDisp', label: 'Signed-out (xml)', prod: false, render: (v) => v},
  ];

  const visibleCols = COLS.filter((c) => (debug ? true : c.prod));

  /* =========================
     Styles
     ========================= */
  const pagePad = {padding: 16};
  const h1 = {fontSize: 28, fontWeight: 600, marginBottom: 8};
  const headerRow = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 12,
    alignItems: 'flex-start',
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: 8,
    background: '#fafafa',
  };
  const controls = {display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'};
  const btn = {
    border: '1px solid #aaa',
    borderRadius: 6,
    padding: '6px 10px',
    background: 'white',
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer',
  };
  const tableBox = {marginTop: 10, overflowX: 'auto', border: '1px solid #ddd', borderRadius: 6};
  const th = {
    textAlign: 'left',
    padding: 10,
    background: '#f3f4f6',
    borderBottom: '1px solid #ddd',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };
  const td = {padding: 10, borderTop: '1px solid #eee', verticalAlign: 'top'};

  const rowStyle = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'cancelled') return {background: '#e5e7eb'};
    if (s === 'signed out') return {background: '#fff7ed'};
    if (s === 'signed in') return {background: '#eff6ff'};
    if (s === 'kept') return {background: '#f0fdf4'};
    return {};
  };

  /* =========================
     Render
     ========================= */
  return (
    <div style={pagePad}>
      <h1 style={h1}>Appointments — {date}</h1>

      <Banner
        mapsErr={mapsErr}
        apptErr={apptErr}
        fatal={fatal}
        date={date}
        counts={counts}
        choicesPreview={choicesPreview}
        debug={debug}
        logsTotal={logsTotal}
      />

      <div style={headerRow}>
        <div style={{display: 'grid', gap: 8}}>
          {/* Controls */}
          <div style={controls}>
            <form
              action="/appts/day"
              method="get"
              style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}
            >
              <label>
                <div style={{fontSize: 12}}>Date</div>
                <input type="date" name="date" defaultValue={date} />
              </label>

              <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <input type="checkbox" name="debug" value="1" defaultChecked={debug} />
                <span>Debug</span>
              </label>

              <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <input type="checkbox" name="log" value="1" defaultChecked={showLogs} />
                <span>Logs</span>
              </label>

              <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <input
                  type="checkbox"
                  name="xcancel"
                  value="1"
                  defaultChecked={includeCancelledProd}
                />
                <span>Include Cancelled</span>
              </label>

              {/* preserve other filters */}
              {selParam && <input type="hidden" name="sel" value={selParam} />}
              {scheduleActive !== 'All' && (
                <input type="hidden" name="sched" value={scheduleActive} />
              )}

              <button style={btn} type="submit">
                Go
              </button>
            </form>

            <Link href={mk({date: addDays(date, -1)})} style={btn}>
              ‹ Prev
            </Link>
            <Link href={mk({date: todayStr()})} style={btn}>
              Today
            </Link>
            <Link href={mk({date: addDays(date, +1)})} style={btn}>
              Next ›
            </Link>

            <Link
              href={`/api/appts/day.csv?${new URLSearchParams({
                date,
                ...(selParam ? {sel: selParam} : {}),
                ...(debug ? {debug: '1'} : {}),
                ...(showLogs ? {log: '1'} : {}),
                ...(includeCancelledProd ? {xcancel: '1'} : {}),
                ...(scheduleActive !== 'All' ? {sched: scheduleActive} : {}),
              }).toString()}`}
              style={btn}
            >
              Export CSV
            </Link>
          </div>

          {/* Tabs by Schedule */}
          <ScheduleTabs schedules={scheduleList} current={scheduleActive} />
        </div>

        {/* Right: existing type filter */}
        <ClientFilterBar date={date} choices={maps.choices || []} initialSelectedCSV={selParam} />
      </div>

      <div style={tableBox}>
        <table style={{width: '100%', fontSize: 14, borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.key} style={th}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={i} style={rowStyle(r.status)}>
                {visibleCols.map((c) => (
                  <td key={c.key} style={td}>
                    {c.render(r[c.key], r)}
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && !fatal && !apptErr && (
              <tr>
                <td style={{...td, textAlign: 'center'}} colSpan={visibleCols.length}>
                  No appointments {includeSet.size ? '(after filters)' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
