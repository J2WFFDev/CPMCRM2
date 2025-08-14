// app/appts/day/page.jsx
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import {pool} from '@/lib/db';
import Link from 'next/link';

// --- Config from env (with safe defaults) ---
const APPTS_TABLE = process.env.APPTS_TABLE || 'easyopti.appts';
const COLS = {
  date: process.env.APPTS_DATE_COL || 'mdate',
  time: process.env.APPTS_TIME_COL || 'mtime',
  acctid: process.env.APPTS_ACCTID_COL || 'acctid',
  xml: process.env.APPTS_XML_COL || 'xml',
  deleted: (process.env.APPTS_DELETED_COL || 'deleted').trim(),
};

const PAT = {
  table: process.env.PATIENTS_TABLE || 'easyopti.patients',
  acctid: process.env.PATIENTS_ACCTID_COL || 'acctid',
  nameCol: (process.env.PATIENTS_NAME_COL || 'name').trim(),
  nameExpr: (process.env.PATIENTS_NAME_EXPR || '').trim(), // if provided, overrides nameCol
};

const INI = {
  table: process.env.INI_FILES_TABLE || 'easyopti.ini_files',
  fid: String(process.env.INI_FILES_FID || '14'),
  jsonCol: process.env.INI_FILES_JSON_COL || 'data18',
};

// Helpers
const QI = (id) => `\`${id}\``;
const QT = (tbl) => tbl.split('.').map(QI).join('.');
const todayStr = () => new Date().toISOString().slice(0, 10);

function parseTag(xml, tag) {
  // grab <tag>value</tag> or <tag/> edge cases; case-insensitive, minimal
  if (!xml) return '';
  const re = new RegExp(`<\\s*${tag}\\s*>([^<]*)<\\s*/\\s*${tag}\\s*>`, 'i');
  const m = re.exec(xml);
  return m ? (m[1] || '').trim() : '';
}

// Attempt to parse JSON mapping from ini_files
async function loadApptTypeMap() {
  const tbl = QT(INI.table);
  const jsonCol = QI(INI.jsonCol);
  const sql = `SELECT ${jsonCol} AS j FROM ${tbl} WHERE \`fid\` = ? LIMIT 1`;
  try {
    const [rows] = await pool.query(sql, [INI.fid]);
    const txt = rows?.[0]?.j || '';
    if (!txt) return {};
    // common shapes: {"1":"Annual","2":"Glasses Verify"} or [{"id":1,"label":"Annual"},...]
    const data = JSON.parse(txt);
    if (Array.isArray(data)) {
      // Try to coerce array into map
      const m = {};
      for (const item of data) {
        const key = String(item?.id ?? item?.value ?? item?.key ?? '');
        const val = String(item?.label ?? item?.name ?? item?.text ?? '');
        if (key) m[key] = val || key;
      }
      return m;
    } else if (data && typeof data === 'object') {
      // Already a map
      const m = {};
      for (const [k, v] of Object.entries(data)) m[String(k)] = String(v);
      return m;
    }
    return {};
  } catch {
    return {};
  }
}

function coerceDateParam(v) {
  // Accept YYYY-MM-DD only; fallback to today
  if (typeof v !== 'string') return todayStr();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? v : todayStr();
}

export default async function DayApptsPage({searchParams}) {
  const date = coerceDateParam(searchParams.date || '');

  // Build patient name expression
  const nameExpr = PAT.nameExpr
    ? PAT.nameExpr // trusted expr you set in env, e.g., "CONCAT(first,' ',last)"
    : `${QI('p')}.${QI(PAT.nameCol)}`;

  const apptsTbl = QT(APPTS_TABLE);
  const patsTbl = QT(PAT.table);

  // Optional deleted filter
  const deletedFilter = COLS.deleted ? `AND ${QI('a')}.${QI(COLS.deleted)} = 0` : '';

  const sql = `
    SELECT
      ${QI('a')}.${QI(COLS.time)}          AS mTime,
      ${QI('a')}.${QI(COLS.xml)}           AS xml,
      ${nameExpr}                          AS patientName
    FROM ${apptsTbl} ${QI('a')}
    LEFT JOIN ${patsTbl} ${QI('p')}
      ON ${QI('p')}.${QI(PAT.acctid)} = ${QI('a')}.${QI(COLS.acctid)}
    WHERE ${QI('a')}.${QI(COLS.date)} = ?
      ${deletedFilter}
    ORDER BY ${QI('a')}.${QI(COLS.time)} ASC
  `;

  let rows = [];
  let error = '';
  let typeMap = {};
  try {
    // parallelize
    const [[rs], m] = await Promise.all([pool.query(sql, [date]), loadApptTypeMap()]);
    rows = rs || [];
    typeMap = m || {};
  } catch (e) {
    error = String(e?.message || e);
  }

  // Transform rows: parse <n> and <o>, map type
  const view = rows.map((r) => {
    const nVal = parseTag(r.xml, 'n'); // appointment type key
    const oVal = parseTag(r.xml, 'o'); // doctor
    const atpLabel = typeMap[String(nVal)] ?? nVal; // fallback to raw code
    return {
      patientName: r.patientName || '',
      time: r.mTime || '',
      typeLabel: atpLabel || '',
      doctor: oVal || '',
    };
  });

  const mkQuery = (overrides = {}) => {
    const sp = new URLSearchParams({date, ...overrides});
    return `/appts/day?${sp.toString()}`;
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Appointments — {date}</h1>

      {/* Controls */}
      <form action="/appts/day" method="get" className="flex gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-sm">Date</label>
          <input type="date" name="date" defaultValue={date} className="border rounded px-2 py-1" />
        </div>
        <button type="submit" className="border rounded px-3 py-2">
          Go
        </button>
        <Link
          href={mkQuery({date: new Date().toISOString().slice(0, 10)})}
          className="border rounded px-3 py-2"
        >
          Today
        </Link>
        <Link
          href={`/api/appts/day.csv?${new URLSearchParams({date}).toString()}`}
          className="border rounded px-3 py-2"
        >
          Export CSV
        </Link>
      </form>

      {error && (
        <div className="p-3 border rounded bg-red-50 text-red-700 text-sm">
          Query failed: {error}
        </div>
      )}

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Patient Name (PN)</th>
              <th className="text-left p-2">Appointment Time (AT)</th>
              <th className="text-left p-2">Appointment Type (ATP)</th>
              <th className="text-left p-2">Doctor (D)</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.patientName}</td>
                <td className="p-2">{r.time}</td>
                <td className="p-2">{r.typeLabel}</td>
                <td className="p-2">{r.doctor}</td>
              </tr>
            ))}
            {(!view || view.length === 0) && !error && (
              <tr>
                <td className="p-4 text-center" colSpan={4}>
                  No appointments for this date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Link href={mkQuery({date})} className="border rounded px-2 py-1">
          Refresh
        </Link>
        <Link href="/appts" className="border rounded px-2 py-1">
          Back to /appts
        </Link>
      </div>
    </div>
  );
}
