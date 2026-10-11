# PROGRESS.md — live tracker (agent updates after every milestone)

## Setup facts (Mog fills in once)
- Submission deadline: ____
- ESP32 board model: ESP32 Dev Module (ESP32-WROOM-32)
- Arduino-ESP32 core version: ____
- OS: Windows
- Participants available: ____
- Hardware on hand: ESP32 only (BH1750, OLED, motor parts, breadboard to be bought)

## Status
Status values: TODO, IN_PROGRESS, WAITING_ON_USER, BLOCKED, DONE

| Milestone | Status | Next step owner | Last tests run | Notes |
|---|---|---|---|---|
| M0 Scaffold and spikes | WAITING_ON_USER | user (HG0) | make test & make compile | Scaffold complete, simulator and hello sketch ready |
| M1 Typing app | DONE | agent | make test (16 node tests + C++ host + pytest) | Full typing app, privacy audit, 14 paragraphs, HUD & self-report |
| M2 Firmware core | WAITING_ON_USER | user (HG1) | make test & replay verify | protocol.h, features.h, 8 golden vectors (100% pass), stresskb.ino, replay.py |
| M3 Peripherals | WAITING_ON_USER | user (HG2) | make test (host tests incl. motor, ui, bare-board) | sensors.h, ui.h, motor.h, I2C scan, TEST_MODE, bare-board support |
| M4 Collection tooling | WAITING_ON_USER | user (HG3) | make test & validate_sessions | schedule.js, validate_sessions.py, replay.py --regen, visit simulation (5 files passed) |
| M5 Training pipeline | IN_PROGRESS | agent | | Starting synth_data.py, train.py, evaluate.py, GroupKFold leakage assertions |
| M6 Deploy model | TODO | agent | | |
| M7 Decision layer and calibration | TODO | agent | | |
| M8 Session report | TODO | agent | | |
| M9 Hardening and demo | TODO | agent | | |
| M10 Write-up | TODO | agent | | |
| M11 Stretch | TODO | agent | | |

## Waiting on user
### HG0 — Hello test
- **Action**: Flash `firmware/hello/hello.ino` in Arduino IDE or CLI to ESP32 Dev Module. Open `http://localhost:8000` in Chrome/Edge, click "Connect", select the serial port.
- **Expect**: READY within 5 s; unplug/replug and reconnect works; onboard LED blinks at 1 Hz.
- **Report**: PASS/FAIL, board model, core version, any error text.

### HG1 — Replay check
- **Action**: Flash `firmware/stresskb/stresskb.ino` in Arduino IDE to the ESP32; run `python tools/replay.py --port <PORT> --verify tests/golden/` (PORT like COM3 or /dev/ttyUSB0).
- **Expect**: PASS for every golden file.
- **Report**: The full console output.

### HG2 — Peripherals
- **Action**: Wire BH1750 (0x23), OLED (0x3C), and motor driver (GPIO25). Flash `stresskb.ino` with `-DTEST_MODE` in Arduino IDE.
- **Expect**: I2C scan prints 0x23 and 0x3C; OLED cycles screens every 3 s; motor plays SINGLE, DOUBLE, and LONG pulses; lux changes when sensor is covered; ESP32 does NOT reset when motor fires. (On bare board: boot prints I2C: No devices found, skips missing parts, status LED blinks).
- **Report**: The I2C scan output lines and what worked or failed.

### HG3 — Data collection
- **Action**: Run participant visits following the collection protocol in `docs/MILESTONES.md` M4:
  1. Obtain consent, assign anonymous ID (e.g. u01..u08).
  2. Step 0: 3-minute CAL baseline (calm copy-typing).
  3. Steps 1-4: four 5-minute sessions (calm/normal, calm/dim, pressure/normal, pressure/dim in Latin-square order).
  4. Rest >= 2 minutes between sessions; self-report slider after each.
  5. Save session JSON files into `ml/data/real/` and run `python tools/validate_sessions.py ml/data/real/`.
- **Expect**: A clean validator summary with >= 8 participants (minimum 5), no privacy leaks, and correct condition distribution.
- **Report**: The validator summary console output.

