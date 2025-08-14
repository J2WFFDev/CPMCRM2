'use client';
import {useState, useEffect} from 'react';

export default function FilterBar({date, choices, initialSelectedCSV}) {
  const [selected, setSelected] = useState(
    new Set((initialSelectedCSV || '').split(',').filter(Boolean))
  );

  // …pure UI only. No db imports, no server-only modules.
  // Submit via querystring. Don’t fetch DB here.

  return (
    <form action="/appts/day" method="get" style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
      <input type="date" name="date" defaultValue={date} />
      <select
        multiple
        value={[...selected]}
        onChange={(e) => {
          const s = new Set();
          for (const o of e.target.selectedOptions) s.add(o.value);
          setSelected(s);
        }}
      >
        {(choices || []).map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <input type="hidden" name="sel" value={[...selected].join(',')} />
      <button type="submit">Apply</button>
    </form>
  );
}
