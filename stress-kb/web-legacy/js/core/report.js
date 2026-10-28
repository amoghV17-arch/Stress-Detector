/**
 * report.js — Pure-logic session report generator.
 * Contract per docs/REPORT_SPEC.md, docs/FEATURES.md, and docs/MILESTONES.md M8.
 * Pure logic with zero DOM dependencies so it can be 100% unit tested with node --test.
 */

export const FEATURE_DEFINITIONS = [
  { id: 1, name: 'kpm', plainName: 'Keystroke Speed (KPM)', plainLow: 'Slower typing speed', plainHigh: 'Faster typing speed' },
  { id: 2, name: 'iki_mean', plainName: 'Inter-Key Interval Mean', plainLow: 'Shorter gaps between keys', plainHigh: 'Longer gaps between keys' },
  { id: 3, name: 'iki_std', plainName: 'Timing Variation (Std)', plainLow: 'Uniform typing intervals', plainHigh: 'Irregular typing intervals' },
  { id: 4, name: 'iki_cv', plainName: 'Rhythm Irregularity (CV)', plainLow: 'Consistent typing rhythm', plainHigh: 'Erratic typing rhythm' },
  { id: 5, name: 'dwell_mean', plainName: 'Key Dwell Time', plainLow: 'Brisk, light key taps', plainHigh: 'Prolonged, heavy key presses' },
  { id: 6, name: 'dwell_std', plainName: 'Key Dwell Variation', plainLow: 'Steady press duration', plainHigh: 'Inconsistent press duration' },
  { id: 7, name: 'overlap_ratio', plainName: 'Key Overlap Ratio', plainLow: 'Isolated single keystrokes', plainHigh: 'Frequent overlapping rollover keys' },
  { id: 8, name: 'bksp_rate', plainName: 'Backspace Rate', plainLow: 'Minimal backspace usage', plainHigh: 'Elevated backspace corrections' },
  { id: 9, name: 'bksp_bursts', plainName: 'Backspace Bursts (>=3 keys)', plainLow: 'Few consecutive corrections', plainHigh: 'Multiple bursts of consecutive deletions' },
  { id: 10, name: 'err_rate', plainName: 'Typo Error Rate', plainLow: 'Accurate typing', plainHigh: 'Elevated typographical errors' },
  { id: 11, name: 'corr_latency', plainName: 'Error Correction Latency', plainLow: 'Immediate correction of typos', plainHigh: 'Delayed correction of typos' },
  { id: 12, name: 'post_err_slow', plainName: 'Post-Error Hesitation', plainLow: 'Maintains pace after error', plainHigh: 'Significant pause/slowdown after error' },
  { id: 13, name: 'long_pauses', plainName: 'Long Pause Count (>2s)', plainLow: 'Continuous typing flow', plainHigh: 'Frequent pauses exceeding 2 seconds' },
  { id: 14, name: 'idle_frac', plainName: 'Idle Time Fraction', plainLow: 'Active typing engagement', plainHigh: 'Prolonged periods of idle inactivity' },
  { id: 15, name: 'burstiness', plainName: 'Typing Burstiness', plainLow: 'Evenly distributed typing', plainHigh: 'Bursty, clustered keystroke patterns' },
  { id: 16, name: 'focus_loss', plainName: 'Window Focus Loss Count', plainLow: 'Continuous focus on task', plainHigh: 'Multiple window switching / blur events' },
  { id: 17, name: 'lux_mean', plainName: 'Ambient Light Level (Lux)', plainLow: 'Dimly lit environment', plainHigh: 'Brightly lit environment' },
  { id: 18, name: 'lux_std', plainName: 'Ambient Light Variation (Std)', plainLow: 'Stable ambient lighting', plainHigh: 'Fluctuating ambient lighting' }
];

