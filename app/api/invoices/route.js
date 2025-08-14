import mysql from 'mysql2/promise';
export const runtime = 'nodejs'; // ensure Node runtime (needed for mysql)
import {pool} from '@/lib/db'; // or: import { pool } from '../../../lib/db';

// Minimal sanitizer for the funky XML; keep server-side.
function sanitizeXml(xml) {
  if (!xml) return null;
  let s = String(xml).trim();
  if (!s.startsWith('<root')) s = `<root>${s}</root>`;
  s = s.replace(/<\s*\/\s*(\d+)\s*>/g, '</v$1>');
  s = s.replace(/<\s*(\d+)\s*>/g, '<v$1>');
  s = s.replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;');
  return s;
}

function tryParseXml(xml) {
  if (!xml) return null;
  try {
    const pick = (tag) => {
      const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };
    const out = {};
    out.primaryInsId = pick('insid') || pick('primary_ins') || null;
    out.policy = pick('policy') || null;
    out.auth = pick('auth') || null;
    out.cpt = Array.from(xml.matchAll(/<cpt>([\s\S]*?)<\/cpt>/gi)).map((m) => m[1].trim());
    out.diag = Array.from(xml.matchAll(/<dx>([\s\S]*?)<\/dx>/gi)).map((m) => m[1].trim());
    return out;
  } catch {
    return null;
  }
}

// GET /api/invoices
export async function GET(req) {
  const {searchParams} = new URL(req.url);
  const from = searchParams.get('from') || '2000-01-01';
  const to = searchParams.get('to') || '2099-12-31';
  const status = searchParams.get('status'); // OPEN|PAID|VOID|QUOTE
  const locid = searchParams.get('locid') ? Number(searchParams.get('locid')) : null;
  const acctid = searchParams.get('acctid') ? Number(searchParams.get('acctid')) : null;
  const page = Number(searchParams.get('page') || 1);
  const pageSize = Math.min(Number(searchParams.get('pageSize') || 50), 200);
  const offset = (page - 1) * pageSize;

  // Inline latest-trans logic via anti-join (no views)
  const sql = `
    SELECT
      inv.invoiceid,
      inv.acctid,
      p.patient_last_name,
      p.patient_first_name,
      inv.day AS invoice_date,
      COALESCE(t1.pat_bal, inv.pat_bal) AS pat_bal_latest,
      COALESCE(t1.ins_bal, inv.ins_bal) AS ins_bal_latest,
      (COALESCE(t1.pat_bal, inv.pat_bal) + COALESCE(t1.ins_bal, inv.ins_bal)) AS total_bal_latest,
      inv.quote,
      inv.void_day,
      inv.locid,
      inv.createdate,
      inv.lastedited,
      CASE
        WHEN inv.void_day IS NOT NULL THEN 'VOID'
        WHEN inv.quote = 1 THEN 'QUOTE'
        WHEN (COALESCE(t1.pat_bal, inv.pat_bal) + COALESCE(t1.ins_bal, inv.ins_bal)) = 0 THEN 'PAID'
        ELSE 'OPEN'
      END AS status
    FROM invoice inv
    JOIN patients p ON p.acctid = inv.acctid
    LEFT JOIN trans_pay t1
      ON t1.invoiceid = inv.invoiceid
    LEFT JOIN trans_pay t2
      ON t2.invoiceid = t1.invoiceid AND t2.transid > t1.transid
    WHERE t2.transid IS NULL
      AND (inv.day BETWEEN ? AND ?)
      AND (? IS NULL OR
           CASE
             WHEN inv.void_day IS NOT NULL THEN 'VOID'
             WHEN inv.quote = 1 THEN 'QUOTE'
             WHEN (COALESCE(t1.pat_bal, inv.pat_bal) + COALESCE(t1.ins_bal, inv.ins_bal)) = 0 THEN 'PAID'
             ELSE 'OPEN'
           END = ?)
      AND (? IS NULL OR inv.locid = ?)
      AND (? IS NULL OR p.acctid = ?)
    ORDER BY inv.day DESC, inv.invoiceid DESC
    LIMIT ? OFFSET ?;
  `;

  const params = [
    from,
    to,
    status ?? null,
    status ?? null,
    locid,
    locid,
    acctid,
    acctid,
    pageSize,
    offset,
  ];

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params);
    return new Response(JSON.stringify({rows, page, pageSize}), {status: 200});
  } finally {
    conn.release();
  }
}

// helper used by /api/invoices/[invoiceid]
export async function fetchInvoiceDetail(invoiceid) {
  const conn = await pool.getConnection();
  try {
    const [mainRows] = await conn.query(
      `
      SELECT
        inv.*,
        p.patient_last_name, p.patient_first_name,
        t1.transid AS last_transid,
        t1.day     AS last_trans_day,
        t1.pat_bal AS pat_bal_after_last_trans,
        t1.ins_bal AS ins_bal_after_last_trans
      FROM invoice inv
      JOIN patients p ON p.acctid = inv.acctid
      LEFT JOIN trans_pay t1 ON t1.invoiceid = inv.invoiceid
      LEFT JOIN trans_pay t2 ON t2.invoiceid = t1.invoiceid AND t2.transid > t1.transid
      WHERE t2.transid IS NULL AND inv.invoiceid = ?
      `,
      [invoiceid]
    );
    if (mainRows.length === 0) return null;

    const invoice = mainRows[0];

    const [payRows] = await conn.query(
      `SELECT * FROM trans_pay WHERE invoiceid = ? ORDER BY day, transid`,
      [invoiceid]
    );
    const [dataRows] = await conn.query(
      `SELECT * FROM trans_data WHERE invoiceid = ? ORDER BY transid`,
      [invoiceid]
    );

    const invXmlSan = sanitizeXml(invoice.xml);
    const invXmlParsed = tryParseXml(invXmlSan);

    const payments = payRows.map((r) => {
      const s = sanitizeXml(r.xml);
      return {...r, xml_parsed: tryParseXml(s)};
    });
    const dataLines = dataRows.map((r) => {
      const s = sanitizeXml(r.xml);
      return {...r, xml_parsed: tryParseXml(s)};
    });

    return {
      invoice: {
        ...invoice,
        xml_sanitized: invXmlSan,
        xml_parsed: invXmlParsed,
      },
      payments,
      dataLines,
    };
  } finally {
    conn.release();
  }
}
