import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TypingEngine } from '../js/core/typing_engine.js';
import { FakeESP32 } from '../sim/fake-esp32.js';
import { calculatePressureAllowedTime } from '../js/core/schedule.js';
import { SessionRecorder } from '../../web-next/src/lib/sessionRecorder.js';

describe('U1 Session Parity Golden Test', () => {
  test('scripted simulated session produces identical session JSON field by field across old and new state layers', () => {
    const targetText = 'The quiet morning air was filled with the gentle rustle of leaves as sunlight broke through the distant clouds.';
    const sessionId = 's_parity_01';
    const userId = 'u_parity';
    const mode = 'RUN';
    const condition = 'pressure';
    const lighting = 'dim';
    const calBaselinePace = { chars: 300, durationS: 180 };
    const expectedAllowedS = calculatePressureAllowedTime(calBaselinePace.chars, calBaselinePace.durationS, targetText.length);

    // 1. Scripted event stream to replay through both implementations
    // Script contains normal letters, errors, backspaces, and focus loss
    const script = [
      { type: 'key', key: 'T', code: 'KeyT', down: 100, up: 180 },
      { type: 'key', key: 'h', code: 'KeyH', down: 250, up: 320 },
      { type: 'key', key: 'e', code: 'KeyE', down: 400, up: 470 },
      { type: 'key', key: ' ', code: 'Space', down: 550, up: 600 },
      { type: 'focus', gained: false, t: 800 },
      { type: 'focus', gained: true, t: 1200 },
      { type: 'key', key: 'q', code: 'KeyQ', down: 1400, up: 1480 },
      { type: 'key', key: 'u', code: 'KeyU', down: 1600, up: 1670 },
      { type: 'key', key: 'z', code: 'KeyZ', down: 1750, up: 1820 }, // Intentional error
      { type: 'key', key: 'Backspace', code: 'Backspace', down: 1950, up: 2020 },
      { type: 'key', key: 'i', code: 'KeyI', down: 2150, up: 2220 },
      { type: 'key', key: 'e', code: 'KeyE', down: 2300, up: 2360 },
      { type: 'key', key: 't', code: 'KeyT', down: 2450, up: 2510 },
      { type: 'heartbeat', t: 3000 },
      { type: 'heartbeat', t: 4000 },
      { type: 'heartbeat', t: 5000 }
    ];

    // Helper to run script through an implementation
    function runScriptOnEngine(engine, sim) {
      engine.start(0);

      for (const step of script) {
        if (step.type === 'key') {
          engine.handleKeyDown({ key: step.key, code: step.code, repeat: false, time: step.down });
          engine.handleKeyUp({ key: step.key, code: step.code, time: step.up });
        } else if (step.type === 'focus') {
          engine.handleFocusChange(step.gained, step.t);
        } else if (step.type === 'heartbeat') {
          engine.handleHeartbeat(step.t);
        }
      }

      // Simulate a completed window from ESP32 with FEAT and PRED
      sim.receive('FEAT,0,30000,10,1,180.5,45.2,80.0,0.35,90.0,22.0,0.22,0.05,0.08,0.02,120.0,1.05,0.45,0.02,-0.35,0.0,280.0,18.0');
      sim.receive('PRED,0,1,0.20,0.65,0.15,2,0,0');
      sim.receive('WARN,LIGHT_DIM,Ambient lux is low');

      engine.stop();
    }

    // --- EXECUTE PATH A: Old app logic ---
    const oldSimEmitted = [];
    const oldSim = new FakeESP32();
    oldSim.onLine = (line) => oldSimEmitted.push(line);

    const oldEngine = new TypingEngine({
      targetText,
      sessionId,
      userId,
      mode,
      condition,
      lighting,
      onSerialLine: (line) => oldSim.receive(line)
    });

    // Capture and route device lines into oldEngine
    oldSim.onLine = (line) => {
      oldSimEmitted.push(line);
      oldEngine.handleIncomingDeviceLine(line);
    };

    runScriptOnEngine(oldEngine, oldSim);

    const oldJSON = oldEngine.exportSessionJSON({
      selfreport: { stress: 3, rushed: 4, tired: 2 },
      task: { allowed_s: expectedAllowedS, restarts: 0 }
    });

    // --- EXECUTE PATH B: New SessionRecorder abstraction ---
    const newSimEmitted = [];
    const newSim = new FakeESP32();

    const newRecorder = new SessionRecorder({
      targetText,
      sessionId,
      userId,
      mode,
      condition,
      lighting,
      sendLineFn: (line) => newSim.receive(line),
      calBaselinePace: { chars: 300, durationS: 180 },
      nowFn: () => 5000
    });

    newSim.onLine = (line) => {
      newSimEmitted.push(line);
      newRecorder.handleDeviceLine(line);
    };

    // Run same script on newRecorder
    newRecorder.start(0);
    for (const step of script) {
      if (step.type === 'key') {
        newRecorder.handleKeyDown({ key: step.key, code: step.code, repeat: false, time: step.down });
        newRecorder.handleKeyUp({ key: step.key, code: step.code, time: step.up });
      } else if (step.type === 'focus') {
        newRecorder.handleFocusChange(step.gained, step.t);
      } else if (step.type === 'heartbeat') {
        newRecorder.engine.handleHeartbeat(step.t);
      }
    }

    // Same ESP32 simulated telemetry
    newSim.receive('FEAT,0,30000,10,1,180.5,45.2,80.0,0.35,90.0,22.0,0.22,0.05,0.08,0.02,120.0,1.05,0.45,0.02,-0.35,0.0,280.0,18.0');
    newSim.receive('PRED,0,1,0.20,0.65,0.15,2,0,0');
    newSim.receive('WARN,LIGHT_DIM,Ambient lux is low');

    const newJSON = newRecorder.stop({
      selfreport: { stress: 3, rushed: 4, tired: 2 },
      restarts: 0
    });

    // --- FIELD-BY-FIELD GOLDEN ASSERTIONS ---
    assert.equal(newJSON.schema, oldJSON.schema, 'Schema version must match');
    assert.equal(newJSON.synthetic, oldJSON.synthetic, 'Synthetic flag must match');

    // Meta assertions
    assert.equal(newJSON.meta.session_id, oldJSON.meta.session_id);
    assert.equal(newJSON.meta.user_id, oldJSON.meta.user_id);
    assert.equal(newJSON.meta.mode, oldJSON.meta.mode);
    assert.equal(newJSON.meta.condition, oldJSON.meta.condition);
    assert.equal(newJSON.meta.lighting, oldJSON.meta.lighting);
    assert.equal(newJSON.meta.has_light_sensor, oldJSON.meta.has_light_sensor);
    assert.equal(newJSON.meta.fw_version, oldJSON.meta.fw_version);
    assert.equal(newJSON.meta.app_version, oldJSON.meta.app_version);

    // Task assertions
    assert.equal(newJSON.task.total_chars, oldJSON.task.total_chars);
    assert.equal(newJSON.task.uncorrected_errors, oldJSON.task.uncorrected_errors);
    assert.equal(newJSON.task.restarts, oldJSON.task.restarts);
    assert.equal(newJSON.task.allowed_s, oldJSON.task.allowed_s);

    // Keystroke Events (Exact field-by-field array comparison)
    assert.equal(newJSON.events.length, oldJSON.events.length, 'Events count must match');
    assert.deepEqual(newJSON.events, oldJSON.events, 'Events array must match identically');

    // Focus Events
    assert.equal(newJSON.focus.length, oldJSON.focus.length, 'Focus count must match');
    assert.deepEqual(newJSON.focus, oldJSON.focus, 'Focus array must match identically');

    // Windows & Predictions
    assert.equal(newJSON.windows.length, oldJSON.windows.length, 'Windows count must match');
    assert.deepEqual(newJSON.windows, oldJSON.windows, 'Windows array must match identically');

    // Self-report
    assert.deepEqual(newJSON.selfreport, oldJSON.selfreport, 'Selfreport must match identically');

    // Warnings
    assert.equal(newJSON.warnings.length, oldJSON.warnings.length, 'Warnings count must match');
    assert.equal(newJSON.warnings[0].code, oldJSON.warnings[0].code);
    assert.equal(newJSON.warnings[0].detail, oldJSON.warnings[0].detail);
  });
});