export const PATTERN_FLAG_RULES = [
  { bit: 0, flag: 'RUSHED', name: 'Rushed Typing', rule: 'High speed combined with elevated typo rate (z_kpm >= 1.0 AND z_err_rate >= 0.5)' },
  { bit: 1, flag: 'HESITANT', name: 'Hesitant / Uncertain', rule: 'Frequent long pauses and reduced speed (z_long_pauses >= 1.0 AND z_kpm <= -0.5)' },
  { bit: 2, flag: 'FRUSTRATED', name: 'Frustrated Corrections', rule: 'Repeated backspace bursts with erratic rhythm (z_bksp_bursts >= 1.0 AND z_burstiness >= 0.5)' },
  { bit: 3, flag: 'FATIGUED', name: 'Cognitive Fatigue', rule: 'Decelerating speed with rising errors over the last 6 valid windows' },
  { bit: 4, flag: 'DISTRACTED', name: 'Distracted / Multitasking', rule: 'Multiple window blur events or idle time with window switches (focus_loss >= 2)' },
  { bit: 5, flag: 'FOCUSED', name: 'Deep Focus & Flow', rule: 'Consistent rhythm, very low errors, and minimal pauses (|z_iki_cv| <= 0.5 AND z_err <= 0.25)' }
];

export function transformFeatures(rawF) {
  const f = [...rawF];
  const luxMean = Math.max(0, f[16] || 0);
  const luxStd = Math.max(0, f[17] || 0);
  f[16] = Math.log(1 + luxMean);
  f[17] = luxStd / (luxMean + 1);
  return f;
}

