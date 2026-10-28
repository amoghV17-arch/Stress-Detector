import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTimeSeriesChannels } from '../js/core/series.js';

describe('Time Series Derivation Helper', () => {
  test('derives channels from empty session without crashing', () => {
    const res = deriveTimeSeriesChannels(null);
    assert.equal(res.durationSeconds, 300);
    assert.equal(res.stress.length, 0);
  });

  test('derives stress stepped trace, errors, pauses, and light accurately', () => {
    const session = {
      meta: { has_light_sensor: true },
      task: { elapsed_s: 60 },
      events: [
        [1, 1000, 'L', 50, 0],
        [2, 2000, 'L', 50, 0],
        [3, 5000, 'B', 60, 1], // Pause: 5000 - 2050 = 2950ms (> 2s), and Error/Backspace
        [4, 5200, 'B', 60, 1],
        [5, 5400, 'B', 60, 1], // 3 backspaces streak -> Burst
        [6, 6000, 'L', 50, 0]
      ],
      lux: [
        [1000, 350.2],
        [10000, 360.5]
      ],
      windows: [
        { win_id: 0, t_end: 30000, valid: 1, pred: { cls: 1, p: [0.1, 0.7, 0.2], flags: 1, alert: 0 } },
        { win_id: 1, t_end: 45000, valid: 1, pred: { cls: 2, p: [0.05, 0.15, 0.8], flags: 0, alert: 1 } }
      ],
      alerts: [
        { win_id: 1, t: 45000 }
      ]
    };

    const res = deriveTimeSeriesChannels(session);
    assert.equal(res.durationSeconds, 60);
    assert.equal(res.stress.length, 2);
    assert.equal(res.stress[0].cls, 1);
    assert.equal(res.stress[1].cls, 2);

    // Pause detected
    assert.equal(res.pauses.length, 1);
    assert.equal(res.pauses[0].durationS >= 2.9, true);

    // Errors and backspace burst
    assert.equal(res.errors.length, 3);
    assert.equal(res.errors[2].isBurst, true, 'Third consecutive backspace must be flagged as burst');

    // Light
    assert.equal(res.light.length, 2);
    assert.equal(res.light[0].lux, 350.2);

    // Margin notes: 1 flag (RUSHED, bit 0) + 1 alert
    const flags = res.marginNotes.filter(n => n.type === 'flag');
    const alerts = res.marginNotes.filter(n => n.type === 'alert');
    assert.equal(flags.length, 1);
    assert.equal(flags[0].label, 'RUSHED');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].label, 'Alert');
  });

  test('omits light channel when has_light_sensor is false', () => {
    const session = {
      meta: { has_light_sensor: false },
      lux: [[1000, 350]]
    };
    const res = deriveTimeSeriesChannels(session);
    assert.equal(res.hasLight, false);
    assert.equal(res.light.length, 0);
  });
});
