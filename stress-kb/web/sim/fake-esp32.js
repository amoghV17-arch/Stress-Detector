/**
 * FakeESP32: Software device emulator implementing docs/PROTOCOL.md and docs/FEATURES.md
 * Used for testing without hardware.
 */

export class FakeESP32 {
  constructor(options = {}) {
    this.fwVer = options.fwVer ?? '0.1';
    this.protoVer = 1;
    this.onLine = options.onLine ?? (() => {}); // Callback when fake ESP32 sends a line to laptop
    this.session = null;
    this.baselines = new Map(); // user_id -> { mu: number[18], sd: number[18] }
    this.watchdogTimer = null;
    this.linkLost = false;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((id) => clearTimeout(id));

    // Default global baseline for state 3 (NO_BASELINE)
    this.defaultBaseline = {
      mu: [180, 220, 80, 0.36, 95, 25, 0.25, 0.05, 0.1, 0.03, 120, 1.1, 0.5, 0.02, -0.4, 0.0, 300, 20],
      sd: [40, 60, 25, 0.1, 20, 10, 0.1, 0.03, 0.3, 0.02, 80, 0.2, 0.8, 0.03, 0.2, 0.5, 50, 10]
    };
  }

  // Emit a line over serial to laptop
  emit(line) {
    this.onLine(line);
  }

  // Simulate hardware power-on / reset
  boot() {
    this.emit(`READY,${this.fwVer},${this.protoVer}`);
  }

  // Feed an incoming line from laptop
  receive(line) {
    const raw = (line || '').trim();
    if (!raw) return;

    if (raw.length > 160) {
      this.emit('WARN,OVERFLOW,Line exceeds 160 chars');
      return;
    }

    const parts = raw.split(',');
    const cmd = parts[0];

    // Reset link watchdog on valid session events
    if (this.session && (cmd === 'K' || cmd === 'F' || cmd === 'T')) {
      this.kickWatchdog();
    }

    switch (cmd) {
      case 'HELLO':
        this.clearWatchdog();
        this.session = null;
        this.emit(`READY,${this.fwVer},${this.protoVer}`);
        break;

      case 'S':
        this.handleSessionCmd(parts);
        break;

      case 'K':
        this.handleKeyEvent(parts);
        break;

      case 'F':
        this.handleFocusEvent(parts);
        break;

      case 'T':
        this.handleHeartbeat(parts);
        break;

      case 'R':
        this.handleReplayLux(parts);
        break;

      default:
        this.emit(`WARN,UNKNOWN_CMD,${cmd}`);
        break;
    }
  }

  handleSessionCmd(parts) {
    const sub = parts[1];
    if (sub === 'START') {
      const sessionId = parts[2] || '';
      const userId = parts[3] || 'default';
      const mode = parts[4] || 'RUN';

      this.session = {
        sessionId,
        userId,
        mode,
        seq: 0,
        expectedSeq: 1,
        events: [], // K and F
        luxSamples: [], // R
        openWindowIdx: 0,
        validWindows: [],
        emaScore: 0,
        consecutiveHigh: 0,
        cooldownRemaining: 0,
        lastEventTime: 0
      };

      this.linkLost = false;
      this.emit('ACK,S');

      if (mode === 'RUN') {
        const base = this.baselines.get(userId);
        if (base) {
          const muStr = base.mu.map(v => v.toFixed(3)).join(',');
          const sdStr = base.sd.map(v => v.toFixed(3)).join(',');
          this.emit(`BASE,${userId},1,${muStr},${sdStr}`);
        } else {
          const muStr = this.defaultBaseline.mu.map(v => v.toFixed(3)).join(',');
          const sdStr = this.defaultBaseline.sd.map(v => v.toFixed(3)).join(',');
          this.emit(`BASE,${userId},0,${muStr},${sdStr}`);
        }
      }
      this.kickWatchdog();
    } else if (sub === 'STOP') {
      if (!this.session) {
        this.emit('ACK,S');
        return;
      }
      this.clearWatchdog();
      this.emit('ACK,S');

      if (this.session.mode === 'CAL') {
        if (this.session.validWindows.length >= 6) {
          // Compute baseline from valid windows
          const baseline = this.computeBaseline(this.session.validWindows);
          this.baselines.set(this.session.userId, baseline);
          const muStr = baseline.mu.map(v => v.toFixed(3)).join(',');
          const sdStr = baseline.sd.map(v => v.toFixed(3)).join(',');
          this.emit(`BASE,${this.session.userId},1,${muStr},${sdStr}`);
          this.emit(`CAL,DONE,${this.session.validWindows.length}`);
        } else {
          this.emit(`WARN,CAL_TOO_SHORT,${this.session.validWindows.length}`);
        }
      }
      this.session = null;
    } else {
      this.emit(`WARN,UNKNOWN_CMD,S,${sub}`);
    }
  }

