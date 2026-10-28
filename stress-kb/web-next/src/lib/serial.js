/**
 * Shared Web Serial & Software Emulator Manager.
 * Client-only singleton that survives Next.js hot module reloading.
 * Supports Web Serial and the FakeESP32 software emulator.
 */

import { HandshakeController } from '../../../web/js/core/handshake.js';
import { FakeESP32 } from '../../../web/sim/fake-esp32.js';

export class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;

    this.status = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | CONNECTED
    this.statusMessage = 'Disconnected';
    this.deviceInfo = null; // { version: '0.1', protocol: 1 }
    this.isSimulator = false;
    this.lastUseSimulator = false;

    this.handshake = null;
    this.fakeDevice = null;

    // Listeners sets
    this.statusListeners = new Set();
    this.lineReceivedListeners = new Set();
    this.lineSentListeners = new Set();
    this.errorListeners = new Set();
  }

  get isConnected() {
    return this.status === 'CONNECTED';
  }

  get isConnecting() {
    return this.status === 'CONNECTING';
  }

  get isSerialSupported() {
    return typeof window !== 'undefined' && Boolean(navigator?.serial);
  }

  // --- Subscriptions ---
  subscribeStatus(listener) {
    this.statusListeners.add(listener);
    // Initial emit
    listener({
      status: this.status,
      message: this.statusMessage,
      deviceInfo: this.deviceInfo,
      isSimulator: this.isSimulator,
    });
    return () => this.statusListeners.delete(listener);
  }

  onLineReceived(listener) {
    this.lineReceivedListeners.add(listener);
    return () => this.lineReceivedListeners.delete(listener);
  }

  onLineSent(listener) {
    this.lineSentListeners.add(listener);
    return () => this.lineSentListeners.delete(listener);
  }

  onError(listener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  _notifyStatus(status, message, deviceInfo = null) {
    this.status = status;
    this.statusMessage = message;
    if (deviceInfo) this.deviceInfo = deviceInfo;
    if (status === 'DISCONNECTED') this.deviceInfo = null;

    const payload = {
      status: this.status,
      message: this.statusMessage,
      deviceInfo: this.deviceInfo,
      isSimulator: this.isSimulator,
    };
    for (const listener of this.statusListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('Error in status listener:', err);
      }
    }
  }

  _notifyLineReceived(line) {
    for (const listener of this.lineReceivedListeners) {
      try {
        listener(line);
      } catch (err) {
        console.error('Error in line received listener:', err);
      }
    }
  }

  _notifyLineSent(line) {
    for (const listener of this.lineSentListeners) {
      try {
        listener(line);
      } catch (err) {
        console.error('Error in line sent listener:', err);
      }
    }
  }

  _notifyError(err) {
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    }
  }

  // --- Connection Control ---
  async connect(useSimulator = false) {
    if (this.isConnected || this.isConnecting) return;

    this.isSimulator = Boolean(useSimulator);
    this.lastUseSimulator = this.isSimulator;
    this._notifyStatus('CONNECTING', 'Initiating connection...');

    try {
      if (this.isSimulator) {
        this.fakeDevice = new FakeESP32();
        this.port = this.fakeDevice.createMockPort();
        await this.port.open();
      } else {
        if (!this.isSerialSupported) {
          throw new Error('Web Serial is not supported in this browser. Please use Chrome or Edge, or toggle "Use simulator".');
        }

        this.port = await navigator.serial.requestPort();
        await this.port.open({ baudRate: 115200 });

        // DTR/RTS hardware control lines toggle for ESP32 auto-reset
        if (this.port && typeof this.port.setSignals === 'function') {
          try {
            await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
            await new Promise((r) => setTimeout(r, 100));
            await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
          } catch (e) {
            console.warn('Could not set control signals:', e);
          }
        }
      }

      // Set up writer
      const textEncoder = new TextEncoderStream();
      this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();

      // Set up reader
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      // Start read loop
      this.startReadLoop();

      // Handshake with retry (10s timeout per HG0 specification)
      await new Promise((resolve, reject) => {
        this.handshake = new HandshakeController({
          retryIntervalMs: 500,
          maxTimeoutMs: 10000,
          sendFn: (msg) => this.sendLine(msg),
          onSuccess: (info) => {
            this._notifyStatus('CONNECTED', `Connected (v${info.version}, proto ${info.protocol})`, info);
            resolve(info);
          },
          onFailure: (err) => {
            this.disconnect();
            reject(err);
          },
        });
        this.handshake.start();
      });
    } catch (err) {
      const isTimeout = err?.message && err.message.includes('timeout');
      const msg = isTimeout
        ? `${err.message}. If using a real ESP32: press the physical EN/RST button on the board, check the COM port, and verify hello.ino is uploaded.`
        : `Failed: ${err?.message || 'Connection error'}`;

      this._notifyStatus('DISCONNECTED', msg);
      this._notifyError(err);
      await this.disconnect();
      throw err;
    }
  }

  async startReadLoop() {
    let lineBuffer = '';
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        lineBuffer += value;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // keep remainder
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            this._notifyLineReceived(trimmed);
            if (this.handshake && !this.handshake.completed) {
              this.handshake.handleLine(trimmed);
            }
          }
        }
      }
    } catch (err) {
      if (this.isConnected || this.isConnecting) {
        this._notifyError(err);
        this.disconnect();
      }
    }
  }

  async sendLine(line) {
    if (!this.writer) return;
    const msg = line.endsWith('\n') ? line : line + '\n';
    this._notifyLineSent(line.trim());
    await this.writer.write(msg);
  }

  async reconnect() {
    await this.disconnect();
    return this.connect(this.lastUseSimulator);
  }

  async disconnect() {
    if (this.handshake) {
      this.handshake.cancel();
      this.handshake = null;
    }

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.readableStreamClosed) {
        await this.readableStreamClosed.catch(() => {});
        this.readableStreamClosed = null;
      }
      if (this.writer) {
        await this.writer.close();
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.writableStreamClosed) {
        await this.writableStreamClosed.catch(() => {});
        this.writableStreamClosed = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (_) {}

    this.fakeDevice = null;
    this._notifyStatus('DISCONNECTED', 'Disconnected');
  }
}

/**
 * Singleton getter that survives hot module reloads in Next.js development.
 */
export function getSerialManager() {
  if (typeof window === 'undefined') {
    return new SerialManager();
  }
  if (!window.__stresskb_serial_manager__) {
    window.__stresskb_serial_manager__ = new SerialManager();
  }
  return window.__stresskb_serial_manager__;
}
