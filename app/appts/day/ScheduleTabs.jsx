// app/appts/day/ScheduleTabs.jsx
'use client';

import {useCallback} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';

export default function ScheduleTabs({schedules = [], current = 'All'}) {
  const router = useRouter();
  const sp = useSearchParams();

  const onSelect = useCallback(
    (label) => {
      const params = new URLSearchParams(sp?.toString() || '');
      if (!label || label === 'All') params.delete('sched');
      else params.set('sched', label);
      router.push(`/appts/day?${params.toString()}`);
    },
    [router, sp]
  );

  const all = ['All', ...schedules];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: '1px solid #e5e7eb',
          overflowX: 'auto',
        }}
      >
        {all.map((label) => {
          const active = (current || 'All') === label;
          return (
            <button
              key={label}
              onClick={() => onSelect(label)}
              style={{
                padding: '8px 12px',
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                border: '1px solid #e5e7eb',
                borderBottom: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: active ? '#ffffff' : '#f9fafb',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                transform: active ? 'translateY(1px)' : 'none',
                cursor: 'pointer',
              }}
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
