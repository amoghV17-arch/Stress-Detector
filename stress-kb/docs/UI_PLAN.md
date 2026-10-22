# StressKB UI Plan & Design Specification

## 1. Vision & Signature Concept
StressKB estimates cognitive and workload stress from typing rhythm without ever inspecting, storing, or transmitting typed characters. 

The core signature visual metaphor is **the strip-chart recorder** — a continuous horizontal paper roll (reminiscent of a seismograph or sleep-lab polysomnograph) with stacked continuous time-series channels. Time scrolls horizontally along a single calibrated axis.

- **Primary Signature Component**: `<StripRoll />` — an interactive SVG strip-chart with stacked channels (Stress, Speed, Errors, Pauses, Light) and marginal annotations for behavioural pattern flags and haptic vibration alerts.
- **Aesthetic Stance**: Disciplined laboratory instrumentation. Quiet, editorial, tactile paper and ink. Not a SaaS dashboard, not a neon gamer telemetry widget, and not an animated marketing carousel.

---

## 2. Design Tokens & Palette

All tokens are defined as CSS custom properties in `src/app/tokens.css` (or `app/tokens.css`):

```css
:root {
  /* Surface & Base */
  --color-paper: #E4EBE7;
  --color-grid: #B9C7C1;
  --color-ink: #10272B;
  --color-ink-muted: #4B6360;
  --color-ink-faint: #809690;

  /* Stress Classification Levels (never used alone; accompanied by texture & label) */
  --color-level-low: #1F6F6A;     /* Muted teal */
  --color-level-med: #D99A1E;     /* Ochre amber */
  --color-level-high: #D8432B;    /* Rust red - used on paper for graphics & large numbers only */

  /* Structural Geometry */
  --radius-instrument: 1px;       /* 0px - 2px strictly on dials, pins, and controls */
  --border-rule: 1px solid var(--color-grid);
  --border-ink: 1px solid var(--color-ink);

  /* Typography Stacks */
  --font-sans: var(--font-archivo), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-serif: var(--font-source-serif), "Times New Roman", Georgia, serif;
  --font-mono: "SF Mono", "Consolas", "Courier New", monospace;
}
```

### Contrast & Accessibility Guarantees
- Body text (`--color-ink` `#10272B` on `--color-paper` `#E4EBE7`) provides a contrast ratio exceeding **10.5:1** (far above WCAG AAA 7:1).
- Muted labels (`--color-ink-muted` `#4B6360` on `#E4EBE7`) provide a contrast ratio > **4.6:1** (meeting WCAG AA).
- High stress `#D8432B` is reserved for thick visual traces, status blocks, and large type, never for fine body text on paper.
- Line styles on strip charts distinguish levels redundantly: Low = solid, Medium = dashed / shaded hatching, High = stepped dense bar with hatch fill.

---

## 3. Typography & Copy Rules

### Type Roles
1. **Archivo** (variable width & weight):
   - **Expanded width, Bold**: Big KPI numbers, primary headings, window verdict stamps.
   - **Narrow width, Medium/Semi-bold**: Strip-chart channel labels, time ticks, tabular indicator tags.
   - **Regular**: Functional control labels, button text, meta headers.
2. **Source Serif 4**:
   - Used for the primary study typing paragraph (~20px, comfortable reading rhythm).
   - Used for the opening single verdict sentence and explanatory clinical/ergonomic findings (~18px, max line length 65–70 characters, relaxed 1.6 line height).
3. **Monospace** (clean system mono):
   - Strict alignment of timestamps (`0:30`, `1:00`), raw serial lines, and sequence counters.

### Copywriting Rules
- **Sentence case throughout**: "How your typing compared with your usual" (not "How Your Typing Compared...").
- **No tracked all-caps eyebrows**: Avoid "/// SYSTEM DIAGNOSTICS ///" or "OVERVIEW".
- **Plain, honest terms**:
  - "Device" (not "Hardware & Connection")
  - "Set up a session" (not "Session Setup & Consent")
  - "Start typing" (not "Start Typing Session")
  - "Device log" (not "Serial Activity Console")
  - "Patterns we noticed" (not "Behaviour Pattern Flags")
  - "You said vs the model said" (not "Post-Session Self-Report Comparison")
  - "What this can't tell you" (not "Scientific Disclaimer & Limitations")
- **Single Deterministic Verdict Sentence**:
  - Computed purely from session data; never fabricated or LLM-generated.
  - Example: *"Medium stress, 65% sure. You sped up and made more errors after 1:30."*

---

## 4. Motion Budget (Strictly 4 Moments)

Any motion must earn its place. All 4 moments respect `prefers-reduced-motion: reduce` (falling back immediately to their final static state):

1. **Landing Hero**: Live rhythm tape that draws ticks on visitor key-downs (ticks and hold marks only, zero letters).
2. **Landing Pipeline**: Exactly one pinned scroll sequence demonstrating the data path: `[Keystroke events] -> [30s window] -> [18 features] -> [Personal baseline] -> [TinyML model] -> [Verdict]`.
3. **Report Load**: The strip-chart traces draw across the roll once from left to right like an analog pen on paper.
4. **Demo Mode Alert**: A 2px horizontal shake of the browser viewport edge synchronized to the ESP32 ERM motor vibration pulse.

