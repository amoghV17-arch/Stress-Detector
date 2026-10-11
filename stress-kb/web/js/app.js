import { SerialManager } from './serial.js';

const serialManager = new SerialManager();

const btnConnect = document.getElementById('btn-connect');
const toggleSimulator = document.getElementById('toggle-simulator');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const consoleOutput = document.getElementById('console-output');
const btnClearConsole = document.getElementById('btn-clear-console');
const btnSendHello = document.getElementById('btn-send-hello');

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
    logToConsole(`System: Handshake succeeded with device (Firmware v${info.version}, Protocol ${info.protocol})`, 'sys');
  } else if (status === 'CONNECTING') {
    statusBadge.classList.add('status-connecting');
    statusText.textContent = message;
    btnConnect.disabled = true;
    logToConsole(`System: ${message}`, 'sys');
  } else {
    statusBadge.classList.add('status-disconnected');
    statusText.textContent = message;
    btnConnect.textContent = 'Connect';
    btnConnect.disabled = false;
    btnConnect.classList.remove('btn-danger');
    btnSendHello.disabled = true;
    logToConsole(`System: ${message}`, 'sys');
  }
};

serialManager.onLineReceived = (line) => {
  const isWarn = line.startsWith('WARN');
  logToConsole(`<- ${line}`, isWarn ? 'warn' : 'rx');
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
    const useSim = toggleSimulator.checked;
    await serialManager.connect(useSim);
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
