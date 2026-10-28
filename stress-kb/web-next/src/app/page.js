'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './page.module.css';
import { CanvasRhythmTape } from '@/components/CanvasRhythmTape';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Keystroke timing events',
    desc: 'Captures key-down and key-up millisecond timestamps, dwell hold time, and coarse key classes. Zero typed characters are ever stored or transmitted.',
    formula: 'Events: [seq, t, cls, dwell, err]',
  },
  {
    step: '02',
    title: '30-second window aggregation',
    desc: 'Keystroke biometrics are batched into fixed 30-second sliding windows with 15-second overlap (50% hop size) for consistent temporal resolution.',
    formula: 'Window: 30s span \u2022 15s hop',
  },
  {
    step: '03',
    title: '18 biometric features',
    desc: 'Computes typing speed, timing variation (IKI standard deviation & CV), key overlap ratio, backspace rates, pauses (>2s), and ambient light using one-pass Welford variance.',
    formula: 'Welford online \u03BC & \u03C3\u00B2 in 1 pass',
  },
  {
    step: '04',
    title: 'Personal baseline normalisation',
    desc: 'Normalises each window feature against the participant\'s quiet calibration baseline (z = (f - \u03BC) / \u03C3_eff), clipping outliers to [-5, +5].',
    formula: 'z = (f - \u03BC_cal) / \u03C3_eff \u2208 [-5, 5]',
  },
  {
    step: '05',
    title: 'Edge TinyML inference',
    desc: 'A trained 100-tree Random Forest evaluates normalized biometric vectors on the ESP32 microcontroller in < 1 ms with zero cloud connectivity.',
    formula: 'ESP32 flash \u2022 < 1 ms inference latency',
  },
  {
    step: '06',
    title: 'Stateful decision & verdict',
    desc: 'Applies EMA smoothing (\u03B1 = 0.4), confidence gating (0.60 threshold), evaluates 6 behavioural pattern flags, and triggers ERM vibration alerts on sustained high stress.',
    formula: 'EMA smoothing \u2022 3-in-a-row alert trigger',
  },
];