---

## 5. Layout & ASCII Wireframes

### A. Participant Typing Page (`/session/run`) — Study Mode
**Design Directive**: Total distraction-free calm. Fullscreen, quiet. No cards, no live stress tape, no gauge needles, no sounds, no stress score. Calm and Pressure modes share the exact same typography and layout; pressure mode differs solely by the presence of a countdown rule and running target score.

```
+-----------------------------------------------------------------------------+
| [Esc Quit]                                                        [04:12]   |
|                                                                             |
|                                                                             |
|         The sun had dropped behind the low ridge of hills, leaving          |
|         a long pale ribbon of yellow light along the horizon. In            |
|         the stillness of the evening, the air turned crisp and              |
|         every sound carried across the dry grass...                         |
|                                                                             |
|         [ Cursor resting here in active typing area ]                       |
|                                                                             |
|                                                                             |
| --------------------------------------------------------------------------- |
| [Remaining time indicator line - in Pressure mode: thin depleting rule]     |
| [Score: 420 pts] (Pressure mode only, quiet right-aligned monospace)        |
+-----------------------------------------------------------------------------+
```

### B. The Signature Strip-Chart Roll (`/report`)
**Design Directive**: A single horizontally continuous paper strip with faint graph grid (`#B9C7C1`). Sticky channel indicators on the left. Stacked time-aligned channels. Margin notes for pattern flags and motor alerts.

```
+-----------------------------------------------------------------------------+
| "Medium stress, 65% sure. You sped up and made more errors after 1:30."     |
| (Source Serif 4, 22px, confident, plain language verdict)                   |
+-----------------------------------------------------------------------------+
| [<- Drag / Scroll horizontally ->]                     [Show as table] [CSV]|
|=============================================================================|
| TIME         0:00        0:30        1:00        1:30        2:00        2:30   |
|-------------+-----------+-----------+-----------+-----------+-----------+---|
| STRESS      |     LOW   |    LOW    |    MED    |    HIGH   |    HIGH   |   |
|             |___________|___________|--- - - - -|###########|###########|   |
|             |                       |           |  ! RUSHED |  ! ALERT  |   |
|-------------+-----------+-----------+-----------+-----------+-----------+---|
| SPEED       |           /\_         _/\         /\_         __/\        |   |
| (keys/min)  |__________/   \_______/   \_______/   \_______/    \_______|   |
|-------------+-----------+-----------+-----------+-----------+-----------+---|
| ERRORS      |           |           |  |        |||| |||    || | |||    |   |
| (ticks/burst)|_________|___________|__|________|___________|___________|   |
|-------------+-----------+-----------+-----------+-----------+-----------+---|
| PAUSES      |   |                   |               |                   |   |
| (>2s bars)  |___|___________________|_______________|___________________|   |
|-------------+-----------+-----------+-----------+-----------+-----------+---|
| LIGHT       | --------------------------------------------------------- |   |
| (lux line)  | (faint continuous ambient illumination trace)             |   |
|=============================================================================|
| CROSSHAIR READOUT AT 1:45 -> Stress: High (72%) | Speed: 312 cpm | Err: 6.2%|
+-----------------------------------------------------------------------------+
```

### C. Critique Against Generic Dashboard Anti-Patterns

| Generic Dashboard Anti-Pattern | How We Rejected / Revised It | Why |
|---|---|---|
| **Grid of identical rounded cards** with drop shadows | Replaced with an **asymmetric two-column laboratory layout** and a continuous horizontal paper roll. | Generic card grids fragment time series data. Typing stress is continuous time-series data; a strip-chart respects temporal continuity. |
| **Dark neon / purple glassmorphism** | Replaced with **tactile paper (`#E4EBE7`) and carbon ink (`#10272B`)** with graph paper gridlines (`#B9C7C1`). | Neon gradients suggest gaming software. StressKB is an experimental cognitive science instrument for examiners and participants. |
| **Gauges, speedometers, & circular dials** | Replaced with **linear stepped traces, rate ticks, and pause bars**. | Gauges present momentary snapshots rather than trajectory. Stress development over 5 minutes is about *when* and *why* changes occurred. |
| **Tracked uppercase badges** (`[STATUS: ACTIVE]`) | Replaced with **natural sentence-case typography** in Archivo Narrow. | Caps-lock badges create visual noise and distract the eye from real analytical content. |
| **Real-time stress verdict during participant typing** | **Strictly forbidden in Study Mode** (`/session/run`). Confined exclusively to post-session `/report` and Demo Mode. | Showing live stress scores to a participant directly biases their psychological state and invalidates study data. |

---

## 6. Architecture & Code Reuse Guarantee

- **No forked or duplicated logic**: The existing validated modules in `web/js/core/` (`typing_engine.js`, `report.js`, `schedule.js`, `paragraphs.js`, `handshake.js`, `demo_session.js`) remain the single source of truth.
- **Import Strategy**: Next.js App Router in `web-next/` directly imports ES modules from `web/js/core/` via a path alias (e.g., `@core/*` mapping to `../web/js/core/*`), or symlink/shared reference.
- **Zero Privacy Leakage**: Web Serial reads timing, key class, dwell, and error flags. No typed characters are ever sent to state, DOM, local storage, or IndexedDB.
