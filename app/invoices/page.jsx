'use client';

import {useEffect, useState} from 'react';

export default function InvoicesPage() {
  // table/list state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // filters/pager
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [locid, setLocid] = useState('');
  const [acctid, setAcctid] = useState('');

  // ui toggles
  const [showDebug, setShowDebug] = useState(false);

  // detail modal
  const [detail, setDetail] = useState(null);

  // helpers
  const money = (cents) => {
    const v = Number(cents || 0) / 100;
    const s = Math.abs(v).toFixed(2);
    return v < 0 ? `(${s})` : s;
  };

  const statusTag = (s) => {
    const base = {
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: 12,
      fontWeight: 700,
      border: '1px solid #d0d0d0',
      display: 'inline-block',
      minWidth: 54,
      textAlign: 'center',
    };
    const map = {
      OPEN: {background: '#fff7e6', borderColor: '#f0ad4e'},
      PAID: {background: '#e6ffed', borderColor: '#28a745'},
      VOID: {background: '#f8d7da', borderColor: '#dc3545'},
      QUOTE: {background: '#e6f0ff', borderColor: '#0d6efd'},
    };
    return <span style={{...base, ...(map[s] || {})}}>{s}</span>;
  };

  async function fetchList() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    if (locid) params.set('locid', locid);
    if (acctid) params.set('acctid', acctid);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const res = await fetch(`/api/invoices?${params.toString()}`);
    const json = await res.json();
    setRows(Array.isArray(json.rows) ? json.rows : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  async function openDetail(invoiceid) {
    const res = await fetch(`/api/invoices/${invoiceid}`);
    const json = await res.json();
    setDetail(json);
  }

  function resetFilters() {
    setFrom('');
    setTo('');
    setStatus('');
    setLocid('');
    setAcctid('');
    setPage(1);
    fetchList();
  }

  return (
    <div style={{padding: 16, display: 'grid', gap: 12}}>
      {/* Filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 8,
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{display: 'block', fontSize: 12, color: '#555'}}>From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{width: '100%'}}
          />
        </div>
        <div>
          <label style={{display: 'block', fontSize: 12, color: '#555'}}>To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{width: '100%'}}
          />
        </div>
        <div>
          <label style={{display: 'block', fontSize: 12, color: '#555'}}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{width: '100%'}}
          >
            <option value="">Any</option>
            <option>OPEN</option>
            <option>PAID</option>
            <option>VOID</option>
            <option>QUOTE</option>
          </select>
        </div>
        <div>
          <label style={{display: 'block', fontSize: 12, color: '#555'}}>Loc</label>
          <input
            value={locid}
            onChange={(e) => setLocid(e.target.value)}
            placeholder="locid"
            style={{width: '100%'}}
          />
        </div>
        <div>
          <label style={{display: 'block', fontSize: 12, color: '#555'}}>AcctID</label>
          <input
            value={acctid}
            onChange={(e) => setAcctid(e.target.value)}
            placeholder="acctid"
            style={{width: '100%'}}
          />
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <button
            onClick={() => {
              setPage(1);
              fetchList();
            }}
          >
            Apply
          </button>
          <button onClick={resetFilters}>Reset</button>
        </div>
      </div>

      {/* Header + Debug toggle */}
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <h2 style={{margin: 0, fontSize: 18}}>Invoices</h2>
        <label style={{marginLeft: 'auto', fontSize: 13}}>
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
          />{' '}
          Debug
        </label>
      </div>

      {/* Table */}
      <div style={{overflowX: 'auto', border: '1px solid #e5e5e5', borderRadius: 8}}>
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead style={{background: '#fafafa'}}>
            <tr>
              <th style={{textAlign: 'left', padding: 8}}>Invoice</th>
              <th style={{textAlign: 'left', padding: 8}}>Date</th>
              <th style={{textAlign: 'left', padding: 8}}>Patient</th>
              <th style={{textAlign: 'right', padding: 8}}>Pat Bal</th>
              <th style={{textAlign: 'right', padding: 8}}>Ins Bal</th>
              <th style={{textAlign: 'center', padding: 8}}>Status</th>
              <th style={{textAlign: 'center', padding: 8}}>Aging</th>
              <th style={{textAlign: 'left', padding: 8}}>Loc</th>
              <th style={{textAlign: 'left', padding: 8}}>Edited</th>
              {showDebug && <th style={{textAlign: 'left', padding: 8}}>Debug</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={showDebug ? 10 : 9} style={{padding: 12}}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={showDebug ? 10 : 9} style={{padding: 12}}>
                  No invoices
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.invoiceid} style={{borderTop: '1px solid #eee'}}>
                  <td style={{padding: 8}}>
                    <button onClick={() => openDetail(r.invoiceid)} title="Open details">
                      #{r.invoiceid}
                    </button>
                  </td>
                  <td style={{padding: 8}}>{(r.invoice_date || '').slice(0, 10)}</td>
                  <td style={{padding: 8}}>
                    {r.patient_last_name}, {r.patient_first_name}
                  </td>
                  <td style={{padding: 8, textAlign: 'right'}}>{money(r.pat_bal_latest)}</td>
                  <td style={{padding: 8, textAlign: 'right'}}>{money(r.ins_bal_latest)}</td>
                  <td style={{padding: 8, textAlign: 'center'}}>{statusTag(r.status)}</td>
                  <td style={{padding: 8, textAlign: 'center'}}>
                    {r.aging_bucket ? (
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: 999,
                          border: '1px solid #ddd',
                          fontSize: 12,
                        }}
                      >
                        {r.aging_bucket}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{padding: 8}}>{r.locid}</td>
                  <td style={{padding: 8}}>
                    {r.lastedited ? new Date(r.lastedited).toLocaleString() : ''}
                  </td>
                  {showDebug && (
                    <td style={{padding: 8, fontSize: 12}}>
                      acct:{r.acctid} | quote:{r.quote} | void:{r.void_day || '—'}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <div>Page {page}</div>
        <button onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {/* Detail Drawer */}
      {detail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setDetail(null)}
        >
          <div
            style={{
              width: '90%',
              maxWidth: 1100,
              maxHeight: '85vh',
              overflow: 'auto',
              background: 'white',
              borderRadius: 8,
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
              <h3 style={{margin: 0}}>
                Invoice #{detail.invoice.invoiceid} — {detail.invoice.patient_last_name},{' '}
                {detail.invoice.patient_first_name}
              </h3>
              <button style={{marginLeft: 'auto'}} onClick={() => setDetail(null)}>
                Close
              </button>
            </div>

            <div
              style={{marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8}}
            >
              <div>
                <strong>Date</strong>
                <div>{(detail.invoice.day || '').slice(0, 10)}</div>
              </div>
              <div>
                <strong>Created</strong>
                <div>{detail.invoice.createdate || '—'}</div>
              </div>
              <div>
                <strong>Last Edited</strong>
                <div>{detail.invoice.lastedited || '—'}</div>
              </div>
              <div>
                <strong>Loc</strong>
                <div>{detail.invoice.locid}</div>
              </div>
              <div>
                <strong>Pat Bal (last)</strong>
                <div>
                  {money(detail.invoice.pat_bal_after_last_trans ?? detail.invoice.pat_bal)}
                </div>
              </div>
              <div>
                <strong>Ins Bal (last)</strong>
                <div>
                  {money(detail.invoice.ins_bal_after_last_trans ?? detail.invoice.ins_bal)}
                </div>
              </div>
              <div>
                <strong>Quote</strong>
                <div>{detail.invoice.quote ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <strong>Void</strong>
                <div>{detail.invoice.void_day || '—'}</div>
              </div>
            </div>

            {/* PROD summary from parsed XML */}
            <div style={{marginTop: 12}}>
              <h4>Summary</h4>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8}}>
                <div>
                  <strong>Primary Ins</strong>
                  <div>{detail.invoice.xml_parsed?.primaryInsId || '—'}</div>
                </div>
                <div>
                  <strong>Policy</strong>
                  <div>{detail.invoice.xml_parsed?.policy || '—'}</div>
                </div>
                <div>
                  <strong>Auth</strong>
                  <div>{detail.invoice.xml_parsed?.auth || '—'}</div>
                </div>
              </div>
            </div>

            {/* Payments timeline */}
            <div style={{marginTop: 12}}>
              <h4>Payments (trans_pay)</h4>
              <div style={{overflowX: 'auto'}}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign: 'left', padding: 6}}>TransID</th>
                      <th style={{textAlign: 'left', padding: 6}}>Date</th>
                      <th style={{textAlign: 'left', padding: 6}}>Type</th>
                      <th style={{textAlign: 'right', padding: 6}}>Pat Bal</th>
                      <th style={{textAlign: 'right', padding: 6}}>Ins Bal</th>
                      {showDebug && <th style={{textAlign: 'left', padding: 6}}>Debug XML</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.transid} style={{borderTop: '1px solid #eee'}}>
                        <td style={{padding: 6}}>{p.transid}</td>
                        <td style={{padding: 6}}>{(p.day || '').slice(0, 10)}</td>
                        <td style={{padding: 6}}>{p.type ?? '—'}</td>
                        <td style={{padding: 6, textAlign: 'right'}}>{money(p.pat_bal)}</td>
                        <td style={{padding: 6, textAlign: 'right'}}>{money(p.ins_bal)}</td>
                        {showDebug && (
                          <td style={{padding: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap'}}>
                            {p.xml_parsed ? JSON.stringify(p.xml_parsed, null, 2) : p.xml || '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Data line items */}
            <div style={{marginTop: 12}}>
              <h4>Data Lines (trans_data)</h4>
              <div style={{overflowX: 'auto'}}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign: 'left', padding: 6}}>TransID</th>
                      <th style={{textAlign: 'left', padding: 6}}>Type</th>
                      <th style={{textAlign: 'left', padding: 6}}>BC</th>
                      <th style={{textAlign: 'left', padding: 6}}>OptiID</th>
                      {showDebug && <th style={{textAlign: 'left', padding: 6}}>Debug XML</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.dataLines.map((d) => (
                      <tr key={d.transid} style={{borderTop: '1px solid #eee'}}>
                        <td style={{padding: 6}}>{d.transid}</td>
                        <td style={{padding: 6}}>{d.type ?? '—'}</td>
                        <td style={{padding: 6}}>{d.bc || '—'}</td>
                        <td style={{padding: 6}}>{d.optiid || '—'}</td>
                        {showDebug && (
                          <td style={{padding: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap'}}>
                            {d.xml_parsed ? JSON.stringify(d.xml_parsed, null, 2) : d.xml || '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Raw XML (debug) */}
            {showDebug && (
              <div style={{marginTop: 12}}>
                <h4>Invoice XML (sanitized)</h4>
                <pre
                  style={{
                    background: '#f7f7f7',
                    padding: 8,
                    borderRadius: 6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {detail.invoice.xml_sanitized || '—'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
