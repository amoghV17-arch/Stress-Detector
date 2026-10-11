import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HandshakeController } from '../js/core/handshake.js';

describe('HandshakeController', () => {
  test('immediate READY on first attempt succeeds', () => {
    let sent = [];
    let successResult = null;
    let failureError = null;

    const hs = new HandshakeController({
      sendFn: (msg) => sent.push(msg),
      onSuccess: (info) => { successResult = info; },
      onFailure: (err) => { failureError = err; }
    });

    hs.start();
    assert.deepEqual(sent, ['HELLO,1']);

    const accepted = hs.handleLine('READY,0.1,1');
    assert.equal(accepted, true);
    assert.equal(hs.completed, true);
    assert.equal(successResult.version, '0.1');
    assert.equal(successResult.protocol, 1);
    assert.equal(failureError, null);
  });

  test('retries every 500ms when device does not reply immediately', () => {
    let sent = [];
    let scheduledTimers = [];
    let virtualTime = 0;

    const mockSetTimeout = (fn, delay) => {
      const id = { fn, due: virtualTime + delay };
      scheduledTimers.push(id);
      return id;
    };
    const mockClearTimeout = (id) => {
      scheduledTimers = scheduledTimers.filter(t => t !== id);
    };

    let successResult = null;
    const hs = new HandshakeController({
      retryIntervalMs: 500,
      maxTimeoutMs: 5000,
      sendFn: (msg) => sent.push(msg),
      onSuccess: (info) => { successResult = info; },
      setTimeoutFn: mockSetTimeout,
      clearTimeoutFn: mockClearTimeout,
      nowFn: () => virtualTime
    });

    hs.start();
    assert.equal(sent.length, 1); // 1st HELLO,1

    // Advance 500ms -> 2nd HELLO
    virtualTime += 500;
    const due500 = scheduledTimers.filter(t => t.due <= virtualTime);
    scheduledTimers = scheduledTimers.filter(t => t.due > virtualTime);
    due500.forEach(t => t.fn());
    assert.equal(sent.length, 2);

    // Advance another 500ms -> 3rd HELLO
    virtualTime += 500;
    const due1000 = scheduledTimers.filter(t => t.due <= virtualTime);
    scheduledTimers = scheduledTimers.filter(t => t.due > virtualTime);
    due1000.forEach(t => t.fn());
    assert.equal(sent.length, 3);

    // Now device replies
    hs.handleLine('READY,0.1,1');
    assert.equal(hs.completed, true);
    assert.equal(successResult.version, '0.1');
  });

  test('tolerates reset banners and junk lines before READY', () => {
    let successResult = null;
    const hs = new HandshakeController({
      sendFn: () => {},
      onSuccess: (info) => { successResult = info; }
    });

    hs.start();
    // Junk output from bootloader/reset
    assert.equal(hs.handleLine('rst:0x1 (POWERON_RESET),boot:0x13'), false);
    assert.equal(hs.handleLine('configsip: 0, SPIWP:0xee'), false);
    assert.equal(hs.handleLine('clk_drv:0x00,q_drv:0x00'), false);
    assert.equal(hs.handleLine('load:0x3fff0030,len:1184'), false);
    assert.equal(hs.handleLine(''), false);
    assert.equal(hs.completed, false);

    // Finally READY arrives
    assert.equal(hs.handleLine('READY,0.1,1'), true);
    assert.equal(hs.completed, true);
    assert.equal(successResult.version, '0.1');
  });

  test('times out after 5000ms if no READY is seen', () => {
    let failureError = null;
    let scheduledTimers = [];
    let virtualTime = 0;

    const mockSetTimeout = (fn, delay) => {
      const id = { fn, due: virtualTime + delay };
      scheduledTimers.push(id);
      return id;
    };
    const mockClearTimeout = (id) => {
      scheduledTimers = scheduledTimers.filter(t => t !== id);
    };

    const hs = new HandshakeController({
      retryIntervalMs: 500,
      maxTimeoutMs: 5000,
      sendFn: () => {},
      onFailure: (err) => { failureError = err; },
      setTimeoutFn: mockSetTimeout,
      clearTimeoutFn: mockClearTimeout,
      nowFn: () => virtualTime
    });

    hs.start();
    // Trigger the 5000ms timer
    const timeoutTimer = scheduledTimers.find(t => t.due === 5000);
    assert.ok(timeoutTimer);
    timeoutTimer.fn();

    assert.ok(failureError);
    assert.match(failureError.message, /timeout/i);
  });
});
