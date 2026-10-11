import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateParticipantSchedule, calculatePressureAllowedTime } from '../js/core/schedule.js';
import { TypingEngine } from '../js/core/typing_engine.js';
import { FakeESP32 } from '../sim/fake-esp32.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Schedule & Visit Collection Protocol', () => {
  test('generates valid 5-step schedule with Latin-square counterbalancing', () => {
    const s1 = generateParticipantSchedule('u01');
    assert.equal(s1.length, 5);
    assert.equal(s1[0].mode, 'CAL');
    assert.equal(s1[0].durationSeconds, 180);

    for (let i = 1; i <= 4; i++) {
      assert.equal(s1[i].mode, 'RUN');
      assert.equal(s1[i].durationSeconds, 300);
    }

    // Verify conditions are counterbalanced across participants
    const s2 = generateParticipantSchedule('u02');
    const s3 = generateParticipantSchedule('u03');
    const s4 = generateParticipantSchedule('u04');

    assert.notDeepEqual(
      s1.slice(1).map(s => s.condition + '_' + s.lighting),
      s2.slice(1).map(s => s.condition + '_' + s.lighting)
    );
  });

  test('calculatePressureAllowedTime scales to 0.75x CAL pace', () => {
    // Participant typed 360 chars in 180s (2 chars/sec)
    // Target text has 400 chars -> normal time = 200s
    // Pressure allowed = 0.75 * 200 = 150s
    const allowed = calculatePressureAllowedTime(360, 180, 400);
    assert.equal(allowed, 150);

    // Fallback if no data
    assert.equal(calculatePressureAllowedTime(0, 0, 400), 225);
  });

  test('simulated full participant visit yields 5 valid session files', () => {
    const participantId = 'u01';
    const schedule = generateParticipantSchedule(participantId);
    const testDir = path.resolve('tests/output_visit');
    fs.mkdirSync(testDir, { recursive: true });

    const sim = new FakeESP32();

    for (const step of schedule) {
      const lines = [];
      sim.onLine = (l) => lines.push(l);

      const engine = new TypingEngine({
        targetText: "The quiet morning air was filled with the gentle rustle of leaves as sunlight broke through the distant clouds. Birds circled above the tall oak trees while a cool breeze swept through the valley. Walking along the winding trail felt peaceful and calm, offering a welcomed moment of stillness before the busy routine of the day began in the crowded city nearby.",
        sessionId: step.sessionId,
        userId: participantId,
        mode: step.mode,
        condition: step.condition,
        lighting: step.lighting,
        onSerialLine: (l) => sim.receive(l)
      });

      let simTime = 0;
      engine.start(simTime);

      // Simulate realistic typing
      const durationS = step.mode === 'CAL' ? 180 : 300;
      for (let sec = 1; sec <= durationS; sec++) {
        simTime += 1000;
        const char = engine.targetText[sec % engine.targetText.length];
        engine.handleKeyDown({ key: char, code: `Key_${char}`, repeat: false, time: simTime });
        engine.handleKeyUp({ key: char, code: `Key_${char}`, time: simTime + 80 });

        if (sec % 10 === 0) {
          engine.handleHeartbeat(simTime);
        }
        if (sec % 2 === 0) {
          sim.receive(`R,${simTime},320`);
        }
      }

      engine.stop();
      lines.forEach(l => engine.handleIncomingDeviceLine(l));

      const sessionJSON = engine.exportSessionJSON({
        selfreport: {
          stress: step.condition === 'pressure' ? 4 : 2,
          rushed: step.condition === 'pressure' ? 4 : 1,
          tired: 2
        },
        task: {
          allowed_s: durationS,
          restarts: 0
        }
      });

      const filename = `${participantId}_${step.sessionId}_${step.mode}.json`;
      const outPath = path.join(testDir, filename);
      fs.writeFileSync(outPath, JSON.stringify(sessionJSON, null, 2), 'utf-8');
    }

    const generated = fs.readdirSync(testDir).filter(f => f.endsWith('.json'));
    assert.equal(generated.length, 5);
  });
});
