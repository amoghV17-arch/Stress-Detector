# UI_REDESIGN_PROMPTS.md — turn StressKB into a proper, distinctive web app

## How to use
1. Drop this file into `docs/`. Paste the **Design brief** into Antigravity first, then give the prompts **U0 to U9 one at a time**.
2. Add a milestone "M12 UI redesign (U0-U9)" to `docs/PROGRESS.md` and follow the same autonomy loop as AGENTS.md: tests green, PROGRESS.md updated, git commit after every prompt.
3. If your environment can open a browser and take screenshots, do it at the end of every prompt and critique the result before moving on.

---
## Design brief (paste first)

**Subject.** StressKB estimates stress from typing rhythm. A browser captures key timing, an ESP32 computes features and a verdict, and a report explains the session. Audiences: a participant typing (needs calm), an operator running sessions, and examiners watching a demo on a projector.

**Signature idea: the strip-chart recorder.** The data is time series on several channels, so the report is one long paper roll you drag or scroll sideways, like a seismograph or sleep-lab recording. Stress is the top trace; speed, errors, pauses and light are stacked channels below; pattern flags are margin notes attached to time spans. This is the ONE bold element. Everything else stays quiet and disciplined.

**Look (tokens).**

| Role | Value |
|---|---|
| Paper | #E4EBE7 with a faint graph grid |
| Grid lines | #B9C7C1 |
| Ink (text, traces) | #10272B |
| Low | #1F6F6A |
| Medium | #D99A1E |
| High | #D8432B |

- Type: **Archivo** (variable, width axis): expanded for big numbers and headings, narrow for channel labels. **Source Serif 4** for explanatory text, about 18px, max 70 characters per line, slightly looser line height than the sans. Load with `next/font`; if the width axis is not available that way, self-host the variable font file.
- Labels are sentence case. No tracked all-caps eyebrows, no numbered markers unless the content really is a sequence.
- Layout: left-aligned, asymmetric two-column text with margin notes. No grid of identical rounded cards. Radius 0-2px on instrument parts. No soft grey shadows, no gradients, no glassmorphism, no glow.
- Hairlines only where they carry meaning (channel separators, time ticks).
- Never rely on colour alone: stress levels also differ by line style/hatching and are labelled.
- Dark, neon-on-navy, cream with terracotta, and purple gradients are all off the table.



**Motion budget: exactly four moments**, all disabled or replaced by the final static state under `prefers-reduced-motion`:
1. Landing hero: a live rhythm tape that draws as the visitor types (draws ticks only, never letters).
2. Landing: ONE pinned scroll sequence showing the pipeline (events, window, features, baseline, model, verdict).
3. Report: the traces draw in once like a pen on load.
4. Demo mode only: a brief 2px shake of the page edge when the motor alert fires.
Plus normal responsive feedback (button press, drag). No fade-up on every section, no hover animations on everything.

**Copy.** Plain, active, sentence case. Rename:

| Old | New |
|---|---|
| Hardware & Connection | Device |
| Session Setup & Consent | Set up a session |
| Start Typing Session | Start typing |
| 1-Click Demo (Stressed Session) | Play a recorded stressed session |
| Serial Activity Console | Device log |
| Typing Pattern Indicators (18 Features) | How your typing compared with your usual |
| Clinical / Behavioral Meaning | What it suggests |
| Behaviour Pattern Flags | Patterns we noticed |
| Haptic Vibration Alerts | Vibration alerts |
| Data Quality & Reliability | How much to trust this |
| Post-Session Self-Report Comparison | You said vs the model said |
| Discrepancy | Different from what you reported |
| Scientific Disclaimer & Ergonomic Guidance | What this can't tell you |

The report opens with ONE plain verdict sentence, for example: "Medium stress, 65% sure. You sped up and made more errors after 1:30." It is produced by a deterministic, unit-tested function from the session data, never by an LLM, and it must never overclaim.

**Hard rules (do not break).**
- This is a UI layer. Do NOT change the protocol, the 18 features, the session JSON schema, or the ESP32 behaviour. Port and reuse the existing logic in `web/js/core/*`; do not fork it. New pure display helpers (verdict sentence, series derivation) go in core with unit tests.
- `make test` must stay green. Typed characters are never stored, logged or sent, including on the landing page hero.
- **Study mode vs demo mode.** UI affects typing behaviour, so in Study mode (data collection): quiet, no live tape, no sounds, no stress verdict shown to the participant, calm and pressure sessions look identical except the timer and score, fixed fonts and layout, and the app version is recorded in `meta.app_version`. Demo mode (viva) shows everything.
- Quality floor: responsive down to 360px, visible keyboard focus, contrast at AA for text (red on paper is for graphics and large text only), reduced motion respected, no layout shift, tested at 1366x768 and 1920x1080 (projector).
- Keep the simulator working so every screen can be verified without hardware.

