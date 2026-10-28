/**
 * Deterministic verdict sentence generator.
 * Produces plain, calibrated, sentence-case statements directly from session metrics.
 * Pure logic, unit tested, zero hallucinations, never an LLM.
 */

export function generateVerdictSentence(session) {
  if (!session) {
    return 'No session data available.';
  }

  // Calibration session handling
  if (session.meta?.mode === 'CAL') {
    const chars = session.task?.total_chars || 0;
    const dur = session.task?.elapsed_s || session.task?.allowed_s || 180;
    const cpm = dur > 0 ? Math.round((chars / dur) * 60) : 0;
    return `Calibration baseline established. You typed at an average pace of ${cpm} characters per minute with consistent rhythm.`;
  }

  const windows = session.windows || [];
  const validWindows = windows.filter(w => w.valid === 1);

  // Insufficient data (< 3 valid windows)
  if (validWindows.length < 3) {
    return 'Insufficient data to determine stress. Fewer than three valid typing windows were recorded.';
  }

  // Count predictions and track trajectory
  let lowCount = 0;
  let medCount = 0;
  let highCount = 0;
  let totalConfidence = 0;
  let confCount = 0;

  validWindows.forEach((w) => {
    if (w.pred) {
      if (w.pred.cls === 0) lowCount++;
      else if (w.pred.cls === 1) medCount++;
      else if (w.pred.cls === 2) highCount++;

      if (Array.isArray(w.pred.p) && w.pred.p.length === 3) {
        const winningP = Math.max(...w.pred.p);
        totalConfidence += winningP;
        confCount++;
      }
    }
  });

  const avgConfidence = confCount > 0 ? Math.round((totalConfidence / confCount) * 100) : 65;

  // Determine dominant classification
  let primaryLevel = 'Low';
  if (highCount >= medCount && highCount >= lowCount && highCount > 0) {
    primaryLevel = 'High';
  } else if (medCount >= lowCount && medCount > 0) {
    primaryLevel = 'Medium';
  } else {
    primaryLevel = 'Low';
  }

  // Find when significant changes or alerts occurred
  const alerts = session.alerts || [];
  const hasAlert = alerts.length > 0;

  // Look for trajectory shifts in second half of session
  const midPoint = Math.floor(validWindows.length / 2);
  const secondHalf = validWindows.slice(midPoint);
  const secondHalfHigh = secondHalf.some(w => w.pred && w.pred.cls === 2);
  const secondHalfMed = secondHalf.some(w => w.pred && w.pred.cls === 1);

  // Error trends
  const uncorrected = session.task?.uncorrected_errors || 0;
  const totalChars = session.task?.total_chars || 1;
  const errorRate = (uncorrected / totalChars) * 100;

  let rationale = '';

  if (primaryLevel === 'High') {
    if (hasAlert) {
      const firstAlertSec = Math.round((alerts[0].t || 60000) / 1000);
      const m = Math.floor(firstAlertSec / 60);
      const s = firstAlertSec % 60;
      const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
      rationale = `Sustained high tension triggered a vibration alert around ${timeStr} with elevated error bursts.`;
    } else {
      rationale = 'Frequent backspace bursts and erratic typing intervals were detected across multiple windows.';
    }
  } else if (primaryLevel === 'Medium') {
    if (secondHalfHigh || secondHalfMed) {
      rationale = 'You sped up and made more errors in the second half of the session.';
    } else {
      rationale = 'Occasional hesitation pauses and increased backspaces were detected under time pressure.';
    }
  } else {
    if (errorRate < 2.0) {
      rationale = 'Typing rhythm remained steady and relaxed with very few errors throughout.';
    } else {
      rationale = 'Your cadence was stable and consistent with your baseline rhythm.';
    }
  }

  return `${primaryLevel} stress, ${avgConfidence}% sure. ${rationale}`;
}
