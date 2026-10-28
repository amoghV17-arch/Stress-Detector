'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { CanvasRhythmTape } from '@/components/CanvasRhythmTape';
import { OledMirror } from '@/components/OledMirror';
import { DEMO_SESSION } from '../../../../web/js/core/demo_session.js';
import { useSession } from '@/context/SessionContext';

export default function DemoPage() {
  const router = useRouter();
  const sessionCtx = useSession();

  // Mode: 'replay' or 'interactive'
  const [activeTab, setActiveTab] = useState('replay');

  // Replay State
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(8); // default to 8x for fast viva presentation
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);

  // Device Mirror State
  const [oledState, setOledState] = useState({
    screen: 'MAIN',
    stressLevel: 0,
    confidence: 0.75,
    patternFlags: 0,
    lux: 320,
    linkOk: true,
    calWindows: 0,
    totalKeys: 40,
    isAlert: false,
  });

  // Edge Shake on Alert
  const [isShaking, setIsShaking] = useState(false);

  // Buffers for Tape
  const [tapeEvents, setTapeEvents] = useState([]);
  const [tapeWindows, setTapeWindows] = useState([]);

  // Generate realistic synthetic typing events for the 150s demo session
  const demoEvents = useMemo(() => {
    const evs = [];
    let t = 500;
    let seq = 0;

    // First 45s: Calm baseline typing (steady 250ms IKI, 70ms dwell, low errors)
    while (t < 45000) {
      const dwell = 65 + Math.floor(Math.random() * 20);
      evs.push([seq++, t, 'L', dwell, 0]);
      t += 240 + Math.floor(Math.random() * 30);
    }

    // 45s - 90s: Accelerating, rising errors, hesitancy pauses
    while (t < 90000) {
      const dwell = 50 + Math.floor(Math.random() * 30);
      const isErr = Math.random() < 0.15;
      const cls = isErr ? 'B' : 'L';
      evs.push([seq++, t, cls, dwell, isErr ? 1 : 0]);

      // Occasional hesitation pause
      if (Math.random() < 0.05) {
        t += 2200; // >2s pause
      } else {
        t += 180 + Math.floor(Math.random() * 40);
      }
    }

    // 90s - 150s: Rushed, severe backspace bursts, erratic rhythm (High stress)
    while (t < 150000) {
      const isBurst = Math.random() < 0.25;
      if (isBurst) {
        // Backspace burst: 3+ backspaces in rapid succession
        for (let b = 0; b < 4; b++) {
          evs.push([seq++, t, 'B', 45, 1]);
          t += 110;
        }
      } else {
        const dwell = 45 + Math.floor(Math.random() * 40);
        evs.push([seq++, t, 'L', dwell, Math.random() < 0.1 ? 1 : 0]);
        t += 130 + Math.floor(Math.random() * 60);
      }
    }

    return evs;
  }, []);

  const totalDurationMs = (DEMO_SESSION.task?.elapsed_s || 150) * 1000;

  // Replay tick loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = 50;
    const stepTimeMs = intervalMs * replaySpeed;

    const interval = setInterval(() => {
      setPlaybackTimeMs((prevTime) => {
        const nextTime = prevTime + stepTimeMs;

        if (nextTime >= totalDurationMs) {
          setIsPlaying(false);
          return totalDurationMs;
        }

        // Update tape events up to nextTime
        const currentEvs = demoEvents.filter((e) => e[1] <= nextTime);
        setTapeEvents(currentEvs);

        // Update tape windows up to nextTime
        const currentWins = DEMO_SESSION.windows.filter((w) => w.t_end <= nextTime);
        setTapeWindows(currentWins);

        // Update OLED screen from current window
        if (currentWins.length > 0) {
          const latestWin = currentWins[currentWins.length - 1];
          const pred = latestWin.pred || {};
          const isAlertNow = Boolean(pred.alert);

          setOledState({
            screen: 'MAIN',
            stressLevel: pred.cls ?? 0,
            confidence: pred.p ? Math.max(...pred.p) : 0.7,
            patternFlags: pred.flags || 0,
            lux: 300 + Math.floor(Math.sin(nextTime / 10000) * 30),
            linkOk: true,
            calWindows: 6,
            totalKeys: latestWin.n_keys || 50,
            isAlert: isAlertNow,
          });

          // Trigger 2px Edge Shake on Alert moment
          if (isAlertNow && !isAlertRef.current) {
            triggerEdgeShake();
          }
          isAlertRef.current = isAlertNow;
        }

        return nextTime;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, replaySpeed, demoEvents, totalDurationMs]);

  const isAlertRef = useRef(false);

  // 2px edge shake trigger with automatic reset
  const triggerEdgeShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
    }, 450);
  }, []);

  // Controls
  const handleTogglePlay = () => {
    if (playbackTimeMs >= totalDurationMs) {
      setPlaybackTimeMs(0);
      setTapeEvents([]);
      setTapeWindows([]);
      isAlertRef.current = false;
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setPlaybackTimeMs(0);
    setTapeEvents([]);
    setTapeWindows([]);
    isAlertRef.current = false;
    setOledState({
      screen: 'MAIN',
      stressLevel: 0,
      confidence: 0.8,
      patternFlags: 0,
      lux: 320,
      linkOk: true,
      calWindows: 0,
      totalKeys: 0,
      isAlert: false,
    });
  };

  // Live Interactive Typing handlers
  const handleLiveKeyDown = (e) => {
    if (activeTab !== 'interactive') return;
    const now = Date.now();
    const isBack = e.key === 'Backspace';
    const newEvent = [tapeEvents.length, now, isBack ? 'B' : 'L', 75, isBack ? 1 : 0];
    setTapeEvents((prev) => [...prev.slice(-200), newEvent]);
    setPlaybackTimeMs(now);
  };

  const progressPercent = Math.min(100, (playbackTimeMs / totalDurationMs) * 100);

  return (
    <main className={`${styles.demoContainer} ${isShaking ? styles.edgeShake : ''}`}>
      {/* Top Header */}
      <header className={styles.topBar}>
        <div className={styles.titleArea}>
          <h1 className={styles.demoTitle}>Demo Mode &middot; Device Mirror &amp; Rhythm Tape</h1>
          <p className={styles.demoSubtitle}>
            Presentation view with 60 FPS continuous canvas tape, pixel-accurate 128x64 OLED mirror, and alert haptics.
          </p>
        </div>

        <div className={styles.topActions}>
          <Link href="/session" className={styles.btnAction}>
            &larr; Operator Setup
          </Link>
          <Link href="/report" className={`${styles.btnAction} ${styles.btnPrimary}`}>
            Report Viewer &rarr;
          </Link>
        </div>
      </header>

      {/* Alert Banner */}
      {oledState.isAlert && (
        <div className={styles.alertBanner}>
          <span>! VIBRATION ALERT TRIGGERED (Sustained High Stress Detected &mdash; Motor Pulsed)</span>
          <span>ERM 2px Edge Shake</span>
        </div>
      )}

      {/* Instrument Stage: Canvas Tape + OLED Mirror */}
      <div className={styles.instrumentGrid}>
        {/* Left: Continuous Canvas Rhythm Tape */}
        <div className={styles.tapeCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Live Rhythm Tape (Stylus &amp; Paper Feed)</span>
            <span className={styles.cardSubtitle}>
              {isPlaying ? `Playback: ${(playbackTimeMs / 1000).toFixed(1)}s / ${(totalDurationMs / 1000).toFixed(0)}s` : 'Idle'}
            </span>
          </div>

          <CanvasRhythmTape
            events={tapeEvents}
            windows={tapeWindows}
            currentTimeMs={playbackTimeMs}
            isPlaying={isPlaying}
            pxPerSec={50}
          />
        </div>

        {/* Right: Pixel-Accurate 128x64 OLED Mirror */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <OledMirror
            screen={oledState.screen}
            stressLevel={oledState.stressLevel}
            confidence={oledState.confidence}
            patternFlags={oledState.patternFlags}
            lux={oledState.lux}
            linkOk={oledState.linkOk}
            calWindows={oledState.calWindows}
            totalKeys={oledState.totalKeys}
            isAlert={oledState.isAlert}
          />
          <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
            Hardware Mirror (SSD1306)
          </span>
        </div>
      </div>

      {/* Control Card: Replay vs Live Typing */}
      <section className={styles.controlCard}>
        <div className={styles.modeToggleBar}>
          <button
            className={`${styles.btnMode} ${activeTab === 'replay' ? styles.btnModeActive : ''}`}
            onClick={() => {
              setActiveTab('replay');
              handleReset();
            }}
          >
            Play a recorded stressed session (Demo)
          </button>
          <button
            className={`${styles.btnMode} ${activeTab === 'interactive' ? styles.btnModeActive : ''}`}
            onClick={() => {
              setActiveTab('interactive');
              handleReset();
            }}
          >
            Live interactive typing
          </button>
        </div>

        {activeTab === 'replay' ? (
          /* Replay Control Panel */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className={styles.replayControls}>
              <button
                className={`${styles.btnAction} ${styles.btnPrimary}`}
                onClick={handleTogglePlay}
                style={{ minWidth: '100px' }}
              >
                {isPlaying ? 'Pause' : playbackTimeMs >= totalDurationMs ? 'Replay' : 'Play'}
              </button>

              <button className={styles.btnAction} onClick={handleReset}>
                Reset
              </button>

              <div className={styles.speedGroup}>
                <span>Speed:</span>
                <button
                  className={`${styles.btnSpeed} ${replaySpeed === 1 ? styles.btnSpeedActive : ''}`}
                  onClick={() => setReplaySpeed(1)}
                >
                  1x Normal
                </button>
                <button
                  className={`${styles.btnSpeed} ${replaySpeed === 8 ? styles.btnSpeedActive : ''}`}
                  onClick={() => setReplaySpeed(8)}
                >
                  8x Fast (Viva)
                </button>
              </div>

              <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {(playbackTimeMs / 1000).toFixed(1)}s / {(totalDurationMs / 1000).toFixed(0)}s
              </div>
            </div>

            {/* Progress Bar */}
            <div className={styles.progressBarContainer}>
              <div className={styles.progressBar} style={{ width: `${progressPercent}%` }} />
            </div>

            <p style={{ fontSize: '12px', color: 'var(--color-ink-muted)', margin: 0 }}>
              Simulates a 2.5-minute cognitive stress escalation (calm pace &rarr; rising typo errors &rarr; rapid backspace bursts &rarr; vibration alert with 2px edge shake).
            </p>
          </div>
        ) : (
          /* Live Interactive Typing Area */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
              className={styles.typingInput}
              placeholder="Click here and type anything freely. Each keystroke draws carbon ticks, hold width, and error marks on the canvas tape above in real time..."
              onKeyDown={handleLiveKeyDown}
            />
            <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)' }}>
              Privacy note: zero characters typed are ever stored or logged; only down/up timing is rendered.
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
