import { SerialManager } from './serial.js';
import { TypingEngine } from './core/typing_engine.js';
import { getRandomParagraph } from './core/paragraphs.js';

const serialManager = new SerialManager();
let currentEngine = null;
let heartbeatInterval = null;
let timerInterval = null;
let sessionDurationSeconds = 300;
let remainingSeconds = 300;
let liveScore = 0;
let usedParagraphIndices = [];

// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const toggleSimulator = document.getElementById('toggle-simulator');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const consoleOutput = document.getElementById('console-output');
const btnClearConsole = document.getElementById('btn-clear-console');
const btnSendHello = document.getElementById('btn-send-hello');

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
  const mode = selectMode.value; // CAL or RUN
  const condition = selectCondition.value; // calm or pressure
  const lighting = selectLighting.value;
  const sessionId = `s_${Date.now().toString(36)}`;

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
        // Live score with accuracy penalty
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
  sessionDurationSeconds = mode === 'CAL' ? 180 : 300;
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
  }

  cardTask.style.display = 'none';
  cardSetup.style.display = 'block';
  modalSelfReport.style.display = 'flex';
}

btnSaveSession.addEventListener('click', () => {
  if (!currentEngine) return;
  const sessionData = currentEngine.exportSessionJSON({
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

  const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sessionData.meta.user_id}_${sessionData.meta.session_id}_${sessionData.meta.mode}.json`;
  a.click();
  URL.revokeObjectURL(url);

  modalSelfReport.style.display = 'none';
});

btnCloseModal.addEventListener('click', () => {
  modalSelfReport.style.display = 'none';
});
