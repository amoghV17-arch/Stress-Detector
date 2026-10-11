import { SerialManager } from './serial.js';
import { TypingEngine } from './core/typing_engine.js';
import { getRandomParagraph } from './core/paragraphs.js';
import { generateParticipantSchedule, calculatePressureAllowedTime } from './core/schedule.js';
import { parseAndAnalyzeSession, generateCSV } from './core/report.js';

const serialManager = new SerialManager();
let currentEngine = null;
let heartbeatInterval = null;
let timerInterval = null;
let sessionDurationSeconds = 300;
let remainingSeconds = 300;
let liveScore = 0;
let usedParagraphIndices = [];
let currentSchedule = [];
let calBaselinePace = { chars: 0, durationS: 180 };

// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const toggleSimulator = document.getElementById('toggle-simulator');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const consoleOutput = document.getElementById('console-output');
const btnClearConsole = document.getElementById('btn-clear-console');
const btnSendHello = document.getElementById('btn-send-hello');

const selectVisitStep = document.getElementById('select-visit-step');
const cardSetup = document.getElementById('card-setup');
const inputUserId = document.getElementById('input-user-id');
const selectMode = document.getElementById('select-mode');
const selectCondition = document.getElementById('select-condition');
const selectLighting = document.getElementById('select-lighting');
const checkConsent = document.getElementById('check-consent');
const btnStartSession = document.getElementById('btn-start-session');

const cardTask = document.getElementById('card-task');
const hudTimer = document.getElementById('hud-timer');
const hudProgress = document.getElementById('hud-progress');
const hudAccuracy = document.getElementById('hud-accuracy');
const hudScoreContainer = document.getElementById('hud-score-container');
const hudScore = document.getElementById('hud-score');
const btnStopSession = document.getElementById('btn-stop-session');
const typingContainer = document.getElementById('typing-container');

// Self-Report Modal
const modalSelfReport = document.getElementById('modal-selfreport');
const sliderStress = document.getElementById('slider-stress');
const sliderRushed = document.getElementById('slider-rushed');
const sliderTired = document.getElementById('slider-tired');
const valStress = document.getElementById('val-stress');
const valRushed = document.getElementById('val-rushed');
const valTired = document.getElementById('val-tired');
const btnSaveSession = document.getElementById('btn-save-session');
const btnCloseModal = document.getElementById('btn-close-modal');

function updateScheduleDropdown() {
  const userId = (inputUserId.value || 'u01').trim();
  currentSchedule = generateParticipantSchedule(userId);
  selectVisitStep.innerHTML = '';
  currentSchedule.forEach((step, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `Step ${step.step}: ${step.name}`;
    selectVisitStep.appendChild(opt);
  });
  applySelectedScheduleStep();
}

function applySelectedScheduleStep() {
  const idx = parseInt(selectVisitStep.value, 10) || 0;
  const step = currentSchedule[idx];
  if (step) {
    selectMode.value = step.mode;
    selectCondition.value = step.condition;
    selectLighting.value = step.lighting;
  }
}

inputUserId.addEventListener('input', updateScheduleDropdown);
selectVisitStep.addEventListener('change', applySelectedScheduleStep);

// Initial populate
updateScheduleDropdown();

