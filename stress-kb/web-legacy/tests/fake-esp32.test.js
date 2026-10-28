import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FakeESP32 } from '../sim/fake-esp32.js';

describe('FakeESP32', () => {
  test('boot and HELLO handshake', () => {
    const emitted = [];
    const sim = new FakeESP32({
      onLine: (line) => emitted.push(line)
    });

    sim.boot();
    assert.deepEqual(emitted, ['READY,0.1,1']);

    emitted.length = 0;
    sim.receive('HELLO,1');
    assert.deepEqual(emitted, ['READY,0.1,1']);
  });

  test('RUN session start emits ACK,S and BASE', () => {
    const emitted = [];
    const sim = new FakeESP32({
      onLine: (line) => emitted.push(line)
    });

    sim.receive('S,START,sess01,u01,RUN');
    assert.equal(emitted[0], 'ACK,S');
    assert.match(emitted[1], /^BASE,u01,0,/);
    sim.receive('S,STOP');
  });

  test('seq gap detection emits WARN,GAP', () => {
    const emitted = [];
    const sim = new FakeESP32({
      onLine: (line) => emitted.push(line)
    });

    sim.receive('S,START,sess01,u01,RUN');
    emitted.length = 0;

    // Send seq 1
    sim.receive('K,1,100,50,L,0');
    assert.equal(emitted.length, 0);

    // Send seq 3 (missing seq 2)
    sim.receive('K,3,250,50,L,0');
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0], 'WARN,GAP,2,3');
    sim.receive('S,STOP');
  });

  test('watchdog emits LINK_LOST after 5s and LINK_OK on recovery', () => {
    let virtualTime = 0;
    let scheduledTimers = [];
    const mockSetTimeout = (fn, delay) => {
      const id = { fn, due: virtualTime + delay };
      scheduledTimers.push(id);
      return id;
    };
    const mockClearTimeout = (id) => {
      scheduledTimers = scheduledTimers.filter(t => t !== id);
    };

    const emitted = [];
    const sim = new FakeESP32({
      onLine: (line) => emitted.push(line),
      nowFn: () => virtualTime,
      setTimeoutFn: mockSetTimeout,
      clearTimeoutFn: mockClearTimeout
    });

    sim.receive('S,START,sess01,u01,RUN');
    emitted.length = 0;

    // Advance 5000ms
    virtualTime += 5000;
    const due = scheduledTimers.filter(t => t.due <= virtualTime);
    scheduledTimers = scheduledTimers.filter(t => t.due > virtualTime);
    due.forEach(t => t.fn());

    assert.ok(emitted.some(l => l.startsWith('WARN,LINK_LOST')));

    // Next event restores link
    emitted.length = 0;
    sim.receive('T,5500');
    assert.ok(emitted.some(l => l.startsWith('WARN,LINK_OK')));
  });

  test('end-to-end scenario (calm then pressure) produces expected alerts and flags', () => {
    const emitted = [];
    const sim = new FakeESP32({
      onLine: (line) => emitted.push(line)
    });

    sim.receive('S,START,sess02,u01,RUN');

    let seq = 1;
    let t = 0;

    // 1. Send 2 calm windows (t up to ~60 000 ms)
    for (let w = 0; w < 2; w++) {
      for (let k = 0; k < 30; k++) {
        t += 800;
        sim.receive(`K,${seq++},${t},70,L,0`);
      }
      t += 5000;
      sim.receive(`T,${t}`);
    }

    let predLines = emitted.filter(l => l.startsWith('PRED'));
    assert.ok(predLines.length >= 2, 'Should emit PRED lines for closed calm windows');
    for (const pl of predLines) {
      const parts = pl.split(',');
      const alert = parseInt(parts[7], 10);
      assert.equal(alert, 0, 'No alert should fire in calm typing');
    }

    // 2. Send sustained pressure windows (rapid typing, high errors, backspaces)
    // Needs 3 consecutive windows with EMA >= 0.6 to fire alert
    for (let w = 0; w < 6; w++) {
      for (let k = 0; k < 80; k++) {
        t += 180;
        const err = (k % 2 === 0) ? 1 : 0;
        const cls = (k % 8 < 3) ? 'B' : 'L'; // runs of 3 consecutive backspaces
        sim.receive(`K,${seq++},${t},150,${cls},${err}`);
      }
      t += 1000;
      sim.receive(`T,${t}`);
    }

    sim.receive('S,STOP');

    predLines = emitted.filter(l => l.startsWith('PRED'));
    assert.ok(predLines.length >= 5, 'Should emit multiple PRED windows across session');

    const flagsFired = predLines.some(l => {
      const parts = l.split(',');
      return parseInt(parts[6], 10) > 0;
    });
    const alertsFired = predLines.some(l => {
      const parts = l.split(',');
      return parseInt(parts[7], 10) === 1;
    });

    assert.ok(flagsFired, 'Behaviour pattern flags should be evaluated and detected');
    assert.ok(alertsFired, 'Alert should trigger under sustained high stress pressure');
  });

  test('failure drill: malformed lines and unknown commands', () => {
    const emitted = [];
    const sim = new FakeESP32({ onLine: (line) => emitted.push(line) });

    sim.receive('S,START,sess_malform,u01,RUN');
    emitted.length = 0;

    // Line exceeding 160 characters
    sim.receive('K,1,100,50,L,0,' + 'X'.repeat(160));
    assert.ok(emitted.some(l => l.includes('WARN,OVERFLOW')));

    // Unknown command safely emits warning
    emitted.length = 0;
    sim.receive('UNKNOWN_CMD,1,2,3');
    assert.ok(emitted[0].startsWith('WARN,UNKNOWN_CMD'));

    // Corrupt key parameters handled without throwing
    assert.doesNotThrow(() => {
      sim.receive('K,notanumber,abc,xyz,INVALID,0');
      sim.receive('K,');
    });

    sim.receive('S,STOP');
  });

  test('failure drill: reset mid-session with HELLO', () => {
    const emitted = [];
    const sim = new FakeESP32({ onLine: (line) => emitted.push(line) });

    sim.receive('S,START,sess_reset,u01,RUN');
    sim.receive('K,1,100,50,L,0');

    emitted.length = 0;
    sim.receive('HELLO,1');
    assert.deepEqual(emitted, ['READY,0.1,1']);

    emitted.length = 0;
    sim.receive('S,START,sess_new,u02,RUN');
    assert.equal(emitted[0], 'ACK,S');
    assert.equal(sim.session.userId, 'u02');

    sim.receive('S,STOP');
  });

  test('failure drill: unplugged sensor operating gracefully', () => {
    const emitted = [];
    const sim = new FakeESP32({ onLine: (line) => emitted.push(line) });

    sim.receive('S,START,sess_nolux,u01,RUN');
    emitted.length = 0;

    for (let i = 1; i <= 30; i++) {
      sim.receive(`K,${i},${i * 500},60,L,0`);
    }
    sim.receive('T,30000');

    const featLine = emitted.find(l => l.startsWith('FEAT'));
    assert.ok(featLine, 'Must emit FEAT without light sensor');
    const parts = featLine.split(',');
    assert.equal(parseFloat(parts[21]), 0); // lux_mean = 0
    assert.equal(parseFloat(parts[22]), 0); // lux_std = 0

    const predLine = emitted.find(l => l.startsWith('PRED'));
    assert.ok(predLine, 'Inference must succeed without sensor data');

    sim.receive('S,STOP');
  });

  test('failure drill: 2000-line burst throughput', () => {
    const emitted = [];
    const sim = new FakeESP32({ onLine: (line) => emitted.push(line) });

    sim.receive('S,START,sess_burst,u01,RUN');
    emitted.length = 0;

    const t0 = performance.now();
    for (let i = 1; i <= 2000; i++) {
      sim.receive(`K,${i},${i * 15},40,L,0`);
    }
    sim.receive('S,STOP');
    const elapsedMs = performance.now() - t0;

    assert.ok(elapsedMs < 1000, `Burst must execute rapidly (took ${elapsedMs.toFixed(1)} ms)`);
    assert.ok(emitted.some(l => l.startsWith('FEAT')));
    assert.equal(sim.session, null);
  });

  test('failure drill: accelerated 30-minute soak test', () => {
    const emitted = [];
    const sim = new FakeESP32({ onLine: (line) => emitted.push(line) });

    sim.receive('S,START,sess_soak,u01,RUN');
    emitted.length = 0;

    const tStart = performance.now();
    let seq = 1;
    // 60 sliding windows (15s hop each = 900s simulated duration)
    for (let w = 0; w < 60; w++) {
      for (let k = 0; k < 20; k++) {
        sim.receive(`K,${seq++},${w * 15000 + k * 500},60,L,0`);
      }
    }
    sim.receive('T,915000');
    sim.receive('S,STOP');
    const soakElapsedMs = performance.now() - tStart;

    assert.ok(soakElapsedMs < 2000, `Soak test must complete quickly (took ${soakElapsedMs.toFixed(1)} ms)`);
    const featCount = emitted.filter(l => l.startsWith('FEAT')).length;
    assert.ok(featCount >= 60, `Must produce >= 60 windows (got ${featCount})`);
    assert.equal(sim.session, null);
  });
});