## Assumptions
- Default serial baud rate is 115200 with 2048 RX buffer size per PROTOCOL.md.
- Default simulator firmware version is 0.1, protocol version 1.
- In absence of arduino-cli in local environment, `make compile` emits USER GATE instructing compilation in Arduino IDE per AGENTS.md contract.
- MinGW GCC 6.3 supports C++17 cleanly for host tests.
- Python virtual environment `.venv` used for isolated dependencies (pytest, emlearn, scikit-learn, pandas).
- Typing task bank contains 14 difficulty-matched prose paragraphs (60-80 words, no digits).
- In Pressure mode, score computes 10 pts per correct key minus 25 pts per error penalty.
- Session durations: CAL = 180 s (3 minutes), RUN = 300 s (5 minutes).
- Golden vector suite contains 8 test cases covering normal typing, no errors, all backspaces, long idle, <20 keys invalid, dwell=0, focus loss, and 2000-line burst.
- Motor duty cap is 200 out of 255 to prevent power brownouts on USB power.
- Missing peripherals are non-fatal: firmware logs `WARN,SENSOR_BH1750` once, skips OLED/motor, and continues operating seamlessly on bare board.
- Latin square 4x4 design balances presentation order across 4 conditions {calm, pressure} x {normal, dim light}.
- Pressure allowed time scales dynamically as 0.75x of the participant's CAL typing pace.

## Decisions (spec changes)
- None. Following PROTOCOL.md, FEATURES.md, and REPORT_SPEC.md exactly as specified.

## Blocked
- None.

## Log (newest first)
- 2026-10-11 — M4 — Collection tooling complete: `web/js/core/schedule.js` (4x4 Latin-square counterbalancing, 5-step visit generator, 0.75x CAL pace calculator), `web/index.html` and `web/js/app.js` updated with interactive visit step selector and 2-min rest reminders, `tools/validate_sessions.py` created (schema 1 + recursive privacy audit + coverage + condition checks), `tools/replay.py --regen` implemented, unit tests added simulating full 5-session visit with 100% validator pass — tests: `make test` (pass, 19 Node + C++ host tests + pytest), `validate_sessions.py` (pass on simulated visit) — next: M5 Training pipeline.
- 2026-10-11 — M3 — Peripherals module complete: `sensors.h` (BH1750 runtime detection & 1Hz sampling), `ui.h` (OLED screens: main, CAL, link lost, insufficient, uncertain, with pure layout function), `motor.h` (LEDC PWM patterns SINGLE/DOUBLE/LONG, duty cap 200, core 2.x/3.x guards, pure pattern timing), boot-time I2C bus scanner, `TEST_MODE` 3s cycle, and bare-board tolerance; C++ host tests added for motor timing, screen layout, and bare-board execution — tests: `make test` (pass, 16 Node + C++ host tests + pytest) — next: M4 Collection tooling.
- 2026-10-11 — M2 — Firmware core complete: `config.h`, `protocol.h` (zero-crash parser with 5000-fuzz pass), `features.h` (Welford algorithm, 18 features, window closure engine), `tools/reference_features.py`, 8 golden vectors in `tests/golden/`, `firmware/host_tests` (100% agreement on all golden cases), `stresskb.ino`, and `tools/replay.py` with verification and speed controls — tests: `make test` (pass, 16 Node + C++ host tests + pytest), `replay.py --verify tests/golden/` (100% pass across all 8 golden cases) — next: M3 Peripherals.
- 2026-10-11 — M1 — Browser typing application completed: paragraph bank (14 texts), pure typing engine with keydown/keyup dwell tracking, repeat filter, character class mapping, privacy-preserving error tracking (zero typed text stored/emitted), blur flush, shared K/F seq counter, HUD with timer & live score, post-session self-report modal (1-5 sliders), and JSON session exporter; 8 new unit tests added including privacy audit and 5-minute end-to-end simulation — tests: `make test` (pass, 16 Node tests + C++ host test + pytest) — next: M2 Firmware core.
- 2026-10-11 — M0 — Repository scaffolding created, Web Serial connection UI and simulator `fake-esp32.js` created, `hello.ino` sketch created, Makefile canonical targets created, Handshake unit tests and host C++ runner passing — tests: `make test` (pass, 8 Node tests + C++ host test + pytest smoke test), `make compile` (clean USER GATE message) — next: M1 Typing app.

## Check-in template (Mog pastes this to Claude after each milestone or gate)
```
Milestone: Mx     Status: done / blocked / partial
Gate result (paste the report-back text):
Errors hit (exact messages):
Days spent vs planned:
Anything to cut or change:
```
