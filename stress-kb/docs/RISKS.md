# RISKS.md — problems expected, and where the fix is already built in

## Hardware and toolchain
| Risk | Prevention |
|---|---|
| Charge-only cable or missing driver | HG0 spike before anything else |
| ESP32 resets when the port opens | HELLO/READY retry handshake (M0) |
| Port busy (Serial Monitor open) | Documented in HARDWARE.md |
| Motor resets the ESP32 | Transistor, diode, bulk capacitor, duty cap, check motor voltage (HG2) |
| I2C devices not found | Boot-time scan; addresses 0x23 and 0x3C/0x3D |
| Bad GPIO choice | Outputs on 25/27/2; avoid input-only 34-39 and strapping pins |
| PWM code does not compile | `ESP_ARDUINO_VERSION_MAJOR` guards (LEDC API differs in core 3.x) |
| ESP32 RX buffer overflow | `Serial.setRxBufferSize(2048)` before begin; burst test in M9 |
| Web Serial unavailable | Chrome/Edge on localhost; `tools/serial_bridge.py` fallback |

## Data and ML
| Risk | Prevention |
|---|---|
| Key auto-repeat corrupts dwell | `event.repeat` ignored; tests in M1 |
| Keyup lost when the window loses focus | Pending keys flushed with dwell = 0 |
| Serial lag distorts timing | Features use laptop event timestamps |
| Windows never close during idle | 1 Hz heartbeat T lines |
| Training and runtime features differ | Training uses ESP32-generated FEAT; replay regenerates; reference-vs-C++ golden tests |
| Same-session windows leak into the test set | GroupKFold by participant with an assertion test |
| Light sensor learns the room, not stress | Counterbalanced lighting plus with/without ablation |
| Fast typists look stressed | Per-user CAL baseline stored on the ESP32 |
| Zero-variance baseline (e.g. no errors in CAL) | `sd_eff` floor and z clipping |
| Predictions on nearly empty windows | valid gate (n_keys >= 20), INSUFFICIENT state |
| Twitchy alerts | EMA, confidence gate, 3-in-a-row, cooldown |
| Small, noisy dataset | 3 classes, 8-12 features, class weights, honest metrics, state limitations |
| Weak labels (session label on every window) | Say so in the write-up; also report the condition-based target |
| Model library will not compile | emlearn (plain C) is the primary path; TFLite Micro/Edge Impulse is optional M6b |
| Demo failure | Replay demo mode plus a recorded backup video |

## Agent behaviour risks
| Risk | Rule |
|---|---|
| Passing tests by weakening them | Forbidden. Fix the code, not the test |
| Fabricated or synthetic results shown as real | Real metrics only from ml/data/real; synthetic outputs carry a banner |
| Invented libraries or APIs | Use only real libraries, pinned versions, check docs |
| Spec drift | Change the doc first, then code and tests, log it under Decisions |
| Endless loops on one bug | 3 attempts, then log under Blocked and move on |
| Scope creep | Do not start M11 before M9 is DONE |
| Privacy regression | Test that scans exports for typed text must stay green |
