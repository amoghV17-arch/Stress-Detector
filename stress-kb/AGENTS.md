# AGENTS.md — start here

## Mission
Build "AI-Based Stress Detection Using Typing Behaviour and TinyML" end to end, autonomously.

A browser typing app captures raw typing events and streams them over USB serial to an ESP32.
The ESP32 computes features, normalises per user, runs a TinyML classifier, applies a decision
layer, and drives an OLED and a coin vibration motor. A BH1750 sensor gives ambient light.
A browser report summarises each session.

## Division of labour
- YOU (agent): all software — web app, firmware source, host tests, ML pipeline, report, tooling, docs.
- MOG (human): all physical hardware — wiring, flashing, on-device tests, running sessions with real participants.
- You cannot touch hardware. Everything must be verifiable WITHOUT it, using:
  1. a software device emulator (`web/sim/fake-esp32.js`) that speaks docs/PROTOCOL.md,
  2. firmware core logic written as plain C++ headers and tested natively on the PC (`firmware/host_tests`),
  3. replay tools that re-stream recorded raw events (`tools/replay.py`).
- When a step needs hardware, mark it USER GATE and move on to independent work.

## Read order
docs/PROTOCOL.md → docs/FEATURES.md → docs/REPORT_SPEC.md → docs/MILESTONES.md → docs/RISKS.md → docs/HARDWARE.md (context) → docs/PROGRESS.md (state)

## Autonomy loop
1. Open docs/PROGRESS.md. Pick the first milestone that is not DONE and has unblocked AGENT tasks.
2. Do its AGENT tasks in order. Do not ask Mog questions. Pick sensible defaults and log them under "Assumptions".
3. Run the milestone's acceptance commands. Fix failures. After 3 failed repair attempts on one issue,
   log it under "Blocked" with the exact error text and move to any independent task.
4. Update docs/PROGRESS.md: status, commands run and results, files changed, assumptions, next step.
   Commit to git after every milestone (`git init` in M0).
5. At a USER GATE: set the milestone to WAITING_ON_USER, copy the exact gate checklist from docs/HARDWARE.md
   into "Waiting on user", and continue with milestones that do not depend on it.
6. Stop when every AGENT task is DONE and only USER GATES or Blocked items remain. Print a final summary
   listing what Mog must do next, in order.

## Hard rules
- Privacy: never log, store or transmit typed characters. Only timing, key class and an error flag.
  Capture keys only inside the app's own window. No global hooks, no keylogging.
- Local only: no cloud, MQTT, auth, databases or analytics.
- The docs are the contract. PROTOCOL.md and FEATURES.md are the source of truth. To change them: edit the doc
  first, then all code, then tests, and log it under "Decisions" in PROGRESS.md.
- Never weaken or delete a test to make it pass. Never fabricate results. Any metric shown in a report or
  results file must come from ml/data/real. Synthetic data (ml/data/synthetic) is only for developing pipelines
  and every output derived from it must carry the banner "SYNTHETIC — NOT REAL RESULTS".
- Use only real, well-known libraries. Pin versions in requirements.txt / package notes. Do not invent APIs.
- Firmware: non-blocking (millis), fixed-size buffers, no dynamic allocation in hot paths, constants in
  `config.h`, a comment on every pin. Guard Arduino-ESP32 core differences with
  `#if ESP_ARDUINO_VERSION_MAJOR >= 3` (the LEDC PWM API differs between core 2.x and 3.x).
- Staged hardware: Mog currently owns ONLY the ESP32; other parts arrive later. The firmware must boot and run the
  full protocol (handshake, features, inference, decision layer) on a bare ESP32. Use `HAS_BH1750`, `HAS_OLED`,
  `HAS_MOTOR` flags in `config.h` plus runtime I2C detection. A missing peripheral logs once (e.g. `WARN,SENSOR_BH1750`),
  is skipped, and never blocks boot or the protocol. On a bare board, status = onboard LED blink codes + serial.
  Session files record `meta.has_light_sensor`.
- Core logic (features, protocol parsing, decision layer) lives in plain C++17 headers with no Arduino
  dependencies so it compiles and is tested on the PC.
- The output is a behavioural estimate, never a diagnosis. The report carries a disclaimer.
- Keep it simple: no web build step (ES modules), few files, no extra frameworks.

## Repo layout (create it in M0)
```
stress-kb/
  AGENTS.md  Makefile  .gitignore
  docs/                      specs (this bundle) + PROGRESS.md; you add DEMO.md and REPORT_DRAFT.md
  web/                       index.html, css/, js/ (ES modules)
    sim/fake-esp32.js        software device emulator implementing PROTOCOL.md
    tests/                   node --test files
  firmware/stresskb/         stresskb.ino, config.h, protocol.h, features.h, decision.h,
                             sensors.h, ui.h, motor.h, model/ (generated)
  firmware/host_tests/       Makefile, C++ tests, golden-vector comparison
  ml/                        requirements.txt, train.py, evaluate.py, export_emlearn.py,
                             feature_selection.json, data/real, data/synthetic, results/, export/
  tools/                     reference_features.py, replay.py, synth_data.py, validate_sessions.py,
                             serial_bridge.py (optional fallback if Web Serial fails)
  tests/golden/              event CSVs + expected features generated by reference_features.py
```

## Canonical commands (create in M0, keep stable)
- `make serve`    → `python -m http.server 8000 -d web`
- `make test`     → `node --test web/tests` + `make -C firmware/host_tests` + `pytest -q tests ml`
- `make compile`  → `arduino-cli compile` if installed (FQBN esp32:esp32:esp32), else print "USER GATE: compile in Arduino IDE"
- `make synth`    → generate synthetic data into ml/data/synthetic

## Environment assumptions
Python 3.10+, Node 18+, g++ with C++17. Chrome or Edge for Web Serial. If anything is missing, log it under "Blocked".
