import { HandshakeController } from './core/handshake.js';
import { FakeESP32 } from '../sim/fake-esp32.js';

export class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.handshake = null;
    this.fakeDevice = null;

    // Callbacks
    this.onStatusChange = () => {};
    this.onLineReceived = () => {};
    this.onLineSent = () => {};
    this.onError = () => {};
  }

  async connect(useSimulator = false) {
    if (this.isConnected || this.isConnecting) return;
    this.isConnecting = true;
    this.onStatusChange('CONNECTING', 'Initiating connection...');

    try {
      if (useSimulator) {
        this.fakeDevice = new FakeESP32();
        this.port = this.fakeDevice.createMockPort();
        await this.port.open();
      } else {
        if (!navigator.serial) {
          throw new Error('Web Serial is not supported in this browser. Please use Chrome or Edge, or toggle "Use simulator".');
        }
        this.port = await navigator.serial.requestPort();
        await this.port.open({ baudRate: 115200 });
      }

      // Set up writer
      const textEncoder = new TextEncoderStream();
      this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();

      // Set up reader
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      // Read loop in background
      this.startReadLoop();

      // Run HandshakeController
      await new Promise((resolve, reject) => {
        this.handshake = new HandshakeController({
          retryIntervalMs: 500,
          maxTimeoutMs: 5000,
          sendFn: (msg) => this.sendLine(msg),
          onSuccess: (info) => {
            this.isConnected = true;
            this.isConnecting = false;
            this.onStatusChange('CONNECTED', `Connected (v${info.version}, proto ${info.protocol})`, info);
            resolve(info);
          },
          onFailure: (err) => {
            this.isConnecting = false;
            this.disconnect();
            reject(err);
          }
        });
        this.handshake.start();
      });

    } catch (err) {
      this.isConnecting = false;
      this.isConnected = false;
      this.onStatusChange('DISCONNECTED', `Failed: ${err.message}`);
      this.onError(err);
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
            this.onLineReceived(trimmed);
            if (this.handshake && !this.handshake.completed) {
              this.handshake.handleLine(trimmed);
            }
          }
        }
      }
    } catch (err) {
      if (this.isConnected || this.isConnecting) {
        this.onError(err);
        this.disconnect();
      }
    }
  }

  async sendLine(line) {
    if (!this.writer) return;
    const msg = line.endsWith('\n') ? line : line + '\n';
    this.onLineSent(line.trim());
    await this.writer.write(msg);
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

    this.isConnected = false;
    this.isConnecting = false;
    this.fakeDevice = null;
    this.onStatusChange('DISCONNECTED', 'Disconnected');
  }
}
