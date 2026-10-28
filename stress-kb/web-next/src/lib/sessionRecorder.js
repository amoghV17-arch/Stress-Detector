/**
 * SessionRecorder: Orchestrates the active session lifecycle.
 * Integrates TypingEngine with SerialManager to stream keystrokes,
 * ingest peripheral telemetry (LUX, BASE, FEAT, PRED, WARN),
 * and produce identical session JSON according to REPORT_SPEC.md schema 1.
 */

import { TypingEngine } from '../../../web/js/core/typing_engine.js';
import { calculatePressureAllowedTime } from '../../../web/js/core/schedule.js';

export class SessionRecorder {
  constructor(options = {}) {
    this.targetText = options.targetText || '';
    this.sessionId = options.sessionId || 's01';
    this.userId = options.userId || 'u01';
    this.mode = options.mode || 'RUN'; // CAL | RUN
    this.condition = options.condition || 'calm'; // calm | pressure
    this.lighting = options.lighting || 'normal'; // normal | dim
    this.serialManager = options.serialManager || null;
    this.nowFn = options.nowFn || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

    // Callbacks
    this.onProgress = options.onProgress || (() => {});
    this.onFinish = options.onFinish || (() => {});
    this.onAlert = options.onAlert || (() => {});
    this.onWarning = options.onWarning || (() => {});

    this.calBaselinePace = options.calBaselinePace || { chars: 0, durationS: 180 };
    this.customDurationSeconds = options.durationSeconds || null;
    this.sessionDurationSeconds = options.durationSeconds || 300;
    this.remainingSeconds = this.sessionDurationSeconds;
    this.liveScore = 0;
    this.isActive = false;

    this.heartbeatTimer = null;
    this.countdownTimer = null;
    this.unsubscribeLine = null;

    // Instantiate core pure typing engine
    this.engine = new TypingEngine({
      targetText: this.targetText,
      sessionId: this.sessionId,
      userId: this.userId,
      mode: this.mode,
      condition: this.condition,
      lighting: this.lighting,
      onSerialLine: (line) => {
        if (this.serialManager && typeof this.serialManager.sendLine === 'function') {
          this.serialManager.sendLine(line);
        } else if (typeof options.sendLineFn === 'function') {
          options.sendLineFn(line);
        }
      },
      onProgress: (p) => {
        if (this.condition === 'pressure') {
          this.liveScore = Math.max(0, p.correct * 10 - p.errors * 25);
        } else {
          this.liveScore = 0;
        }

        const isComplete = p.cursor >= p.total || this.remainingSeconds <= 0;
        this.onProgress({
          cursor: p.cursor,
          total: p.total,
          correct: p.correct,
          errors: p.errors,
          score: this.liveScore,
          remainingSeconds: Math.max(0, this.remainingSeconds),
          durationSeconds: this.sessionDurationSeconds,
          isComplete,
        });

        if (isComplete) {
          this.stop();
        }
      },
    });
  }

  start(startTimeMs = null) {
    if (this.isActive) return;
    this.isActive = true;

    // Determine session duration per protocol or user selection
    if (this.customDurationSeconds && this.customDurationSeconds > 0) {
      this.sessionDurationSeconds = this.customDurationSeconds;
    } else if (this.mode === 'CAL') {
      this.sessionDurationSeconds = 180;
    } else {
      if (this.condition === 'pressure') {
        this.sessionDurationSeconds = calculatePressureAllowedTime(
          this.calBaselinePace.chars,
          this.calBaselinePace.durationS,
          this.targetText.length
        );
      } else {
        this.sessionDurationSeconds = 300;
      }
    }
    this.remainingSeconds = this.sessionDurationSeconds;

    // Bind serial listener to ingest device lines
    if (this.serialManager && typeof this.serialManager.onLineReceived === 'function') {
      this.unsubscribeLine = this.serialManager.onLineReceived((line) => {
        this.handleDeviceLine(line);
      });
    }

    const startT = startTimeMs ?? this.nowFn();
    this.engine.start(startT);

    // Initial progress tick
    this.onProgress({
      cursor: 0,
      total: this.targetText.length,
      correct: 0,
      errors: 0,
      score: 0,
      remainingSeconds: this.remainingSeconds,
      durationSeconds: this.sessionDurationSeconds,
      isComplete: false,
    });

    // 1 Hz heartbeat timer
    if (typeof setInterval !== 'undefined') {
      this.heartbeatTimer = setInterval(() => {
        if (this.isActive) {
          this.engine.handleHeartbeat(this.nowFn());
        }
      }, 1000);

      // Countdown timer if pressure condition
      if (this.condition === 'pressure') {
        this.countdownTimer = setInterval(() => {
          if (!this.isActive) return;
          this.remainingSeconds--;
          const isZero = this.remainingSeconds <= 0;
          this.onProgress({
            cursor: this.engine.cursor,
            total: this.targetText.length,
            correct: this.engine.correctCount,
            errors: this.engine.errorCount,
            score: this.liveScore,
            remainingSeconds: Math.max(0, this.remainingSeconds),
            durationSeconds: this.sessionDurationSeconds,
            isComplete: isZero,
          });

          if (isZero) {
            this.stop();
          }
        }, 1000);
      }
    }
  }

  handleDeviceLine(line) {
    if (!line) return;
    this.engine.handleIncomingDeviceLine(line);

    if (line.startsWith('ALERT')) {
      const parts = line.split(',');
      this.onAlert({ win_id: parseInt(parts[1], 10), t: parseInt(parts[2], 10) });
    } else if (line.startsWith('PRED')) {
      const parts = line.split(',');
      const alert = parseInt(parts[7], 10);
      if (alert === 1) {
        this.onAlert({ win_id: parseInt(parts[1], 10), t: parseInt(parts[2], 10) });
      }
    } else if (line.startsWith('WARN')) {
      const parts = line.split(',');
      this.onWarning({ code: parts[1] || '', detail: parts.slice(2).join(',') });
    }
  }

  handleKeyDown(event) {
    if (!this.isActive) return;
    this.engine.handleKeyDown({
      key: event.key,
      code: event.code,
      repeat: event.repeat,
      time: event.time ?? this.nowFn(),
    });
  }

  handleKeyUp(event) {
    if (!this.isActive) return;
    this.engine.handleKeyUp({
      key: event.key,
      code: event.code,
      time: event.time ?? this.nowFn(),
    });
  }

  handleFocusChange(gained, time = null) {
    if (!this.isActive) return;
    this.engine.handleFocusChange(gained, time ?? this.nowFn());
  }

  stop(exportOptions = {}) {
    if (!this.isActive) return null;
    this.isActive = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.unsubscribeLine) {
      this.unsubscribeLine();
      this.unsubscribeLine = null;
    }

    this.engine.stop();

    const mergedOptions = {
      task: {
        allowed_s: this.sessionDurationSeconds,
        restarts: exportOptions.restarts ?? 0,
      },
      selfreport: exportOptions.selfreport || { stress: 1, rushed: 1, tired: 1 },
      synthetic: exportOptions.synthetic ?? false,
      has_light_sensor: exportOptions.has_light_sensor ?? true,
      fw_version: exportOptions.fw_version ?? '0.1',
    };

    const sessionJSON = this.engine.exportSessionJSON(mergedOptions);
    this.onFinish(sessionJSON);
    return sessionJSON;
  }
}