**Stack.** Next.js (App Router), JavaScript with JSDoc (no TypeScript), CSS variables for tokens plus CSS Modules (no Tailwind default palette, no component kits like shadcn). SVG with `d3-scale` and `d3-shape` for the roll; canvas with `requestAnimationFrame` for the live tape (no React state per keystroke, use refs); GSAP with ScrollTrigger for the landing sequence; `idb-keyval` for the session archive. Web Serial code lives in client components only, behind one shared serial manager that survives hot reload. Pin all versions.

**Pages.**
- `/` landing (scroll story, live hero tape)
- `/session` operator setup
- `/session/run` participant typing (fullscreen, study mode)
- `/report` the roll for a loaded or archived session
- `/sessions` archive
- `/device` OLED mirror, status, device log
- `/method` how it works, ethics, limitations

---
## Prompts

### U0 — Plan, review, scaffold
```
Read AGENTS.md, docs/UI_REDESIGN_PROMPTS.md (Design brief) and inspect the current web/ app and its tests.
1. Write docs/UI_PLAN.md: a compact design plan (palette tokens, type roles, layout concept with ASCII wireframes for
   the typing page and the report roll, principles). Review it against the brief: if any part looks like a generic
   default dashboard, revise it and note what you changed and why.
2. Scaffold a Next.js App Router project in web-next/ with the tokens as CSS variables, fonts via next/font, a base
   layout, and a smoke page. Import the existing core logic from web/js/core without duplicating it (for example via
   experimental.externalDir or a shared folder), keeping the old app untouched until parity.
3. Add npm scripts (dev, build, lint) and a make target.
Acceptance: `npm run build` succeeds, `make test` is unchanged and green, UI_PLAN.md exists, tokens are in one file.
Update docs/PROGRESS.md and commit.
```

### U1 — Serial and session state layer
```
Port the connection and session logic into web-next/: one shared serial manager (Web Serial + the existing software
emulator), HELLO/READY handshake with retry, reconnect, connection status store, session recorder that produces the
SAME session JSON as the old app. Client components only; guard navigator.serial; show a clear message in unsupported
browsers. No visual polish yet.
Acceptance: a golden test runs the same scripted simulated session through old and new code and compares the session
JSON field by field. `make test` green. Update PROGRESS.md and commit.
```

### U2 — Participant typing page (study mode)
```
Build /session/run as a fullscreen, quiet page: consent step, the target paragraph set in the serif at a comfortable
size, a thin timer rule that shortens in pressure mode with a plain score, post-session sliders restyled. No setup UI,
no live tape, no verdict, no sounds. Calm and pressure share the same layout and fonts. Esc asks for confirmation to quit.
Keep every M1 behaviour (repeat ignored, dwell, error flag, focus events, heartbeat, no characters stored).
Acceptance: existing M1 tests pass against the new page; a test proves study mode never renders a verdict or tape;
screenshots at 360px, 1366x768 and 1920x1080 reviewed. Update PROGRESS.md and commit.
```

### U3 — Operator setup page
```
Build /session: connect the device (or use the emulator), participant ID, Latin-square schedule, mode, lighting, and a
before-you-start checklist (device connected, light sensor detected or marked missing, consent shown). The serial
traffic appears in a collapsible "Device log" drawer styled as paper tape. Starting a session navigates to /session/run
and hands the keyboard over cleanly.
Acceptance: the operator can run a complete simulated participant visit using only this page, with the schedule and
file naming from M4. Update PROGRESS.md and commit.
```

