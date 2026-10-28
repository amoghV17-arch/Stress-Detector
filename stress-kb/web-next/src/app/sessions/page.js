'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { getAllArchivedSessions, deleteArchivedSession, clearArchivedSessions, saveSessionToArchive } from '@/lib/sessionArchive';
import { useSession } from '@/context/SessionContext';
import { StripRoll } from '@/components/StripRoll';
import normalSessionFixture from '../../../../web/tests/fixtures/normal_session.json';
import syntheticSessionFixture from '../../../../web/tests/fixtures/synthetic_session.json';

export default function SessionsArchivePage() {
  const router = useRouter();
  const sessionCtx = useSession();

  const [archivedSessions, setArchivedSessions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadSessions = async () => {
    setIsLoading(true);
    const list = await getAllArchivedSessions();
    setArchivedSessions(list);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Seed sample fixtures if archive is empty
  const handleSeedSamples = async () => {
    await saveSessionToArchive(normalSessionFixture);
    await saveSessionToArchive(syntheticSessionFixture);
    await loadSessions();
  };

  // Delete single session
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this session from archive?')) {
      await deleteArchivedSession(id);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      await loadSessions();
    }
  };

  // Clear all sessions
  const handleClearAll = async () => {
    if (confirm('Are you sure you want to delete all archived sessions?')) {
      await clearArchivedSessions();
      setSelectedIds([]);
      await loadSessions();
    }
  };

  // Open session in report
  const handleOpenReport = (sessionRecord) => {
    if (sessionCtx?.setLastCompletedSession) {
      sessionCtx.setLastCompletedSession(sessionRecord.session);
    }
    router.push('/report');
  };

  // Download JSON
  const handleDownload = (sessionRecord, e) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify(sessionRecord.session, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${sessionRecord.userId}_${sessionRecord.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Toggle selection for overlay comparison
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const selectedRecords = archivedSessions.filter((s) => selectedIds.includes(s.id));

  return (
    <main className={styles.container}>
      {/* Top Header */}
      <header className={styles.topBar}>
        <div className={styles.titleArea}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', marginBottom: '4px' }}>
            <Link href="/" style={{ color: 'var(--color-ink)', textDecoration: 'none', fontWeight: 600 }}>
              StressKB
            </Link>{' '}
            &rarr; <span style={{ color: 'var(--color-ink-muted)' }}>Sessions Archive</span>
          </div>
          <h1 className={styles.pageTitle}>Sessions Archive</h1>
          <p className={styles.pageSubtitle}>
            Local IndexedDB repository of completed typing sessions with mini stress traces.
          </p>
        </div>

        <div className={styles.topActions}>
          <Link href="/session" className={styles.btnAction}>
            &larr; Operator Setup
          </Link>
          {archivedSessions.length > 0 && (
            <button className={`${styles.btnAction} ${styles.btnDanger}`} onClick={handleClearAll}>
              Clear archive
            </button>
          )}
          {archivedSessions.length === 0 && (
            <button className={styles.btnAction} onClick={handleSeedSamples}>
              Load sample sessions
            </button>
          )}
        </div>
      </header>

      {/* Sessions Table Card */}
      <section className={styles.archiveCard}>
        {isLoading ? (
          <div className={styles.emptyState}>Loading sessions...</div>
        ) : archivedSessions.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No archived sessions stored in IndexedDB.</p>
            <button className={styles.btnAction} onClick={handleSeedSamples}>
              Load sample sessions to explore
            </button>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.sessionsTable}>
              <thead>
                <tr>
                  <th scope="col" style={{ width: '40px' }}>Select</th>
                  <th scope="col">Participant</th>
                  <th scope="col">Session</th>
                  <th scope="col">Condition</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Mini Stress Trace</th>
                  <th scope="col">Valid Windows</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedSessions.map((s) => {
                  const wins = s.session?.windows || [];
                  const isChecked = selectedIds.includes(s.id);

                  return (
                    <tr
                      key={s.id}
                      style={{
                        backgroundColor: isChecked ? 'rgba(185, 199, 193, 0.25)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleOpenReport(s)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(s.id)}
                          title="Select to compare/overlay (max 2)"
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.userId}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{s.id}</td>
                      <td>
                        <span style={{ textTransform: 'capitalize' }}>
                          {s.mode} ({s.condition})
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{s.durationSeconds} s</td>

                      {/* Mini Stress Trace SVG (120x24px) */}
                      <td>
                        <svg
                          className={styles.miniTraceSvg}
                          width={120}
                          height={24}
                          role="img"
                          aria-label="Mini stress trace"
                        >
                          {wins.map((w, idx) => {
                            const barW = Math.max(2, 120 / Math.max(1, wins.length));
                            const x = idx * barW;
                            const cls = w.pred ? w.pred.cls : 0;
                            const barH = cls === 2 ? 22 : cls === 1 ? 14 : 7;
                            const color =
                              cls === 2
                                ? 'var(--color-level-high)'
                                : cls === 1
                                ? 'var(--color-level-med)'
                                : 'var(--color-level-low)';

                            return (
                              <rect
                                key={idx}
                                x={x}
                                y={24 - barH}
                                width={barW - 1}
                                height={barH}
                                fill={color}
                              />
                            );
                          })}
                        </svg>
                      </td>

                      <td>{s.validWindows} / {wins.length}</td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            className={styles.btnAction}
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReport(s);
                            }}
                          >
                            Open report &rarr;
                          </button>
                          <button
                            className={styles.btnAction}
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={(e) => handleDownload(s, e)}
                          >
                            JSON
                          </button>
                          <button
                            className={`${styles.btnAction} ${styles.btnDanger}`}
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={(e) => handleDelete(s.id, e)}
                          >
                            &times;
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stretch Feature: Overlay Two Sessions on One Roll */}
      {selectedRecords.length === 2 && (
        <section className={styles.overlaySection}>
          <div className={styles.overlayHeader}>
            <div className={styles.overlayTitle}>
              Overlay Comparison: {selectedRecords[0].id} vs {selectedRecords[1].id}
            </div>
            <button
              className={styles.btnAction}
              onClick={() => setShowOverlay(!showOverlay)}
            >
              {showOverlay ? 'Hide overlay roll' : 'Show overlay roll'}
            </button>
          </div>

          {showOverlay && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>
                  Session A: {selectedRecords[0].userId} ({selectedRecords[0].condition})
                </h4>
                <StripRoll session={selectedRecords[0].session} />
              </div>

              <div>
                <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>
                  Session B: {selectedRecords[1].userId} ({selectedRecords[1].condition})
                </h4>
                <StripRoll session={selectedRecords[1].session} />
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

