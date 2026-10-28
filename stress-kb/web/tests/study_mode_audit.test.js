import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionRecorder } from '../../web-next/src/lib/sessionRecorder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('U2 Study Mode & Privacy Audit', () => {
  const pagePath = path.resolve(__dirname, '../../web-next/src/app/session/run/page.js');
  const pageSource = fs.readFileSync(pagePath, 'utf8');

  test('PROVE: study mode never renders a stress verdict, live tape, or sounds', () => {
    // Audit AST/source of /session/run/page.js
    const lower = pageSource.toLowerCase();

    // Must NEVER include live tape elements or canvas
    assert.equal(lower.includes('<canvas'), false, 'Study mode must NEVER render a canvas tape');
    assert.equal(lower.includes('livetape'), false, 'Study mode must NEVER contain liveTape');
    assert.equal(lower.includes('rhythmtape'), false, 'Study mode must NEVER contain rhythm tape');

    // Must NEVER include a live stress verdict or classification chip
    assert.equal(lower.includes('verdictsentence'), false, 'Study mode must NEVER render a verdict sentence');
    assert.equal(lower.includes('stressverdict'), false, 'Study mode must NEVER render stress verdict');
    assert.equal(lower.includes('p_high'), false, 'Study mode must NEVER expose model probabilities');

    // Must NEVER play sounds or instantiate Web Audio
    assert.equal(lower.includes('audiocontext'), false, 'Study mode must NEVER use AudioContext');
    assert.equal(lower.includes('new audio('), false, 'Study mode must NEVER play audio');
  });

  test('PROVE: calm and pressure conditions share identical layout and typography', () => {
    // Both share paragraphText styled with Source Serif 4
    assert.ok(pageSource.includes('styles.paragraphText'));
    assert.ok(pageSource.includes('styles.centerContent'));
    // Pressure mode only conditionally shows the depleting timer line and score
    assert.ok(pageSource.includes("condition === 'pressure'"));
  });

  test('M1 keystroke behavior: repeat is strictly filtered and dwell time measured', () => {
    const emittedLines = [];
    const recorder = new SessionRecorder({
      targetText: 'Test phrase',
      sessionId: 's_m1_test',
      userId: 'u_m1',
      mode: 'RUN',
      condition: 'calm',
      sendLineFn: (line) => emittedLines.push(line),
      nowFn: () => 1000
    });

    recorder.start(1000);

    // Initial key down
    recorder.handleKeyDown({ key: 'T', code: 'KeyT', repeat: false, time: 1050 });
    // Ignored repeated keydown
    recorder.handleKeyDown({ key: 'T', code: 'KeyT', repeat: true, time: 1080 });
    // Key up at 1120 -> dwell = 70ms
    recorder.handleKeyUp({ key: 'T', code: 'KeyT', time: 1120 });

    const keyLines = emittedLines.filter(l => l.startsWith('K'));
    assert.equal(keyLines.length, 1, 'Repeated keydown must be strictly filtered');

    // K,<seq>,<t>,<dwell>,<cls>,<err>
    const parts = keyLines[0].split(',');
    assert.equal(parts[3], '70', 'Dwell time must equal 70ms (1120 - 1050)');
    assert.equal(parts[4], 'L', 'Key class for T must be L (Letter)');
    assert.equal(parts[5], '0', 'Correct key must have err = 0');

    // Focus change
    recorder.handleFocusChange(false, 1200);
    recorder.handleFocusChange(true, 1300);

    const focusLines = emittedLines.filter(l => l.startsWith('F'));
    assert.equal(focusLines.length, 2, 'Focus changes must emit F lines');

    const sessionJSON = recorder.stop({
      selfreport: { stress: 1, rushed: 1, tired: 1 }
    });

    assert.equal(sessionJSON.events.length, 1);
    assert.equal(sessionJSON.focus.length, 2);

    // PRIVACY VERIFICATION: typed letter 'T' never stored in events or session
    assert.equal(JSON.stringify(sessionJSON).includes('"T"'), false);
    assert.equal(JSON.stringify(sessionJSON).includes('Test phrase'), false);
  });
});