export function parseAndAnalyzeSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid session data');
  }

  const meta = session.meta || {};
  const task = session.task || {};
  const isSynthetic = Boolean(session.synthetic);
  const isCalibration = meta.mode === 'CAL';

  const windows = session.windows || [];
  const totalWindows = windows.length;
  const validWindows = windows.filter(w => w.valid === 1);
  const validCount = validWindows.length;

  const hasPersonalBaseline = Boolean(session.baseline && session.baseline.present === 1);
  const baselineMu = (hasPersonalBaseline && session.baseline.mu) || new Array(18).fill(0);
  const baselineSd = (hasPersonalBaseline && session.baseline.sd) || new Array(18).fill(1);

  // Validity check: < 60% valid or < 4 valid windows -> Insufficient data
  const coverageRatio = totalWindows > 0 ? (validCount / totalWindows) : 0;
  const isInsufficientData = !isCalibration && (coverageRatio < 0.6 || validCount < 4);

  // 1. Session Summary
  const summary = {
    userId: meta.user_id || 'unknown',
    sessionId: meta.session_id || 's01',
    mode: meta.mode || 'RUN',
    condition: meta.condition || 'calm',
    lighting: meta.lighting || 'normal',
    durationSeconds: task.elapsed_s || (totalWindows * 15),
    totalKeystrokes: task.total_chars || (session.events ? session.events.length : 0),
    totalWindows,
    validWindows: validCount,
    coveragePercent: Math.round(coverageRatio * 100),
    hasPersonalBaseline,
    baselineSource: hasPersonalBaseline ? 'Personal Calibration' : 'Default Population Baseline',
    isSynthetic,
    isInsufficientData,
    isCalibration
  };

  // If Calibration session, generate calibration baseline analysis only
  if (isCalibration) {
    const calAnalysis = {
      summary,
      calibrationStats: analyzeCalibrationBaseline(validWindows),
      isCalibration: true
    };
    return calAnalysis;
  }

  // 2. Overall Stress
  let overallStress = null;
  if (!isInsufficientData && validCount > 0) {
    const scores = [];
    const confidences = [];
    let lowCount = 0, medCount = 0, highCount = 0;

    for (const w of validWindows) {
      const pred = w.pred || {};
      const p = pred.p || [0.5, 0.3, 0.2];
      const winScore = 0.5 * (p[1] || 0) + 1.0 * (p[2] || 0);
      const conf = Math.max(...p);

      scores.push(winScore);
      confidences.push(conf);

      const cls = pred.cls ?? (p[2] >= p[1] && p[2] >= p[0] ? 2 : (p[1] >= p[0] ? 1 : 0));
      if (cls === 0) lowCount++;
      else if (cls === 1) medCount++;
      else highCount++;
    }

    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const meanConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    let level = 'Low';
    if (meanScore >= 0.66) level = 'High';
    else if (meanScore >= 0.33) level = 'Medium';

    overallStress = {
      level,
      meanScore,
      meanConfidence,
      distribution: {
        lowPercent: Math.round((lowCount / validCount) * 100),
        mediumPercent: Math.round((medCount / validCount) * 100),
        highPercent: Math.round((highCount / validCount) * 100)
      }
    };
  }

  // 3. Timeline
  const timeline = windows.map(w => {
    const pred = w.pred || {};
    const p = pred.p || [0, 0, 0];
    const score = 0.5 * (p[1] || 0) + 1.0 * (p[2] || 0);
    const confidence = p.length > 0 ? Math.max(...p) : 0;
    const isShaded = (w.valid !== 1) || (pred.state === 1);

    return {
      winId: w.win_id,
      tEnd: w.t_end,
      valid: w.valid === 1,
      score,
      confidence,
      cls: pred.cls ?? 255,
      alert: Boolean(pred.alert),
      flags: pred.flags || 0,
      state: pred.state ?? 0,
      isShaded
    };
  });

  // 4. Indicator Table (all 18 features)
  const indicatorTable = [];
  if (validCount > 0) {
    const rawSums = new Array(18).fill(0);
    const featureSums = new Array(18).fill(0);
    for (const w of validWindows) {
      const raw = w.f || new Array(18).fill(0);
      const tf = transformFeatures(raw);
      for (let i = 0; i < 18; i++) {
        rawSums[i] += (raw[i] || 0);
        featureSums[i] += tf[i];
      }
    }

    for (let i = 0; i < 18; i++) {
      // For display, features 16 (lux_mean) and 17 (lux_std) show raw lux, not log-transformed
      const rawMean = (i === 16 || i === 17) ? (rawSums[i] / validCount) : (featureSums[i] / validCount);
      const tfMean = featureSums[i] / validCount;
      const mu = baselineMu[i] ?? 0;
      const sd = baselineSd[i] ?? 1;
      const sdEff = Math.max(sd, 0.1 * Math.abs(mu), 0.001);
      const zScore = Math.min(5, Math.max(-5, (tfMean - mu) / sdEff));

      let arrow = '→';
      let direction = 'flat';
      let meaning = 'Normal baseline range';

      if (zScore >= 0.5) {
        arrow = '↑';
        direction = 'up';
        meaning = FEATURE_DEFINITIONS[i].plainHigh;
      } else if (zScore <= -0.5) {
        arrow = '↓';
        direction = 'down';
        meaning = FEATURE_DEFINITIONS[i].plainLow;
      }

      indicatorTable.push({
        id: i + 1,
        code: FEATURE_DEFINITIONS[i].name,
        name: FEATURE_DEFINITIONS[i].plainName,
        rawMean,
        zScore,
        arrow,
        direction,
        meaning,
        absZ: Math.abs(zScore),
        isTopContributor: false
      });
    }

    // Identify top 3 contributors by |z|
    const topIndices = [...indicatorTable]
      .sort((a, b) => b.absZ - a.absZ)
      .slice(0, 3)
      .map(item => item.id);

    indicatorTable.forEach(item => {
      if (topIndices.includes(item.id)) {
        item.isTopContributor = true;
      }
    });
  }

  // 5. Behaviour Patterns
  let behaviourPatterns = null;
  if (!isInsufficientData && validCount > 0) {
    behaviourPatterns = PATTERN_FLAG_RULES.map(rule => {
      const activeCount = validWindows.filter(w => {
        const flags = (w.pred && w.pred.flags) || 0;
        return (flags & (1 << rule.bit)) !== 0;
      }).length;

      const activePercent = Math.round((activeCount / validCount) * 100);
      return {
        bit: rule.bit,
        flag: rule.flag,
        name: rule.name,
        rule: rule.rule,
        activeCount,
        activePercent,
        isActive: activeCount > 0
      };
    });
  }

  // 6. Trends (First third vs last third of valid windows)
  let trends = null;
  if (!isInsufficientData && validCount >= 3) {
    const thirdSize = Math.max(1, Math.floor(validCount / 3));
    const firstThird = validWindows.slice(0, thirdSize);
    const lastThird = validWindows.slice(validCount - thirdSize);

    const calcThirdMean = (wins, featIdx) =>
      wins.reduce((sum, w) => sum + (w.f ? (w.f[featIdx] || 0) : 0), 0) / wins.length;

    const computeTrend = (featIdx, name) => {
      const first = calcThirdMean(firstThird, featIdx);
      const last = calcThirdMean(lastThird, featIdx);
      const denom = (first !== 0) ? Math.abs(first) : 1;
      const diffPct = ((last - first) / denom) * 100;

      let direction = 'stable';
      if (diffPct > 10) direction = 'increasing';
      else if (diffPct < -10) direction = 'decreasing';

      return { name, first, last, diffPct, direction };
    };

    trends = {
      speed: computeTrend(0, 'Typing Speed (KPM)'),
      errors: computeTrend(9, 'Typo Error Rate'),
      pauses: computeTrend(12, 'Long Pauses (>2s)'),
      backspaces: computeTrend(8, 'Backspace Bursts')
    };
  }

  // 7. Context (Ambient Light)
  let context = null;
  if (meta.has_light_sensor === false) {
    context = {
      hasSensor: false,
      message: 'No light sensor in this session (hardware skipped gracefully)'
    };
  } else if (validCount > 0) {
    const luxMeans = validWindows.map(w => (w.f ? (w.f[16] || 0) : 0));
    const luxStds = validWindows.map(w => (w.f ? (w.f[17] || 0) : 0));
    const meanLux = luxMeans.reduce((a, b) => a + b, 0) / validCount;
    const meanLuxStd = luxStds.reduce((a, b) => a + b, 0) / validCount;
    const variationRatio = meanLuxStd / (meanLux + 1);

    context = {
      hasSensor: true,
      meanLux,
      luxStd: meanLuxStd,
      variationRatio,
      lowLight: meanLux < 50,
      unstableLight: variationRatio > 0.3
    };
  }

  // 8. Reliability
  const uncertainCount = windows.filter(w => w.pred && w.pred.state === 1).length;
  const confidencesAll = validWindows.map(w => (w.pred && w.pred.p ? Math.max(...w.pred.p) : 0));
  const meanConfidence = confidencesAll.length > 0 ? (confidencesAll.reduce((a, b) => a + b, 0) / confidencesAll.length) : 0;
  const warningsList = session.warnings || [];

  const reliability = {
    coveragePercent: Math.round(coverageRatio * 100),
    uncertainWindowsCount: uncertainCount,
    meanConfidence,
    warnings: warningsList,
    hasPersonalBaseline,
    defaultBaselineWarning: !hasPersonalBaseline
  };

  // 9. Alerts
  const alertMoments = [];
  windows.forEach(w => {
    if (w.pred && w.pred.alert === 1) {
      const activeFlags = [];
      const fBitmask = w.pred.flags || 0;
      PATTERN_FLAG_RULES.forEach(r => {
        if ((fBitmask & (1 << r.bit)) !== 0) activeFlags.push(r.name);
      });
      alertMoments.push({
        winId: w.win_id,
        tEnd: w.t_end,
        tEndMinutes: (w.t_end / 60000).toFixed(1),
        activeFlags
      });
    }
  });

  const alerts = {
    count: alertMoments.length,
    moments: alertMoments
  };

  // 10. Self-Report Comparison
  let selfReportComparison = null;
  if (!isInsufficientData && session.selfreport && typeof session.selfreport === 'object') {
    const stressRating = session.selfreport.stress || 1;
    let reportedLevel = 'Low';
    if (stressRating >= 4) reportedLevel = 'High';
    else if (stressRating === 3) reportedLevel = 'Medium';

    const modelLevel = overallStress ? overallStress.level : 'Unknown';
    const agrees = (reportedLevel === modelLevel);

    selfReportComparison = {
      hasReport: true,
      reportedRating: stressRating,
      reportedLevel,
      modelLevel,
      agrees,
      rushedRating: session.selfreport.rushed || 1,
      tiredRating: session.selfreport.tired || 1,
      summary: agrees
        ? `Model prediction (${modelLevel}) matches your post-session self-report (${reportedLevel}).`
        : `Model prediction (${modelLevel}) differs from your post-session self-report (${reportedLevel}).`
    };
  }

  // 11. Disclaimer & Break Advice
  const disclaimer = {
    text: 'Behavioural estimate from typing patterns. Not a medical or psychological assessment.',
    suggestions: (overallStress && overallStress.level === 'High') ? [
      'Take a 5-minute break away from keyboard and screen.',
      'Gently stretch your neck, shoulders, and wrists.',
      'Hydrate with a glass of water and rest your eyes.'
    ] : []
  };

  return {
    summary,
    overallStress,
    timeline,
    indicators: indicatorTable,
    patterns: behaviourPatterns,
    trends,
    context,
    reliability,
    alerts,
    selfReportComparison,
    disclaimer,
    isInsufficientData,
    isSynthetic,
    isCalibration: false
  };
}

