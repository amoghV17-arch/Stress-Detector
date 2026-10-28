'use client';

import React, { useRef, useEffect } from 'react';
import styles from './CanvasRhythmTape.module.css';

/**
 * CanvasRhythmTape — 60 FPS requestAnimationFrame paper tape visualizer.
 * Renders ticks for key-downs, hold duration width, ink marks for errors,
 * gaps for pauses, and perforation marks for 30s ESP32 verdicts.
 * Uses requestAnimationFrame and refs only (zero React re-renders during animation).
 */
export function CanvasRhythmTape({
  events = [],
  windows = [],
  currentTimeMs = 0,
  isPlaying = false,
  pxPerSec = 40,
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  // Store data in refs so the animation loop always accesses latest without re-subscribing
  const eventsRef = useRef(events);
  const windowsRef = useRef(windows);
  const timeRef = useRef(currentTimeMs);
  const isPlayingRef = useRef(isPlaying);
  const pxPerSecRef = useRef(pxPerSec);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    windowsRef.current = windows;
  }, [windows]);

  useEffect(() => {
    timeRef.current = currentTimeMs;
  }, [currentTimeMs]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    pxPerSecRef.current = pxPerSec;
  }, [pxPerSec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = mediaQuery.matches;

    const handleMotionChange = (e) => {
      prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener('change', handleMotionChange);

    // Auto-scale for high DPI displays
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let lastTimestamp = performance.now();

    const render = (now) => {
      const deltaMs = now - lastTimestamp;
      lastTimestamp = now;

      // If playing in real time, advance timeRef
      if (isPlayingRef.current && !prefersReducedMotion) {
        timeRef.current += deltaMs;
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      // Clear canvas with tactile paper color
      ctx.fillStyle = '#E4EBE7';
      ctx.fillRect(0, 0, width, height);

      // Faint horizontal baseline & grid
      ctx.strokeStyle = '#B9C7C1';
      ctx.lineWidth = 1;

      // Grid horizontal lines
      const midY = height / 2;
      ctx.beginPath();
      ctx.moveTo(0, midY - 25);
      ctx.lineTo(width, midY - 25);
      ctx.moveTo(0, midY + 25);
      ctx.lineTo(width, midY + 25);
      ctx.stroke();

      // Center baseline rule
      ctx.strokeStyle = '#809690';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      const curTime = timeRef.current;
      const scale = pxPerSecRef.current / 1000; // px per ms
      // Needle position: 80% from left edge (new events print towards needle)
      const needleX = width * 0.8;

      const currentEvents = eventsRef.current;
      const currentWindows = windowsRef.current;

      // 1. Draw 30-Second Window Perforations & Verdicts
      currentWindows.forEach((win) => {
        const tEndMs = win.t_end ?? (win.win_id + 1) * 30000;
        const winX = needleX - (curTime - tEndMs) * scale;

        // Skip if outside visible viewport
        if (winX < -150 || winX > width + 50) return;

        // Perforation dotted vertical rule
        ctx.strokeStyle = '#809690';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(winX, 0);
        ctx.lineTo(winX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Stamped Verdict Card at the perforation boundary
        const pred = win.pred || {};
        const cls = pred.cls ?? 0;
        const conf = pred.p ? Math.round(Math.max(...pred.p) * 100) : 70;
        const isAlert = Boolean(pred.alert);

        let badgeBg = 'rgba(31, 111, 106, 0.9)';
        let badgeText = `W${win.win_id}: LOW (${conf}%)`;

        if (cls === 1) {
          badgeBg = 'rgba(181, 123, 14, 0.95)';
          badgeText = `W${win.win_id}: MED (${conf}%)`;
        } else if (cls === 2) {
          badgeBg = 'rgba(216, 67, 43, 0.95)';
          badgeText = `W${win.win_id}: HIGH (${conf}%)`;
        }

        if (isAlert) {
          badgeText += ' !ALERT';
          badgeBg = '#D8432B';
        }

        // Draw Stamp Badge
        ctx.font = '10px "SF Mono", Consolas, monospace';
        const textWidth = ctx.measureText(badgeText).width;
        const badgeX = winX - textWidth - 6;
        const badgeY = 6;

        ctx.fillStyle = badgeBg;
        ctx.fillRect(badgeX, badgeY, textWidth + 8, 16);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(badgeText, badgeX + 4, badgeY + 12);
      });

      // 2. Draw Pauses (>2000 ms between keystrokes)
      for (let i = 1; i < currentEvents.length; i++) {
        const prev = currentEvents[i - 1];
        const curr = currentEvents[i];
        const prevEnd = prev[1] + (prev[3] || 80);
        const gap = curr[1] - prevEnd;

        if (gap >= 2000) {
          const xStart = needleX - (curTime - prevEnd) * scale;
          const xEnd = needleX - (curTime - curr[1]) * scale;
          const pauseWidth = Math.max(2, xEnd - xStart);

          if (xEnd >= 0 && xStart <= width) {
            ctx.fillStyle = 'rgba(16, 39, 43, 0.08)';
            ctx.fillRect(xStart, midY - 24, pauseWidth, 48);

            ctx.fillStyle = '#809690';
            ctx.font = '9px "SF Mono", Consolas, monospace';
            const pauseLabel = `${(gap / 1000).toFixed(1)}s pause`;
            if (pauseWidth > 45) {
              ctx.fillText(pauseLabel, xStart + 4, midY + 36);
            }
          }
        }
      }

      // 3. Draw Keystroke Ticks (Key-down line + Hold width + Error ink)
      for (let i = 0; i < currentEvents.length; i++) {
        const ev = currentEvents[i];
        const tMs = ev[1];
        const cls = ev[2];
        const dwell = ev[3] || 70;
        const err = ev[4] || 0;

        const x = needleX - (curTime - tMs) * scale;
        const holdWidth = Math.max(2, dwell * scale);

        // Skip off-screen events
        if (x + holdWidth < -20 || x > width + 20) continue;

        const isError = err === 1 || cls === 'B';

        if (isError) {
          // Ink mark for errors (Red accent mark + hatch)
          ctx.fillStyle = '#D8432B';
          ctx.fillRect(x, midY - 18, holdWidth + 2, 36);

          // Dark error tick
          ctx.fillStyle = '#10272B';
          ctx.fillRect(x, midY - 20, 2.5, 40);

          // Error flag dot
          ctx.beginPath();
          ctx.arc(x + 1, midY - 24, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Normal keystroke
          // Hold time block (light tint)
          ctx.fillStyle = 'rgba(16, 39, 43, 0.18)';
          ctx.fillRect(x, midY - 14, holdWidth, 28);

          // Crisp carbon ink key-down vertical tick
          ctx.fillStyle = '#10272B';
          ctx.fillRect(x, midY - 16, 2, 32);
        }
      }

      // 4. Draw the Needle (the recording stylus at 80% width)
      ctx.strokeStyle = '#D8432B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(needleX, 0);
      ctx.lineTo(needleX, height);
      ctx.stroke();

      // Needle pointer head
      ctx.fillStyle = '#D8432B';
      ctx.beginPath();
      ctx.moveTo(needleX - 4, 0);
      ctx.lineTo(needleX + 4, 0);
      ctx.lineTo(needleX, 8);
      ctx.closePath();
      ctx.fill();

      // Loop requestAnimationFrame
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return (
    <div className={styles.tapeContainer}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.legendOverlay}>
        <span>Stylus</span>
        <span>&bull;</span>
        <span style={{ color: '#10272B' }}>&vert; Keydown</span>
        <span>&bull;</span>
        <span style={{ color: 'rgba(16, 39, 43, 0.6)' }}>&boxH; Dwell</span>
        <span>&bull;</span>
        <span style={{ color: '#D8432B' }}>&bull; Error</span>
        <span>&bull;</span>
        <span style={{ color: '#809690' }}>&vellip; 30s Perforation</span>
      </div>
    </div>
  );
}

