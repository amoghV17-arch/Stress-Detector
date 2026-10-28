import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateParticipantSchedule } from '../js/core/schedule.js';
import { SessionRecorder } from '../../web-next/src/lib/sessionRecorder.js';
import { FakeESP32 } from '../sim/fake-esp32.js';

describe('U3 Operator Setup & Full Visit Simulation', () => {
  test('generates valid 5-step Latin-square schedule for participant u01 through u04', () => {
    const s1 = generateParticipantSchedule('u01');
    assert.equal(s1.length, 5);
    assert.equal(s1[0].mode, 'CAL');
    assert.equal(s1[0].sessionId, 's01');
    assert.equal(s1[1].sessionId, 's02');
    assert.equal(s1[4].sessionId, 's05');

    // Conditions must be counterbalanced
    const runConds1 = s1.slice(1).map(s => `${s.condition}_${s.lighting}`);
    assert.equal(new Set(runConds1).size, 4, 'All 4 experimental conditions must be presented');
  });

  test('simulates complete operator participant visit (steps 0 to 4) producing 5 valid session files', () => {
    const participantId = 'u02';
    const schedule = generateParticipantSchedule(participantId);
    const sessionFiles = [];

    let calPace = { chars: 250, durationS: 180 };

    for (let i = 0; i < schedule.length; i++) {
      const step = schedule[i];
      const sim = new FakeESP32();
      const emitted = [];
      sim.onLine = (line) => emitted.push(line);

      const recorder = new SessionRecorder({
        targetText: 'Sample text for typing test paragraph in experimental visit simulation.',
        sessionId: step.sessionId,
        userId: participantId,
        mode: step.mode,
        condition: step.condition,
        lighting: step.lighting,
        sendLineFn: (line) => sim.receive(line),
        calBaselinePace: calPace,
        nowFn: () => 1000
      });

      sim.onLine = (line) => recorder.handleDeviceLine(line);

      // Start step
      recorder.start(0);

      // Simulate a few key presses
      recorder.handleKeyDown({ key: 'S', code: 'KeyS', repeat: false, time: 100 });
      recorder.handleKeyUp({ key: 'S', code: 'KeyS', time: 180 });
      recorder.handleKeyDown({ key: 'a', code: 'KeyA', repeat: false, time: 300 });
      recorder.handleKeyUp({ key: 'a', code: 'KeyA', time: 370 });

      // Simulate ESP32 telemetry window
      sim.receive('FEAT,0,30000,2,1,180.0,40.0,75.0,0.3,90.0,20.0,0.2,0.05,0.08,0.02,120.0,1.0,0.5,0.02,-0.3,0.0,250.0,15.0');
      sim.receive('PRED,0,0,0.85,0.10,0.05,0,0,0');

      const sessionJSON = recorder.stop({
        selfreport: { stress: 2, rushed: 1, tired: 2 }
      });

      // Assert schema and file naming
      assert.equal(sessionJSON.schema, 1);
      assert.equal(sessionJSON.meta.user_id, participantId);
      assert.equal(sessionJSON.meta.session_id, step.sessionId);
      assert.equal(sessionJSON.meta.mode, step.mode);
      assert.equal(sessionJSON.meta.condition, step.condition);

      const filename = `${participantId}_${step.sessionId}_${step.mode}_${step.condition}_${step.lighting}.json`;
      sessionFiles.push({ filename, json: sessionJSON });
    }

    assert.equal(sessionFiles.length, 5, 'Must generate exactly 5 session files for visit');
    assert.equal(sessionFiles[0].filename, 'u02_s01_CAL_calm_normal.json');
    assert.equal(sessionFiles[4].filename.startsWith('u02_s05_RUN'), true);
  });
});