function analyzeCalibrationBaseline(validWindows) {
  if (!validWindows || validWindows.length === 0) {
    return { validWindowsCount: 0, mu: [], sd: [] };
  }

  const n = validWindows.length;
  const mu = new Array(18).fill(0);
  const sd = new Array(18).fill(0);

  const transWindows = validWindows.map(w => transformFeatures(w.f || new Array(18).fill(0)));

  for (let i = 0; i < 18; i++) {
    const sum = transWindows.reduce((acc, tw) => acc + tw[i], 0);
    mu[i] = sum / n;
    const varSum = transWindows.reduce((acc, tw) => acc + (tw[i] - mu[i]) ** 2, 0);
    sd[i] = Math.sqrt(varSum / n);
  }

  return {
    validWindowsCount: n,
    mu,
    sd,
    featureTable: FEATURE_DEFINITIONS.map((def, idx) => ({
      id: def.id,
      code: def.name,
      name: def.plainName,
      mu: mu[idx],
      sd: sd[idx]
    }))
  };
}

export function generateCSV(session) {
  const windows = session.windows || [];
  const headers = [
    'win_id', 't_end', 'valid', 'n_keys',
    ...FEATURE_DEFINITIONS.map(d => d.name),
    'cls', 'p_low', 'p_med', 'p_high', 'flags', 'alert', 'state'
  ];

  const rows = [headers.join(',')];

  for (const w of windows) {
    const f = w.f || new Array(18).fill(0);
    const pred = w.pred || {};
    const p = pred.p || [0, 0, 0];

    const row = [
      w.win_id,
      w.t_end,
      w.valid,
      w.n_keys,
      ...f.map(v => typeof v === 'number' ? v.toFixed(3) : '0.000'),
      pred.cls ?? 255,
      (p[0] ?? 0).toFixed(2),
      (p[1] ?? 0).toFixed(2),
      (p[2] ?? 0).toFixed(2),
      pred.flags ?? 0,
      pred.alert ?? 0,
      pred.state ?? 0
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}
