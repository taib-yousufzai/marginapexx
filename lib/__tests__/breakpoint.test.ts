import { test } from 'vitest';
import fc from 'fast-check';
import { classifyBreakpoint } from '../breakpoint';

// Feature: responsive-layout, Property 1: Shell never overflows viewport
// Validates: Requirements 20.1
test('shell max-width never exceeds viewport width', () => {
  fc.assert(fc.property(
    fc.integer({ min: 320, max: 2560 }),
    (W) => classifyBreakpoint(W).shellMaxWidth <= W
  ), { numRuns: 100 });
});

// Feature: responsive-layout, Property 2: Mobile tier shell cap
// Validates: Requirements 20.2
test('mobile tier shell max-width is at most 500px', () => {
  fc.assert(fc.property(
    fc.integer({ min: 320, max: 500 }),
    (W) => classifyBreakpoint(W).shellMaxWidth <= 500
  ), { numRuns: 100 });
});

// Feature: responsive-layout, Property 3: Tablet tier shell bounds
// Validates: Requirements 20.3
test('tablet tier shell max-width is between 500 and 900', () => {
  fc.assert(fc.property(
    fc.integer({ min: 501, max: 1023 }),
    (W) => {
      const { shellMaxWidth } = classifyBreakpoint(W);
      return shellMaxWidth > 500 && shellMaxWidth <= 900;
    }
  ), { numRuns: 100 });
});

// Feature: responsive-layout, Property 4: Desktop tier shell cap
// Validates: Requirements 20.4
test('desktop tier shell max-width is at most 1280px', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1024, max: 2560 }),
    (W) => classifyBreakpoint(W).shellMaxWidth <= 1280
  ), { numRuns: 100 });
});

// Feature: responsive-layout, Property 5: Classifier round-trip
// Validates: Requirements 20.5
test('breakpoint classifier round-trip is consistent', () => {
  fc.assert(fc.property(
    fc.integer({ min: 320, max: 2560 }),
    (W) => {
      const tier = classifyBreakpoint(W);
      return classifyBreakpoint(tier.minWidth).name === tier.name;
    }
  ), { numRuns: 100 });
});

// Feature: responsive-layout, Property 6: Monotonicity within tablet tier
// Validates: Requirements 20.6
test('shell max-width is monotonically non-decreasing within tablet tier', () => {
  fc.assert(fc.property(
    fc.integer({ min: 501, max: 1023 }),
    fc.integer({ min: 501, max: 1023 }),
    (W1, W2) => {
      if (W1 >= W2) return true; // only test W1 < W2
      return classifyBreakpoint(W2).shellMaxWidth >= classifyBreakpoint(W1).shellMaxWidth;
    }
  ), { numRuns: 100 });
});

// Feature: responsive-layout, Property 7: Sub-320 viewports produce non-negative values
// Validates: Requirements 20.8
test('sub-320 viewports produce non-negative layout values', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 319 }),
    (W) => {
      const desc = classifyBreakpoint(W);
      return desc.shellMaxWidth >= 0 && desc.minWidth >= 0;
    }
  ), { numRuns: 100 });
});
