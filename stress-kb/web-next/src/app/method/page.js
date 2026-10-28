'use client';

import React from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function MethodPage() {
  return (
    <main className={styles.container}>
      {/* Top Header */}
      <header className={styles.topBar}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Methodology &amp; Scope</h1>
          <p className={styles.pageSubtitle}>
            How StressKB works, ethical considerations, stated limitations, and architectural boundaries.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/" className={styles.btnAction}>
            &larr; Home
          </Link>
          <Link href="/session" className={styles.btnAction}>
            Set up a session &rarr;
          </Link>
        </div>
      </header>

      <div className={styles.articleStack}>
        {/* 1. How it works */}
        <article className={styles.section}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <p className={styles.paragraph}>
            StressKB measures cognitive workload and acute pressure by analysing fine motor typing dynamics.
            When an individual experiences psychological stress or elevated task demands, neuromuscular tension
            alters motor consistency: inter-key intervals (IKI) become irregular, dwell hold times fluctuate,
            and backspace burst corrections escalate.
          </p>
          <p className={styles.paragraph}>
            The system collects millisecond timestamps for key-down and key-up events, batching them into 30-second
            sliding analysis windows with 15-second hops. Across each window, 18 statistical features are computed online
            using Welford variance. These features are z-normalized against the participant&apos;s personal calm baseline
            and evaluated locally by an embedded Random Forest model running on the ESP32 microcontroller in under 1 ms.
          </p>
        </article>

        {/* 2. Zero-Knowledge Privacy Architecture */}
        <article className={styles.section}>
          <h2 className={styles.sectionTitle}>Zero-knowledge privacy architecture</h2>
          <div className={styles.calloutBox}>
            <strong>Core Invariant:</strong> The physical identity of typed characters is never captured,
            never buffered in browser memory, never transmitted over the serial wire, and never written to session files.
          </div>
          <p className={styles.paragraph}>
            Unlike keyloggers or video surveillance that invade participant privacy, StressKB maps keystrokes
            instantly into coarse categories (Letter, Digit, Space, Backspace, Other). The event stream contains
            only millisecond timestamps and duration. An automated privacy audit verifies this contract on every build.
          </p>
        </article>

        {/* 3. Experimental Protocol & Ethics */}
        <article className={styles.section}>
          <h2 className={styles.sectionTitle}>Experimental protocol &amp; ethics</h2>
          <ul className={styles.list}>
            <li>
              <strong>Latin-Square Counterbalancing:</strong> To control for fatigue and order effects, conditions
              (Calm vs Pressure, Normal vs Dim lighting) are counterbalanced across participants using a 4&times;4 Latin-square design.
            </li>
            <li>
              <strong>CAL Baseline Pace Scaling:</strong> Pressure session time limits are personalized: exactly 0.75&times;
              the participant&apos;s natural typing pace recorded during their initial 3-minute CAL baseline, ensuring uniform pressure.
            </li>
            <li>
              <strong>Informed Consent:</strong> Every participant explicitly confirms consent before typing starts.
              Esc allows immediate quitting at any point with zero penalty.
            </li>
          </ul>
        </article>

        {/* 4. Limitations Stated Honestly */}
        <article className={styles.section}>
          <h2 className={styles.sectionTitle}>Limitations stated honestly</h2>
          <p className={styles.paragraph}>
            In accordance with academic rigor, the following methodological boundaries must be acknowledged:
          </p>
          <ul className={styles.list}>
            <li className={styles.limitationItem}>
              <strong>Subjective Ground Truth:</strong> Model labels are supervised by 1&ndash;5 post-session self-report
              sliders (NASA-TLX style), which introduce individual perceptual bias and retrospective cognitive recall noise.
            </li>
            <li className={styles.limitationItem}>
              <strong>Pilot Sample Size:</strong> Preliminary validation was conducted on a pilot cohort (N = 10). Larger,
              demographically diverse cohorts are required to generalize across varied typing proficiencies (e.g. touch-typists vs hunt-and-peck).
            </li>
            <li className={styles.limitationItem}>
              <strong>Illumination &amp; Environmental Confounds:</strong> While ambient lux is tracked via BH1750, variations
              in monitor color temperature, glare, or pupil dilation can subtly influence typing speed independently of stress.
            </li>
            <li className={styles.limitationItem}>
              <strong>Baseline Drift:</strong> Circadian fatigue and posture changes over multi-hour working periods can cause
              natural baseline drift, necessitating periodic re-calibration.
            </li>
          </ul>
        </article>

        {/* 5. What this can't tell you */}
        <article className={styles.section}>
          <h2 className={styles.sectionTitle}>What this can&apos;t tell you</h2>
          <div className={styles.calloutBox}>
            <strong>Scientific Disclaimer:</strong> StressKB provides a behavioural estimate of typing motor rhythm.
            It is not a medical, psychiatric, or diagnostic assessment.
          </div>
          <p className={styles.paragraph}>
            This system cannot distinguish between psychological stress, caffeine intake, room temperature shivering,
            physical wrist fatigue, or emotional excitement. High stress ratings indicate erratic rhythm or rushed motor patterns
            &mdash; never a clinical pathology.
          </p>
        </article>
      </div>
    </main>
  );
}
