// app/api/invoices/[invoiceid]/detail/route.js
import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';

// --- helpers -------------------------------------------------
function getXmlTag(xml, tag) {
  if (!xml) return null;
  const m = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

// Billing category map (billing.t_group) from ini_files fid=13
// e.g. "0,3,Contact Lenses", "0,1,Pro Svc - Exams"
function parseTGroupMap(s) {
  const map = new Map();
  if (!s) return map;
  for (const raw of String(s).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length >= 3) {
      const code = Number(parts[1]);
      const label = parts.slice(2).join(',').trim();
      if (!Number.isNaN(code) && label) map.set(code, label);
    }
  }
  return map;
}

// Your trans_pay.type → label mapping (with a few common aliases)
const PAY_TYPE_MAP = {
  0: 'Patient Cash',
  1: 'Patient Credit Card',
  3: 'Insurance Check',
  4: 'Patient Discount',
  6: 'Insurance Transfer',
  7: 'Insurance Write-Off',
  8: 'Insurance Transfer to Patient',
  13: 'Transfer to Patient from Patient',
  14: 'Transfer Patient→Patient',
  21: 'Insurance EFT',
  22: 'Insurance Credit Card',
  23: 'Paid as part of Invoice',
  26: 'Patient Credit (External)',
  1000: 'Patient Cash',
  1001: 'Patient Credit Card',
  1004: 'Patient Other',
  1006: 'Insurance Transfer',
  1007: 'Insurance Write-Off',
  1008: 'Insurance Transfer',
  1013: 'Transfer to Patient',
  1021: 'Insurance EFT',
  1023: 'Paid as part of another invoice',
};

// sets we use for top-of-card rollups
const PATIENT_DISCOUNT_TYPES = new Set([4, 1004]);
const INS_WRITE_OFF_TYPES = new Set([7, 1007]);

export async function GET(_req, {params}) {
  try {
    const invoiceid = Number(params?.invoiceid);
    if (!Number.isFinite(invoiceid)) {
      return NextResponse.json({error: 'Invalid id'}, {status: 400});
    }

    // Pull category map (billing.t_group)
    const [[iniRow]] = await pool.query('SELECT data FROM ini_files WHERE fid = 13 LIMIT 1');
    const tGroupMap = parseTGroupMap(iniRow?.data || null);

    // Header (invoice)
    const [[inv]] = await pool.query(
      `SELECT invoiceid, acctid, day, void_day, pat_bal, ins_bal, xml, quote, locid, createdate, lastedited
       FROM invoice
       WHERE invoiceid = ?`,
      [invoiceid]
    );
    if (!inv) {
      return NextResponse.json({error: 'Not found'}, {status: 404});
    }

    // Line items
    const [items] = await pool.query(
      `SELECT td.transid, td.bc AS bill_code,
              b.procid AS cpt, b.descr, b.t_group,
              td.pat_bal, td.ins_bal
       FROM trans_data td
       LEFT JOIN billing b ON b.billid = td.bc
       WHERE td.invoiceid = ?
       ORDER BY td.transid`,
      [invoiceid]
    );

    // Payments + insurance join for payer label
    const [pays] = await pool.query(
      `SELECT tp.day, tp.type, tp.xml, tp.pat_bal, tp.ins_bal, tp.insid,
              ins.xml AS ins_xml
       FROM trans_pay tp
       LEFT JOIN insurance ins ON ins.insid = tp.insid
       WHERE tp.invoiceid = ?
       ORDER BY tp.day, tp.transid`,
      [invoiceid]
    );

    // compute header numbers (all in cents)
    const salesCents = items.reduce(
      (s, r) => s + Number(r.pat_bal || 0) + Number(r.ins_bal || 0),
      0
    );

    // totals for receipts/discounts/write-offs
    let receiptsCents = 0;
    let patDiscountCents = 0;
    let insWriteOffCents = 0;

    const payments = pays.map((p) => {
      const type = Number(p.type || 0);
      const labelFromMap = PAY_TYPE_MAP[type];
      const labelFromXml = getXmlTag(p.xml, 'a'); // often like "Patient - Credit Card [1021] Amex"
      const typeLabel = labelFromXml || labelFromMap || `Type ${type}`;
      const payerName =
        getXmlTag(p.ins_xml, 'b') || (p.insid ? `Insurance #${p.insid}` : 'Patient');
      const subType = getXmlTag(p.xml, '0'); // card brand, VSP, check #, etc.

      const pat = Number(p.pat_bal || 0);
      const ins = Number(p.ins_bal || 0);
      const total = pat + ins;

      // rollups (positive dollars)
      if (PATIENT_DISCOUNT_TYPES.has(type)) {
        // patient discounts live on pat_bal
        patDiscountCents += -pat;
      } else if (INS_WRITE_OFF_TYPES.has(type)) {
        // insurance write-offs live on ins_bal
        insWriteOffCents += -ins;
      } else {
        // receipts are payments/credits that reduce balances (exclude write-offs/discounts)
        receiptsCents += -total;
      }

      return {
        date: p.day,
        type,
        typeLabel,
        payerName,
        subType,
        pat_delta: pat,
        ins_delta: ins,
        total_delta: total,
      };
    });

    // balances shown directly from invoice row (current cents)
    const header = {
      invoiceid: inv.invoiceid,
      acctid: inv.acctid,
      date: inv.day,
      status:
        inv.quote === 1
          ? 'QUOTE'
          : inv.void_day
          ? 'VOID'
          : inv.pat_bal + inv.ins_bal === 0
          ? 'CLOSED'
          : 'OPEN',
      salesCents,
      receiptsCents,
      insuranceBalanceCents: Number(inv.ins_bal || 0),
      patientBalanceCents: Number(inv.pat_bal || 0),
      // new:
      patientDiscountCents: patDiscountCents,
      insuranceWriteOffCents: insWriteOffCents,
    };

    const lineItems = items.map((r) => ({
      trans_no: r.transid,
      code: r.bill_code,
      cpt: r.cpt,
      descr: r.descr,
      category: tGroupMap.get(Number(r.t_group)) || '',
      pat: Number(r.pat_bal || 0),
      ins: Number(r.ins_bal || 0),
      total: Number(r.pat_bal || 0) + Number(r.ins_bal || 0),
    }));

    return NextResponse.json({header, lineItems, payments});
  } catch (err) {
    console.error('detail error', err);
    return NextResponse.json({error: 'Failed to fetch detail'}, {status: 500});
  }
}
