'use client';

import { useEffect, useRef, useState } from 'react';

interface TickFlashProps {
  value: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * TickFlash — wraps any element and briefly flashes green (tick-up)
 * or red (tick-down) when `value` changes. Classic trading terminal feel.
 */
export default function TickFlash({ value, children, className = '' }: TickFlashProps) {
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prev.current === null) {
      prev.current = value;
      return;
    }

    if (value === prev.current) return;

    const dir = value > prev.current ? 'up' : 'down';
    prev.current = value;

    // Clear any in-flight animation
    if (timerRef.current) clearTimeout(timerRef.current);

    setFlash(dir);
    timerRef.current = setTimeout(() => setFlash(null), 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  return (
    <span
      className={`tick-flash ${flash === 'up' ? 'tick-up' : flash === 'down' ? 'tick-down' : ''} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