export default function LandingPage() {
  const [heroEvents, setHeroEvents] = useState([]);
  const [heroWindows, setHeroWindows] = useState([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  const pipelineRef = useRef(null);
  const cardsRef = useRef([]);

  // Live hero typing listener
  const handleHeroKeyDown = (e) => {
    const now = Date.now();
    const isBack = e.key === 'Backspace';
    const newEvent = [heroEvents.length, now, isBack ? 'B' : 'L', 70, isBack ? 1 : 0];
    setHeroEvents((prev) => [...prev.slice(-150), newEvent]);
    setCurrentTimeMs(now);
  };

  // GSAP ScrollTrigger Sequence
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check reduced motion & screen width
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSmallScreen = window.innerWidth < 768;

    if (prefersReducedMotion || isSmallScreen) {
      // Keep static layout for accessibility and performance
      return;
    }

    const container = pipelineRef.current;
    if (!container) return;

    const cards = cardsRef.current.filter(Boolean);
    if (cards.length === 0) return;

    const ctx = gsap.context(() => {
      // Pinned horizontal or staggered sequence
      gsap.fromTo(
        cards,
        { opacity: 0.4, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.15,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 75%',
            end: 'bottom 85%',
            scrub: true,
          },
        }
      );
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <div className={styles.landingContainer}>
      {/* Top Nav */}
      <nav className={styles.topNav}>
        <Link href="/" className={styles.brand}>
          <span>StressKB</span>
          <span className={styles.brandBadge}>M12 Instrumentation</span>
        </Link>

        <div className={styles.navLinks}>
          <Link href="/session" className={styles.navLink}>
            Operator setup
          </Link>
          <Link href="/demo" className={styles.navLink}>
            Demo mode
          </Link>
          <Link href="/report" className={styles.navLink}>
            Report viewer
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className={styles.heroSection}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Cognitive stress estimation from typing rhythm.
          </h1>
          <p className={styles.heroSubtitle}>
            Zero-knowledge edge instrumentation. Key timing only &mdash; never what you type.
            Real-time features, embedded TinyML inference, and continuous strip-chart traces.
          </p>

          <div className={styles.heroActions}>
            <Link href="/session" className={styles.btnPrimary}>
              Set up a session &rarr;
            </Link>
            <Link href="/demo" className={styles.btnSecondary}>
              Demo presentation view &rarr;
            </Link>
          </div>
        </div>

        {/* Live Hero Rhythm Tape */}
        <div className={styles.heroTapeBox}>
          <div className={styles.tapeHeader}>
            <span>Live rhythm tape (interactive)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>zero text stored</span>
          </div>

          <CanvasRhythmTape
            events={heroEvents}
            windows={heroWindows}
            currentTimeMs={currentTimeMs}
            isPlaying={heroEvents.length > 0}
            pxPerSec={45}
          />

          <input
            type="text"
            className={styles.liveInputPrompt}
            placeholder="Type here to see real-time carbon ticks, hold width, and error marks..."
            onKeyDown={handleHeroKeyDown}
          />
        </div>
      </header>

      {/* Pinned Pipeline Scroll Section */}
      <section className={styles.pipelineSection} ref={pipelineRef}>
        <div className={styles.pipelineInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>System Architecture</span>
            <h2 className={styles.sectionTitle}>The Zero-Knowledge Pipeline</h2>
            <p className={styles.sectionDesc}>
              How raw keystroke millisecond timing transforms into a reliable cognitive workload estimate on edge hardware.
            </p>
          </div>

          <div className={styles.pipelineGrid}>
            {PIPELINE_STEPS.map((step, idx) => (
              <div
                key={step.step}
                className={styles.stepCard}
                ref={(el) => (cardsRef.current[idx] = el)}
              >
                <div className={styles.stepNumber}>
                  <span>{step.step}</span>
                  <span style={{ color: 'var(--color-grid)' }}>&mdash;&mdash;</span>
                </div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.desc}</p>
                <div className={styles.stepFormula}>{step.formula}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Info Section: Privacy & Edge Hardware */}
      <section className={styles.infoSection}>
        {/* Privacy Invariant */}
        <div className={styles.infoCard}>
          <h2 className={styles.infoTitle}>Timing only, never what you type</h2>
          <p className={styles.infoParagraph}>
            Unlike workplace monitoring software that captures keystrokes or camera video, StressKB enforces
            a strict zero-knowledge architecture. The browser captures only the physical timing of presses and releases.
          </p>
          <ul className={styles.bulletList}>
            <li>No character codes (ASCII/Unicode) are ever recorded, stored in memory, or exported.</li>
            <li>Keystrokes are mapped immediately into coarse structural categories (Letter, Digit, Space, Backspace).</li>
            <li>An automated privacy audit runs in the test suite on every build to guarantee zero text leakage.</li>
          </ul>
        </div>

        {/* Edge Hardware Implementation */}
        <div className={styles.infoCard}>
          <h2 className={styles.infoTitle}>How the ESP32 is used</h2>
          <p className={styles.infoParagraph}>
            The system pairs the browser with an ESP32 microcontroller over Web Serial. All feature calculations,
            calibration z-scoring, and Random Forest inference happen directly on the device.
          </p>
          <ul className={styles.bulletList}>
            <li><strong>TinyML on Flash:</strong> 100 decision trees compiled to standalone C header running in &lt;1 ms.</li>
            <li><strong>Ambient Photometry:</strong> A BH1750 I2C sensor tracks ambient lux to control for lighting variations without cameras.</li>
            <li><strong>Monochrome Display &amp; Haptics:</strong> A 128x64 SSD1306 OLED mirrors system state, and an ERM motor pulses on sustained stress.</li>
          </ul>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div>StressKB &middot; Cognitive Workload Biometrics</div>
        <div className={styles.footerLinks}>
          <Link href="/session" className={styles.footerLink}>
            Operator setup
          </Link>
          <Link href="/demo" className={styles.footerLink}>
            Demo mode
          </Link>
          <Link href="/report" className={styles.footerLink}>
            Report viewer
          </Link>
          <a
            href="https://github.com/amoghV17-arch/Stress-Detector"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footerLink}
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
