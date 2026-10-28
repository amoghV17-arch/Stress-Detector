'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { useSession } from '@/context/SessionContext';
import { PARAGRAPHS, getRandomParagraph } from '@core/paragraphs.js';

function TypingSessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();

  // URL / Session configuration
  const sessionId = searchParams.get('session_id') || 's01';
  const userId = searchParams.get('user_id') || 'u01';
  const mode = searchParams.get('mode') || 'RUN'; // CAL | RUN
  const condition = searchParams.get('condition') || 'calm'; // calm | pressure
  const lighting = searchParams.get('lighting') || 'normal';

  // State
  const [hasConsented, setHasConsented] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [targetText, setTargetText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [score, setScore] = useState(0);

  // Modals
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showSelfReportModal, setShowSelfReportModal] = useState(false);
  const [selfReport, setSelfReport] = useState({ stress: 3, rushed: 3, tired: 3 });

  const containerRef = useRef(null);
  const sessionRecorderRef = useRef(null);

  // Initialize target text
  useEffect(() => {
    const chosen = getRandomParagraph();
    setTargetText(chosen.text);
  }, []);

  // Format mm:ss
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Start session once consented
  const handleStartSession = useCallback(() => {
    setHasConsented(true);

    const recorder = session.startSession({
      targetText,
      sessionId,
      userId,
      mode,
      condition,
      lighting,
      onProgress: (p) => {
        setCursor(p.cursor);
        setRemainingSeconds(p.remainingSeconds);
        setDurationSeconds(p.durationSeconds);
        setScore(p.score);

        if (p.isComplete || p.remainingSeconds <= 0) {
          setShowSelfReportModal(true);
        }
      },
    });

    sessionRecorderRef.current = recorder;

    // Focus typing container
    setTimeout(() => {
      containerRef.current?.focus();
    }, 50);
  }, [session, targetText, sessionId, userId, mode, condition, lighting]);

  // Keyboard Event Handlers (Privacy: Zero characters stored)
  useEffect(() => {
    if (!hasConsented || showQuitModal || showSelfReportModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowQuitModal(true);
        return;
      }

      // Ignore modifier combinations (Ctrl+C, etc)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      e.preventDefault();
      session.handleKeyDown({
        key: e.key,
        code: e.code,
        repeat: e.repeat,
        time: performance.now(),
      });
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Escape') return;
      e.preventDefault();
      session.handleKeyUp({
        key: e.key,
        code: e.code,
        time: performance.now(),
      });
    };

    const handleBlur = () => {
      session.handleFocusChange(false);
    };

    const handleFocus = () => {
      session.handleFocusChange(true);
    };

    const handleVisibility = () => {
      session.handleFocusChange(document.visibilityState === 'visible');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [hasConsented, showQuitModal, showSelfReportModal, session]);

  // Finish session with self-report
  const handleSaveSelfReport = () => {
    session.stopSession({ selfreport: selfReport });
    setShowSelfReportModal(false);
    router.push('/session');
  };

  // Quit without saving
  const handleConfirmQuit = () => {
    session.stopSession();
    setShowQuitModal(false);
    router.push('/session');
  };

  // Render text characters
  const renderParagraph = () => {
    const chars = [];
    for (let i = 0; i < targetText.length; i++) {
      const char = targetText[i];
      let cls = styles.charPending;
      if (i < cursor) {
        cls = styles.charCorrect;
      } else if (i === cursor) {
        cls = styles.charCurrent;
      }
      chars.push(
        <span key={i} className={cls}>
          {char}
        </span>
      );
    }
    return chars;
  };

  // Consent Screen
  if (!hasConsented) {
    return (
      <main className={styles.pageContainer}>
        <div className={styles.centerContent}>
          <div className={styles.consentCard}>
            <h2>Study Session Consent</h2>
            <p>
              This is a zero-knowledge typing study session. Our system measures typing rhythm and
              keystroke timing features (such as key dwell time and inter-key latency) to study cognitive
              workload.
            </p>
            <p>
              <strong>Privacy Guarantee:</strong> No typed characters or text are ever recorded, stored,
              or transmitted.
            </p>

            <label className={styles.consentCheckbox}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span>I consent to participate in this typing rhythm session.</span>
            </label>

            <button
              className={styles.buttonPrimary}
              disabled={!consentChecked}
              onClick={handleStartSession}
            >
              Start typing
            </button>
          </div>
        </div>
      </main>
    );
  }

  const timerPercent = durationSeconds > 0 ? (remainingSeconds / durationSeconds) * 100 : 100;

  return (
    <main
      className={styles.pageContainer}
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Typing test area"
    >
      {/* Top Header Bar */}
      <header className={styles.topBar}>
        <button
          className={styles.quitButton}
          onClick={() => setShowQuitModal(true)}
          title="Press Esc to quit"
        >
          [Esc] Quit
        </button>

        <div className={styles.statusGroup}>
          {condition === 'pressure' ? (
            <>
              <span className={styles.scoreBadge}>Score: {score} pts</span>
              <span className={styles.timerBadge}>{formatTime(remainingSeconds)}</span>
            </>
          ) : (
            <span className={styles.timerBadge}>Untimed</span>
          )}
        </div>
      </header>

      {/* Depleting timer line (pressure mode only) */}
      {condition === 'pressure' && (
        <div className={styles.timerTrack}>
          <div className={styles.timerProgress} style={{ width: `${timerPercent}%` }} />
        </div>
      )}

      {/* Center Typing Area */}
      <div className={styles.centerContent}>
        <div className={styles.typingCard}>
          <p className={styles.paragraphText}>{renderParagraph()}</p>
        </div>
      </div>

      {/* Footer Info */}
      <footer className={styles.footerBar}>
        <span className={styles.progressInfo}>
          {cursor} / {targetText.length} characters
        </span>
        <span>Study Mode active &mdash; quiet environment</span>
      </footer>

      {/* Quit Confirmation Modal */}
      {showQuitModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalBox}>
            <h2 className={styles.modalTitle}>Quit Session?</h2>
            <p className={styles.modalDescription}>
              Are you sure you want to quit? Your progress for this session will not be saved.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.buttonSecondary}
                onClick={() => setShowQuitModal(false)}
                autoFocus
              >
                Return to typing
              </button>
              <button className={styles.buttonPrimary} onClick={handleConfirmQuit}>
                Discard and quit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Session Self-Report Modal */}
      {showSelfReportModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalBox}>
            <h2 className={styles.modalTitle}>Session Complete</h2>
            <p className={styles.modalDescription}>
              Please rate your experience during this run before viewing the report.
            </p>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span>Mental Stress</span>
                <span className={styles.sliderValue}>{selfReport.stress} / 5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                className={styles.sliderInput}
                value={selfReport.stress}
                onChange={(e) =>
                  setSelfReport({ ...selfReport, stress: parseInt(e.target.value, 10) })
                }
              />
              <div className={styles.sliderLabels}>
                <span>1 (Calm)</span>
                <span>5 (High stress)</span>
              </div>
            </div>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span>Time Pressure</span>
                <span className={styles.sliderValue}>{selfReport.rushed} / 5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                className={styles.sliderInput}
                value={selfReport.rushed}
                onChange={(e) =>
                  setSelfReport({ ...selfReport, rushed: parseInt(e.target.value, 10) })
                }
              />
              <div className={styles.sliderLabels}>
                <span>1 (Paced)</span>
                <span>5 (Rushed)</span>
              </div>
            </div>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span>Mental Fatigue</span>
                <span className={styles.sliderValue}>{selfReport.tired} / 5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                className={styles.sliderInput}
                value={selfReport.tired}
                onChange={(e) =>
                  setSelfReport({ ...selfReport, tired: parseInt(e.target.value, 10) })
                }
              />
              <div className={styles.sliderLabels}>
                <span>1 (Alert)</span>
                <span>5 (Exhausted)</span>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.buttonPrimary} onClick={handleSaveSelfReport}>
                Save and continue
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TypingSessionPage() {
  return (
    <Suspense fallback={<div className={styles.pageContainer}>Loading session...</div>}>
      <TypingSessionContent />
    </Suspense>
  );
}
