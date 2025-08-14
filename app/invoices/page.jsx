'use client';

import {useEffect, useMemo, useState} from 'react';

const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toLocaleString(undefined, {style: 'currency', currency: 'USD'});
};

// robust: handles DATE, ISO strings, or weird values
const fmtDate = (d) => {
  if (!d) return '';
  // try ISO or Date object first
  const try1 = new Date(d);
  if (!isNaN(try1)) return try1.toLocaleDateString();
  // try YYYY-MM-DD as local midnight
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const try2 = new Date(`${d}T00:00:00`);
    if (!isNaN(try2)) return try2.toLocaleDateString();
  }
  // fallbacks
  if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
  return String(d);
};

export default function InvoicesPage() {
  // Data + paging
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters
  const [acctid, setAcctid] = useState('');
  const [qInstant, setQInstant] = useState('');
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');

  // Sort + debug
  const [sort, setSort] = useState('invoice_date');
  const [dir, setDir] = useState('desc');
  const [debug, setDebug] = useState(false);

  // Detail drawer state
  const [openId, setOpenId] = useState(null);

  // Debounce text search
  useEffect(() => {
    const t = setTimeout(() => setQ(qInstant), 300);
    return () => clearTimeout(t);
  }, [qInstant]);

  // Fetch list
  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
      dir,
    });
    if (acctid) params.set('acctid', acctid);
    if (q) params.set('q', q);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (status) params.set('status', status);
    if (debug) params.set('debug', '1');

    fetch(`/api/invoices?${params.toString()}`, {cache: 'no-store'})
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows || []);
        setTotal(d.total || 0);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      });
  }, [page, pageSize, acctid, q, dateFrom, dateTo, status, sort, dir, debug]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const headers = [
    ['patient_last_name', 'Last, First'],
    ['invoiceid', 'Invoice'],
    ['invoice_date', 'Date'],
    ['status', 'Status'],
    ['sales_cents', 'Sales'],
    ['receipts_cents', 'Receipts'],
    ['ins_bal_cents', 'Insurance Balance'],
    ['pat_bal_cents', 'Patient Balance'],
  ];

  function toggleSort(col) {
    if (sort === col) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setDir('asc');
    }
  }

  const StatusChip = ({s}) => {
    const C = String(s || '').toUpperCase();
    const bg =
      C === 'VOID' ? '#fde7e7' : C === 'QUOTE' ? '#f2f2f2' : C === 'CLOSED' ? '#e7f7ee' : '#e9f0ff'; // OPEN
    const color =
      C === 'VOID' ? '#b11' : C === 'QUOTE' ? '#555' : C === 'CLOSED' ? '#0a7d40' : '#3b5bdb';
    return (
      <span style={{background: bg, color, padding: '2px 8px', borderRadius: 999, fontSize: 12}}>
        {C || '—'}
      </span>
    );
  };

  return (
    <div style={{padding: 16}}>
      <h1 style={{fontSize: 22, fontWeight: 600, marginBottom: 8}}>Invoices</h1>

      {/* Filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <input
          placeholder="Search invoiceid/acctid or name…"
          value={qInstant}
          onChange={(e) => {
            setQInstant(e.target.value);
            setPage(1);
          }}
          style={{padding: 8, border: '1px solid #ccc', borderRadius: 6}}
        />
        <input
          placeholder="acctid"
          value={acctid}
          onChange={(e) => {
            setAcctid(e.target.value);
            setPage(1);
          }}
          style={{padding: 8, border: '1px solid #ccc', borderRadius: 6}}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          style={{padding: 8, border: '1px solid #ccc', borderRadius: 6}}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          style={{padding: 8, border: '1px solid #ccc', borderRadius: 6}}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          style={{padding: 8, border: '1px solid #ccc', borderRadius: 6}}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">CLOSED</option>
          <option value="VOID">VOID</option>
          <option value="QUOTE">QUOTE</option>
        </select>
        <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          Debug
        </label>
      </div>

      {/* Table */}
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid #ddd',
          borderRadius: 6,
        }}
      >
        <table style={{borderCollapse: 'collapse', width: '100%'}}>
          <thead>
            <tr style={{background: '#f7f7f7'}}>
              {headers.map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  style={{
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderBottom: '1px solid #eee',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                  {sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              {debug && (
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderBottom: '1px solid #eee',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Age (days)
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.invoiceid}
                style={{borderBottom: '1px solid #f0f0f0', cursor: 'pointer'}}
                onClick={() => setOpenId(Number(r.invoiceid))}
                title="Click to view details"
              >
                <td style={{padding: '8px 10px'}}>
                  {`${r.patient_last_name || ''}, ${r.patient_first_name || ''}`.replace(/^, /, '')}
                </td>
                <td style={{padding: '8px 10px'}}>{r.invoiceid}</td>
                <td style={{padding: '8px 10px'}}>{fmtDate(r.invoice_date)}</td>
                <td style={{padding: '8px 10px'}}>
                  <StatusChip s={r.status} />
                </td>
                <td style={{padding: '8px 10px'}}>{money(r.sales_cents)}</td>
                <td style={{padding: '8px 10px'}}>{money(r.receipts_cents)}</td>
                <td style={{padding: '8px 10px'}}>{money(r.ins_bal_cents)}</td>
                <td style={{padding: '8px 10px'}}>{money(r.pat_bal_cents)}</td>
                {debug && <td style={{padding: '8px 10px'}}>{r.age_days ?? ''}</td>}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={debug ? headers.length + 1 : headers.length}
                  style={{padding: 16, color: '#666'}}
                >
                  No invoices match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 12}}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Prev
        </button>
        <div>
          Page {page} / {totalPages}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          style={{marginLeft: 8}}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}/page
            </option>
          ))}
        </select>
        <div style={{marginLeft: 'auto'}}>{total.toLocaleString()} total</div>
      </div>

      {/* Detail Drawer (classic layout) */}
      {openId != null && <DetailDrawer invoiceid={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ---------- Detail Drawer (classic layout, with new data) ----------
function DetailDrawer({invoiceid, onClose}) {
  const [data, setData] = useState(null); // { header, lineItems, payments }
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setData(null);
      setErr(null);
      try {
        const res = await fetch(`/api/invoices/${invoiceid}/detail`, {cache: 'no-store'});
        let payload;
        try {
          payload = await res.json();
        } catch {
          throw new Error(`Non-JSON response (HTTP ${res.status})`);
        }
        if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [invoiceid]);

  const header = data?.header;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '720px',
        background: '#fff',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #eee',
        }}
      >
        <div style={{fontWeight: 700, fontSize: 16}}>Invoice #{invoiceid}</div>
        <button onClick={onClose} style={{marginLeft: 'auto'}}>
          Close
        </button>
      </div>

      <div style={{padding: 16, overflowY: 'auto'}}>
        {!data && !err && <div>Loading…</div>}
        {err && <div style={{color: '#b11'}}>Error: {err}</div>}
        {data && (
          <>
            {/* Header summary */}
            <div style={{marginBottom: 12}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                <Info label="Sales" value={money(header.salesCents)} />
                <Info label="Receipts" value={money(header.receiptsCents)} />
                <Info label="Insurance Balance" value={money(header.insuranceBalanceCents)} />
                <Info label="Patient Balance" value={money(header.patientBalanceCents)} />
                <Info label="Patient Discounts" value={money(header.patientDiscountCents)} />
                <Info label="Insurance Write-Offs" value={money(header.insuranceWriteOffCents)} />
              </div>
            </div>

            {/* Line items */}
            <SectionTitle>Line Items</SectionTitle>
            <div
              style={{
                overflowX: 'auto',
                border: '1px solid #eee',
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              <table style={{borderCollapse: 'collapse', width: '100%'}}>
                <thead>
                  <tr style={{background: '#f7f7f7'}}>
                    <Th>Trans #</Th>
                    <Th>Code</Th>
                    <Th>CPT</Th>
                    <Th>Description</Th>
                    <Th>Category</Th>
                    <Th right>Pat</Th>
                    <Th right>Ins</Th>
                    <Th right>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data.lineItems || []).map((ln) => (
                    <tr key={ln.trans_no} style={{borderBottom: '1px solid #f0f0f0'}}>
                      <Td>{ln.trans_no}</Td>
                      <Td>{ln.code || ''}</Td>
                      <Td>{ln.cpt || ''}</Td>
                      <Td>{ln.descr || ''}</Td>
                      <Td>{ln.category || ''}</Td>
                      <Td right>{money(ln.pat)}</Td>
                      <Td right>{money(ln.ins)}</Td>
                      <Td right>{money(ln.total)}</Td>
                    </tr>
                  ))}
                  {(!data.lineItems || !data.lineItems.length) && (
                    <tr>
                      <Td colSpan={8} muted>
                        No lines.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Payments */}
            <SectionTitle>Payments</SectionTitle>
            <div style={{overflowX: 'auto', border: '1px solid #eee', borderRadius: 6}}>
              <table style={{borderCollapse: 'collapse', width: '100%'}}>
                <thead>
                  <tr style={{background: '#f7f7f7'}}>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Payer</Th>
                    <Th>Sub-Type</Th>
                    <Th right>Pat Δ</Th>
                    <Th right>Ins Δ</Th>
                    <Th right>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data.payments || []).map((p, i) => (
                    <tr key={i} style={{borderBottom: '1px solid #f0f0f0'}}>
                      <Td>{fmtDate(p.date)}</Td>
                      <Td>{p.typeLabel}</Td>
                      <Td>{p.payerName}</Td>
                      <Td>{p.subType || ''}</Td>
                      <Td right>{money(p.pat_delta)}</Td>
                      <Td right>{money(p.ins_delta)}</Td>
                      <Td right>{money(p.total_delta)}</Td>
                    </tr>
                  ))}
                  {(!data.payments || !data.payments.length) && (
                    <tr>
                      <Td colSpan={7} muted>
                        No payments.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// lightweight UI bits
function SectionTitle({children}) {
  return <div style={{fontWeight: 700, margin: '12px 0 6px'}}>{children}</div>;
}
function Info({label, value}) {
  return (
    <div>
      <div style={{fontSize: 12, color: '#666'}}>{label}</div>
      <div style={{fontWeight: 600}}>{value || '—'}</div>
    </div>
  );
}
function Th({children, right}) {
  return (
    <th
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '8px 10px',
        borderBottom: '1px solid #eee',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}
function Td({children, right, muted, colSpan}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '8px 10px',
        color: muted ? '#666' : undefined,
      }}
    >
      {children}
    </td>
  );
}