### U4 — The roll (signature report component)
```
Build <StripRoll session /> as the signature element, in SVG with d3-scale/d3-shape.
- Left sticky channel labels (sentence case): Stress, Speed, Errors, Pauses, Light (hidden if meta.has_light_sensor is
  false). Time axis in m:ss with a faint graph grid.
- Stress is a stepped Low/Medium/High trace using colour AND line style/hatching. Speed is a line; errors are tick marks
  with backspace bursts emphasised; long pauses are bars; light is a line.
- Pattern flags appear as margin notes attached to the time span where they were active; alerts are markers with a short note.
- Drag with inertia, wheel and keyboard (arrow keys) to scroll; a crosshair readout shows that window's values and level.
- The traces draw in once like a pen on load (the single report animation); skip it for reduced motion.
- "Show as table" toggle gives an accessible equivalent.
- Handle the synthetic banner, insufficient data and no personal baseline per docs/REPORT_SPEC.md.
- Add a pure verdict-sentence function in core with unit tests, and a series-derivation helper with unit tests.
Acceptance: fixture sessions (normal, low coverage, no baseline, no light sensor, synthetic) render correctly; drag stays
smooth on a 5-minute session; unit tests green. Update PROGRESS.md and commit.
```

### U5 — Report body and copy
```
Build /report around the roll: the verdict sentence first, then the roll, then the remaining REPORT_SPEC.md sections in
plain language using the copy table in the brief. Fix these known issues: show raw lux (not the log-transformed value)
in the indicator table; the timeline needs Low/Medium/High axis labels; the alert legend key must be visible. The
self-report comparison appears as a visible gap on the roll plus one sentence. Keep Load JSON, Download JSON/CSV and a
print stylesheet where the roll prints fit-to-width in landscape.
Acceptance: all 11 REPORT_SPEC sections are present; lux shows raw values; a print preview looks right; tests green.
Update PROGRESS.md and commit.
```

### U6 — Live tape and device mirror (demo mode)
```
Build the demo-mode view: a canvas rhythm tape (ticks for key-downs, width for hold time, ink marks for errors, gaps for
pauses, a perforation mark at each 30 s window boundary where the ESP32 verdict "prints"), and an OLED mirror component:
a pixel-accurate 128x64 one-bit rendering driven by BASE/PRED/WARN lines, so it matches the real OLED screens. On an alert,
play the 2px edge shake. Add "Play a recorded stressed session" (replay the recorded demo at normal and 8x speed).
Use requestAnimationFrame and refs only. Study mode must never load this code.
Acceptance: runs smoothly with the emulator, low CPU, reduced-motion fallback exists. Update PROGRESS.md and commit.
```

### U7 — Landing page
```
Build / as a scroll story with the live hero tape (typing draws ticks only; never store or transmit letters), then ONE
pinned GSAP ScrollTrigger sequence for the pipeline: key events, 30 s window, 18 features, personal baseline, model,
verdict. Short sections on privacy ("timing only, never what you type") and how the ESP32 is used. Primary action: set up
a session. Use the copy rules in the brief; no marketing filler, no "AI-powered" language. Provide static fallbacks for
reduced motion and small screens.
Acceptance: no layout shift, keyboard navigable, works at 360px and projector size. Update PROGRESS.md and commit.
```

### U8 — Archive, device and method pages
```
Build /sessions (IndexedDB archive with a mini stress trace for each session, open in /report), /device (connection
status, OLED mirror, device log), and /method (how it works, ethics, what this can't tell you, limitations stated honestly
from the spec). Stretch: overlay two sessions on one roll.
Acceptance: sessions persist across reloads; delete works; tests green. Update PROGRESS.md and commit.
```

### U9 — Polish, accessibility, performance, switch-over
```
1. Focus states, AA contrast, reduced motion, screen-reader labels on the roll, 360px/1366x768/1920x1080 screenshots; fix issues.
2. Remove ONE decorative element that does not earn its place.
3. Verify the parity checklist below, then point `make serve` at the new app and keep the old one in web-legacy/.
4. Update docs, run `make test` and `npm run build`, print a summary.
```

---
## Parity checklist (before switching over)
- [ ] Handshake, reconnect and emulator work
- [ ] A scripted session produces identical session JSON to the old app
- [ ] Study mode shows no tape, verdict or sounds
- [ ] All 11 report sections present, raw lux shown, synthetic banner works
- [ ] Download JSON/CSV and print/PDF work
- [ ] `make test` and `npm run build` pass
- [ ] Typed characters never appear in stored or exported data

## Cut lines if time runs short (drop in this order)
1. Overlay compare of two sessions. 2. Pinned landing sequence (keep the live hero). 3. Drag inertia and pen draw-in (keep a static stacked-channel roll). 4. Archive page. Never cut study mode or the parity checks.
