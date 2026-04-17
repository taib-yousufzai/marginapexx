export type BreakpointTier = 'mobile' | 'tablet' | 'desktop';

export interface BreakpointDescriptor {
  name: BreakpointTier;
  minWidth: number;
  maxWidth: number;
  shellMaxWidth: number;
}

export function classifyBreakpoint(viewportWidth: number): BreakpointDescriptor {
  if (viewportWidth <= 500) {
    return { name: 'mobile', minWidth: 0, maxWidth: 500, shellMaxWidth: Math.min(500, viewportWidth) };
  }
  if (viewportWidth <= 1023) {
    return { name: 'tablet', minWidth: 501, maxWidth: 1023, shellMaxWidth: Math.min(900, viewportWidth) };
  }
  return { name: 'desktop', minWidth: 1024, maxWidth: Infinity, shellMaxWidth: Math.min(1280, viewportWidth) };
}
