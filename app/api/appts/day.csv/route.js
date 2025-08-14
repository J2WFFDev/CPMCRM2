export const runtime = 'nodejs';

const pick = (obj, ...keys) => keys.map((k) => obj[k]).find((v) => v !== undefined && v !== '');
const DB_SCHEMA = pick(process.env, 'DB_NAME', 'MYSQL_DB') || 'easyopti';
const QI = (id) => `\`${id}\``;
const QT = (tbl) =>
  tbl.includes('.') ? tbl.split('.').map(QI).join('.') : `${QI(DB_SCHEMA)}.${QI(tbl)}`;

const APPTS_TABLE = process.env.APPTS_TABLE || `${DB_SCHEMA}.appts`;
const PAT_TABLE = process.env.PATIENTS_TABLE || `${DB_SCHEMA}.patients`;
const EMP_TABLE = process.env.EMP_TABLE || `${DB_SCHEMA}.employees`;

export async function GET(req) {
  try {
    const {pool} = await import('@/lib/db');
    const {searchParams} = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const sql = `
      SELECT
        a.${QI('mdate')}      AS mdate,
        a.${QI('mtime')}      AS mtime,
        a.${QI('xml')}        AS appt_xml,
        a.${QI('empid')}      AS empid,
        a.${QI('locid')}      AS locid,
        a.${QI('showed')}     AS showed,
        a.${QI('si')}         AS si,
        a.${QI('signedout')}  AS signedout,
        a.${QI('yearout')}    AS yearout,
        a.${QI('roomtime')}   AS roomtime,
        a.${QI('created_date')} AS created_date,
        a.${QI('deleted')}    AS deleted,
        CONCAT_WS(', ', p.${QI('patient_last_name')}, p.${QI(
      'patient_first_name'
    )}) AS patient_name,
        e.${QI('xml')}        AS emp_xml
      FROM ${QT(APPTS_TABLE)} a
      LEFT JOIN ${QT(PAT_TABLE)} p ON p.${QI('acctid')} = a.${QI('acctid')}
      LEFT JOIN ${QT(EMP_TABLE)} e ON e.${QI('empid')}  = a.${QI('empid')}
      WHERE a.${QI('mdate')} = ?
        AND (a.${QI('deleted')} IS NULL OR a.${QI('deleted')} = 0)
      ORDER BY a.${QI('mtime')} ASC
    `;
    const [rows] = await pool.query(sql, [date]);

    const cols = Object.keys(rows[0] || {mdate: '', mtime: '', patient_name: ''});
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))];
    const csv = lines.join('\n');

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="appts_${date}.csv"`,
      },
    });
  } catch (e) {
    return new Response(String(e?.message || e), {status: 500});
  }
}