function logToConsole(text, type = 'sys') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${text}`;
  consoleOutput.appendChild(entry);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

serialManager.onStatusChange = (status, message, info) => {
  statusBadge.className = 'status-badge';
  if (status === 'CONNECTED') {
    statusBadge.classList.add('status-connected');
    statusText.textContent = message;
    btnConnect.textContent = 'Disconnect';
    btnConnect.classList.add('btn-danger');
    btnSendHello.disabled = false;
    btnStartSession.disabled = !checkConsent.checked;
    logToConsole(`System: Handshake complete (Firmware v${info.version}, Protocol ${info.protocol})`, 'sys');
  } else if (status === 'CONNECTING') {
    statusBadge.classList.add('status-connecting');
    statusText.textContent = message;
    btnConnect.disabled = true;
    btnStartSession.disabled = true;
    logToConsole(`System: ${message}`, 'sys');
  } else {
    statusBadge.classList.add('status-disconnected');
    statusText.textContent = message;
    btnConnect.textContent = 'Connect';
    btnConnect.disabled = false;
    btnConnect.classList.remove('btn-danger');
    btnSendHello.disabled = true;
    btnStartSession.disabled = true;
    logToConsole(`System: ${message}`, 'sys');
  }
};

serialManager.onLineReceived = (line) => {
  const isWarn = line.startsWith('WARN');
  logToConsole(`<- ${line}`, isWarn ? 'warn' : 'rx');
  if (currentEngine) {
    currentEngine.handleIncomingDeviceLine(line);
  }
};

serialManager.onLineSent = (line) => {
  logToConsole(`-> ${line}`, 'tx');
};

serialManager.onError = (err) => {
  logToConsole(`Error: ${err.message}`, 'warn');
};

btnConnect.addEventListener('click', async () => {
  if (serialManager.isConnected) {
    await serialManager.disconnect();
  } else {
    await serialManager.connect(toggleSimulator.checked);
  }
});

btnSendHello.addEventListener('click', async () => {
  if (serialManager.isConnected) {
    await serialManager.sendLine('HELLO,1');
  }
});

btnClearConsole.addEventListener('click', () => {
  consoleOutput.innerHTML = '';
});

checkConsent.addEventListener('change', () => {
  btnStartSession.disabled = !checkConsent.checked || !serialManager.isConnected;
});

// Slider values live display
sliderStress.addEventListener('input', () => { valStress.textContent = sliderStress.value; });
sliderRushed.addEventListener('input', () => { valRushed.textContent = sliderRushed.value; });
sliderTired.addEventListener('input', () => { valTired.textContent = sliderTired.value; });

// Target paragraph rendering
let targetText = '';
function renderTypingDisplay(cursor) {
  typingContainer.innerHTML = '';
  for (let i = 0; i < targetText.length; i++) {
    const span = document.createElement('span');
    span.textContent = targetText[i];
    if (i < cursor) {
      span.className = 'char-correct';
    } else if (i === cursor) {
      span.className = 'char-current';
    } else {
      span.className = 'char-pending';
    }
    typingContainer.appendChild(span);
  }
}

// Start Session
btnStartSession.addEventListener('click', () => {
  const userId = (inputUserId.value || 'u01').trim();
  const stepIdx = parseInt(selectVisitStep.value, 10) || 0;
  const currentStepDef = currentSchedule[stepIdx] || {};

  const mode = selectMode.value; // CAL or RUN
  const condition = selectCondition.value; // calm or pressure
  const lighting = selectLighting.value;
  const sessionId = currentStepDef.sessionId || `s0${stepIdx + 1}`;

  const chosen = getRandomParagraph(usedParagraphIndices);
  usedParagraphIndices.push(chosen.index);
  targetText = chosen.text;

  currentEngine = new TypingEngine({
    targetText,
    sessionId,
    userId,
    mode,
    condition,
    lighting,
    onSerialLine: (line) => serialManager.sendLine(line),
    onProgress: (p) => {
      hudProgress.textContent = `${p.cursor} / ${p.total}`;
      const acc = p.cursor > 0 ? Math.round((p.correct / (p.correct + p.errors)) * 100) : 100;
      hudAccuracy.textContent = `${acc}%`;

      if (condition === 'pressure') {
        liveScore = Math.max(0, p.correct * 10 - p.errors * 25);
        hudScore.textContent = liveScore;
      }
      renderTypingDisplay(p.cursor);

      if (p.cursor >= p.total) {
        finishSession();
      }
    }
  });

  // Switch to task view
  cardSetup.style.display = 'none';
  cardTask.style.display = 'block';

  renderTypingDisplay(0);
  typingContainer.focus();

  // Mode durations: CAL = 180s (3 min), RUN = 300s (5 min)
  if (mode === 'CAL') {
    sessionDurationSeconds = 180;
  } else {
    if (condition === 'pressure') {
      // Allowed time = 0.75 * time at CAL pace
      sessionDurationSeconds = calculatePressureAllowedTime(
        calBaselinePace.chars,
        calBaselinePace.durationS,
        targetText.length
      );
    } else {
      sessionDurationSeconds = 300;
    }
  }
  remainingSeconds = sessionDurationSeconds;

  if (condition === 'pressure') {
    hudScoreContainer.style.display = 'flex';
    hudTimer.textContent = formatTime(remainingSeconds);
  } else {
    hudScoreContainer.style.display = 'none';
    hudTimer.textContent = 'Untimed';
  }

  currentEngine.start(performance.now());

  // 1 Hz Heartbeat
  heartbeatInterval = setInterval(() => {
    if (currentEngine) {
      currentEngine.handleHeartbeat(performance.now());
    }
  }, 1000);

  // Timer countdown
  if (condition === 'pressure') {
    timerInterval = setInterval(() => {
      remainingSeconds--;
      hudTimer.textContent = formatTime(remainingSeconds);
      if (remainingSeconds <= 0) {
        finishSession();
      }
    }, 1000);
  }
});

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Keyboard capturing (Strict Privacy: never stores typed text)
typingContainer.addEventListener('keydown', (e) => {
  if (!currentEngine || !currentEngine.isActive) return;
  e.preventDefault();
  currentEngine.handleKeyDown({
    key: e.key,
    code: e.code,
    repeat: e.repeat,
    time: performance.now()
  });
});

typingContainer.addEventListener('keyup', (e) => {
  if (!currentEngine || !currentEngine.isActive) return;
  e.preventDefault();
  currentEngine.handleKeyUp({
    key: e.key,
    code: e.code,
    time: performance.now()
  });
});

window.addEventListener('blur', () => {
  if (currentEngine && currentEngine.isActive) {
    currentEngine.handleFocusChange(false, performance.now());
  }
});

window.addEventListener('focus', () => {
  if (currentEngine && currentEngine.isActive) {
    currentEngine.handleFocusChange(true, performance.now());
  }
});

document.addEventListener('visibilitychange', () => {
  if (currentEngine && currentEngine.isActive) {
    const gained = document.visibilityState === 'visible';
    currentEngine.handleFocusChange(gained, performance.now());
  }
});

btnStopSession.addEventListener('click', () => {
  finishSession();
});

function finishSession() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (currentEngine) {
    currentEngine.stop();
    if (selectMode.value === 'CAL') {
      calBaselinePace = {
        chars: currentEngine.cursor,
        durationS: sessionDurationSeconds
      };
      logToConsole(`Protocol: Calibration pace recorded (${calBaselinePace.chars} chars in ${calBaselinePace.durationS}s). Pressure time will be scaled to 0.75x.`, 'sys');
    }
  }

  cardTask.style.display = 'none';
  cardSetup.style.display = 'block';
  modalSelfReport.style.display = 'flex';

  // Auto-advance to next visit step
  const nextIdx = (parseInt(selectVisitStep.value, 10) || 0) + 1;
  if (nextIdx < currentSchedule.length) {
    selectVisitStep.value = nextIdx;
    applySelectedScheduleStep();
    logToConsole('Protocol Reminder: Participant should take a >= 2 minute rest before starting the next session.', 'sys');
  }
}

let currentSessionData = null;
let timelineChartInstance = null;

// Navigation elements
const btnNavTyping = document.getElementById('btn-nav-typing');
const btnNavReport = document.getElementById('btn-nav-report');
const sectionReport = document.getElementById('section-report');
const cardConsole = document.getElementById('card-console');
const btnModalViewReport = document.getElementById('btn-modal-view-report');

// Report elements
const inputReportFile = document.getElementById('input-report-file');
const reportFileName = document.getElementById('report-file-name');
const btnReportDownloadJson = document.getElementById('btn-report-download-json');
const btnReportDownloadCsv = document.getElementById('btn-report-download-csv');
const btnReportPrint = document.getElementById('btn-report-print');

const reportSynthBanner = document.getElementById('report-synth-banner');
const reportInsufficientBanner = document.getElementById('report-insufficient-banner');
const reportDefaultBaselineBanner = document.getElementById('report-default-baseline-banner');

function switchToTab(tab) {
  if (tab === 'typing') {
    btnNavTyping.classList.add('active-nav');
    btnNavReport.classList.remove('active-nav');
    cardSetup.style.display = 'block';
    cardConsole.style.display = 'block';
    sectionReport.style.display = 'none';
  } else {
    btnNavTyping.classList.remove('active-nav');
    btnNavReport.classList.add('active-nav');
    cardSetup.style.display = 'none';
    cardTask.style.display = 'none';
    cardConsole.style.display = 'none';
    sectionReport.style.display = 'block';
  }
}

btnNavTyping.addEventListener('click', () => switchToTab('typing'));
btnNavReport.addEventListener('click', () => switchToTab('report'));

function getCompletedSessionData() {
  if (!currentEngine) return null;
  return currentEngine.exportSessionJSON({
    selfreport: {
      stress: parseInt(sliderStress.value, 10),
      rushed: parseInt(sliderRushed.value, 10),
      tired: parseInt(sliderTired.value, 10)
    },
    task: {
      allowed_s: sessionDurationSeconds,
      restarts: 0
    }
  });
}

btnSaveSession.addEventListener('click', () => {
  const sessionData = getCompletedSessionData();
  if (!sessionData) return;
  currentSessionData = sessionData;

  const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sessionData.meta.user_id}_${sessionData.meta.session_id}_${sessionData.meta.mode}.json`;
  a.click();
  URL.revokeObjectURL(url);

  modalSelfReport.style.display = 'none';
});

