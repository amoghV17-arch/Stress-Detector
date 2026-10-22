import styles from './page.module.css';
import { PARAGRAPHS } from '@core/paragraphs.js';
import { mapKeyClass } from '@core/typing_engine.js';
import { CONDITIONS } from '@core/schedule.js';

export default function SmokePage() {
  // Verify core logic imports function as expected
  const sampleKeyClass = mapKeyClass('a');
  const sampleParagraphCount = PARAGRAPHS.length;
  const sampleConditionsCount = CONDITIONS.length;

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.badge}>M12 U0 Smoke Test</div>
        <h1 className={styles.title}>StressKB Instrumentation</h1>
        <p className={styles.verdictSentence}>
          Zero-knowledge cognitive stress estimation from typing rhythm. All traces are rendered on tactile calibrated paper with carbon ink.
        </p>
      </header>

      <div className={styles.grid}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tokens & Calibration Levels</h2>
          <div className={styles.tokenRow}>
            <span className={`${styles.tokenChip} ${styles.low}`}>Low: #1F6F6A</span>
            <span className={`${styles.tokenChip} ${styles.medium}`}>Medium: #D99A1E</span>
            <span className={`${styles.tokenChip} ${styles.high}`}>High: #D8432B</span>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Imported Core Logic Verification</h2>
          <div className={styles.coreItem}>
            <div>Paragraphs bank: {sampleParagraphCount} items available</div>
            <div>Latin-square conditions: {sampleConditionsCount} active</div>
            <div>Key class mapper check: &apos;a&apos; maps to &apos;{sampleKeyClass}&apos; (Letter)</div>
          </div>
        </section>
      </div>
    </main>
  );
}
