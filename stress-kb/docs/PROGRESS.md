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
| M2 Firmware core | IN_PROGRESS | agent | | Starting protocol.h, features.h, reference_features.py, golden tests |
| M3 Peripherals | TODO | agent | | |
| M4 Collection tooling | TODO | agent | | |
| M5 Training pipeline | TODO | agent | | |
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

## Assumptions
- Default serial baud rate is 115200 with 2048 RX buffer size per PROTOCOL.md.
- Default simulator firmware version is 0.1, protocol version 1.
- In absence of arduino-cli in local environment, `make compile` emits USER GATE instructing compilation in Arduino IDE per AGENTS.md contract.
- MinGW GCC 6.3 supports C++17 cleanly for host tests.
- Python virtual environment `.venv` used for isolated dependencies (pytest, emlearn, scikit-learn, pandas).
- Typing task bank contains 14 difficulty-matched prose paragraphs (60-80 words, no digits).
- In Pressure mode, score computes 10 pts per correct key minus 25 pts per error penalty.
- Session durations: CAL = 180 s (3 minutes), RUN = 300 s (5 minutes).

## Decisions (spec changes)
- None. Following PROTOCOL.md, FEATURES.md, and REPORT_SPEC.md exactly as specified.

## Blocked
- None.

## Log (newest first)
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
