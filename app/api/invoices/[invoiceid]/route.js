// app/api/invoices/[id]/detail/route.js
import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';

export async function GET(_req, {params}) {
  try {
    const invoiceid = Number(params.id);
    if (!Number.isFinite(invoiceid)) {
      return NextResponse.json({error: 'Invalid id'}, {status: 400});
    }

    // Header (with names, balances, receipts summary, etc.)
    const [[header]] = await pool.query(
      `SELECT *
       FROM v_invoice_full
       WHERE invoiceid = :invoiceid
       LIMIT 1`,
      {invoiceid}
    );
    if (!header) return NextResponse.json({error: 'Not found'}, {status: 404});

    // Raw XML from base table (for <n> and <m> notes)
    const [[xmlRow]] = await pool.query(
      `SELECT xml
       FROM invoice
       WHERE invoiceid = :invoiceid
       LIMIT 1`,
      {invoiceid}
    );
    header.xml = xmlRow?.xml || null;

    // Line items + billing descriptions
    const [lines] = await pool.query(
      `SELECT invoiceid, transid, bill_code, bill_descr, line_type,
              line_pat_cents, line_ins_cents, line_total_cents, insid, optiid
       FROM v_invoice_lines
       WHERE invoiceid = :invoiceid
       ORDER BY transid ASC`,
      {invoiceid}
    );

    // Payment events (raw), include a computed total for convenience
    const [payments] = await pool.query(
      `SELECT transid, day, pat_bal, ins_bal,
              (pat_bal + ins_bal) AS total_cents,
              type, insid, locid, cashierid, xml
       FROM trans_pay
       WHERE invoiceid = :invoiceid
       ORDER BY day ASC, transid ASC`,
      {invoiceid}
    );

    return NextResponse.json({header, lines, payments});
  } catch (err) {
    console.error('GET /api/invoices/[id]/detail error', err);
    return NextResponse.json({error: 'Failed to fetch detail'}, {status: 500});
  }
}
