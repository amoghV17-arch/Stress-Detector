/**
 * schedule.js — Latin-square condition scheduling and collection protocol per docs/MILESTONES.md M4
 */

export const CONDITIONS = [
  { id: 'C1', condition: 'calm', lighting: 'normal', name: 'Calm / Normal Light' },
  { id: 'C2', condition: 'calm', lighting: 'dim',    name: 'Calm / Dim Light' },
  { id: 'C3', condition: 'pressure', lighting: 'normal', name: 'Pressure / Normal Light' },
  { id: 'C4', condition: 'pressure', lighting: 'dim',    name: 'Pressure / Dim Light' }
];

// 4x4 Latin Square for counterbalancing order effects
export const LATIN_SQUARE = [
  [0, 1, 3, 2], // P0: C1, C2, C4, C3
  [1, 2, 0, 3], // P1: C2, C3, C1, C4
  [2, 3, 1, 0], // P2: C3, C4, C2, C1
  [3, 0, 2, 1]  // P3: C4, C1, C3, C2
];

/**
 * Generates the full 5-step visit plan for a participant.
 * Step 0: CAL (3-minute baseline)
 * Steps 1-4: 4 experimental RUN sessions (5 minutes each, Latin-square counterbalanced)
 * @param {number|string} participantId number or string e.g. "u01"
 * @returns {Array} List of 5 session step definitions
 */
export function generateParticipantSchedule(participantId) {
  let pIdx = 0;
  if (typeof participantId === 'number') {
    pIdx = participantId;
  } else {
    // Extract digits from "u01", "p02", etc.
    const match = String(participantId).match(/\d+/);
    if (match) {
      pIdx = parseInt(match[0], 10) - 1; // 1-based to 0-based
    }
  }
  if (isNaN(pIdx) || pIdx < 0) pIdx = 0;

  const row = LATIN_SQUARE[pIdx % 4];

  const schedule = [
    {
      step: 0,
      sessionId: 's01',
      mode: 'CAL',
      condition: 'calm',
      lighting: 'normal',
      durationSeconds: 180, // 3 minutes
      name: 'Baseline Calibration (CAL)'
    }
  ];

  for (let i = 0; i < 4; i++) {
    const condDef = CONDITIONS[row[i]];
    schedule.push({
      step: i + 1,
      sessionId: `s0${i + 2}`,
      mode: 'RUN',
      condition: condDef.condition,
      lighting: condDef.lighting,
      durationSeconds: 300, // 5 minutes
      name: `Session ${i + 1}: ${condDef.name}`
    });
  }

  return schedule;
}

/**
 * Calculates allowed time for pressure mode:
 * "Pressure mode allowed time = 0.75 x the time the participant needed at their CAL pace."
 * @param {number} calCharsTyped characters typed during CAL session
 * @param {number} calDurationS duration of CAL session in seconds (typically 180s)
 * @param {number} targetChars characters in the target text (typically ~400-500)
 * @returns {number} allowed time in seconds
 */
export function calculatePressureAllowedTime(calCharsTyped, calDurationS, targetChars) {
  if (!calCharsTyped || calCharsTyped <= 0 || !calDurationS || calDurationS <= 0) {
    return 225; // Default: 0.75 * 300s = 225s
  }
  const charsPerSec = calCharsTyped / calDurationS;
  const expectedSec = targetChars / charsPerSec;
  const allowed = Math.round(0.75 * expectedSec);
  // Clamp between 60s and 300s
  return Math.max(60, Math.min(300, allowed));
}