  handleKeyEvent(parts) {
    if (!this.session) return;
    if (parts.length < 6) {
      this.emit('WARN,MALFORMED,K');
      return;
    }
    const seq = parseInt(parts[1], 10);
    const tDown = parseInt(parts[2], 10);
    const dwell = parseInt(parts[3], 10);
    const cls = parts[4];
    const err = parseInt(parts[5], 10);

    if (!Number.isFinite(seq) || !Number.isFinite(tDown) || !Number.isFinite(dwell) || !Number.isFinite(err)) {
      this.emit('WARN,MALFORMED,K');
      return;
    }

    this.checkSeq(seq);
    const event = { type: 'K', seq, t: tDown, dwell, cls, err };
    this.session.events.push(event);
    this.session.lastEventTime = tDown;
    this.checkWindows(tDown);
  }

  handleFocusEvent(parts) {
    if (!this.session) return;
    if (parts.length < 4) {
      this.emit('WARN,MALFORMED,F');
      return;
    }
    const seq = parseInt(parts[1], 10);
    const t = parseInt(parts[2], 10);
    const v = parseInt(parts[3], 10);

    if (!Number.isFinite(seq) || !Number.isFinite(t) || !Number.isFinite(v)) {
      this.emit('WARN,MALFORMED,F');
      return;
    }

    this.checkSeq(seq);
    const event = { type: 'F', seq, t, v };
    this.session.events.push(event);
    this.session.lastEventTime = t;
    this.checkWindows(t);
  }

  handleHeartbeat(parts) {
    if (!this.session) return;
    const t = parseInt(parts[1], 10);
    if (!Number.isFinite(t)) {
      this.emit('WARN,MALFORMED,T');
      return;
    }
    this.session.lastEventTime = t;
    this.checkWindows(t);
  }

  handleReplayLux(parts) {
    if (!this.session) return;
    const t = parseInt(parts[1], 10);
    const lux = parseFloat(parts[2]);
    if (!Number.isFinite(t) || !Number.isFinite(lux)) {
      this.emit('WARN,MALFORMED,R');
      return;
    }
    this.session.luxSamples.push({ t, lux });
    this.checkWindows(t);
  }

  checkSeq(seq) {
    if (seq !== this.session.expectedSeq) {
      this.emit(`WARN,GAP,${this.session.expectedSeq},${seq}`);
    }
    this.session.expectedSeq = seq + 1;
  }

  kickWatchdog() {
    this.clearWatchdog();
    if (this.linkLost) {
      this.linkLost = false;
      this.emit('WARN,LINK_OK,Link restored');
    }
    this.watchdogTimer = this.setTimeoutFn(() => {
      if (this.session && !this.linkLost) {
        this.linkLost = true;
        this.emit('WARN,LINK_LOST,No events for 5s');
      }
    }, 5000);
    if (this.watchdogTimer && typeof this.watchdogTimer.unref === 'function') {
      this.watchdogTimer.unref();
    }
  }

