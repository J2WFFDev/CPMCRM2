// app/api/invoices/route.js
import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';

function parseBool(v, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10))
    );
    const offset = (page - 1) * pageSize;

    const acctid = url.searchParams.get('acctid');
    const q = url.searchParams.get('q'); // id or name
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const status = url.searchParams.get('status'); // OPEN|CLOSED|VOID|QUOTE
    const debug = parseBool(url.searchParams.get('debug'), false);

    const sort = url.searchParams.get('sort') || 'invoice_date';
    const dir = (url.searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortCols = new Set([
      'invoice_date',
      'invoiceid',
      'acctid',
      'sales_cents',
      'receipts_cents',
      'ins_bal_cents',
      'pat_bal_cents',
      'total_bal_cents',
      'patient_last_name',
      'patient_first_name',
      'createdate',
      'lastedited',
      'locid',
      'status',
    ]);
    const sortCol = sortCols.has(sort) ? sort : 'invoice_date';

    const where = [];
    const params = {};

    if (acctid) {
      where.push('inv.acctid = :acctid');
      params.acctid = Number(acctid);
    }
    if (dateFrom) {
      where.push('inv.invoice_date >= :dateFrom');
      params.dateFrom = dateFrom;
    }
    if (dateTo) {
      where.push('inv.invoice_date <= :dateTo');
      params.dateTo = dateTo;
    }
    if (status) {
      where.push('inv.status = :status');
      params.status = status.toUpperCase();
    }

    if (q) {
      const n = Number(q);
      if (Number.isFinite(n)) {
        where.push('(inv.invoiceid = :n OR inv.acctid = :n)');
        params.n = n;
      } else {
        where.push(
          '(CONCAT_WS(" ", inv.patient_first_name, inv.patient_last_name) LIKE :q OR inv.patient_last_name LIKE :q OR inv.patient_first_name LIKE :q)'
        );
        params.q = `%${q}%`;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const baseSelect = `
      SELECT
        inv.invoiceid,
        inv.acctid,
        inv.invoice_date,
        inv.patient_first_name,
        inv.patient_last_name,
        inv.sales_cents,
        inv.receipts_cents,
        inv.ins_bal_cents,
        inv.pat_bal_cents,
        inv.total_bal_cents,
        inv.status,
        inv.locid,
        inv.createdate,
        inv.lastedited
        ${debug ? ', TIMESTAMPDIFF(DAY, inv.invoice_date, UTC_DATE()) AS age_days' : ''}
      FROM v_invoice_summary inv
    `;

    const countSql = `SELECT COUNT(*) AS cnt FROM v_invoice_summary inv ${whereSql};`;

    const safeLimit = Math.min(100, Math.max(1, Number(pageSize) | 0));
    const safeOffset = Math.max(0, Number(offset) | 0);
    const listSql = `${baseSelect} ${whereSql} ORDER BY ${sortCol} ${dir} LIMIT ${safeLimit} OFFSET ${safeOffset};`;

    if (debug) {
      console.log('[invoices] params:', params);
      console.log('[invoices] sql:', listSql);
    }

    const [[{cnt}]] = await pool.query(countSql, params);
    const [rows] = await pool.query(listSql, params);

    return NextResponse.json({page, pageSize, total: cnt, rows});
  } catch (err) {
    console.error('GET /api/invoices error', err);
    return NextResponse.json({error: 'Failed to fetch invoices'}, {status: 500});
  }
}
