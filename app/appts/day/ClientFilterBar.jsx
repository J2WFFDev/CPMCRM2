'use client';
import {useEffect, useState} from 'react';

export default function ClientFilterBar(props) {
  const [Comp, setComp] = useState(null);

  useEffect(() => {
    let alive = true;
    import('./FilterBar')
      .then((m) => {
        if (alive) setComp(() => m.default);
      })
      .catch(() => {
        if (alive)
          setComp(() => () => (
            <span style={{fontSize: 12, color: '#932'}}>Failed to load FilterBar</span>
          ));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!Comp) {
    return <span style={{fontSize: 12, color: '#666'}}>Loading filters…</span>;
  }
  return <Comp {...props} />;
}