  clearWatchdog() {
    if (this.watchdogTimer) {
      this.clearTimeoutFn(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  // Windows: 30 000 ms long, 15 000 ms hop.
  // Window k covers [15000 * k, 15000 * k + 30000)
  checkWindows(currentT) {
    if (!Number.isFinite(currentT)) return;
    while (true) {
      const k = this.session.openWindowIdx;
      const winStart = 15000 * k;
      const winEnd = winStart + 30000;
      if (currentT < winEnd) {
        break; // Window not yet closed
      }
      this.closeWindow(k, winStart, winEnd);
      this.session.openWindowIdx = k + 1;
    }
  }

  closeWindow(k, winStart, winEnd) {
    // Gather K events in [winStart, winEnd)
    const kEvents = this.session.events.filter(e => e.type === 'K' && e.t >= winStart && e.t < winEnd);
    const fEvents = this.session.events.filter(e => e.type === 'F' && e.t >= winStart && e.t < winEnd);
    const luxEvents = this.session.luxSamples.filter(e => e.t >= winStart && e.t < winEnd);

    const nKeys = kEvents.length;

    // Short IKIs (<= 2000 ms)
    let shortIkis = [];
    let longPauses = 0;
    let longPauseSum = 0;
    for (let i = 1; i < kEvents.length; i++) {
      const iki = kEvents[i].t - kEvents[i - 1].t;
      if (iki <= 2000) {
        shortIkis.push(iki);
      } else {
        longPauses++;
        longPauseSum += Math.min(iki, 30000);
      }
    }

    const isValid = nKeys >= 20 && shortIkis.length >= 3;

    let f = new Array(18).fill(0);
    if (isValid) {
      // 1. kpm
      f[0] = nKeys / 0.5;

      // 2. iki_mean, 3. iki_std, 4. iki_cv
      const ikiMean = shortIkis.reduce((a, b) => a + b, 0) / shortIkis.length;
      const ikiVar = shortIkis.reduce((a, b) => a + (b - ikiMean) ** 2, 0) / shortIkis.length;
      const ikiStd = Math.sqrt(ikiVar);
      f[1] = ikiMean;
      f[2] = ikiStd;
      f[3] = ikiMean > 0 ? ikiStd / ikiMean : 0;

      // 5. dwell_mean, 6. dwell_std (dwell > 0, clipped to 2000)
      const validDwells = kEvents.map(e => Math.min(2000, e.dwell)).filter(d => d > 0);
      if (validDwells.length > 0) {
        const dMean = validDwells.reduce((a, b) => a + b, 0) / validDwells.length;
        const dVar = validDwells.reduce((a, b) => a + (b - dMean) ** 2, 0) / validDwells.length;
        f[4] = dMean;
        f[5] = Math.sqrt(dVar);
      }

      // 7. overlap_ratio
      let overlapCount = 0;
      let overlapTotal = 0;
      for (let i = 1; i < kEvents.length; i++) {
        const prev = kEvents[i - 1];
        const curr = kEvents[i];
        const iki = curr.t - prev.t;
        if (iki <= 2000 && prev.dwell > 0) {
          overlapTotal++;
          if (curr.t < prev.t + Math.min(2000, prev.dwell)) {
            overlapCount++;
          }
        }
      }
      f[6] = overlapTotal > 0 ? overlapCount / overlapTotal : 0;

      // 8. bksp_rate
      const bkspCount = kEvents.filter(e => e.cls === 'B').length;
      f[7] = bkspCount / nKeys;

      // 9. bksp_bursts (>= 3 consecutive B events)
      let bkspBursts = 0;
      let currentBurst = 0;
      for (const e of kEvents) {
        if (e.cls === 'B') {
          currentBurst++;
          if (currentBurst === 3) bkspBursts++;
        } else {
          currentBurst = 0;
        }
      }
      f[8] = bkspBursts;

      // 10. err_rate
      const lspCount = kEvents.filter(e => e.cls === 'L' || e.cls === 'S' || e.cls === 'P').length;
      const errCount = kEvents.filter(e => e.err === 1).length;
      f[9] = errCount / Math.max(1, lspCount);

      // 11. corr_latency: for each err=1 key, ms until first later B event within 10000ms
      let corrLatencies = [];
      for (let i = 0; i < kEvents.length; i++) {
        if (kEvents[i].err === 1) {
          for (let j = i + 1; j < kEvents.length; j++) {
            if (kEvents[j].cls === 'B') {
              const dt = kEvents[j].t - kEvents[i].t;
              if (dt <= 10000) corrLatencies.push(dt);
              break;
            }
          }
        }
      }
      f[10] = corrLatencies.length > 0 ? corrLatencies.reduce((a, b) => a + b, 0) / corrLatencies.length : 0;

      // 12. post_err_slow: for each err key: mean of next up to 3 short IKI / iki_mean
      let postErrRatios = [];
      for (let i = 0; i < kEvents.length; i++) {
        if (kEvents[i].err === 1) {
          let nextGaps = [];
          for (let j = i + 1; j < Math.min(kEvents.length, i + 4); j++) {
            const gap = kEvents[j].t - kEvents[j - 1].t;
            if (gap <= 2000) nextGaps.push(gap);
          }
          if (nextGaps.length >= 1 && ikiMean > 0) {
            const m = nextGaps.reduce((a, b) => a + b, 0) / nextGaps.length;
            postErrRatios.push(m / ikiMean);
          }
        }
      }
      f[11] = postErrRatios.length > 0 ? postErrRatios.reduce((a, b) => a + b, 0) / postErrRatios.length : 1.0;

      // 13. long_pauses
      f[12] = longPauses;

      // 14. idle_frac
      f[13] = Math.min(1.0, longPauseSum / 30000.0);

      // 15. burstiness: (iki_std - iki_mean) / (iki_std + iki_mean)
      f[14] = (ikiStd + ikiMean) > 0 ? (ikiStd - ikiMean) / (ikiStd + ikiMean) : 0;

      // 16. focus_loss: count of F events with v = 0
      f[15] = fEvents.filter(e => e.v === 0).length;

      // 17. lux_mean, 18. lux_std
      if (luxEvents.length > 0) {
        const lMean = luxEvents.reduce((a, b) => a + b.lux, 0) / luxEvents.length;
        const lVar = luxEvents.reduce((a, b) => a + (b.lux - lMean) ** 2, 0) / luxEvents.length;
        f[16] = lMean;
        f[17] = Math.sqrt(lVar);
      } else {
        f[16] = 0;
        f[17] = 0;
      }
    }

    // Emit FEAT line
    const featStr = f.map(v => v.toFixed(3)).join(',');
    this.emit(`FEAT,${k},${winEnd},${nKeys},${isValid ? 1 : 0},${featStr}`);

    if (isValid) {
      // Store transformed features for calibration baseline computation:
      // x17 = ln(1 + lux_mean), x18 = lux_std / (lux_mean + 1)
      const xTransformed = [...f];
      xTransformed[16] = Math.log(1 + f[16]);
      xTransformed[17] = f[17] / (f[16] + 1);
      this.session.validWindows.push(xTransformed);

      // In RUN or REPLAY mode, evaluate model & decision layer
      if (this.session.mode === 'RUN' || this.session.mode === 'REPLAY') {
        this.evaluatePrediction(k, xTransformed);
      }
    }
  }

  evaluatePrediction(k, xTransformed) {
    const base = this.baselines.get(this.session.userId) || this.defaultBaseline;
    const hasBaseline = this.baselines.has(this.session.userId);

    // Compute z-scores: z = clip((x - mu) / sd_eff, -5, 5)
    // sd_eff = max(sd, 0.1 * |mu|, 1e-3)
    const z = xTransformed.map((x, i) => {
      const mu = base.mu[i] ?? 0;
      const sd = base.sd[i] ?? 1;
      const sdEff = Math.max(sd, 0.1 * Math.abs(mu), 0.001);
      return Math.min(5, Math.max(-5, (x - mu) / sdEff));
    });

    // Behaviour flags bitmask
    let flags = 0;
    if (z[0] >= 1.0 && z[9] >= 0.5) flags |= (1 << 0); // RUSHED: z_kpm >= 1.0 && z_err_rate >= 0.5
    if (z[12] >= 1.0 && z[0] <= -0.5) flags |= (1 << 1); // HESITANT: z_long_pauses >= 1.0 && z_kpm <= -0.5
    if (z[8] >= 1.0 && z[14] >= 0.5) flags |= (1 << 2); // FRUSTRATED: z_bksp_bursts >= 1.0 && z_burstiness >= 0.5

    // FATIGUED over last 6 windows
    const nVal = this.session.validWindows.length;
    if (nVal >= 6) {
      // Check last 6
      // Mean z_kpm of last 3 vs first 3 of the 6
      // For simplicity in emulator:
      if (z[0] <= -0.5 && z[9] >= 0.5) flags |= (1 << 3);
    }

    if (xTransformed[15] >= 2 || (z[13] >= 1.0 && xTransformed[15] >= 1)) flags |= (1 << 4); // DISTRACTED
    if (Math.abs(z[3]) <= 0.5 && z[9] <= 0.25 && z[12] <= 0.25) flags |= (1 << 5); // FOCUSED

    // Heuristic classifier for simulation:
    // stress indicator = 0.3*z_err_rate + 0.3*z_kpm_diff + 0.2*z_bursts + 0.2*z_pauses
    let stressScore = 0.25 * (z[9] + z[8] + Math.max(0, z[0]) + Math.max(0, -z[0]));
    let pLow = 0.7, pMed = 0.2, pHigh = 0.1;
    if (stressScore > 1.5) {
      pLow = 0.05; pMed = 0.25; pHigh = 0.70;
    } else if (stressScore > 0.5) {
      pLow = 0.20; pMed = 0.60; pHigh = 0.20;
    }

    const cls = pHigh >= pMed && pHigh >= pLow ? 2 : (pMed >= pLow ? 1 : 0);
    const maxP = Math.max(pLow, pMed, pHigh);

    let state = 0; // OK
    if (!hasBaseline) state = 3; // NO_BASELINE
    if (maxP < 0.6) state = 1; // UNCERTAIN

    // Decision layer: score = 0.5 * p_med + 1.0 * p_high
    const windowScore = 0.5 * pMed + 1.0 * pHigh;
    let alert = 0;

    if (state === 0 || state === 3) { // eligible window
      if (this.session.emaScore === 0) {
        this.session.emaScore = windowScore;
      } else {
        this.session.emaScore = 0.4 * windowScore + 0.6 * this.session.emaScore;
      }

      if (this.session.cooldownRemaining > 0) {
        this.session.cooldownRemaining--;
      } else {
        if (this.session.emaScore >= 0.6) {
          this.session.consecutiveHigh++;
          if (this.session.consecutiveHigh >= 3) {
            alert = 1;
            this.session.cooldownRemaining = 20; // 20 windows cooldown
            this.session.consecutiveHigh = 0;
          }
        } else {
          this.session.consecutiveHigh = 0;
        }
      }
    }

    this.emit(`PRED,${k},${cls},${pLow.toFixed(2)},${pMed.toFixed(2)},${pHigh.toFixed(2)},${flags},${alert},${state}`);
  }

  computeBaseline(validWindows) {
    const n = validWindows.length;
    const mu = new Array(18).fill(0);
    const sd = new Array(18).fill(0);

    for (let f = 0; f < 18; f++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += validWindows[i][f];
      mu[f] = sum / n;

      let varSum = 0;
      for (let i = 0; i < n; i++) varSum += (validWindows[i][f] - mu[f]) ** 2;
      sd[f] = Math.sqrt(varSum / n);
    }

    return { mu, sd };
  }

  /**
   * Returns a mock WebSerial Port object for drop-in browser use
   */
  createMockPort() {
    let inputController = null;
    let isOpen = false;

    // Stream for device -> laptop
    const readable = new ReadableStream({
      start: (controller) => {
        inputController = controller;
      }
    });

    this.onLine = (line) => {
      if (isOpen && inputController) {
        try {
          const encoder = new TextEncoder();
          inputController.enqueue(encoder.encode(line + '\n'));
        } catch (_) {}
      }
    };

    // Stream for laptop -> device
    let lineBuffer = '';
    const writable = new WritableStream({
      write: (chunk) => {
        const text = new TextDecoder().decode(chunk);
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // keep remainder
        for (const line of lines) {
          this.receive(line);
        }
      }
    });

    return {
      open: async () => {
        isOpen = true;
        this.boot();
      },
      close: async () => {
        isOpen = false;
        this.clearWatchdog();
        try {
          if (inputController) inputController.close();
        } catch (_) {}
      },
      readable,
      writable
    };
  }
}
