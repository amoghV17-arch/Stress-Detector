import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateVerdictSentence } from '../js/core/verdict.js';

describe('Verdict Sentence Generator', () => {
  test('handles null or empty session gracefully', () => {
    assert.equal(generateVerdictSentence(null), 'No session data available.');
    assert.equal(generateVerdictSentence({}), 'Insufficient data to determine stress. Fewer than three valid typing windows were recorded.');
  });

  test('generates calibration baseline sentence', () => {
    const calSession = {
      meta: { mode: 'CAL' },
      task: { total_chars: 450, elapsed_s: 180 }
    };
    const s = generateVerdictSentence(calSession);
    assert.ok(s.startsWith('Calibration baseline established'));
    assert.ok(s.includes('150 characters per minute'));
  });

  test('detects insufficient data when < 3 valid windows exist', () => {
    const session = {
      meta: { mode: 'RUN' },
      windows: [
        { valid: 1, pred: { cls: 0, p: [0.8, 0.1, 0.1] } },
        { valid: 0 }
      ]
    };
    const s = generateVerdictSentence(session);
    assert.equal(s, 'Insufficient data to determine stress. Fewer than three valid typing windows were recorded.');
  });

  test('produces calibrated low stress verdict', () => {
    const lowSession = {
      meta: { mode: 'RUN' },
      task: { total_chars: 300, uncorrected_errors: 1 },
      windows: [
        { valid: 1, pred: { cls: 0, p: [0.85, 0.10, 0.05] } },
        { valid: 1, pred: { cls: 0, p: [0.80, 0.15, 0.05] } },
        { valid: 1, pred: { cls: 0, p: [0.90, 0.08, 0.02] } }
      ]
    };
    const s = generateVerdictSentence(lowSession);
    assert.ok(s.startsWith('Low stress, 85% sure.'));
    assert.ok(s.includes('steady and relaxed'));
  });

  test('produces calibrated high stress verdict with alert reference', () => {
    const highSession = {
      meta: { mode: 'RUN' },
      alerts: [{ win_id: 3, t: 75000 }],
      windows: [
        { valid: 1, pred: { cls: 1, p: [0.2, 0.6, 0.2] } },
        { valid: 1, pred: { cls: 2, p: [0.1, 0.2, 0.7] } },
        { valid: 1, pred: { cls: 2, p: [0.05, 0.15, 0.8] } },
        { valid: 1, pred: { cls: 2, p: [0.05, 0.15, 0.8] } }
      ]
    };
    const s = generateVerdictSentence(highSession);
    assert.ok(s.startsWith('High stress,'));
    assert.ok(s.includes('sure.'));
    assert.ok(s.includes('1:15'));
  });
});
