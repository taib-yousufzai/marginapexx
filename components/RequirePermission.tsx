'use client';

import React, { useEffect, useState } from 'react';
import { getSession } from '@/lib/auth';
import { Permission, hasPermission, AppRole } from '@/lib/permissions';

interface RequirePermissionProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequirePermission({ permission, children, fallback = null }: RequirePermissionProps) {
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (cancelled) return;
      if (!session || !session.user) {
        setIsAllowed(false);
        return;
      }
      
      const role = session.user.user_metadata?.role as AppRole | undefined;
      if (role && hasPermission(role, permission)) {
        setIsAllowed(true);
      } else {
        setIsAllowed(false);
      }
    });
    return () => { cancelled = true; };
  }, [permission]);

  // While loading, return nothing (or a skeleton if desired)
  if (isAllowed === null) return null;

  return isAllowed ? <>{children}</> : <>{fallback}</>;
}
