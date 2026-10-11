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
});
