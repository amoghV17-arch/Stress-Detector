'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { useSession } from '@/context/SessionContext';
import { generateParticipantSchedule } from '@core/schedule.js';

export default function OperatorSetupPage() {
  const router = useRouter();
  const session = useSession();

  // Operator Configuration
  const [userId, setUserId] = useState('u01');
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [useSimulator, setUseSimulator] = useState(true);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(1); // 1, 2, 3, 5 min (default 1 min for fast testing)

  // Manual overrides (defaults populated from schedule)
  const [manualMode, setManualMode] = useState('');
  const [manualCondition, setManualCondition] = useState('');
  const [manualLighting, setManualLighting] = useState('');

  // Checklist states
  const [consentPrepared, setConsentPrepared] = useState(true);
  const [lightSensorAcknowledged, setLightSensorAcknowledged] = useState(true);
  const [logOpen, setLogOpen] = useState(true);

  const tapeEndRef = useRef(null);

  // Auto-generate Latin-square schedule for current participant
  const schedule = useMemo(() => {
    return generateParticipantSchedule(userId || 'u01');
  }, [userId]);

  const currentStep = schedule[selectedStepIndex] || schedule[0];

  const effectiveMode = manualMode || currentStep.mode;
  const effectiveCondition = manualCondition || currentStep.condition;
  const effectiveLighting = manualLighting || currentStep.lighting;
  const effectiveSessionId = currentStep.sessionId || 's01';

  // Autoscroll device log tape
  useEffect(() => {
    if (logOpen && tapeEndRef.current) {
      tapeEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session.logs, logOpen]);

  // Connect / Disconnect handlers
  const handleToggleConnect = async () => {
    if (session.connectionStatus === 'CONNECTED') {
      await session.disconnect();
    } else {
      await session.connect(useSimulator);
    }
  };

  const handleSendHello = async () => {
    if (session.connectionStatus === 'CONNECTED') {
      await session.sendLine('HELLO,1');
    }
  };

  // Checklist validation
  const isDeviceReady = session.connectionStatus === 'CONNECTED';
  const isChecklistComplete = isDeviceReady && consentPrepared && lightSensorAcknowledged;

  // Start typing navigation
  const handleStartTyping = () => {
    if (!isChecklistComplete) return;

    const query = new URLSearchParams({
      session_id: effectiveSessionId,
      user_id: userId,
      mode: effectiveMode,
      condition: effectiveCondition,
      lighting: effectiveLighting,
      duration: (selectedDurationMinutes * 60).toString(),
    });

    router.push(`/session/run?${query.toString()}`);
  };

  return (
    <main className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div className={styles.breadcrumb}>
            <Link href="/" className={styles.breadcrumbLink}>
              StressKB
            </Link>{' '}
            &rarr; <span>Operator Setup</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link
              href="/demo"
              className={styles.btnSecondary}
              style={{ textDecoration: 'none', fontSize: '12px', padding: '4px 10px' }}
            >
              Live Demo &rarr;
            </Link>
            <Link
              href="/report"
              className={styles.btnSecondary}
              style={{ textDecoration: 'none', fontSize: '12px', padding: '4px 10px' }}
            >
              Report Viewer &rarr;
            </Link>
          </div>
        </div>
        <h1 className={styles.title}>Set up a session</h1>
        <p className={styles.subtitle}>
          Configure participant parameters, verify hardware connection, and hand over the keyboard for data collection.
        </p>
      </header>

      <div className={styles.grid}>
        {/* Card 1: Device Connection */}
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            <span>Device</span>
            <div className={styles.statusIndicator}>
              <span
                className={`${styles.statusDot} ${
                  session.connectionStatus === 'CONNECTED'
                    ? styles.dotConnected
                    : session.connectionStatus === 'CONNECTING'
                    ? styles.dotConnecting
                    : styles.dotDisconnected
                }`}
              />
              <span>{session.connectionMessage}</span>
            </div>
          </div>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={useSimulator}
              disabled={session.connectionStatus === 'CONNECTED' || session.connectionStatus === 'CONNECTING'}
              onChange={(e) => setUseSimulator(e.target.checked)}
            />
            <span>Use software emulator (no physical board needed)</span>
          </label>

          {!session.isSerialSupported && !useSimulator && (
            <p style={{ color: 'var(--color-level-high)', fontSize: '12px', marginBottom: '12px' }}>
              Web Serial is not supported in this browser. Please use Chrome/Edge or toggle software emulator.
            </p>
          )}

          <div className={styles.buttonRow}>
            <button
              className={session.connectionStatus === 'CONNECTED' ? styles.btnSecondary : styles.btnPrimary}
              onClick={handleToggleConnect}
              disabled={session.connectionStatus === 'CONNECTING'}
            >
              {session.connectionStatus === 'CONNECTED' ? 'Disconnect' : 'Connect'}
            </button>

            <button
              className={styles.btnSecondary}
              onClick={handleSendHello}
              disabled={session.connectionStatus !== 'CONNECTED'}
            >
              Send HELLO,1
            </button>
          </div>
        </section>

        {/* Card 2: Participant & Schedule */}
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            <span>Participant &amp; Schedule</span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="participant-id">
              Participant ID (e.g. u01)
            </label>
            <input
              id="participant-id"
              type="text"
              className={styles.formInput}
              value={userId}
              maxLength={8}
              onChange={(e) => {
                setUserId(e.target.value.trim());
                setManualMode('');
                setManualCondition('');
                setManualLighting('');
              }}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="visit-step">
              Visit Step (Latin-Square Counterbalanced)
            </label>
            <select
              id="visit-step"
              className={styles.formSelect}
              value={selectedStepIndex}
              onChange={(e) => {
                setSelectedStepIndex(parseInt(e.target.value, 10));
                setManualMode('');
                setManualCondition('');
                setManualLighting('');
              }}
            >
              {schedule.map((st, idx) => (
                <option key={st.step} value={idx}>
                  Step {st.step}: {st.name} ({st.durationSeconds / 60} min)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>Mode</label>
              <select
                className={styles.formSelect}
                value={effectiveMode}
                onChange={(e) => setManualMode(e.target.value)}
              >
                <option value="CAL">CAL (Baseline)</option>
                <option value="RUN">RUN (Study)</option>
              </select>
            </div>

            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>Condition</label>
              <select
                className={styles.formSelect}
                value={effectiveCondition}
                onChange={(e) => setManualCondition(e.target.value)}
              >
                <option value="calm">Calm</option>
                <option value="pressure">Pressure</option>
              </select>
            </div>

            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>Lighting</label>
              <select
                className={styles.formSelect}
                value={effectiveLighting}
                onChange={(e) => setManualLighting(e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="dim">Dim</option>
              </select>
            </div>
          </div>

          {/* Duration Selector */}
          <div className={styles.formGroup} style={{ marginTop: '16px' }}>
            <label className={styles.formLabel}>Session Duration</label>
            <div className={styles.durationButtonGroup}>
              {[1, 2, 3, 5].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`${styles.durationBtn} ${selectedDurationMinutes === mins ? styles.durationBtnActive : ''}`}
                  onClick={() => setSelectedDurationMinutes(mins)}
                >
                  {mins} min{mins === 1 ? ' (Quick test)' : mins === 3 ? ' (Cal standard)' : mins === 5 ? ' (Full study)' : ''}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Interactive Guide: What options to pick */}
      <section className={styles.guideBox}>
        <div className={styles.guideTitle}>
          <span>ℹ️</span>
          <span>How to use Participant &amp; Schedule options</span>
        </div>
        <p className={styles.guideText}>
          The study protocol counterbalances 4 conditions across participants to eliminate order effects.
          Click a quick setup card below or configure manually above:
        </p>
        <div className={styles.guideGrid}>
          <div
            className={styles.guideCard}
            onClick={() => {
              setManualMode('RUN');
              setManualCondition('pressure');
              setSelectedDurationMinutes(1);
            }}
          >
            <div className={styles.guideCardTitle}>⚡ Quick Stress Test (1 min &bull; Pressure)</div>
            <div className={styles.guideCardDesc}>
              Fastest way to test! Sets 1-minute countdown timer with time pressure. Keystroke errors and hesitations will trigger stress detection.
            </div>
          </div>

          <div
            className={styles.guideCard}
            onClick={() => {
              setManualMode('CAL');
              setManualCondition('calm');
              setSelectedDurationMinutes(3);
            }}
          >
            <div className={styles.guideCardTitle}>🎯 Baseline Calibration (3 min &bull; CAL)</div>
            <div className={styles.guideCardDesc}>
              Recommended for research. Records relaxed baseline typing rhythm (&mu;, &sigma;) to calibrate subsequent z-score stress estimation.
            </div>
          </div>
        </div>
      </section>

      {/* Checklist & Primary Action Card */}
      <section className={styles.startCard}>
        <div>
          <div className={styles.startInfoTitle}>Before you start checklist</div>
          <ul className={styles.checklist}>
            <li className={styles.checkItem}>
              <span className={isDeviceReady ? styles.checkIconSuccess : styles.checkIconPending}>
                {isDeviceReady ? '✓' : '○'}
              </span>
              <span>Device connected ({session.connectionStatus})</span>
            </li>
            <li className={styles.checkItem}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={lightSensorAcknowledged}
                  onChange={(e) => setLightSensorAcknowledged(e.target.checked)}
                />
                <span>Light sensor detected or marked missing (bare-board mode)</span>
              </label>
            </li>
            <li className={styles.checkItem}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={consentPrepared}
                  onChange={(e) => setConsentPrepared(e.target.checked)}
                />
                <span>Zero-knowledge privacy consent step prepared</span>
              </label>
            </li>
          </ul>
          <div className={styles.startInfoDesc}>
            Target: <strong>{userId}</strong> &mdash; <strong>{currentStep.name}</strong> ({effectiveSessionId})
          </div>
        </div>

        <button
          className={styles.btnPrimary}
          style={{ padding: '12px 28px', fontSize: '15px' }}
          disabled={!isChecklistComplete}
          onClick={handleStartTyping}
        >
          Start typing &rarr;
        </button>
      </section>

      {/* Device Log Paper Tape Drawer */}
      <section className={styles.logDrawer}>
        <div className={styles.logHeader} onClick={() => setLogOpen(!logOpen)}>
          <span className={styles.logTitle}>
            <span>{logOpen ? '▼' : '►'}</span>
            <span>Device log (paper tape)</span>
            <span style={{ color: 'var(--color-ink-faint)', fontSize: '11px' }}>
              ({session.logs.length} lines)
            </span>
          </span>
          <button
            className={styles.btnSecondary}
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={(e) => {
              e.stopPropagation();
              session.clearLogs();
            }}
          >
            Clear tape
          </button>
        </div>

        {logOpen && (
          <div className={styles.tapeBody}>
            {session.logs.length === 0 ? (
              <div style={{ color: 'var(--color-ink-faint)' }}>Tape idle. Ready for serial events.</div>
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
            <div ref={tapeEndRef} />
          </div>
        )}
      </section>
    </main>
  );
}
