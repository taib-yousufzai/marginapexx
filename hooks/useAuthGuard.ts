'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * Route protection hook.
 * Call this at the top of any protected page component.
 * If no valid session exists, redirects to /login using router.replace
 * (so /login does not appear in the browser history stack).
 *
 * Must only be used in 'use client' components — the underlying
 * session check runs inside useEffect, making it SSR-safe.
 *
 * Validates: Requirements 5.1, 5.3, 6.4
 */
export function useAuthGuard(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (!cancelled && !session) {
        router.replace('/login');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);
}
