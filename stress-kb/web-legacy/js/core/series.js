/**
 * Pure series-derivation helper for strip-chart recorder visualizations.
 * Maps session JSON to time-aligned stacked channel series (Stress, Speed, Errors, Pauses, Light)
 * and margin annotations (Pattern flags and Alerts).
 */

export const FLAG_NAMES = [
  'RUSHED',       // Bit 0
  'HESITANT',     // Bit 1
  'FRUSTRATED',   // Bit 2
  'FATIGUED',     // Bit 3
  'DISTRACTED',   // Bit 4
  'FOCUSED'       // Bit 5
];

export function deriveTimeSeriesChannels(session) {
  if (!session) {
    return {
      durationSeconds: 300,
      stress: [],
      speed: [],
      errors: [],
      pauses: [],
      light: [],
      marginNotes: []
    };
  }

  const durationSeconds = Math.max(
    30,
    session.task?.elapsed_s || session.task?.allowed_s || 300
  );

  // 1. STRESS CHANNEL (stepped windows)
  const stress = [];
  const rawWindows = session.windows || [];

  rawWindows.forEach((w) => {
    const tEndMs = w.t_end ?? (15000 * w.win_id + 30000);
    const tStartMs = Math.max(0, tEndMs - 30000);

    const cls = w.pred ? w.pred.cls : 0;
    const p = w.pred ? w.pred.p : [0.7, 0.2, 0.1];
    const flags = w.pred ? w.pred.flags : 0;
    const alert = w.pred ? w.pred.alert : 0;

    stress.push({
      win_id: w.win_id,
      tStartS: tStartMs / 1000,
      tEndS: tEndMs / 1000,
      cls, // 0 = Low, 1 = Med, 2 = High
      p,
      flags,
      alert,
      valid: w.valid ?? 1
    });
  });

  // 2. ERRORS & SPEED from Events
  const events = session.events || [];
  const errors = [];
  const pauses = [];
  const speed = [];

  let backspaceStreak = 0;
  let lastEventEndMs = 0;

  events.forEach((ev, i) => {
    // ev: [seq, t, cls, dwell, err]
    const seq = ev[0];
    const tMs = ev[1];
    const cls = ev[2];
    const dwell = ev[3] || 0;
    const err = ev[4] || 0;
    const tS = tMs / 1000;

    // Detect Pause (> 2000 ms between keystrokes)
    if (i > 0) {
      const gapMs = tMs - lastEventEndMs;
      if (gapMs >= 2000) {
        pauses.push({
          tStartS: lastEventEndMs / 1000,
          tEndS: tS,
          durationS: Math.round((gapMs / 1000) * 10) / 10
        });
      }
    }
    lastEventEndMs = tMs + dwell;

    // Detect Errors & Backspace Bursts
    if (cls === 'B') {
      backspaceStreak++;
    } else {
      backspaceStreak = 0;
    }

    if (err === 1 || cls === 'B') {
      errors.push({
        seq,
        tS,
        isBackspace: cls === 'B',
        isBurst: backspaceStreak >= 3
      });
    }
  });

  // Compute speed curve (CPM in rolling 15s intervals)
  if (events.length > 0) {
    for (let s = 15; s <= durationSeconds; s += 5) {
      const startMs = (s - 15) * 1000;
      const endMs = s * 1000;
      const count = events.filter(e => e[1] >= startMs && e[1] <= endMs).length;
      const cpm = Math.round((count / 15) * 60);
      speed.push({ tS: s, cpm });
    }
  } else if (rawWindows.length > 0) {
    // Fallback: derive speed from window features (f[0] = iki_mean)
    rawWindows.forEach((w) => {
      const tEndMs = w.t_end ?? (15000 * w.win_id + 30000);
      const iki = (Array.isArray(w.f) && w.f[0] > 0) ? w.f[0] : 250;
      const cpm = Math.round(60000 / iki);
      speed.push({ tS: tEndMs / 1000, cpm });
    });
  }

  // 3. LIGHT CHANNEL
  const light = [];
  const hasLight = session.meta?.has_light_sensor !== false;
  if (hasLight && Array.isArray(session.lux)) {
    session.lux.forEach(([tMs, lux]) => {
      light.push({ tS: tMs / 1000, lux: parseFloat(lux.toFixed(1)) });
    });
  }

  // 4. MARGIN NOTES (Pattern flags and Alerts)
  const marginNotes = [];

  // Add notes for flags active in windows
  stress.forEach((w) => {
    if (w.flags > 0) {
      FLAG_NAMES.forEach((flagName, bitIdx) => {
        if ((w.flags & (1 << bitIdx)) !== 0) {
          marginNotes.push({
            type: 'flag',
            label: flagName,
            tStartS: w.tStartS,
            tEndS: w.tEndS,
            win_id: w.win_id
          });
        }
      });
    }
  });

  // Add notes for vibration alerts
  const alerts = session.alerts || [];
  alerts.forEach((a) => {
    const tS = (a.t || (15000 * a.win_id + 30000)) / 1000;
    marginNotes.push({
      type: 'alert',
      label: 'Alert',
      tStartS: Math.max(0, tS - 2),
      tEndS: tS + 2,
      win_id: a.win_id
    });
  });

  return {
    durationSeconds,
    hasLight,
    stress,
    speed,
    errors,
    pauses,
    light,
    marginNotes
  };
}
