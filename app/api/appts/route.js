// app/api/appts/route.js
export const runtime = 'nodejs';

import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';

const APPTS_TABLE = process.env.APPTS_TABLE || 'easyopti.appts';
const COLS = {
  date: process.env.APPTS_DATE_COL || 'mdate',
  time: process.env.APPTS_TIME_COL || 'mtime',
  empid: process.env.APPTS_EMPID_COL || 'empid',
  patient: (process.env.APPTS_PATIENT_COL || '').trim(), // optional
  type: process.env.APPTS_TYPE_COL || 'eventid',
  status: process.env.APPTS_STATUS_COL || 'showed',
};
const QI = (id) => `\`${id}\``;
const TBL = APPTS_TABLE.split('.').map(QI).join('.');

function coerceInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export async function GET(req) {
  const {searchParams} = new URL(req.url);

  const page = coerceInt(searchParams.get('page'), 1);
  const pageSize = Math.min(coerceInt(searchParams.get('pageSize'), 20), 200);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const q = searchParams.get('q');
  const format = (searchParams.get('format') || 'json').toLowerCase();

  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];

  if (from) {
    where.push(`${QI(COLS.date)} >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`${QI(COLS.date)} <= ?`);
    params.push(to);
  }

  // Only include patient in search if we actually have a column
  if (q) {
    const searchParts = [];
    if (COLS.patient) searchParts.push(`${QI(COLS.patient)} LIKE ?`);
    searchParts.push(`${QI(COLS.type)} LIKE ?`, `${QI(COLS.status)} LIKE ?`);
    where.push(`(${searchParts.join(' OR ')})`);
    if (COLS.patient) params.push(`%${q}%`);
    params.push(`%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS cnt FROM ${TBL} ${whereSql}`;

  // If no patient column, select a blank string for it
  const patientExpr = COLS.patient ? QI(COLS.patient) : `''`;
  const baseSelect = `
    SELECT
      ${QI(COLS.date)} AS date,
      ${QI(COLS.time)} AS mTime,
      CONCAT(${QI(COLS.date)}, ' ', ${QI(COLS.time)}) AS start_dt,
      ${QI(COLS.empid)} AS empid,
      ${patientExpr} AS patient,
      ${QI(COLS.type)} AS apptType,
      ${QI(COLS.status)} AS status
    FROM ${TBL}
    ${whereSql}
    ORDER BY ${QI(COLS.date)} DESC, ${QI(COLS.time)} DESC
    LIMIT ? OFFSET ?`;

  try {
    const [[countRow]] = await pool.query(countSql, params);
    const total = Number(countRow?.cnt ?? 0);

    const dataParams = params.slice();
    dataParams.push(pageSize, offset);
    const [rows] = await pool.query(baseSelect, dataParams);

    if (format === 'csv') {
      const headers = ['date', 'mTime', 'start_dt', 'empid', 'patient', 'apptType', 'status'];
      const csv = [
        headers.join(','),
        ...rows.map((r) =>
          headers
            .map((h) => {
              const v = r[h] ?? '';
              const s = String(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(',')
        ),
      ].join('\n');

      const res = new NextResponse(csv, {status: 200});
      res.headers.set('Content-Type', 'text/csv; charset=utf-8');
      res.headers.set('Content-Disposition', `attachment; filename="appts_page_${page}.csv"`);
      return res;
    }

    return NextResponse.json({page, pageSize, total, rows});
  } catch (err) {
    const payload =
      process.env.NODE_ENV === 'development'
        ? {error: 'Failed to load appointments.', detail: String(err?.message || err)}
        : {error: 'Failed to load appointments.'};
    return NextResponse.json(payload, {status: 500});
  }
}
