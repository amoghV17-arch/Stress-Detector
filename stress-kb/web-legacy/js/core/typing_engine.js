/**
 * Core typing capture and protocol streamer.
 * Pure logic, no DOM dependencies. Testable in node --test.
 *
 * Privacy guarantee: Never logs, stores, or transmits typed characters.
 * Only timing, key class, dwell, and error flag are stored and emitted.
 */

export function mapKeyClass(key) {
  if (key === ' ') return 'S';
  if (key === 'Backspace') return 'B';
  if (key === 'Enter') return 'E';
  if (/^[a-zA-Z]$/.test(key)) return 'L';
  if (/^[0-9.,!?;:'"()\-]$/.test(key)) return 'P';
  return 'M'; // Modifier or other
}

export class TypingEngine {
  constructor(options = {}) {
    this.targetText = options.targetText || '';
    this.sessionId = options.sessionId || 's01';
    this.userId = options.userId || 'u01';
    this.mode = options.mode || 'RUN'; // CAL | RUN | REPLAY
    this.condition = options.condition || 'calm'; // calm | pressure
    this.lighting = options.lighting || 'normal'; // normal | dim

    this.onSerialLine = options.onSerialLine || (() => {});
    this.onProgress = options.onProgress || (() => {}); // { cursor, total, correct, errors }

    this.cursor = 0;
    this.correctCount = 0;
    this.errorCount = 0;
    this.seq = 0;
    this.startTime = null; // rebased to t = 0
    this.isActive = false;

    // Pending keydowns waiting for keyup: code -> { downTime, cls, err }
    this.pendingKeys = new Map();

    // Stored events for session JSON per REPORT_SPEC.md (NO CHARACTERS)
    this.recordedEvents = []; // [seq, t_down, dwell, class, err]
    this.recordedFocus = [];  // [seq, t, v]
    this.recordedLux = [];    // [t, lux]
    this.recordedWindows = [];
    this.recordedAlerts = [];
    this.recordedWarnings = [];
    this.baseline = { present: 0, mu: [], sd: [] };
  }

  start(timestampMs) {
    this.startTime = timestampMs;
    this.isActive = true;
    this.seq = 0;
    this.cursor = 0;
    this.correctCount = 0;
    this.errorCount = 0;
    this.pendingKeys.clear();
    this.recordedEvents = [];
    this.recordedFocus = [];
    this.recordedLux = [];
    this.recordedWindows = [];
    this.recordedAlerts = [];
    this.recordedWarnings = [];

    // Send session start line per PROTOCOL.md
    this.onSerialLine(`S,START,${this.sessionId},${this.userId},${this.mode}`);
  }

  stop() {
    if (!this.isActive) return;
    this.flushPendingKeys(this.getRelativeTime(Date.now()));
    this.isActive = false;
    this.onSerialLine('S,STOP');
  }

  getRelativeTime(absoluteTimeMs) {
    if (this.startTime === null) return 0;
    return Math.max(0, Math.round(absoluteTimeMs - this.startTime));
  }

  /**
   * Handle keydown event
   * @param {Object} ev { key, code, repeat, time }
   */
  handleKeyDown(ev) {
    if (!this.isActive) return;
    if (ev.repeat) return; // Strict requirement: event.repeat is ignored

    const relTime = this.getRelativeTime(ev.time);
    const cls = mapKeyClass(ev.key);

    let err = 0;
    if (cls === 'B') {
      // Backspace retreats cursor
      if (this.cursor > 0) {
        this.cursor--;
      }
      err = 0;
    } else if (cls === 'M') {
      // Modifier keys (Shift, Ctrl, etc.) don't advance cursor
      err = 0;
    } else {
      // Typable character: check against target text character at cursor
      const expectedChar = this.targetText[this.cursor] || '';
      if (ev.key === expectedChar) {
        err = 0;
        this.correctCount++;
      } else {
        err = 1;
        this.errorCount++;
      }
      this.cursor++;
    }

    // Save pending keydown
    this.pendingKeys.set(ev.code || ev.key, {
      downTime: relTime,
      cls,
      err
    });

    this.onProgress({
      cursor: this.cursor,
      total: this.targetText.length,
      correct: this.correctCount,
      errors: this.errorCount
    });
  }

  /**
   * Handle keyup event
   * @param {Object} ev { key, code, time }
   */
  handleKeyUp(ev) {
    if (!this.isActive) return;
    const code = ev.code || ev.key;
    const pending = this.pendingKeys.get(code);
    const relTime = this.getRelativeTime(ev.time);

    if (pending) {
      this.pendingKeys.delete(code);
      const dwell = Math.max(0, relTime - pending.downTime);
      this.emitKeyEvent(pending.downTime, dwell, pending.cls, pending.err);
    }
  }

  /**
   * Flush all un-keyed-up keys with dwell = 0 (e.g. on blur / window switch)
   */
  flushPendingKeys(flushTime) {
    for (const [code, pending] of this.pendingKeys.entries()) {
      this.emitKeyEvent(pending.downTime, 0, pending.cls, pending.err);
    }
    this.pendingKeys.clear();
  }

  emitKeyEvent(tDown, dwell, cls, err) {
    this.seq++;
    const line = `K,${this.seq},${tDown},${dwell},${cls},${err}`;
    this.onSerialLine(line);
    // Record into session events: [seq, t_down, dwell, class, err]
    this.recordedEvents.push([this.seq, tDown, dwell, cls, err]);
  }

  /**
   * Handle focus lost or regained
   * @param {boolean} gained true if regained, false if lost
   * @param {number} timeMs absolute time
   */
  handleFocusChange(gained, timeMs) {
    if (!this.isActive) return;
    const relTime = this.getRelativeTime(timeMs);
    if (!gained) {
      // Window lost focus: flush pending keys with dwell = 0
      this.flushPendingKeys(relTime);
    }
    this.seq++;
    const v = gained ? 1 : 0;
    const line = `F,${this.seq},${relTime},${v}`;
    this.onSerialLine(line);
    this.recordedFocus.push([this.seq, relTime, v]);
  }

  /**
   * 1 Hz heartbeat
   * @param {number} timeMs absolute time
   */
  handleHeartbeat(timeMs) {
    if (!this.isActive) return;
    const relTime = this.getRelativeTime(timeMs);
    const line = `T,${relTime}`;
    this.onSerialLine(line);
  }

  /**
   * Parse incoming line from device to populate session log
   */
  handleIncomingDeviceLine(line) {
    const trimmed = (line || '').trim();
    if (!trimmed) return;
    const parts = trimmed.split(',');
    const cmd = parts[0];

    if (cmd === 'BASE') {
      // BASE,<user_id>,<present>,<mu1..18>,<sd1..18>
      const present = parseInt(parts[2], 10) || 0;
      const values = parts.slice(3).map(Number);
      this.baseline = {
        present,
        mu: values.slice(0, 18),
        sd: values.slice(18, 36)
      };
    } else if (cmd === 'LUX') {
      const t = parseInt(parts[1], 10);
      const lux = parseFloat(parts[2]);
      this.recordedLux.push([t, lux]);
    } else if (cmd === 'FEAT') {
      // FEAT,<win_id>,<t_end>,<n_keys>,<valid>,<f1..18>
      const winId = parseInt(parts[1], 10);
      const tEnd = parseInt(parts[2], 10);
      const nKeys = parseInt(parts[3], 10);
      const valid = parseInt(parts[4], 10);
      const f = parts.slice(5).map(Number);

      let win = this.recordedWindows.find(w => w.win_id === winId);
      if (!win) {
        win = { win_id: winId, t_end: tEnd, n_keys: nKeys, valid, f };
        this.recordedWindows.push(win);
      } else {
        win.t_end = tEnd;
        win.n_keys = nKeys;
        win.valid = valid;
        win.f = f;
      }
    } else if (cmd === 'PRED') {
      // PRED,<win_id>,<cls>,<p_low>,<p_med>,<p_high>,<flags>,<alert>,<state>
      const winId = parseInt(parts[1], 10);
      const cls = parseInt(parts[2], 10);
      const p = [parseFloat(parts[3]), parseFloat(parts[4]), parseFloat(parts[5])];
      const flags = parseInt(parts[6], 10);
      const alert = parseInt(parts[7], 10);
      const state = parseInt(parts[8], 10);

      let win = this.recordedWindows.find(w => w.win_id === winId);
      if (!win) {
        win = { win_id: winId, t_end: 15000 * winId + 30000, n_keys: 0, valid: 1, f: [] };
        this.recordedWindows.push(win);
      }
      win.pred = { cls, p, flags, alert, state };

      if (alert === 1) {
        this.recordedAlerts.push({ win_id: winId, t: win.t_end });
      }
    } else if (cmd === 'WARN') {
      // WARN,<code>,<detail>
      this.recordedWarnings.push({
        t: this.getRelativeTime(Date.now()),
        code: parts[1] || '',
        detail: parts.slice(2).join(',')
      });
    }
  }

  /**
   * Build complete Session JSON according to REPORT_SPEC.md
   * @param {Object} options { selfreport: { stress, rushed, tired }, task: { allowed_s, restarts }, synthetic }
   * @returns {Object} Validated session JSON (never contains typed text)
   */
  exportSessionJSON(options = {}) {
    const elapsedS = this.startTime !== null ? Math.round((Date.now() - this.startTime) / 1000) : 0;

    const uncorrectedErrors = Math.max(0, this.errorCount); // uncorrected errors count

    const session = {
      schema: 1,
      synthetic: options.synthetic ?? false,
      meta: {
        session_id: this.sessionId,
        user_id: this.userId,
        mode: this.mode,
        condition: this.condition,
        lighting: this.lighting,
        has_light_sensor: options.has_light_sensor ?? true,
        started_iso: this.startTime ? new Date(this.startTime).toISOString() : new Date().toISOString(),
        fw_version: options.fw_version ?? '0.1',
        app_version: '1.0'
      },
      task: {
        allowed_s: options.task?.allowed_s ?? 300,
        elapsed_s: elapsedS,
        restarts: options.task?.restarts ?? 0,
        total_chars: this.cursor,
        uncorrected_errors: uncorrectedErrors
      },
      events: this.recordedEvents,
      focus: this.recordedFocus,
      lux: this.recordedLux,
      baseline: this.baseline,
      windows: this.recordedWindows,
      alerts: this.recordedAlerts,
      selfreport: {
        stress: options.selfreport?.stress ?? 1,
        rushed: options.selfreport?.rushed ?? 1,
        tired: options.selfreport?.tired ?? 1
      },
      warnings: this.recordedWarnings
    };

    return session;
  }
}
