'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function ClientOrientationLock() {
  const pathname = usePathname();

  useEffect(() => {
    // Determine if we are on a route that includes a chart
    // The TradingChart component unlocks the orientation on its own,
    // but just to be absolutely sure we don't conflict, we re-lock on route changes 
    // to any non-chart path, and lock globally on mount.
    
    // We can rely on TradingChart's own useEffect to unlock it.
    // Here we apply a global portrait lock.
    if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }, [pathname]); // Re-run this check when the route changes to ensure we remain locked

  return null;
}
