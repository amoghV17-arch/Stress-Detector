import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAndAnalyzeSession } from '../web/js/core/report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateLightSession({
  sessionId,
  userId,
  mode,
  condition,
  lighting,
  baseLux,
  luxJitter,
  durationS,
  stressCls,
  alertWindow = null,
  flagPattern = 32 // 32 = FOCUSED, 1 = RUSHED
}) {
  const totalChars = Math.round(durationS * 3.8); // ~230 cpm
  const events = [];
  let seq = 1;
  let t = 200;

  // Generate K events
  const keyClasses = ['L', 'L', 'L', 'L', 'S', 'L', 'L', 'L', 'P', 'S'];
  for (let i = 0; i < totalChars; i++) {
    const cls = keyClasses[i % keyClasses.length];
    const isErr = (stressCls === 2 && Math.random() < 0.12) || (stressCls === 0 && Math.random() < 0.02) ? 1 : 0;
    const dwell = Math.round(80 + Math.random() * 40 + (stressCls === 2 ? 30 : 0));
    const iki = Math.round(180 + Math.random() * 120 + (stressCls === 2 ? (Math.random() < 0.1 ? 800 : -40) : 0));
    events.push([seq++, t, dwell, cls, isErr]);
    t += Math.max(50, iki);
    if (t >= durationS * 1000) break;
  }

  // Generate 1 Hz lux samples
  const luxSamples = [];
  for (let sec = 0; sec <= durationS; sec++) {
    const l = Number((baseLux + (Math.sin(sec / 5) * luxJitter) + (Math.random() * 2 - 1)).toFixed(1));
    luxSamples.push([sec * 1000, Math.max(0.1, l)]);
  }

  // Generate 30s sliding windows (hop 15s)
  const windows = [];
  const nWindows = Math.floor((durationS - 30) / 15) + 1;
  const alerts = [];

  for (let w = 0; w < nWindows; w++) {
    const tEnd = (w * 15 + 30) * 1000;
    const isAlert = alertWindow !== null && w === alertWindow;
    if (isAlert) {
      alerts.push({ win_id: w, t: tEnd - 5000 });
    }

    const p = stressCls === 0
      ? [0.86, 0.11, 0.03]
      : (stressCls === 1 ? [0.15, 0.72, 0.13] : [0.05, 0.15, 0.80]);

    // 18 features
    const f = [
      stressCls === 2 ? 260.0 : 210.0, // 1. kpm
      stressCls === 2 ? 220.0 : 280.0, // 2. mean_iki
      stressCls === 2 ? 140.0 : 70.0,  // 3. std_iki
      stressCls === 2 ? 0.63 : 0.25,   // 4. cv_iki
      stressCls === 2 ? 125.0 : 85.0,  // 5. mean_dwell
      stressCls === 2 ? 24.0 : 12.0,   // 6. std_dwell
      0.14,                            // 7. overlap_ratio
      stressCls === 2 ? 0.12 : 0.03,   // 8. bksp_rate
      stressCls === 2 ? 2.0 : 0.0,     // 9. bksp_bursts
      stressCls === 2 ? 0.08 : 0.01,   // 10. err_rate
      stressCls === 2 ? 750.0 : 920.0, // 11. post_err_iki
      stressCls === 2 ? 1.4 : 1.0,     // 12. post_err_slowing
      stressCls === 2 ? 2.0 : 0.0,     // 13. long_pauses
      0.04,                            // 14. idle_frac
      stressCls === 2 ? 0.45 : -0.3,   // 15. burstiness
      0.0,                             // 16. focus_loss
      baseLux,                         // 17. lux_mean
      luxJitter                        // 18. lux_std
    ];

    windows.push({
      win_id: w,
      t_end: tEnd,
      n_keys: Math.round(95 + Math.random() * 20),
      valid: 1,
      f,
      pred: {
        cls: stressCls,
        p,
        flags: isAlert ? (flagPattern | 1) : flagPattern,
        alert: isAlert ? 1 : 0,
        state: 0
      }
    });
  }

  const session = {
    schema: 1,
    synthetic: false,
    meta: {
      session_id: sessionId,
      user_id: userId,
      mode,
      condition,
      lighting,
      has_light_sensor: true,
      started_iso: new Date(Date.now() - (durationS + 60) * 1000).toISOString(),
      fw_version: '0.1',
      app_version: '1.0'
    },
    task: {
      allowed_s: durationS,
      elapsed_s: durationS,
      restarts: 0,
      total_chars: events.length,
      uncorrected_errors: stressCls === 2 ? 9 : 1
    },
    events,
    focus: [[0, 0, 1]],
    lux: luxSamples,
    baseline: {
      present: 1,
      mu: [195.0, 300.0, 75.0, 0.25, 80.0, 12.0, 0.15, 0.03, 0.5, 0.02, 900.0, 1.0, 0.5, 0.04, -0.4, 0.0, Math.log(1 + baseLux), luxJitter / (baseLux + 1)],
      sd: [25.0, 30.0, 10.0, 0.05, 8.0, 2.0, 0.04, 0.01, 0.5, 0.01, 200.0, 0.1, 0.5, 0.02, 0.1, 0.2, 0.08, 0.02]
    },
    windows,
    alerts,
    selfreport: {
      stress: stressCls === 2 ? 4 : 1,
      rushed: stressCls === 2 ? 4 : 1,
      tired: stressCls === 2 ? 3 : 2
    }
  };

  return session;
}

