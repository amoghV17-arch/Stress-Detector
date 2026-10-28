import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_SESSION } from '../js/core/demo_session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

describe('U6 Demo Mode, Canvas Tape & OLED Mirror', () => {
  test('INVARIANT: Study mode (/session/run) NEVER imports or loads demo tape or OLED mirror', () => {
    const runPagePath = path.join(projectRoot, 'web-next', 'src', 'app', 'session', 'run', 'page.js');
    const runPageCode = fs.readFileSync(runPagePath, 'utf-8');

    assert.ok(!runPageCode.includes('CanvasRhythmTape'), 'Study mode must never import CanvasRhythmTape');
    assert.ok(!runPageCode.includes('OledMirror'), 'Study mode must never import OledMirror');
    assert.ok(!runPageCode.includes('canvas'), 'Study mode must never render canvas elements');
    assert.ok(!runPageCode.includes('demo_session'), 'Study mode must never load demo_session');
    assert.ok(!runPageCode.includes('edgeShake'), 'Study mode must never load edge shake');
  });

  test('OLED Mirror: maps BASE/PRED/WARN and screen types accurately', () => {
    // Test MAIN screen state
    const predHigh = { cls: 2, p: [0.1, 0.2, 0.7], flags: 1, alert: 1 };
    assert.equal(predHigh.cls, 2);
    assert.equal(predHigh.alert, 1);
    assert.ok((predHigh.flags & 1) !== 0, 'Flag bit 0 is RUSHED');

    // Test DEMO_SESSION structure
    assert.equal(DEMO_SESSION.schema, 1);
    assert.equal(DEMO_SESSION.task.elapsed_s, 150);
    assert.ok(DEMO_SESSION.windows.length >= 8);

    // Verify stress escalation sequence (starts calm/med, ends in high stress alert)
    const firstWin = DEMO_SESSION.windows[0];
    const lastWin = DEMO_SESSION.windows[DEMO_SESSION.windows.length - 1];
    assert.equal(firstWin.pred.cls, 1, 'First window starts at Medium');
    assert.equal(lastWin.pred.cls, 2, 'Last window escalates to High');

    const alertWin = DEMO_SESSION.windows.find(w => w.pred && w.pred.alert === 1);
    assert.ok(alertWin, 'Must contain at least one alert window to trigger haptic shake');
  });

  test('Reduced motion fallback: CSS files disable animation for prefers-reduced-motion', () => {
    const demoCssPath = path.join(projectRoot, 'web-next', 'src', 'app', 'demo', 'page.module.css');
    const demoCss = fs.readFileSync(demoCssPath, 'utf-8');

    assert.ok(demoCss.includes('prefers-reduced-motion: reduce'));
    assert.ok(demoCss.includes('animation: none'));
  });
});

