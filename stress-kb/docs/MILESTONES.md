# MILESTONES.md

Tags: **AGENT** = you do it autonomously. **USER GATE** = needs Mog's hardware; copy the matching checklist
from docs/HARDWARE.md into PROGRESS.md "Waiting on user" and keep going elsewhere.
Every milestone ends with: acceptance commands green, PROGRESS.md updated, git commit.

---
## M0 — Scaffold and spikes
**AGENT**
- Create the repo layout, Makefile (targets in AGENTS.md), .gitignore (ignore ml/data/real), requirements files, `git init`.
- web: a connect page using Web Serial with the HELLO/READY handshake (retry every 500 ms, 5 s max, tolerates the ESP32 resetting when the port opens), plus a "Use simulator" toggle that swaps in `web/sim/fake-esp32.js`.
- firmware: `hello` sketch: prints READY,0.1,1 at boot, replies READY to HELLO,1, blinks the LED.
**Acceptance**: `make test` passes (handshake logic incl. retry and reset cases); `make serve` loads the page and connects to the simulator; `make compile` ok or prints USER GATE.
**USER GATE HG0**.

## M1 — Typing app (browser)
**AGENT**
- Copy-typing task with a bank of >= 12 target paragraphs (60-80 words, no digits, matched difficulty, never repeated within a participant's visit).
- Capture: keydown/keyup with `event.repeat` ignored; dwell (0 if keyup was never seen); key class; err flag by comparing the typed character to the expected one at the cursor (the character is used locally and never stored or sent); focus lost/regained (blur, visibilitychange); 1 Hz heartbeat; t from performance.now() rebased to session start.
- Modes: Calm (no timer) and Pressure (visible countdown + score with an accuracy penalty). Consent screen. Post-session sliders: stress, rushed, tired (1-5).
- Stream K/F/T lines per PROTOCOL.md to the serial port or the simulator; build the session JSON per REPORT_SPEC.md (no characters).
- Pure logic in `web/js/core/*.js` with no DOM, so it is testable with `node --test`.
**Acceptance**: tests for repeat ignored, dwell, class mapping, err flag including backspace corrections, blur flushing pending keys with dwell 0, seq numbering, and a test that scans an exported session and fails if any typed text appears. A simulated 5-minute session works end to end.

## M2 — Firmware core (host-testable)
**AGENT**
- `protocol.h`: robust line parser (malformed/oversized lines, field counts, never crashes). `features.h`: window engine and the 18 features per FEATURES.md (Welford, ring buffers, windows closed by heartbeat).
- `tools/reference_features.py` and `tests/golden/` with >= 8 recorded/synthesised event CSVs and expected features, including edge cases: no errors, all backspaces, long idle, fewer than 20 keys, dwell = 0 events, focus losses, burst of 2000 lines.
- `firmware/host_tests`: C++ tests comparing `features.h` against the golden expectations; parser fuzz test.
- `stresskb.ino` glue: parser -> engine -> FEAT lines. `tools/replay.py`: streams a CSV/session to a serial port or to the simulator, `--speed`, `--verify`.
**Acceptance**: `make -C firmware/host_tests` green; replay against the simulator verifies PASS; `make compile` ok or USER GATE.
**USER GATE HG1**.

## M3 — Peripherals
**AGENT**
- `sensors.h`: BH1750 at 1 Hz; if absent -> `WARN,SENSOR_BH1750`, lux = 0, system keeps running.
- `ui.h`: OLED screens (main: level, confidence bar, top flag, lux, link status; CAL; LINK LOST; INSUFFICIENT; UNCERTAIN). Screen state logic as a pure function with host tests.
- `motor.h`: LEDC PWM patterns SINGLE, DOUBLE, LONG with a duty cap constant; core 2.x/3.x guards; pattern timing as pure functions with host tests.
- Boot-time I2C scan printed over serial. `TEST_MODE` build flag cycles all outputs every 3 s. Status LED states.
- Bare-board mode: each of BH1750, OLED and motor is optional (flags + I2C auto-detect). A missing part is skipped without blocking boot or the protocol; status via onboard LED blink codes + serial. Host-test the "nothing attached" path.
**Acceptance**: host tests green; `make compile` ok or USER GATE.
**USER GATE HG2**.

## M4 — Collection tooling and protocol
**AGENT**
- Session runner UI: user ID, schedule generator per participant index (2x2 conditions {calm, pressure} x {normal, dim light}; order from a Latin square; CAL first), per-session JSON download named `<user>_<session>_<mode>.json`.
- Pressure mode allowed time = 0.75 x the time the participant needed at their CAL pace.
- `tools/validate_sessions.py`: schema, no characters, coverage, lux present, label present, counts per participant/condition.
- `tools/replay.py --regen`: re-streams saved raw events through the firmware (or simulator) to regenerate FEAT after a spec change.
- **Collection protocol** (also shown in the app): consent; 3-minute CAL (calm copy-typing); then four 5-minute sessions (calm/normal, calm/dim, pressure/normal, pressure/dim, in Latin-square order); a different paragraph each session; >= 2 minutes rest between sessions; self-report after each; the participant may stop at any time; anonymous IDs only; no deception beyond the timer.
- Targets: >= 8 participants (minimum 5), about 19 windows per 5-minute session.
- Sessions with `meta.has_light_sensor = false` are flagged by the validator and excluded from the light ablation in M5.
**Acceptance**: tests; a simulated full participant visit yields 5 files that pass the validator.
**USER GATE HG3**.

## M5 — Training pipeline
**AGENT**
- `tools/synth_data.py` (clearly synthetic, realistic effect sizes) so the pipeline can be built before real data exists.
- `ml/`: load sessions; per-participant normalisation from CAL exactly as in FEATURES.md; **GroupKFold by participant** (assert no participant appears in both train and test); class weights; models: RandomForest and sklearn MLPClassifier; targets: self-report 3-class and condition binary; ablation with vs without light features (17, 18); feature importance; feature selection -> `ml/feature_selection.json` (8-12 features).
- Outputs: `ml/results/*.md` (tables for the write-up: accuracy, macro-F1, confusion matrix, per-participant scores, ablation) and figures. Banner everything derived from synthetic data.
**Acceptance**: pipeline runs end to end on synthetic data; leakage assertion test; results markdown generated. Rerun on `ml/data/real` once Mog adds files.

## M6 — Deploy the model on the ESP32
**AGENT**
- `ml/export_emlearn.py`: sklearn model -> C header using emlearn (vendor the needed header-only emlearn files into `firmware/stresskb/model/`; check the emlearn docs for supported estimator types and fall back to RandomForest if the MLP is unsupported). Write model global defaults (mu/sd), feature subset and class order to a generated `model_config.h`.
- Host test: compiled C inference agrees with sklearn predictions on held-out windows (>= 99% agreement; document any difference). Report model size and an inference-time estimate.
- Integrate in `stresskb.ino`: z-normalise, infer, emit PRED. Export held-out sessions plus expected predictions to `ml/export/heldout/`.
- Optional **M6b stretch** (USER GATE): int8 TFLite + C array + step-by-step instructions for TFLite Micro / Edge Impulse as a comparison. Skip unless time remains.
**Acceptance**: host agreement test; `make compile` ok or USER GATE.
**USER GATE HG4**.

## M7 — Decision layer, calibration, pattern flags
**AGENT**
- `decision.h` per FEATURES.md (EMA, confidence gate, N-in-a-row, cooldown counted in windows, UNCERTAIN/INSUFFICIENT/NO_BASELINE states). Pattern flags with thresholds as constants.
- CAL mode with NVS persistence behind an interface (in-memory fake for host tests), BASE lines, link watchdog, OLED/motor integration.
- Golden decision tests: scripted PRED sequences -> exact alert windows; flag tests per rule; watchdog test.
**Acceptance**: host tests green; simulator end-to-end scenario (calm then pressure) produces the expected alert and flags; `make compile` ok or USER GATE.
**USER GATE HG5**.

## M8 — Session report
**AGENT**: implement all 11 sections of REPORT_SPEC.md from a saved session JSON, with print CSS, JSON/CSV download, insufficient-data logic, and the synthetic banner.
**Acceptance**: `web/js/core/report.js` unit-tested on fixture sessions (normal, low coverage, no baseline, synthetic); a simulated session renders a complete report.

## M9 — Hardening and demo
**AGENT**
- Demo mode: one click replays a recorded stressed session to the device (or simulator).
- Failure drills in the simulator: heartbeat stops, malformed lines, seq gaps, reset mid-session, 2000-line burst, unplugged sensor. Accelerated 30-minute soak test.
- `docs/DEMO.md`: a 3-minute script and a backup-plan checklist.
**Acceptance**: `make test` fully green; every drill has a test or a documented manual check.
**USER GATE HG6**.

## M10 — Write-up
**AGENT**: `docs/REPORT_DRAFT.md`: abstract, problem, architecture, protocol, features, data collection and ethics, results (include `ml/results/*.md`), ablations, limitations (weak labels, small sample, light confound, per-user baselines), future work. Use "[citation needed]" instead of inventing references. Mark every placeholder.

## M11 — Stretch (only after M9)
ESP32 WiFi live report page, a physical self-report button, LittleFS on-device logs, TFLite Micro comparison (M6b).