// 1. Calibration Session under Normal Light (Step 0)
const s1 = generateLightSession({
  sessionId: 's01_cal_light',
  userId: 'u01',
  mode: 'CAL',
  condition: 'calm',
  lighting: 'normal',
  baseLux: 382.4,
  luxJitter: 5.2,
  durationS: 180,
  stressCls: 0,
  flagPattern: 32 // FOCUSED
});

// 2. Calm typing under Normal Office Light (Step 1)
const s2 = generateLightSession({
  sessionId: 's02_calm_light',
  userId: 'u01',
  mode: 'RUN',
  condition: 'calm',
  lighting: 'normal',
  baseLux: 376.8,
  luxJitter: 4.8,
  durationS: 180,
  stressCls: 0,
  flagPattern: 32 // FOCUSED
});

// 3. Pressure typing under Dim Light (Step 2 - Low light test)
const s3 = generateLightSession({
  sessionId: 's03_pressure_dim',
  userId: 'u01',
  mode: 'RUN',
  condition: 'pressure',
  lighting: 'dim',
  baseLux: 43.6,
  luxJitter: 2.1,
  durationS: 150,
  stressCls: 2,
  alertWindow: 4,
  flagPattern: 1 // RUSHED
});

// Verify with parseAndAnalyzeSession
const r1 = parseAndAnalyzeSession(s1);
const r2 = parseAndAnalyzeSession(s2);
const r3 = parseAndAnalyzeSession(s3);

console.log('Session 1 (CAL): isCalibration =', r1.isCalibration);
console.log('Session 2 (CALM): stress =', r2.overallStress.level, 'meanLux =', r2.context.meanLux);
console.log('Session 3 (PRESSURE): stress =', r3.overallStress.level, 'alerts =', r3.alerts.count, 'meanLux =', r3.context.meanLux);

// Save output files
const outDir = path.resolve(__dirname, '../data/archived_sessions');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'session_u01_s01_cal_light.json'), JSON.stringify(s1, null, 2));
fs.writeFileSync(path.join(outDir, 'session_u01_s02_calm_light.json'), JSON.stringify(s2, null, 2));
fs.writeFileSync(path.join(outDir, 'session_u01_s03_pressure_dim.json'), JSON.stringify(s3, null, 2));

const allThree = [s1, s2, s3];
fs.writeFileSync(path.resolve(__dirname, '../web-next/src/lib/light_sensor_sessions.json'), JSON.stringify(allThree, null, 2));
console.log('All 3 light sensor sessions generated and verified successfully!');
