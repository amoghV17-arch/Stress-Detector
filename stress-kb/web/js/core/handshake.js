/**
 * Handshake logic implementing docs/PROTOCOL.md
 * Laptop sends HELLO,1 every 500ms (up to maxTimeoutMs, default 5000ms)
 * until it receives READY,<fw_ver>,1.
 */

export class HandshakeController {
  constructor(options = {}) {
    this.retryIntervalMs = options.retryIntervalMs ?? 500;
    this.maxTimeoutMs = options.maxTimeoutMs ?? 5000;
    this.sendFn = options.sendFn ?? (() => {});
    this.onSuccess = options.onSuccess ?? (() => {});
    this.onFailure = options.onFailure ?? (() => {});
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

    this.timer = null;
    this.timeoutTimer = null;
    this.startTime = 0;
    this.completed = false;
  }

  start() {
    this.completed = false;
    this.startTime = this.nowFn();

    // Send initial HELLO,1 immediately
    this.sendFn('HELLO,1');

    // Periodic retry
    const scheduleRetry = () => {
      this.timer = this.setTimeoutFn(() => {
        if (this.completed) return;
        this.sendFn('HELLO,1');
        scheduleRetry();
      }, this.retryIntervalMs);
    };
    scheduleRetry();

    // Timeout
    this.timeoutTimer = this.setTimeoutFn(() => {
      if (this.completed) return;
      this.cancel();
      this.onFailure(new Error('Handshake timeout: no READY received within ' + this.maxTimeoutMs + 'ms'));
    }, this.maxTimeoutMs);
  }

  /**
   * Feed incoming line from serial / simulator
   * @param {string} line
   * @returns {boolean} true if this line completed the handshake
   */
  handleLine(line) {
    if (this.completed) return false;
    const trimmed = (line || '').trim();
    if (!trimmed) return false;

    // Line format: READY,<fw_ver>,1
    const parts = trimmed.split(',');
    if (parts[0] === 'READY' && parts.length >= 3) {
      this.completed = true;
      this.cancel();
      const info = {
        version: parts[1],
        protocol: parseInt(parts[2], 10) || 1,
        raw: trimmed
      };
      this.onSuccess(info);
      return true;
    }
    return false;
  }

  cancel() {
    if (this.timer) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
    if (this.timeoutTimer) {
      this.clearTimeoutFn(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
