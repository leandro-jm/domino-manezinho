import { useEffect, useState } from 'react';

export function TurnTimer({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, deadline - now);
  const pct = Math.min(100, (left / (total * 1000)) * 100);
  return (
    <div className={`turn-timer ${left < 5000 ? 'is-low' : ''}`} role="timer" aria-label={`${Math.ceil(left / 1000)} segundos`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
