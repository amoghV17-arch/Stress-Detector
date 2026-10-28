'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { scaleLinear } from 'd3-scale';
import { line, curveMonotoneX } from 'd3-shape';
import styles from './StripRoll.module.css';
import { deriveTimeSeriesChannels } from '../../../web/js/core/series.js';

export function StripRoll({ session }) {
  const [showTable, setShowTable] = useState(false);
  const [hoverX, setHoverX] = useState(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const containerRef = useRef(null);

  // Derive channels from session JSON
  const data = useMemo(() => {
    return deriveTimeSeriesChannels(session);
  }, [session]);

  const selfReportInfo = useMemo(() => {
    if (!session?.selfreport || typeof session.selfreport.stress !== 'number') return null;
    const rating = session.selfreport.stress;
    const reportedLevel = rating >= 4 ? 'High' : (rating === 3 ? 'Medium' : 'Low');
    const reportedH = rating >= 4 ? 62 : (rating === 3 ? 42 : 20);

    const validStress = data.stress.filter(w => w.valid === 1);
    const avgCls = validStress.length > 0
      ? (validStress.reduce((acc, w) => acc + w.cls, 0) / validStress.length)
      : 0;
    const modelLevel = avgCls >= 1.5 ? 'High' : (avgCls >= 0.5 ? 'Medium' : 'Low');
    const modelH = avgCls >= 1.5 ? 62 : (avgCls >= 0.5 ? 42 : 20);

    const agrees = reportedLevel === modelLevel;
    const sentence = agrees
      ? `Self-report matches model (${modelLevel}).`
      : `Self-report gap: you reported ${reportedLevel} while model estimated ${modelLevel}.`;

    return {
      rating,
      reportedLevel,
      reportedH,
      modelLevel,
      modelH,
      hasGap: !agrees,
      sentence
    };
  }, [session, data.stress]);

  const totalDuration = data.durationSeconds;
  // Pixels per second for paper tape roll (e.g. 5px per sec -> 300s = 1500px)
  const pxPerSec = 5;
  const rollWidth = Math.max(900, totalDuration * pxPerSec);

  // Channel heights
  const hTime = 24;
  const hStress = 70;
  const hSpeed = 60;
  const hErrors = 45;
  const hPauses = 35;
  const hLight = data.hasLight ? 45 : 0;
  const hNotes = 30;

  const totalSvgHeight = hTime + hStress + hSpeed + hErrors + hPauses + hLight + hNotes;

  // D3 Scales
  const xScale = useMemo(() => {
    return scaleLinear().domain([0, totalDuration]).range([0, rollWidth]);
  }, [totalDuration, rollWidth]);

  // Speed scale (0 to max cpm, clamp to at least 200)
  const maxSpeed = useMemo(() => {
    const vals = data.speed.map((s) => s.cpm);
    return Math.max(250, ...(vals.length ? vals : [250]));
  }, [data.speed]);

  const speedYScale = useMemo(() => {
    return scaleLinear()
      .domain([0, maxSpeed])
      .range([hTime + hStress + hSpeed - 6, hTime + hStress + 6]);
  }, [maxSpeed, hTime, hStress, hSpeed]);

  // Light scale
  const maxLux = useMemo(() => {
    const vals = data.light.map((l) => l.lux);
    return Math.max(500, ...(vals.length ? vals : [500]));
  }, [data.light]);

  const lightYScale = useMemo(() => {
    const yTop = hTime + hStress + hSpeed + hErrors + hPauses;
    return scaleLinear()
      .domain([0, maxLux])
      .range([yTop + hLight - 6, yTop + 6]);
  }, [maxLux, hTime, hStress, hSpeed, hErrors, hPauses, hLight]);

  // Speed Line generator
  const speedPath = useMemo(() => {
    if (!data.speed.length) return '';
    const gen = line()
      .x((d) => xScale(d.tS))
      .y((d) => speedYScale(d.cpm))
      .curve(curveMonotoneX);
    return gen(data.speed) || '';
  }, [data.speed, xScale, speedYScale]);

  // Light Line generator
  const lightPath = useMemo(() => {
    if (!data.light.length) return '';
    const gen = line()
      .x((d) => xScale(d.tS))
      .y((d) => lightYScale(d.lux))
      .curve(curveMonotoneX);
    return gen(data.light) || '';
  }, [data.light, xScale, lightYScale]);

  // Mouse Drag / Keyboard Scroll Handling
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX - (containerRef.current?.offsetLeft || 0);
    startScrollLeft.current = containerRef.current?.scrollLeft || 0;
  };

  const handleMouseMove = (e) => {
    if (isDragging.current && containerRef.current) {
      e.preventDefault();
      const x = e.pageX - (containerRef.current.offsetLeft || 0);
      const walk = (x - startX.current) * 1.5;
      containerRef.current.scrollLeft = startScrollLeft.current - walk;
    }

    // Crosshair tracking
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left + containerRef.current.scrollLeft - 110; // offset sticky label
      if (relativeX >= 0 && relativeX <= rollWidth) {
        setHoverX(relativeX);
      } else {
        setHoverX(null);
      }
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleKeyDown = (e) => {
    if (!containerRef.current) return;
    if (e.key === 'ArrowRight') {
      containerRef.current.scrollLeft += 80;
    } else if (e.key === 'ArrowLeft') {
      containerRef.current.scrollLeft -= 80;
    }
  };

  // Compute Crosshair Hover Values
  const hoverData = useMemo(() => {
    if (hoverX === null) return null;
    const tSec = Math.max(0, Math.min(totalDuration, xScale.invert(hoverX)));
    const m = Math.floor(tSec / 60);
    const s = Math.floor(tSec % 60);
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

    // Window at this time
    const activeWin = data.stress.find((w) => tSec >= w.tStartS && tSec <= w.tEndS);
    let stressLabel = 'Low';
    let stressProb = '70%';
    if (activeWin) {
      if (activeWin.cls === 1) stressLabel = 'Medium';
      else if (activeWin.cls === 2) stressLabel = 'High';
      const maxP = Math.max(...activeWin.p);
      stressProb = `${Math.round(maxP * 100)}%`;
    }

    // Speed at this time
    const closestSpeed = data.speed.reduce((prev, curr) =>
      Math.abs(curr.tS - tSec) < Math.abs(prev.tS - tSec) ? curr : prev,
      data.speed[0] || { cpm: 0 }
    );

    return {
      timeStr,
      stressLabel,
      stressProb,
      cpm: closestSpeed?.cpm || 0,
    };
  }, [hoverX, totalDuration, xScale, data.stress, data.speed]);

  // Synthetic & Baseline Notices
  const isSynthetic = session?.synthetic === true;
  const isInsufficient = (session?.windows?.filter((w) => w.valid === 1).length || 0) < 3;
  const isDefaultBaseline = session?.baseline?.present === 0;

  return (
    <div className={styles.rollWrapper}>
      {/* Notice Banners */}
      {isSynthetic && (
        <div className={styles.bannerSynthetic}>
          SYNTHETIC SESSION &mdash; Modeled laboratory data for testing and validation.
        </div>
      )}
      {isInsufficient && (
        <div className={styles.bannerWarning}>
          Notice: Fewer than three valid typing windows were recorded. Metrics represent preliminary coverage.
        </div>
      )}
      {isDefaultBaseline && !isInsufficient && (
        <div className={styles.bannerWarning} style={{ backgroundColor: 'rgba(217, 154, 30, 0.1)', color: '#8C5F05' }}>
          Notice: No personal calibration baseline stored. Normalized against global population metrics.
        </div>
      )}

      {/* Header controls */}
      <div className={styles.rollHeader}>
        <div className={styles.rollHeaderTitle}>
          <span>Strip-chart recorder roll</span>
          <span style={{ fontSize: '11px', color: 'var(--color-ink-faint)', fontWeight: 400 }}>
            (&larr; Drag or arrow keys to scroll &rarr;)
          </span>
        </div>
        <div className={styles.rollControls}>
          <button
            className={styles.btnToggle}
            onClick={() => setShowTable(!showTable)}
            aria-label="Toggle accessible table view"
          >
            {showTable ? 'Show roll graph' : 'Show as table'}
          </button>
        </div>
      </div>

      {/* Visible Alert & Channel Legend Key */}
      <div className={styles.legendRow}>
        <div className={styles.legendItem}>
          <span className={styles.swatchLow} />
          <span>Low</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.swatchMed} />
          <span>Medium</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.swatchHigh} />
          <span>High</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.swatchAlert}>!</span>
          <span>Vibration Alert</span>
        </div>
        <div className={styles.legendItem}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-ink)' }}>F</span>
          <span>Pattern Flag</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.swatchPause} />
          <span>Pause (&gt;2s)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.swatchError} />
          <span>Error / Backspace</span>
        </div>
        {selfReportInfo && (
          <div className={styles.selfReportGapBadge}>
            {selfReportInfo.sentence}
          </div>
        )}
      </div>

      {showTable ? (
        /* Accessible Semantic Table View */
        <div className={styles.tableContainer}>
          <table className={styles.accessibleTable}>
            <thead>
              <tr>
                <th scope="col">Time Window</th>
                <th scope="col">Stress Classification</th>
                <th scope="col">Confidence</th>
                <th scope="col">Active Pattern Flags</th>
                <th scope="col">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {data.stress.map((w) => (
                <tr key={w.win_id}>
                  <td>
                    {Math.floor(w.tStartS / 60)}:{(w.tStartS % 60).toString().padStart(2, '0')} &ndash;{' '}
                    {Math.floor(w.tEndS / 60)}:{(w.tEndS % 60).toString().padStart(2, '0')}
                  </td>
                  <td>{w.cls === 0 ? 'Low' : w.cls === 1 ? 'Medium' : 'High'}</td>
                  <td>{Math.round(Math.max(...w.p) * 100)}%</td>
                  <td>{w.flags > 0 ? `Flag code: ${w.flags}` : 'None'}</td>
                  <td>{w.alert === 1 ? 'Alert Triggered' : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Graphic Strip Roll Viewport */
        <div
          className={styles.scrollContainer}
          ref={containerRef}
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onKeyDown={handleKeyDown}
        >
          {/* Left Sticky Channel Column */}
          <div className={styles.channelLabelsColumn}>
            <div className={styles.channelLabelCell} style={{ height: hTime }}>
              <span>Time</span>
            </div>
            <div className={styles.channelLabelCell} style={{ height: hStress }}>
              <span>Stress</span>
              <div className={styles.axisLevels}>
                <span className={styles.axisLevelHigh}>High</span>
                <span className={styles.axisLevelMed}>Med</span>
                <span className={styles.axisLevelLow}>Low</span>
              </div>
            </div>
            <div className={styles.channelLabelCell} style={{ height: hSpeed }}>
              <span>Speed</span>
              <span className={styles.channelUnit}>cpm</span>
            </div>
            <div className={styles.channelLabelCell} style={{ height: hErrors }}>
              <span>Errors</span>
              <span className={styles.channelUnit}>ticks / bursts</span>
            </div>
            <div className={styles.channelLabelCell} style={{ height: hPauses }}>
              <span>Pauses</span>
              <span className={styles.channelUnit}>&gt;2s bars</span>
            </div>
            {data.hasLight && (
              <div className={styles.channelLabelCell} style={{ height: hLight }}>
                <span>Light</span>
                <span className={styles.channelUnit}>lux</span>
              </div>
            )}
            <div className={styles.channelLabelCell} style={{ height: hNotes }}>
              <span>Notes</span>
              <span className={styles.channelUnit}>flags / alerts</span>
            </div>
          </div>

          {/* Floating Crosshair Readout */}
          {hoverData && (
            <div className={styles.readoutCard}>
              <div className={styles.readoutItem}>
                <span className={styles.readoutLabel}>Time:</span>
                <span>{hoverData.timeStr}</span>
              </div>
              <div className={styles.readoutItem}>
                <span className={styles.readoutLabel}>Stress:</span>
                <span>
                  {hoverData.stressLabel} ({hoverData.stressProb})
                </span>
              </div>
              <div className={styles.readoutItem}>
                <span className={styles.readoutLabel}>Speed:</span>
                <span>{hoverData.cpm} cpm</span>
              </div>
            </div>
          )}

          {/* SVG Strip Chart Track */}
          <svg
            className={styles.svgCanvas}
            width={rollWidth}
            height={totalSvgHeight}
            role="img"
            aria-label="Continuous strip-chart time series"
          >
            <defs>
              {/* Medium Stress Dotted Hatch */}
              <pattern id="hatch-med" width="6" height="6" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="1" fill="var(--color-level-med)" opacity="0.6" />
              </pattern>
              {/* High Stress Diagonal Crosshatch */}
              <pattern
                id="hatch-high"
                width="8"
                height="8"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-level-high)" strokeWidth="1.5" opacity="0.4" />
                <line x1="0" y1="0" x2="8" y2="0" stroke="var(--color-level-high)" strokeWidth="1.5" opacity="0.4" />
              </pattern>
            </defs>

            {/* --- 1. TIME AXIS RULER --- */}
            <g transform={`translate(0, 0)`}>
              <line x1="0" y1={hTime} x2={rollWidth} y2={hTime} stroke="var(--color-grid)" strokeWidth="1" />
              {Array.from({ length: Math.floor(totalDuration / 15) + 1 }).map((_, i) => {
                const t = i * 15;
                const x = xScale(t);
                const isMajor = t % 30 === 0;
                const m = Math.floor(t / 60);
                const s = t % 60;
                const label = `${m}:${s < 10 ? '0' : ''}${s}`;

                return (
                  <g key={t} transform={`translate(${x}, 0)`}>
                    <line x1="0" y1={isMajor ? 4 : 12} x2="0" y2={hTime} stroke="var(--color-grid)" strokeWidth="1" />
                    {isMajor && (
                      <text
                        x="3"
                        y="14"
                        fontFamily="var(--font-mono)"
                        fontSize="10"
                        fill="var(--color-ink-muted)"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* --- 2. STRESS CHANNEL --- */}
            <g transform={`translate(0, ${hTime})`}>
              <line x1="0" y1={hStress} x2={rollWidth} y2={hStress} stroke="var(--color-grid)" strokeWidth="1" />
              {/* Horizontal axis guidelines */}
              <line x1="0" y1={hStress - 20} x2={rollWidth} y2={hStress - 20} stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.6" />
              <line x1="0" y1={hStress - 42} x2={rollWidth} y2={hStress - 42} stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.6" />
              <line x1="0" y1={hStress - 62} x2={rollWidth} y2={hStress - 62} stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.6" />
              <text x="4" y={hStress - 22} fontSize="8" fontFamily="var(--font-mono)" fill="var(--color-level-low)" opacity="0.8">Low</text>
              <text x="4" y={hStress - 44} fontSize="8" fontFamily="var(--font-mono)" fill="#B57B0E" opacity="0.8">Med</text>
              <text x="4" y={hStress - 64} fontSize="8" fontFamily="var(--font-mono)" fill="var(--color-level-high)" opacity="0.8">High</text>

              {/* Self-report gap overlay if present */}
              {selfReportInfo && selfReportInfo.hasGap && (
                <g>
                  <rect
                    x="0"
                    y={Math.min(hStress - selfReportInfo.reportedH, hStress - selfReportInfo.modelH)}
                    width={rollWidth}
                    height={Math.abs(selfReportInfo.reportedH - selfReportInfo.modelH)}
                    fill="rgba(16, 39, 43, 0.06)"
                    stroke="#10272B"
                    strokeWidth="0.8"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1="0"
                    y1={hStress - selfReportInfo.reportedH}
                    x2={rollWidth}
                    y2={hStress - selfReportInfo.reportedH}
                    stroke="#10272B"
                    strokeWidth="1.2"
                    strokeDasharray="4 2"
                  />
                </g>
              )}

              {data.stress.map((w) => {
                const x1 = xScale(w.tStartS);
                const x2 = xScale(w.tEndS);
                const width = Math.max(2, x2 - x1);

                // Heights for Low / Med / High stepped traces
                let barH = 20;
                let strokeColor = 'var(--color-level-low)';
                let fillVal = 'rgba(31, 111, 106, 0.15)';
                let strokeDash = 'none';
                let label = 'Low';

                if (w.cls === 1) {
                  barH = 42;
                  strokeColor = 'var(--color-level-med)';
                  fillVal = 'url(#hatch-med)';
                  strokeDash = '4 2';
                  label = 'Med';
                } else if (w.cls === 2) {
                  barH = 62;
                  strokeColor = 'var(--color-level-high)';
                  fillVal = 'url(#hatch-high)';
                  strokeDash = 'none';
                  label = 'High';
                }

                const y = hStress - barH;

                return (
                  <g key={w.win_id}>
                    <rect
                      x={x1}
                      y={y}
                      width={width}
                      height={barH}
                      fill={fillVal}
                      stroke={strokeColor}
                      strokeWidth="1.5"
                      strokeDasharray={strokeDash}
                    />
                    <text
                      x={x1 + 6}
                      y={y + 14}
                      fontFamily="var(--font-sans)"
                      fontSize="10"
                      fontWeight="600"
                      fill={strokeColor}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* --- 3. SPEED CHANNEL --- */}
            <g transform={`translate(0, 0)`}>
              <line
                x1="0"
                y1={hTime + hStress + hSpeed}
                x2={rollWidth}
                y2={hTime + hStress + hSpeed}
                stroke="var(--color-grid)"
                strokeWidth="1"
              />
              {speedPath && (
                <path
                  className={styles.penDraw}
                  d={speedPath}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="1.75"
                />
              )}
            </g>

            {/* --- 4. ERRORS CHANNEL --- */}
            <g transform={`translate(0, ${hTime + hStress + hSpeed})`}>
              <line x1="0" y1={hErrors} x2={rollWidth} y2={hErrors} stroke="var(--color-grid)" strokeWidth="1" />
              {data.errors.map((err) => {
                const x = xScale(err.tS);
                return (
                  <g key={err.seq} transform={`translate(${x}, 0)`}>
                    <line
                      x1="0"
                      y1={err.isBurst ? 4 : 16}
                      x2="0"
                      y2={hErrors}
                      stroke="var(--color-level-high)"
                      strokeWidth={err.isBurst ? '2.5' : '1.5'}
                    />
                    {err.isBurst && (
                      <circle cx="0" cy="4" r="2.5" fill="var(--color-level-high)" />
                    )}
                  </g>
                );
              })}
            </g>

            {/* --- 5. PAUSES CHANNEL --- */}
            <g transform={`translate(0, ${hTime + hStress + hSpeed + hErrors})`}>
              <line x1="0" y1={hPauses} x2={rollWidth} y2={hPauses} stroke="var(--color-grid)" strokeWidth="1" />
              {data.pauses.map((p, idx) => {
                const x1 = xScale(p.tStartS);
                const x2 = xScale(p.tEndS);
                const w = Math.max(4, x2 - x1);

                return (
                  <g key={idx}>
                    <rect
                      x={x1}
                      y="10"
                      width={w}
                      height="16"
                      fill="var(--color-ink-muted)"
                      opacity="0.35"
                      rx="1"
                    />
                    <text
                      x={x1 + 3}
                      y="22"
                      fontFamily="var(--font-mono)"
                      fontSize="9"
                      fill="var(--color-ink)"
                    >
                      {p.durationS}s
                    </text>
                  </g>
                );
              })}
            </g>

            {/* --- 6. LIGHT CHANNEL (Optional) --- */}
            {data.hasLight && (
              <g transform={`translate(0, 0)`}>
                <line
                  x1="0"
                  y1={hTime + hStress + hSpeed + hErrors + hPauses + hLight}
                  x2={rollWidth}
                  y2={hTime + hStress + hSpeed + hErrors + hPauses + hLight}
                  stroke="var(--color-grid)"
                  strokeWidth="1"
                />
                {lightPath && (
                  <path
                    className={styles.penDraw}
                    d={lightPath}
                    fill="none"
                    stroke="var(--color-level-med)"
                    strokeWidth="1.25"
                  />
                )}
              </g>
            )}

            {/* --- 7. MARGIN NOTES & ALERTS --- */}
            <g
              transform={`translate(0, ${
                hTime + hStress + hSpeed + hErrors + hPauses + hLight
              })`}
            >
              {data.marginNotes.map((note, idx) => {
                const x = xScale(note.tStartS);
                const isAlert = note.type === 'alert';

                return (
                  <g key={idx} transform={`translate(${x}, 18)`}>
                    <rect
                      x="0"
                      y="-12"
                      width={isAlert ? 48 : 58}
                      height="16"
                      fill={isAlert ? 'var(--color-level-high)' : 'var(--color-paper)'}
                      stroke={isAlert ? 'var(--color-level-high)' : 'var(--color-ink)'}
                      strokeWidth="1"
                      rx="1"
                    />
                    <text
                      x="4"
                      y="0"
                      fontFamily="var(--font-sans)"
                      fontSize="9"
                      fontWeight="600"
                      fill={isAlert ? '#FFFFFF' : 'var(--color-ink)'}
                    >
                      {note.label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Crosshair Vertical Line */}
            {hoverX !== null && (
              <line
                className={styles.crosshairLine}
                x1={hoverX}
                y1="0"
                x2={hoverX}
                y2={totalSvgHeight}
              />
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