btnModalViewReport.addEventListener('click', () => {
  const sessionData = getCompletedSessionData();
  if (!sessionData) return;
  currentSessionData = sessionData;
  modalSelfReport.style.display = 'none';
  switchToTab('report');
  renderReportView(currentSessionData, `${sessionData.meta.user_id}_${sessionData.meta.session_id}_${sessionData.meta.mode}.json`);
});

btnCloseModal.addEventListener('click', () => {
  modalSelfReport.style.display = 'none';
});

// File upload handler
inputReportFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  reportFileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      currentSessionData = data;
      renderReportView(data, file.name);
    } catch (err) {
      alert(`Invalid session JSON: ${err.message}`);
    }
  };
  reader.readAsText(file);
});

// Export handlers
btnReportDownloadJson.addEventListener('click', () => {
  if (!currentSessionData) return;
  const blob = new Blob([JSON.stringify(currentSessionData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fname = `${currentSessionData.meta?.user_id || 'user'}_${currentSessionData.meta?.session_id || 'sess'}_report.json`;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
});

btnReportDownloadCsv.addEventListener('click', () => {
  if (!currentSessionData) return;
  const csv = generateCSV(currentSessionData);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fname = `${currentSessionData.meta?.user_id || 'user'}_${currentSessionData.meta?.session_id || 'sess'}_windows.csv`;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
});

btnReportPrint.addEventListener('click', () => {
  window.print();
});

export function renderReportView(sessionData, fileName = '') {
  if (!sessionData) return;
  currentSessionData = sessionData;

  btnReportDownloadJson.disabled = false;
  btnReportDownloadCsv.disabled = false;
  btnReportPrint.disabled = false;
  if (fileName) reportFileName.textContent = fileName;

  const analysis = parseAndAnalyzeSession(sessionData);

  // Banners
  reportSynthBanner.style.display = analysis.isSynthetic ? 'block' : 'none';
  reportInsufficientBanner.style.display = analysis.isInsufficientData ? 'block' : 'none';
  reportDefaultBaselineBanner.style.display = (analysis.reliability && analysis.reliability.defaultBaselineWarning) ? 'block' : 'none';

  // Section 1: Summary
  const s = analysis.summary;
  const summaryGrid = document.getElementById('rep-summary-grid');
  summaryGrid.innerHTML = `
    <div class="summary-card"><div class="summary-card-label">Participant ID</div><div class="summary-card-val">${s.userId}</div></div>
    <div class="summary-card"><div class="summary-card-label">Session ID</div><div class="summary-card-val">${s.sessionId}</div></div>
    <div class="summary-card"><div class="summary-card-label">Task Mode</div><div class="summary-card-val">${s.mode} (${s.condition})</div></div>
    <div class="summary-card"><div class="summary-card-label">Lighting Context</div><div class="summary-card-val">${s.lighting}</div></div>
    <div class="summary-card"><div class="summary-card-label">Duration</div><div class="summary-card-val">${s.durationSeconds}s</div></div>
    <div class="summary-card"><div class="summary-card-label">Keystrokes</div><div class="summary-card-val">${s.totalKeystrokes}</div></div>
    <div class="summary-card"><div class="summary-card-label">Valid Windows</div><div class="summary-card-val">${s.validWindows} / ${s.totalWindows} (${s.coveragePercent}%)</div></div>
    <div class="summary-card"><div class="summary-card-label">Baseline Source</div><div class="summary-card-val">${s.baselineSource}</div></div>
  `;

  // Calibration Section
  const secCal = document.getElementById('rep-sec-calibration');
  const secOverall = document.getElementById('rep-sec-overall');
  const secTimeline = document.getElementById('rep-sec-timeline');
  const secIndicators = document.getElementById('rep-sec-indicators');
  const secPatterns = document.getElementById('rep-sec-patterns');
  const secTrends = document.getElementById('rep-sec-trends');
  const secSelfReport = document.getElementById('rep-sec-selfreport');

  if (analysis.isCalibration) {
    secCal.style.display = 'block';
    secOverall.style.display = 'none';
    secTimeline.style.display = 'none';
    secIndicators.style.display = 'none';
    secPatterns.style.display = 'none';
    secTrends.style.display = 'none';
    secSelfReport.style.display = 'none';

    const tbody = document.querySelector('#rep-cal-table tbody');
    tbody.innerHTML = '';
    analysis.calibrationStats.featureTable.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.id}</td>
        <td><code>${row.code}</code></td>
        <td>${row.name}</td>
        <td><strong>${row.mu.toFixed(3)}</strong></td>
        <td><strong>${row.sd.toFixed(3)}</strong></td>
      `;
      tbody.appendChild(tr);
    });
    return;
  }

  secCal.style.display = 'none';

  // Section 2: Overall Stress
  if (analysis.overallStress && !analysis.isInsufficientData) {
    secOverall.style.display = 'block';
    const os = analysis.overallStress;
    const badge = document.getElementById('rep-stress-level');
    badge.textContent = os.level;
    badge.className = `stress-badge stress-${os.level.toLowerCase()}`;
    document.getElementById('rep-stress-score').textContent = os.meanScore.toFixed(2);
    document.getElementById('rep-stress-confidence').textContent = `${Math.round(os.meanConfidence * 100)}%`;

    const d = os.distribution;
    document.getElementById('rep-distribution-bars').innerHTML = `
      <div class="dist-bar dist-bar-low" style="width: ${d.lowPercent}%;" title="Low: ${d.lowPercent}%">${d.lowPercent > 10 ? `Low ${d.lowPercent}%` : ''}</div>
      <div class="dist-bar dist-bar-med" style="width: ${d.mediumPercent}%;" title="Med: ${d.mediumPercent}%">${d.mediumPercent > 10 ? `Med ${d.mediumPercent}%` : ''}</div>
      <div class="dist-bar dist-bar-high" style="width: ${d.highPercent}%;" title="High: ${d.highPercent}%">${d.highPercent > 10 ? `High ${d.highPercent}%` : ''}</div>
    `;
  } else {
    secOverall.style.display = 'none';
  }

  // Section 3: Timeline Chart
  secTimeline.style.display = 'block';
  renderTimelineChart(analysis.timeline);

  // Section 4: Indicators Table
  secIndicators.style.display = 'block';
  const indTbody = document.querySelector('#rep-indicators-table tbody');
  indTbody.innerHTML = '';
  analysis.indicators.forEach(ind => {
    const tr = document.createElement('tr');
    if (ind.isTopContributor) tr.classList.add('top-contributor-row');
    const arrowClass = ind.direction === 'up' ? 'arrow-up' : (ind.direction === 'down' ? 'arrow-down' : 'arrow-flat');
    tr.innerHTML = `
      <td>${ind.id}</td>
      <td>
        <code>${ind.code}</code>
        ${ind.isTopContributor ? '<span class="top-contributor-badge">Top 3</span>' : ''}
        <div style="font-size: 0.75rem; color: var(--text-muted);">${ind.name}</div>
      </td>
      <td>${ind.rawMean.toFixed(2)}</td>
      <td><strong>${ind.zScore > 0 ? '+' : ''}${ind.zScore.toFixed(2)}</strong></td>
      <td class="${arrowClass}">${ind.arrow} ${ind.direction}</td>
      <td>${ind.meaning}</td>
    `;
    indTbody.appendChild(tr);
  });

  // Section 5: Patterns
  if (analysis.patterns && !analysis.isInsufficientData) {
    secPatterns.style.display = 'block';
    const grid = document.getElementById('rep-patterns-grid');
    grid.innerHTML = '';
    analysis.patterns.forEach(p => {
      const card = document.createElement('div');
      card.className = `pattern-card ${p.isActive ? 'pattern-card-active' : ''}`;
      card.innerHTML = `
        <div class="pattern-header">
          <span class="pattern-name">${p.name}</span>
          <span class="pattern-pct">${p.activePercent}%</span>
        </div>
        <div class="pattern-rule">${p.rule}</div>
      `;
      grid.appendChild(card);
    });
  } else {
    secPatterns.style.display = 'none';
  }

  // Section 6: Trends
  if (analysis.trends && !analysis.isInsufficientData) {
    secTrends.style.display = 'block';
    const tGrid = document.getElementById('rep-trends-grid');
    tGrid.innerHTML = '';
    Object.values(analysis.trends).forEach(t => {
      const card = document.createElement('div');
      card.className = 'trend-card';
      const dirClass = `trend-dir-${t.direction}`;
      card.innerHTML = `
        <div class="trend-header">
          <span class="trend-name">${t.name}</span>
          <span class="${dirClass}">${t.direction.toUpperCase()} (${t.diffPct > 0 ? '+' : ''}${t.diffPct.toFixed(1)}%)</span>
        </div>
        <div class="trend-rule">Start: ${t.first.toFixed(2)} &rarr; End: ${t.last.toFixed(2)}</div>
      `;
      tGrid.appendChild(card);
    });
  } else {
    secTrends.style.display = 'none';
  }

  // Section 7: Context
  const repContext = document.getElementById('rep-context-content');
  if (!analysis.context || !analysis.context.hasSensor) {
    repContext.innerHTML = `<div style="color: var(--text-muted); font-style: italic;">No light sensor in this session (hardware skipped gracefully).</div>`;
  } else {
    const c = analysis.context;
    let notes = [];
    if (c.lowLight) notes.push('<span style="color: var(--accent-amber);">Low light environment (&lt; 50 Lux)</span>');
    if (c.unstableLight) notes.push('<span style="color: var(--accent-red);">Unstable lighting conditions (variation &gt; 30%)</span>');
    if (notes.length === 0) notes.push('<span style="color: var(--accent-green);">Stable lighting conditions</span>');

    repContext.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-card-label">Mean Ambient Light</div><div class="summary-card-val">${c.meanLux.toFixed(1)} Lux</div></div>
        <div class="summary-card"><div class="summary-card-label">Light Variation (Std)</div><div class="summary-card-val">${c.luxStd.toFixed(1)} Lux</div></div>
        <div class="summary-card"><div class="summary-card-label">Condition Assessment</div><div class="summary-card-val" style="font-size: 0.85rem;">${notes.join(' • ')}</div></div>
      </div>
    `;
  }

  // Section 8: Reliability
  const relGrid = document.getElementById('rep-reliability-grid');
  const rel = analysis.reliability;
  let warnText = rel.warnings.length > 0 ? rel.warnings.map(w => `${w.code}: ${w.detail}`).join(', ') : 'None detected';
  relGrid.innerHTML = `
    <div class="rel-card"><div class="rel-label">Window Coverage</div><div class="rel-val">${rel.coveragePercent}%</div></div>
    <div class="rel-card"><div class="rel-label">Uncertain Windows</div><div class="rel-val">${rel.uncertainWindowsCount}</div></div>
    <div class="rel-card"><div class="rel-label">Mean Confidence</div><div class="rel-val">${Math.round(rel.meanConfidence * 100)}%</div></div>
    <div class="rel-card"><div class="rel-label">Warnings</div><div class="rel-val" style="font-size: 0.85rem;">${warnText}</div></div>
  `;

  // Section 9: Alerts
  const repAlerts = document.getElementById('rep-alerts-content');
  if (analysis.alerts.count === 0) {
    repAlerts.innerHTML = `<div style="color: var(--accent-green); font-size: 0.9rem;">0 haptic vibration alerts triggered during this session.</div>`;
  } else {
    let momentsHtml = analysis.alerts.moments.map(m => `
      <div style="margin-bottom: 0.4rem;">
        &bull; <strong>Window ${m.winId} (${m.tEndMinutes} min)</strong>: Pattern flags: ${m.activeFlags.join(', ') || 'None'}
      </div>
    `).join('');
    repAlerts.innerHTML = `
      <div style="color: var(--accent-amber); font-size: 0.95rem; margin-bottom: 0.5rem;">
        <strong>${analysis.alerts.count}</strong> vibration alert(s) triggered:
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">${momentsHtml}</div>
    `;
  }

  // Section 10: Self-Report
  if (analysis.selfReportComparison && !analysis.isInsufficientData) {
    secSelfReport.style.display = 'block';
    const sr = analysis.selfReportComparison;
    secSelfReport.innerHTML = `
      <h3 class="rep-title">10. Post-Session Self-Report Comparison</h3>
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-card-label">Reported Stress Rating</div><div class="summary-card-val">${sr.reportedRating} / 5 (${sr.reportedLevel})</div></div>
        <div class="summary-card"><div class="summary-card-label">Model Estimate</div><div class="summary-card-val">${sr.modelLevel}</div></div>
        <div class="summary-card"><div class="summary-card-label">Agreement</div><div class="summary-card-val" style="color: ${sr.agrees ? 'var(--accent-green)' : 'var(--accent-amber)'}">${sr.agrees ? 'Match' : 'Discrepancy'}</div></div>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">${sr.summary}</p>
    `;
  } else {
    secSelfReport.style.display = 'none';
  }

  // Section 11: Disclaimer
  const repDisc = document.getElementById('rep-disclaimer-content');
  let suggestionsHtml = '';
  if (analysis.disclaimer.suggestions.length > 0) {
    suggestionsHtml = `
      <div class="disclaimer-suggestions">
        <strong>Ergonomic Break Recommendations:</strong>
        <ul>
          ${analysis.disclaimer.suggestions.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  repDisc.innerHTML = `
    <div class="disclaimer-text">${analysis.disclaimer.text}</div>
    ${suggestionsHtml}
  `;
}

function renderTimelineChart(timeline) {
  const canvas = document.getElementById('rep-timeline-chart');
  if (!canvas) return;

  if (timelineChartInstance) {
    timelineChartInstance.destroy();
    timelineChartInstance = null;
  }

  if (typeof window.Chart === 'undefined') return;

  const labels = timeline.map(w => `W${w.winId} (${(w.tEnd / 60000).toFixed(1)}m)`);
  const stressScores = timeline.map(w => w.valid ? w.score : null);
  const confidences = timeline.map(w => w.valid ? w.confidence : null);
  const alertPoints = timeline.map(w => w.alert ? w.score : null);

  const ctx = canvas.getContext('2d');
  timelineChartInstance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Stress Score',
          data: stressScores,
          borderColor: '#f87171',
          backgroundColor: 'rgba(248, 113, 113, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Confidence',
          data: confidences,
          borderColor: '#38bdf8',
          borderDash: [5, 5],
          borderWidth: 1.5,
          tension: 0.3,
          fill: false
        },
        {
          label: 'Alert Moment',
          data: alertPoints,
          pointBackgroundColor: '#fbbf24',
          pointBorderColor: '#fff',
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 1.0,
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(51, 65, 85, 0.4)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(51, 65, 85, 0.2)' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f8fafc' }
        }
      }
    }
  });
}

