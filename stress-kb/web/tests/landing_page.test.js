import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

describe('U7 Landing Page Specification & Copy Audit', () => {
  const pagePath = path.join(projectRoot, 'web-next', 'src', 'app', 'page.js');
  const pageCode = fs.readFileSync(pagePath, 'utf-8');

  test('no marketing filler, no AI-powered buzzwords', () => {
    const prohibitedWords = [
      'AI-powered',
      'ai-powered',
      'revolutionary',
      'game-changing',
      'next-generation',
      'seamless',
      'supercharge',
      'magic'
    ];

    prohibitedWords.forEach(word => {
      assert.ok(!pageCode.includes(word), `Landing page must not contain marketing buzzword "${word}"`);
    });
  });

  test('contains all 6 pipeline steps in exact sequence', () => {
    assert.ok(pageCode.includes('Keystroke timing events'));
    assert.ok(pageCode.includes('30-second window aggregation'));
    assert.ok(pageCode.includes('18 biometric features'));
    assert.ok(pageCode.includes('Personal baseline normalisation'));
    assert.ok(pageCode.includes('Edge TinyML inference'));
    assert.ok(pageCode.includes('Stateful decision & verdict'));
  });

  test('contains strict privacy and hardware sections', () => {
    assert.ok(pageCode.includes('Timing only, never what you type'));
    assert.ok(pageCode.includes('How the ESP32 is used'));
    assert.ok(pageCode.includes('BH1750'));
    assert.ok(pageCode.includes('SSD1306'));
  });

  test('primary CTA actions link to /session and /demo', () => {
    assert.ok(pageCode.includes('href="/session"'));
    assert.ok(pageCode.includes('href="/demo"'));
    assert.ok(pageCode.includes('Set up a session'));
  });
});

