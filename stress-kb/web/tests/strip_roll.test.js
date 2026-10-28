import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveTimeSeriesChannels } from '../js/core/series.js';
import { generateVerdictSentence } from '../js/core/verdict.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

describe('U4 Strip Roll Component Data Pipeline', () => {
  const normalSession = loadFixture('normal_session.json');
  const lowCoverageSession = loadFixture('low_coverage_session.json');
  const noBaselineSession = loadFixture('no_baseline_session.json');
  const syntheticSession = loadFixture('synthetic_session.json');
  const calSession = loadFixture('cal_session.json');

  test('normal_session: derives all channels, time ranges, and non-empty traces', () => {
    const data = deriveTimeSeriesChannels(normalSession);
    assert.equal(data.durationSeconds, 150);
    assert.ok(data.stress.length >= 8, 'Normal session should have multiple windows');
    assert.ok(data.speed.length > 0, 'Speed curve must be populated');
    assert.equal(data.errors.length, 0, 'Normal session fixture has empty events');
    assert.equal(data.hasLight, true);

    const verdict = generateVerdictSentence(normalSession);
    assert.ok(verdict.includes('sure.'), 'Verdict must include confidence percentage');
  });

  test('events parsing: derives speed curve, error ticks, backspace bursts, and pauses', () => {
    const sessionWithEvents = {
      task: { elapsed_s: 60, allowed_s: 60 },
      events: [
        [0, 1000, 'L', 100, 0],
        [1, 1200, 'L', 110, 0],
        [2, 1400, 'L', 95, 1],   // error flag
        [3, 1600, 'B', 80, 0],   // backspace
        [4, 1800, 'B', 85, 0],   // backspace
        [5, 2000, 'B', 90, 0],   // backspace burst (streak >= 3)
        [6, 5000, 'L', 105, 0]   // pause > 2000ms
      ],
      windows: []
    };

    const data = deriveTimeSeriesChannels(sessionWithEvents);
    assert.equal(data.errors.length, 4); // 1 error flag + 3 backspaces
    const burst = data.errors.find(e => e.isBurst);
    assert.ok(burst, 'Should flag backspace burst when streak >= 3');
    assert.equal(data.pauses.length, 1, 'Should detect pause >= 2000ms');
    assert.ok(data.pauses[0].durationS >= 2.0);
  });

  test('low_coverage_session: detects insufficient coverage (< 3 valid windows)', () => {
    const data = deriveTimeSeriesChannels(lowCoverageSession);
    const validCount = lowCoverageSession.windows.filter(w => w.valid === 1).length;
    assert.ok(validCount < 3);

    const verdict = generateVerdictSentence(lowCoverageSession);
    assert.ok(verdict.includes('Insufficient data'));
  });

  test('no_baseline_session: handles uncalibrated participant gracefully', () => {
    const data = deriveTimeSeriesChannels(noBaselineSession);
    assert.equal(noBaselineSession.baseline.present, 0);
    assert.ok(data.stress.length > 0);

    const verdict = generateVerdictSentence(noBaselineSession);
    assert.ok(verdict.length > 0);
  });

  test('synthetic_session: flags synthetic session metadata properly', () => {
    assert.equal(syntheticSession.synthetic, true);
    const data = deriveTimeSeriesChannels(syntheticSession);
    assert.ok(data.stress.length > 0);
  });

  test('cal_session: produces baseline summary without error', () => {
    assert.equal(calSession.meta.mode, 'CAL');
    const verdict = generateVerdictSentence(calSession);
    assert.ok(verdict.startsWith('Calibration baseline established'));
  });

  test('geometry validation: time series coordinates contain zero NaN or negative dimensions', () => {
    const data = deriveTimeSeriesChannels(normalSession);
    data.stress.forEach((w) => {
      assert.ok(!isNaN(w.tStartS));
      assert.ok(!isNaN(w.tEndS));
      assert.ok(w.tEndS >= w.tStartS);
    });

    data.speed.forEach((s) => {
      assert.ok(!isNaN(s.tS));
      assert.ok(!isNaN(s.cpm));
      assert.ok(s.cpm >= 0);
    });

    data.errors.forEach((e) => {
      assert.ok(!isNaN(e.tS));
      assert.ok(e.tS >= 0);
    });
  });
});
