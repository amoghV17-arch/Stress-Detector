'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { useSession } from '@/context/SessionContext';
import { OledMirror } from '@/components/OledMirror';

export default function DeviceDiagnosticsPage() {
  const session = useSession();
  const logEndRef = useRef(null);

  const [useSimulator, setUseSimulator] = useState(false);
  const [testAlertActive, setTestAlertActive] = useState(false);

  // Auto-scroll device log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.logs]);

  const handleToggleConnect = async () => {
    if (session.connectionStatus === 'CONNECTED') {
      await session.disconnect();
    } else {
      await session.connect(useSimulator);
    }
  };

  const handleSendHello = async () => {
    await session.sendHello();
  };

  const handleTestBuzz = async () => {
    setTestAlertActive(true);
    await session.sendLine('M,TEST');
    setTimeout(() => {
      setTestAlertActive(false);
    }, 1200);
  };

  const isConnected = session.connectionStatus === 'CONNECTED';

  return (
    <main className={styles.container}>
      {/* Top Header */}
      <header className={styles.topBar}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Device Status &amp; Diagnostics</h1>
          <p className={styles.pageSubtitle}>
            Hardware connection telemetry, real-time OLED mirror, and serial paper tape console.
          </p>
        </div>

        <div className={styles.topActions}>
          <Link href="/session" className={styles.btnAction}>
            &larr; Operator Setup
          </Link>
          <Link href="/demo" className={styles.btnAction}>
            Demo View &rarr;
          </Link>
        </div>
      </header>

      <div className={styles.deviceGrid}>
        {/* Card 1: Connection & Hardware Controls */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Hardware Connection</span>
            <div>
              <span
                className={`${styles.statusDot} ${
                  isConnected ? styles.dotConnected : styles.dotDisconnected
                }`}
              />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{session.connectionStatus}</span>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useSimulator}
              disabled={isConnected}
              onChange={(e) => setUseSimulator(e.target.checked)}
            />
            <span>Use software emulator (no physical ESP32 board needed)</span>
          </label>

          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Device Profile</span>
            <span className={styles.metricValue}>
              {session.isSimulator ? 'Software Emulator (FakeESP32)' : 'ESP32 Dev Module (USB-UART)'}
            </span>
          </div>

          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Baud Rate</span>
            <span className={styles.metricValue}>115200 baud &bull; 8N1</span>
          </div>

          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>DTR / RTS Auto-Reset</span>
            <span className={styles.metricValue}>Enabled (DTR=0, RTS=0)</span>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              className={`${styles.btnAction} ${!isConnected ? styles.btnPrimary : ''}`}
              onClick={handleToggleConnect}
            >
              {isConnected ? 'Disconnect' : 'Connect'}
            </button>

            <button
              className={styles.btnAction}
              onClick={handleSendHello}
              disabled={!isConnected}
            >
              Handshake (HELLO)
            </button>

            <button
              className={styles.btnAction}
              onClick={handleTestBuzz}
              disabled={!isConnected}
            >
              Test Motor Buzz
            </button>
          </div>
        </section>

        {/* Card 2: 128x64 OLED Display Mirror */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>SSD1306 Display Mirror (128x64)</span>
            <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)' }}>I2C 0x3C</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <OledMirror
              screen={isConnected ? 'MAIN' : 'LINK_LOST'}
              stressLevel={testAlertActive ? 2 : 0}
              confidence={0.82}
              patternFlags={testAlertActive ? 1 : 0}
              lux={340}
              linkOk={isConnected}
              calWindows={6}
              totalKeys={45}
              isAlert={testAlertActive}
            />
          </div>

          <p style={{ fontSize: '11px', color: 'var(--color-ink-muted)', textAlign: 'center', margin: 0 }}>
            Pixel-accurate one-bit rendering mirroring the physical SSD1306 OLED screen.
          </p>
        </section>
      </div>

      {/* Device Log Paper Tape Console */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            Device Log &mdash; Paper Tape ({session.logs.length} lines)
          </span>
          <button
            className={styles.btnAction}
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={session.clearLogs}
          >
            Clear tape
          </button>
        </div>

        <div className={styles.logContainer}>
          {session.logs.length === 0 ? (
            <div style={{ color: '#8b949e' }}>Tape empty. Connect device to stream ASCII telemetry.</div>
          ) : (
            session.logs.map((log) => {
              let cls = styles.logSys;
              if (log.type === 'rx') cls = styles.logRx;
              else if (log.type === 'tx') cls = styles.logTx;
              else if (log.type === 'warn') cls = styles.logWarn;

              return (
                <div key={log.id} className={styles.logEntry}>
                  <span className={styles.logTime}>[{log.time}]</span>
                  <span className={cls}>{log.text}</span>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </section>
    </main>
  );
}
