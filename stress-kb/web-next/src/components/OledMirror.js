'use client';

import React, { useRef, useEffect } from 'react';
import styles from './OledMirror.module.css';

/**
 * OledMirror — Pixel-accurate 128x64 one-bit SSD1306 monochrome OLED mirror.
 * Driven by parsed BASE/PRED/WARN lines and session status per firmware/stresskb/ui.h.
 */
export function OledMirror({
  screen = 'MAIN',        // MAIN, CAL, LINK_LOST, INSUFFICIENT, UNCERTAIN
  stressLevel = 0,        // 0: Low, 1: Med, 2: High
  confidence = 0.85,      // 0.0 - 1.0
  patternFlags = 0,       // Bitmask (1=Rushed, 2=Hesitant, 4=Frustrated, etc.)
  lux = 350,              // Ambient lux
  linkOk = true,          // Serial watchdog status
  calWindows = 0,         // Calibration windows count
  totalKeys = 45,         // Total keys in window
  isAlert = false,        // Active vibration alert
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed internal resolution 128 x 64
    const W = 128;
    const H = 64;

    // 1. Clear background (SSD1306 deep black)
    ctx.fillStyle = '#0B0E14';
    ctx.fillRect(0, 0, W, H);

    // Compute text lines according to computeScreenLayout in ui.h
    let title = '';
    let metricLine = '';
    let statusLine = '';
    let footerLine = '';

    if (!linkOk || screen === 'LINK_LOST') {
      title = '! LINK LOST !';
      metricLine = 'No serial traffic';
      statusLine = 'Check USB cable';
      footerLine = 'Motor Stopped';
    } else if (screen === 'CAL') {
      title = 'CALIBRATION';
      metricLine = `Windows: ${calWindows} / 6`;
      statusLine = calWindows >= 6 ? 'Baseline Ready' : 'Type normally...';
      footerLine = `Lux: ${Math.round(lux)} lx`;
    } else if (screen === 'INSUFFICIENT') {
      title = 'INSUFFICIENT';
      metricLine = `Keys: ${totalKeys} (< 20)`;
      statusLine = 'Keep typing...';
      footerLine = `Lux: ${Math.round(lux)} lx`;
    } else if (screen === 'UNCERTAIN') {
      title = 'UNCERTAIN';
      metricLine = `Conf: ${Math.round(confidence * 100)}% (<60%)`;
      statusLine = 'Evaluating...';
      footerLine = `Lux: ${Math.round(lux)} lx`;
    } else {
      // MAIN SCREEN
      const levelStr = stressLevel === 2 ? 'HIGH' : stressLevel === 1 ? 'MED' : 'LOW';
      title = `STRESS: ${levelStr}`;
      metricLine = `Conf: ${Math.round(confidence * 100)}%`;

      let flagStr = 'STEADY';
      if (patternFlags & (1 << 0)) flagStr = 'RUSHED';
      else if (patternFlags & (1 << 2)) flagStr = 'FRUSTRATED';
      else if (patternFlags & (1 << 1)) flagStr = 'HESITANT';
      else if (patternFlags & (1 << 3)) flagStr = 'FATIGUED';
      else if (patternFlags & (1 << 4)) flagStr = 'DISTRACTED';
      else if (patternFlags & (1 << 5)) flagStr = 'FOCUSED';

      statusLine = `Mode: ${flagStr}`;
      footerLine = `Lux: ${Math.round(lux)} | Link OK`;
    }

    // OLED phosphor color (authentic 1-bit bright cyan #00F0FF)
    const oledColor = isAlert ? '#FF4433' : '#00F0FF';
    ctx.fillStyle = oledColor;

    // Title Bar (Inverted high-contrast header block)
    ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = '#0B0E14';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillText(title, 4, 10);

    // Alert indicator mark on right of title bar
    if (isAlert) {
      ctx.fillStyle = '#0B0E14';
      ctx.fillRect(W - 24, 1, 22, 12);
      ctx.fillStyle = '#FF4433';
      ctx.fillText('!AL', W - 22, 10);
    }

    // Body Lines
    ctx.fillStyle = oledColor;
    ctx.font = '8px "Courier New", monospace';

    // Metric Line (y = 26)
    ctx.fillText(metricLine, 4, 26);

    // Status Line (y = 40)
    ctx.fillText(statusLine, 4, 40);

    // Footer divider line
    ctx.strokeStyle = oledColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(W, 48);
    ctx.stroke();

    // Footer Line (y = 58)
    ctx.font = '7px "Courier New", monospace';
    ctx.fillText(footerLine, 4, 58);
  }, [screen, stressLevel, confidence, patternFlags, lux, linkOk, calWindows, totalKeys, isAlert]);

  return (
    <div className={styles.oledWrapper}>
      <div className={styles.oledBezelHeader}>
        <span>SSD1306 128x64 OLED</span>
        <span>I2C 0x3C</span>
      </div>
      <div className={styles.oledGlass}>
        <canvas
          ref={canvasRef}
          width={128}
          height={64}
          className={styles.oledCanvas}
          role="img"
          aria-label="128x64 OLED device screen mirror"
        />
      </div>
    </div>
  );
}

