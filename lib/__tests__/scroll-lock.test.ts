import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Helper to read a CSS file relative to the project root
function readCss(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

// ── Requirement 16.2 ─────────────────────────────────────────────────────────
// The Orders page scroll lock must be wrapped in @media (max-width: 500px)
describe('Orders page scroll lock scoping (Requirement 16.2)', () => {
  const css = readCss('app/order/page.css');

  test('html:has(.ord-root) overflow rule exists inside @media (max-width: 500px)', () => {
    // Find the media query block for max-width: 500px
    const mediaBlockMatch = css.match(/@media\s*\(\s*max-width\s*:\s*500px\s*\)\s*\{([\s\S]*?)\}/);
    expect(mediaBlockMatch).not.toBeNull();

    const mediaBlockContent = mediaBlockMatch![1];
    expect(mediaBlockContent).toContain('html:has(.ord-root)');
    expect(mediaBlockContent).toContain('overflow');
  });

  test('body:has(.ord-root) overflow rule exists inside @media (max-width: 500px)', () => {
    const mediaBlockMatch = css.match(/@media\s*\(\s*max-width\s*:\s*500px\s*\)\s*\{([\s\S]*?)\}/);
    expect(mediaBlockMatch).not.toBeNull();

    const mediaBlockContent = mediaBlockMatch![1];
    expect(mediaBlockContent).toContain('body:has(.ord-root)');
    expect(mediaBlockContent).toContain('overflow');
  });

  test('html:has(.ord-root) overflow rule does NOT appear outside the media query', () => {
    // Remove the @media (max-width: 500px) block and check the remainder
    const withoutMediaBlock = css.replace(
      /@media\s*\(\s*max-width\s*:\s*500px\s*\)\s*\{[\s\S]*?\}/,
      ''
    );
    expect(withoutMediaBlock).not.toContain('html:has(.ord-root)');
  });
});

// ── Requirement 16.3 ─────────────────────────────────────────────────────────
// The Positions page scroll lock must be wrapped in @media (max-width: 500px)
describe('Positions page scroll lock scoping (Requirement 16.3)', () => {
  const css = readCss('app/position/page.css');

  test('html:has(.pos-root) overflow rule exists inside @media (max-width: 500px)', () => {
    const mediaBlockMatch = css.match(/@media\s*\(\s*max-width\s*:\s*500px\s*\)\s*\{([\s\S]*?)\}/);
    expect(mediaBlockMatch).not.toBeNull();

    const mediaBlockContent = mediaBlockMatch![1];
    expect(mediaBlockContent).toContain('html:has(.pos-root)');
    expect(mediaBlockContent).toContain('overflow');
  });

  test('body:has(.pos-root) overflow rule exists inside @media (max-width: 500px)', () => {
    const mediaBlockMatch = css.match(/@media\s*\(\s*max-width\s*:\s*500px\s*\)\s*\{([\s\S]*?)\}/);
    expect(mediaBlockMatch).not.toBeNull();

    const mediaBlockContent = mediaBlockMatch![1];
    expect(mediaBlockContent).toContain('body:has(.pos-root)');
    expect(mediaBlockContent).toContain('overflow');
  });

  test('html:has(.pos-root) overflow rule does NOT appear outside the media query', () => {
    const withoutMediaBlock = css.replace(
      /@media\s*\(\s*max-width\s*:\s*500px\s*\)\s*\{[\s\S]*?\}/,
      ''
    );
    expect(withoutMediaBlock).not.toContain('html:has(.pos-root)');
  });
});

// ── Requirement 16.1 ─────────────────────────────────────────────────────────
// The Buysegment page must NOT set body { overflow: hidden } as a global rule
describe('Buysegment page global overflow safety (Requirement 16.1)', () => {
  const css = readCss('app/buysegment/page.css');

  test('body { overflow: hidden } does NOT appear as a global (unscoped) rule', () => {
    // Strip all @media blocks, then check that no bare body overflow: hidden remains
    const withoutMediaBlocks = css.replace(/@media\s*[^{]+\{[\s\S]*?\}/g, '');
    // A global rule would be: body { ... overflow: hidden ... } with no selector scoping
    const globalBodyOverflowHidden = /\bbody\s*\{[^}]*overflow\s*:\s*hidden[^}]*\}/;
    expect(withoutMediaBlocks).not.toMatch(globalBodyOverflowHidden);
  });

  test('any body overflow: hidden rule is scoped inside a media query', () => {
    // If overflow: hidden appears on body at all, it must be inside a @media block
    const hasBodyOverflowHidden = /body[^{]*\{[^}]*overflow\s*:\s*hidden/.test(css);
    if (!hasBodyOverflowHidden) {
      // No body overflow: hidden at all — that's fine too
      return;
    }

    // Find all @media blocks and check that body overflow: hidden only appears inside them
    const mediaBlocks = [...css.matchAll(/@media\s*[^{]+\{([\s\S]*?)\}/g)].map(m => m[1]);
    const bodyOverflowInMedia = mediaBlocks.some(block =>
      /body[^{]*\{[^}]*overflow\s*:\s*hidden/.test(block)
    );
    expect(bodyOverflowInMedia).toBe(true);
  });
});
