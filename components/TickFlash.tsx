'use client';

interface TickFlashProps {
  value: number;
  children: React.ReactNode;
  className?: string;
}

export default function TickFlash({ value, children, className = '' }: TickFlashProps) {
  return (
    <span className={className}>
      {children}
    </span>
  );
}
