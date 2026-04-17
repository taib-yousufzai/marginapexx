import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Feature: responsive-layout — Integration tests for Footer and theme CSS
// Validates: Requirements 5.2, 5.3, 5.5, 17.1, 20.9, 20.10

const footerCss = fs.readFileSync(
  path.resolve(process.cwd(), 'components/Footer.css'),
  'utf-8'
);

const globalsCss = fs.readFileSync(
  path.resolve(process.cwd(), 'app/globals.css'),
  'utf-8'
);

describe('Footer.css — desktop sidebar', () => {
  // Validates: Requirements 5.3, 20.9
  // At ≥1024px the footer must transform into a fixed left sidebar
  test('contains @media (min-width: 1024px) block with sidebar styles', () => {
    // Find the desktop media query block
    const desktopMediaIndex = footerCss.indexOf('@media (min-width: 1024px)');
    expect(desktopMediaIndex).toBeGreaterThan(-1);

    // Extract the block content after the media query declaration
    const afterMedia = footerCss.slice(desktopMediaIndex);
    const openBrace = afterMedia.indexOf('{');
    expect(openBrace).toBeGreaterThan(-1);

    // Find the matching closing brace for the media block
    let depth = 0;
    let blockEnd = -1;
    for (let i = openBrace; i < afterMedia.length; i++) {
      if (afterMedia[i] === '{') depth++;
      else if (afterMedia[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    expect(blockEnd).toBeGreaterThan(-1);

    const desktopBlock = afterMedia.slice(openBrace, blockEnd + 1);

    // The sidebar must have width: 80px and height: 100vh
    expect(desktopBlock).toContain('width: 80px');
    expect(desktopBlock).toContain('height: 100vh');
  });
});

describe('Footer.css — tablet full-width', () => {
  // Validates: Requirements 5.2, 20.9
  // At 501px+ the footer must expand to max-width: 100%
  test('contains max-width: 100% inside a @media (min-width: 501px) block', () => {
    // Find the tablet media query block
    const tabletMediaIndex = footerCss.indexOf('@media (min-width: 501px)');
    expect(tabletMediaIndex).toBeGreaterThan(-1);

    // Extract the block content after the media query declaration
    const afterMedia = footerCss.slice(tabletMediaIndex);
    const openBrace = afterMedia.indexOf('{');
    expect(openBrace).toBeGreaterThan(-1);

    // Find the matching closing brace for the media block
    let depth = 0;
    let blockEnd = -1;
    for (let i = openBrace; i < afterMedia.length; i++) {
      if (afterMedia[i] === '{') depth++;
      else if (afterMedia[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    expect(blockEnd).toBeGreaterThan(-1);

    const tabletBlock = afterMedia.slice(openBrace, blockEnd + 1);

    // The footer must expand to full width on tablet
    expect(tabletBlock).toContain('max-width: 100%');
  });
});

describe('globals.css — sidebar-width CSS variable', () => {
  // Validates: Requirements 5.5, 20.9
  // At ≥1024px, --sidebar-width must be set to 80px
  test('contains --sidebar-width: 80px inside a @media (min-width: 1024px) block', () => {
    const desktopMediaIndex = globalsCss.indexOf('@media (min-width: 1024px)');
    expect(desktopMediaIndex).toBeGreaterThan(-1);

    const afterMedia = globalsCss.slice(desktopMediaIndex);
    const openBrace = afterMedia.indexOf('{');
    expect(openBrace).toBeGreaterThan(-1);

    // Find the matching closing brace for the media block
    let depth = 0;
    let blockEnd = -1;
    for (let i = openBrace; i < afterMedia.length; i++) {
      if (afterMedia[i] === '{') depth++;
      else if (afterMedia[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    expect(blockEnd).toBeGreaterThan(-1);

    const desktopBlock = afterMedia.slice(openBrace, blockEnd + 1);

    expect(desktopBlock).toContain('--sidebar-width: 80px');
  });
});

describe('globals.css — dark theme preservation', () => {
  // Validates: Requirements 17.1, 20.10
  // body.dark block must exist and define at least --bg-body
  test('contains body.dark block with --bg-body variable', () => {
    const darkBlockIndex = globalsCss.indexOf('body.dark');
    expect(darkBlockIndex).toBeGreaterThan(-1);

    const afterDark = globalsCss.slice(darkBlockIndex);
    const openBrace = afterDark.indexOf('{');
    expect(openBrace).toBeGreaterThan(-1);

    // Find the matching closing brace for the body.dark block
    let depth = 0;
    let blockEnd = -1;
    for (let i = openBrace; i < afterDark.length; i++) {
      if (afterDark[i] === '{') depth++;
      else if (afterDark[i] === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    expect(blockEnd).toBeGreaterThan(-1);

    const darkBlock = afterDark.slice(openBrace, blockEnd + 1);

    // Must define the --bg-body variable
    expect(darkBlock).toContain('--bg-body');
  });
});
