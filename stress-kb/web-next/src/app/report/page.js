'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { StripRoll } from '@/components/StripRoll';
import { parseAndAnalyzeSession, generateCSV } from '../../../../web/js/core/report.js';
import { generateVerdictSentence } from '../../../../web/js/core/verdict.js';
import { useSession } from '@/context/SessionContext';
import defaultSessionFixture from '../../../../web/tests/fixtures/normal_session.json';

export default function ReportPage() {
  const sessionCtx = useSession();
  const fileInputRef = useRef(null);

  // Default to sessionCtx.lastCompletedSession if available, else defaultSessionFixture
  const [sessionData, setSessionData] = useState(() => {
    return sessionCtx?.lastCompletedSession || defaultSessionFixture;
  });

  // Update session data if context changes
  useEffect(() => {
    if (sessionCtx?.lastCompletedSession) {
      setSessionData(sessionCtx.lastCompletedSession);
    }
  }, [sessionCtx?.lastCompletedSession]);

  // Pure analysis parsed from session data
  const report = useMemo(() => {
    try {
      return parseAndAnalyzeSession(sessionData);
    } catch (err) {
      console.error('Failed to parse session:', err);
      return null;
    }
  }, [sessionData]);

  // Verdict sentence
  const verdictSentence = useMemo(() => {
    try {
      return generateVerdictSentence(sessionData);
    } catch {
      return 'Session analysis complete.';
    }
  }, [sessionData]);

  // File loading handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        setSessionData(parsed);
      } catch (err) {
        alert('Failed to parse session JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Download JSON
  const handleDownloadJSON = () => {
    if (!sessionData) return;
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${sessionData.meta?.user_id || 'u01'}_${sessionData.meta?.session_id || 's01'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download CSV
  const handleDownloadCSV = () => {
    if (!sessionData) return;
    try {
      const csvStr = generateCSV(sessionData);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${sessionData.meta?.user_id || 'u01'}_${sessionData.meta?.session_id || 's01'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to generate CSV: ' + err.message);
    }
  };

  // Print PDF
  const handlePrint = () => {
    window.print();
  };

  if (!report || !sessionData) {
    return (
      <main className={styles.reportContainer}>
        <div className={styles.topBar}>
          <h1>Stress Report</h1>
        </div>
        <p>No valid session data available to render.</p>
        <button
          className={`${styles.btnAction} ${styles.btnPrimary}`}
          onClick={() => fileInputRef.current?.click()}
        >
          Load session JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </main>
    );
  }

  const { summary, overallStress, timeline, indicators, patterns, trends, context, reliability, alerts, selfReportComparison, disclaimer } = report;

  return (
    <main className={styles.reportContainer}>
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Top Header & Actions */}
      <header className={styles.topBar}>
        <div className={styles.reportMeta}>
          <div className={styles.reportTitle}>
            <span>Stress Report</span>
            <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--color-ink-muted)' }}>
              &mdash; Participant {summary.userId} ({summary.sessionId})
            </span>
          </div>
          <div className={styles.reportSub}>
            Condition: {summary.mode} ({summary.condition}) &bull; Lighting: {summary.lighting} &bull; Duration: {summary.durationSeconds}s
          </div>
        </div>

        <div className={`${styles.actionsGroup} ${styles.noPrint}`}>
          <Link href="/session" className={styles.btnAction}>
            &larr; Operator Setup
          </Link>
          <button className={styles.btnAction} onClick={() => fileInputRef.current?.click()}>
            Load JSON
          </button>
          <button className={styles.btnAction} onClick={handleDownloadJSON}>
            Download JSON
          </button>
          <button className={styles.btnAction} onClick={handleDownloadCSV}>
            Download CSV
          </button>
          <button className={`${styles.btnAction} ${styles.btnPrimary}`} onClick={handlePrint}>
            Print / PDF
          </button>
        </div>
      </header>

      {/* Synthetic Banner */}
      {summary.isSynthetic && (
        <div className={styles.bannerSynthetic}>
          SYNTHETIC &mdash; NOT REAL RESULTS
        </div>
      )}

      {/* Insufficient Data Warning Banner */}
      {summary.isInsufficientData && (
        <div className={styles.bannerWarning}>
          Insufficient data: valid window coverage was under 60% or fewer than 4 valid windows were completed. Overall stress classification, behavioural patterns, trends, and self-report comparison are omitted.
        </div>
      )}

      {/* Default Baseline Warning */}
      {!summary.hasPersonalBaseline && !summary.isInsufficientData && (
        <div className={styles.bannerWarning} style={{ backgroundColor: 'rgba(217, 154, 30, 0.1)', color: '#8C5F05', borderColor: 'var(--color-level-med)' }}>
          Notice: No personal calibration baseline stored. Normalized against global population metrics.
        </div>
      )}

      {/* 1. Verdict Sentence First */}
      <section className={styles.verdictSection} aria-label="Stress Verdict">
        <div className={styles.verdictSentence}>
          &ldquo;{verdictSentence}&rdquo;
        </div>
      </section>

      {/* 2. The Signature Strip-Chart Roll */}
      <section aria-label="Continuous Strip Chart">
        <StripRoll session={sessionData} />
      </section>

      {/* If Calibration Mode: show calibration baseline summary */}
      {summary.isCalibration ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Calibration Baseline Summary</span>
            <span className={styles.cardSubtitle}>Established from 6+ quiet baseline windows</span>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Feature Index</th>
                  <th>Biometric Indicator</th>
                  <th>Baseline Mean (&mu;)</th>
                  <th>Baseline Std Dev (&sigma;)</th>
                </tr>
              </thead>
              <tbody>
                {report.calibrationStats?.featureTable?.map((f) => (
                  <tr key={f.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>#{f.id}</td>
                    <td>{f.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{f.mu?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{f.sd?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* Standard 11 REPORT_SPEC Sections Grid */
        <div className={styles.sectionsGrid}>
          {/* Section 1: Session summary */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Session summary</span>
              <span className={styles.cardSubtitle}>Metadata & collection parameters</span>
            </div>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Participant ID</span>
                <span className={styles.metricValue}>{summary.userId}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Mode / Condition</span>
                <span className={styles.metricValue}>{summary.mode} ({summary.condition})</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Lighting condition</span>
                <span className={styles.metricValue}>{summary.lighting}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Session duration</span>
                <span className={styles.metricValue}>{summary.durationSeconds} s</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Total keystrokes</span>
                <span className={styles.metricValue}>{summary.totalKeystrokes}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Windows completed</span>
                <span className={styles.metricValue}>
                  {summary.validWindows} / {summary.totalWindows} valid ({summary.coveragePercent}%)
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Baseline used</span>
                <span className={styles.metricValue}>{summary.baselineSource}</span>
              </div>
            </div>
          </section>

          {/* Section 2: Overall stress (omitted if insufficient) */}
          {!summary.isInsufficientData && overallStress && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Overall stress</span>
                <span className={styles.cardSubtitle}>Model estimate from typing rhythm</span>
              </div>
              <div className={styles.metricList}>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Estimated Level</span>
                  <span>
                    <span
                      className={`${styles.levelBadge} ${
                        overallStress.level === 'High'
                          ? styles.levelHigh
                          : overallStress.level === 'Medium'
                          ? styles.levelMedium
                          : styles.levelLow
                      }`}
                    >
                      {overallStress.level} Stress
                    </span>
                  </span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Model confidence</span>
                  <span className={styles.metricValue}>
                    {Math.round(overallStress.meanConfidence * 100)}%
                  </span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Distribution of windows</span>
                  <span className={styles.metricValue}>
                    Low: {overallStress.distribution.lowPercent}% &bull; Med: {overallStress.distribution.mediumPercent}% &bull; High: {overallStress.distribution.highPercent}%
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Section 3: Timeline Summary */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Timeline</span>
              <span className={styles.cardSubtitle}>30-second window breakdown</span>
            </div>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Total time windows</span>
                <span className={styles.metricValue}>{timeline.length}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Alert moments</span>
                <span className={styles.metricValue}>
                  {timeline.filter((w) => w.alert).length} triggered
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Uncertain / shaded intervals</span>
                <span className={styles.metricValue}>
                  {timeline.filter((w) => w.isShaded).length} windows
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '4px' }}>
                Refer to the interactive strip roll above for calibrated Low/Med/High traces, pauses, and backspace bursts.
              </p>
            </div>
          </section>

          {/* Section 4: Indicator table (all 18 features, raw lux shown!) */}
          <section className={`${styles.card} ${styles.fullWidthCard}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>How your typing compared with your usual</span>
              <span className={styles.cardSubtitle}>18 biometric keystroke features &middot; Top 3 contributors highlighted</span>
            </div>
            <div className={styles.tableContainer}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Biometric Feature</th>
                    <th>Session Mean (Raw)</th>
                    <th>Baseline Comparison (z)</th>
                    <th>Plain Language Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map((ind) => {
                    // Raw display value format: show raw lux for features 17 and 18
                    let rawDisplay = ind.rawMean.toFixed(2);
                    if (ind.code === 'lux_mean' || ind.code === 'lux_std') {
                      rawDisplay = `${ind.rawMean.toFixed(1)} lux`;
                    } else if (ind.code === 'kpm') {
                      rawDisplay = `${Math.round(ind.rawMean)} kpm`;
                    } else if (ind.code.includes('latency') || ind.code.includes('dwell') || ind.code.includes('iki')) {
                      rawDisplay = `${Math.round(ind.rawMean)} ms`;
                    }

                    return (
                      <tr key={ind.id} className={ind.isTopContributor ? styles.rowTopContributor : ''}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{ind.id}</td>
                        <td>
                          <span>{ind.name}</span>
                          {ind.isTopContributor && <span className={styles.contributorTag}>Top |z|</span>}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{rawDisplay}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          <span style={{ fontWeight: 700, marginRight: '4px' }}>{ind.arrow}</span>
                          <span>{ind.zScore > 0 ? `+${ind.zScore.toFixed(2)}` : ind.zScore.toFixed(2)}</span>
                        </td>
                        <td style={{ color: ind.direction !== 'flat' ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}>
                          {ind.meaning}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 5: Behaviour patterns (omitted if insufficient) */}
          {!summary.isInsufficientData && patterns && (
            <section className={`${styles.card} ${styles.fullWidthCard}`}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Patterns we noticed</span>
                <span className={styles.cardSubtitle}>Behavioural pattern flags evaluated across 30-second windows</span>
              </div>
              <div className={styles.flagGrid}>
                {patterns.map((p) => (
                  <div
                    key={p.flag}
                    className={`${styles.flagCard} ${p.isActive ? styles.flagCardActive : ''}`}
                  >
                    <div className={styles.flagHeader}>
                      <span>{p.name}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: p.isActive ? 'var(--color-level-high)' : 'var(--color-ink-faint)',
                        }}
                      >
                        {p.activePercent}% ({p.activeCount} win)
                      </span>
                    </div>
                    <div className={styles.flagRule}>{p.rule}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Section 6: Trends over the session (omitted if insufficient) */}
          {!summary.isInsufficientData && trends && (
            <section className={`${styles.card} ${styles.fullWidthCard}`}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Trends over the session</span>
                <span className={styles.cardSubtitle}>First third vs last third of valid windows</span>
              </div>
              <div className={styles.trendGrid}>
                <div className={styles.trendCard}>
                  <div className={styles.trendTitle}>Typing Speed</div>
                  <div
                    className={`${styles.trendValue} ${
                      trends.speed.direction === 'increasing'
                        ? styles.trendInc
                        : trends.speed.direction === 'decreasing'
                        ? styles.trendDec
                        : styles.trendStable
                    }`}
                  >
                    {trends.speed.direction} ({Math.round(trends.speed.first)} &rarr; {Math.round(trends.speed.last)} kpm)
                  </div>
                </div>

                <div className={styles.trendCard}>
                  <div className={styles.trendTitle}>Typo Error Rate</div>
                  <div
                    className={`${styles.trendValue} ${
                      trends.errors.direction === 'increasing'
                        ? styles.trendInc
                        : trends.errors.direction === 'decreasing'
                        ? styles.trendDec
                        : styles.trendStable
                    }`}
                  >
                    {trends.errors.direction}
                  </div>
                </div>

                <div className={styles.trendCard}>
                  <div className={styles.trendTitle}>Long Pauses (&gt;2s)</div>
                  <div
                    className={`${styles.trendValue} ${
                      trends.pauses.direction === 'increasing'
                        ? styles.trendInc
                        : trends.pauses.direction === 'decreasing'
                        ? styles.trendDec
                        : styles.trendStable
                    }`}
                  >
                    {trends.pauses.direction}
                  </div>
                </div>

                <div className={styles.trendCard}>
                  <div className={styles.trendTitle}>Backspace Bursts</div>
                  <div
                    className={`${styles.trendValue} ${
                      trends.backspaces.direction === 'increasing'
                        ? styles.trendInc
                        : trends.backspaces.direction === 'decreasing'
                        ? styles.trendDec
                        : styles.trendStable
                    }`}
                  >
                    {trends.backspaces.direction}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Section 7: Ambient light */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Ambient light</span>
              <span className={styles.cardSubtitle}>Photometric environment context</span>
            </div>
            {context?.hasSensor ? (
              <div className={styles.metricList}>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Mean ambient illumination</span>
                  <span className={styles.metricValue}>{context.meanLux.toFixed(1)} lux</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Illumination variation (Std)</span>
                  <span className={styles.metricValue}>{context.luxStd.toFixed(1)} lux</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Lighting stability</span>
                  <span className={styles.metricValue}>
                    {context.unstableLight ? 'Fluctuating / Unstable' : 'Stable'}
                  </span>
                </div>
                {context.lowLight && (
                  <p style={{ color: '#8C5F05', fontSize: '12px' }}>
                    Notice: Low ambient light (&lt; 50 lux). Illumination may impact visual typing pace.
                  </p>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--color-ink-muted)', fontSize: '13px' }}>
                No light sensor in this session (hardware skipped gracefully).
              </p>
            )}
          </section>

          {/* Section 8: Session reliability */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Session reliability</span>
              <span className={styles.cardSubtitle}>Signal coverage & integrity checks</span>
            </div>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Valid window coverage</span>
                <span className={styles.metricValue}>{reliability.coveragePercent}%</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Uncertain windows</span>
                <span className={styles.metricValue}>{reliability.uncertainWindowsCount}</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Mean model confidence</span>
                <span className={styles.metricValue}>
                  {Math.round(reliability.meanConfidence * 100)}%
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Baseline calibration</span>
                <span className={styles.metricValue}>
                  {reliability.hasPersonalBaseline ? 'Personal calibration' : 'Default population baseline'}
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Hardware warnings</span>
                <span className={styles.metricValue}>
                  {reliability.warnings?.length > 0
                    ? reliability.warnings.map((w) => w.code).join(', ')
                    : 'None recorded'}
                </span>
              </div>
            </div>
          </section>

          {/* Section 9: Vibration alerts */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Vibration alerts</span>
              <span className={styles.cardSubtitle}>Haptic alerts triggered on sustained High stress</span>
            </div>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Total alerts triggered</span>
                <span className={styles.metricValue}>{alerts.count}</span>
              </div>
              {alerts.moments?.length > 0 ? (
                <div style={{ marginTop: '8px' }}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Window</th>
                        <th>Active Pattern Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.moments.map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{a.tEndMinutes} min</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>#{a.winId}</td>
                          <td>{a.activeFlags.length > 0 ? a.activeFlags.join(', ') : 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--color-ink-muted)', fontSize: '13px' }}>
                  No vibration alerts triggered during this session.
                </p>
              )}
            </div>
          </section>

          {/* Section 10: You said vs the model said (omitted if insufficient or missing) */}
          {!summary.isInsufficientData && selfReportComparison && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>You said vs the model said</span>
                <span className={styles.cardSubtitle}>Post-session self-report comparison</span>
              </div>
              <div className={styles.metricList}>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>You reported</span>
                  <span className={styles.metricValue}>
                    {selfReportComparison.reportedLevel} (rating {selfReportComparison.reportedRating}/5)
                  </span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Model estimated</span>
                  <span className={styles.metricValue}>{selfReportComparison.modelLevel} Stress</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Comparison result</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: selfReportComparison.agrees ? 'var(--color-level-low)' : '#8C5F05',
                    }}
                  >
                    {selfReportComparison.agrees ? 'Agreement' : 'Disagreement'}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-ink)', marginTop: '4px' }}>
                  {selfReportComparison.summary}
                </p>
              </div>
            </section>
          )}

          {/* Section 11: What this can't tell you */}
          <section className={`${styles.card} ${styles.fullWidthCard}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>What this can&apos;t tell you</span>
              <span className={styles.cardSubtitle}>Methodological scope & limitations</span>
            </div>
            <div className={styles.disclaimerBox}>
              <p>{disclaimer.text}</p>
              {disclaimer.suggestions?.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <strong style={{ color: 'var(--color-ink)' }}>Recommended breaks:</strong>
                  <ul className={styles.suggestionList}>
                    {disclaimer.suggestions.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
