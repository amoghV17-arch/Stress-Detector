import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TypingEngine, mapKeyClass } from '../js/core/typing_engine.js';
import { FakeESP32 } from '../sim/fake-esp32.js';

describe('TypingEngine & Privacy Contract', () => {
  test('mapKeyClass maps all key types accurately', () => {
    assert.equal(mapKeyClass('a'), 'L');
    assert.equal(mapKeyClass('Z'), 'L');
    assert.equal(mapKeyClass(' '), 'S');
    assert.equal(mapKeyClass('Backspace'), 'B');
    assert.equal(mapKeyClass('Enter'), 'E');
    assert.equal(mapKeyClass('.'), 'P');
    assert.equal(mapKeyClass(','), 'P');
    assert.equal(mapKeyClass('?'), 'P');
    assert.equal(mapKeyClass('3'), 'P');
    assert.equal(mapKeyClass('Shift'), 'M');
    assert.equal(mapKeyClass('Control'), 'M');
    assert.equal(mapKeyClass('Alt'), 'M');
  });

  test('repeat is strictly ignored', () => {
    const lines = [];
    const engine = new TypingEngine({
      targetText: 'hello',
      onSerialLine: (l) => lines.push(l)
    });

    engine.start(1000);
    // Keydown with repeat: true
    engine.handleKeyDown({ key: 'h', code: 'KeyH', repeat: true, time: 1050 });
    engine.handleKeyUp({ key: 'h', code: 'KeyH', time: 1100 });

    // Only S,START was emitted, no K line
    const kLines = lines.filter(l => l.startsWith('K'));
    assert.equal(kLines.length, 0);
  });

  test('dwell calculation on key release', () => {
    const lines = [];
    const engine = new TypingEngine({
      targetText: 'test',
      onSerialLine: (l) => lines.push(l)
    });

    engine.start(1000);
    // Key down at 1100, up at 1185 -> dwell = 85ms
    engine.handleKeyDown({ key: 't', code: 'KeyT', repeat: false, time: 1100 });
    engine.handleKeyUp({ key: 't', code: 'KeyT', time: 1185 });

    const kLines = lines.filter(l => l.startsWith('K'));
    assert.equal(kLines.length, 1);
    // Format: K,<seq>,<t_down>,<dwell>,<class>,<err>
    // t_down = 1100 - 1000 = 100
    assert.equal(kLines[0], 'K,1,100,85,L,0');
  });

  test('error flag detection and backspace cursor recovery', () => {
    const lines = [];
    const engine = new TypingEngine({
      targetText: 'cat',
      onSerialLine: (l) => lines.push(l)
    });

    engine.start(1000);

    // 1. Correct 'c'
    engine.handleKeyDown({ key: 'c', code: 'KeyC', repeat: false, time: 1050 });
    engine.handleKeyUp({ key: 'c', code: 'KeyC', time: 1100 });

    // 2. Mistake: types 'x' instead of 'a' -> err = 1
    engine.handleKeyDown({ key: 'x', code: 'KeyX', repeat: false, time: 1150 });
    engine.handleKeyUp({ key: 'x', code: 'KeyX', time: 1200 });

    // 3. Backspace retreats cursor -> err = 0
    engine.handleKeyDown({ key: 'Backspace', code: 'Backspace', repeat: false, time: 1250 });
    engine.handleKeyUp({ key: 'Backspace', code: 'Backspace', time: 1300 });

    // 4. Correct 'a'
    engine.handleKeyDown({ key: 'a', code: 'KeyA', repeat: false, time: 1350 });
    engine.handleKeyUp({ key: 'a', code: 'KeyA', time: 1400 });

    const kLines = lines.filter(l => l.startsWith('K'));
    assert.equal(kLines.length, 4);
    assert.equal(kLines[0], 'K,1,50,50,L,0');   // 'c' correct
    assert.equal(kLines[1], 'K,2,150,50,L,1');  // 'x' error
    assert.equal(kLines[2], 'K,3,250,50,B,0');  // Backspace
    assert.equal(kLines[3], 'K,4,350,50,L,0');  // 'a' correct
  });

  test('blur flushes pending keys with dwell = 0', () => {
    const lines = [];
    const engine = new TypingEngine({
      targetText: 'test',
      onSerialLine: (l) => lines.push(l)
    });

    engine.start(1000);
    // Key pressed down at 1100
    engine.handleKeyDown({ key: 't', code: 'KeyT', repeat: false, time: 1100 });

    // Window blurs at 1150 before keyup
    engine.handleFocusChange(false, 1150);

    const kLines = lines.filter(l => l.startsWith('K'));
    assert.equal(kLines.length, 1);
    assert.equal(kLines[0], 'K,1,100,0,L,0'); // dwell = 0

    const fLines = lines.filter(l => l.startsWith('F'));
    assert.equal(fLines.length, 1);
    assert.equal(fLines[0], 'F,2,150,0'); // seq shared, incremented to 2
  });

  test('shared sequence numbering across K and F events', () => {
    const lines = [];
    const engine = new TypingEngine({
      targetText: 'hi',
      onSerialLine: (l) => lines.push(l)
    });

    engine.start(1000);
    engine.handleKeyDown({ key: 'h', code: 'KeyH', repeat: false, time: 1020 });
    engine.handleKeyUp({ key: 'h', code: 'KeyH', time: 1080 }); // seq 1
    engine.handleFocusChange(false, 1100);                         // seq 2
    engine.handleFocusChange(true, 1200);                          // seq 3
    engine.handleKeyDown({ key: 'i', code: 'KeyI', repeat: false, time: 1250 });
    engine.handleKeyUp({ key: 'i', code: 'KeyI', time: 1300 }); // seq 4

    const seqs = lines
      .filter(l => l.startsWith('K') || l.startsWith('F'))
      .map(l => parseInt(l.split(',')[1], 10));

    assert.deepEqual(seqs, [1, 2, 3, 4]);
  });

  test('PRIVACY AUDIT: exported session contains NO typed characters', () => {
    const secretWord = "SuperSecretPassword123!";
    const engine = new TypingEngine({
      targetText: secretWord
    });

    engine.start(1000);
    for (let i = 0; i < secretWord.length; i++) {
      engine.handleKeyDown({ key: secretWord[i], code: `Key${i}`, repeat: false, time: 1000 + i * 100 });
      engine.handleKeyUp({ key: secretWord[i], code: `Key${i}`, time: 1050 + i * 100 });
    }
    engine.stop();

    const sessionJSON = engine.exportSessionJSON({
      selfreport: { stress: 2, rushed: 3, tired: 1 }
    });
    const serialized = JSON.stringify(sessionJSON);

    // Verify neither the whole secret nor individual sensitive substrings exist in fields
    assert.equal(serialized.includes(secretWord), false);
    assert.equal(serialized.includes("SuperSecret"), false);
    assert.equal(serialized.includes("Password"), false);

    // Deep inspection of all string values in the JSON
    function inspectStrings(obj) {
      if (typeof obj === 'string') {
        // Allowed string values are protocol tokens only
        const allowed = ['CAL', 'RUN', 'REPLAY', 'calm', 'pressure', 'normal', 'dim', 's01', 'u01', '0.1', '1.0', 'L', 'S', 'B', 'E', 'P', 'M'];
        const isISODate = /^\d{4}-\d{2}-\d{2}T/.test(obj);
        if (!allowed.includes(obj) && !isISODate) {
          assert.fail(`Found unexpected string in exported session: "${obj}"`);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(inspectStrings);
      } else if (obj !== null && typeof obj === 'object') {
        Object.values(obj).forEach(inspectStrings);
      }
    }

    inspectStrings(sessionJSON);
  });

  test('simulated 5-minute typing session end-to-end with fake ESP32', () => {
    const sim = new FakeESP32();
    const emittedFromSim = [];
    sim.onLine = (line) => emittedFromSim.push(line);

    const engine = new TypingEngine({
      targetText: "The quiet morning air was filled with the gentle rustle of leaves as sunlight broke through the distant clouds. Birds circled above the tall oak trees while a cool breeze swept through the valley. Walking along the winding trail felt peaceful and calm, offering a welcomed moment of stillness before the busy routine of the day began in the crowded city nearby.",
      sessionId: "s_sim",
      userId: "u_sim",
      mode: "RUN",
      onSerialLine: (line) => sim.receive(line)
    });

    let simTime = 0;
    engine.start(simTime);

    // Simulate 300 seconds (5 minutes) of realistic typing at 180 kpm (3 keys/sec)
    let charIdx = 0;
    const text = engine.targetText;

    for (let sec = 1; sec <= 300; sec++) {
      simTime += 1000;
      // 3 keys per second
      for (let k = 0; k < 3; k++) {
        const char = text[charIdx % text.length];
        charIdx++;
        const downT = simTime + k * 300;
        const upT = downT + 75; // 75ms dwell
        engine.handleKeyDown({ key: char, code: `Code_${char}`, repeat: false, time: downT });
        engine.handleKeyUp({ key: char, code: `Code_${char}`, time: upT });
      }
      // 1 Hz heartbeat
      engine.handleHeartbeat(simTime);
      // Feed simulated lux in REPLAY/RUN
      sim.receive(`R,${simTime},320`);
    }

    engine.stop();

    // Verify windows closed and FEAT lines emitted
    const featLines = emittedFromSim.filter(l => l.startsWith('FEAT'));
    const predLines = emittedFromSim.filter(l => l.startsWith('PRED'));

    // A 300-second session with 30s windows and 15s hop yields about (300 - 30) / 15 + 1 = 19 windows
    assert.ok(featLines.length >= 18, `Expected >= 18 FEAT lines, got ${featLines.length}`);
    assert.ok(predLines.length >= 18, `Expected >= 18 PRED lines, got ${predLines.length}`);

    // Feed lines back to engine to complete session JSON
    emittedFromSim.forEach(l => engine.handleIncomingDeviceLine(l));

    const sessionJSON = engine.exportSessionJSON({
      selfreport: { stress: 2, rushed: 1, tired: 3 }
    });

    assert.equal(sessionJSON.windows.length >= 18, true);
    assert.equal(sessionJSON.events.length > 500, true);
  });
});
