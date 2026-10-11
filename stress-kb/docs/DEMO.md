# StressKB — Demonstration Script & Contingency Plan

This document contains the official **3-Minute Presentation Script** and **Live Demo Contingency Checklist** for StressKB (*AI-Based Stress Detection Using Typing Behaviour and TinyML on ESP32*).

---

## 1. 3-Minute Presentation Script

### Minute 1: Problem Definition & Zero-Knowledge Privacy Architecture
* **Visual**: Show laptop screen with `StressKB` web application connected (`web/index.html`).
* **Speaker Script**:
  > *"Workplace cognitive stress degrades productivity, focus, and long-term well-being, yet existing monitoring tools either invade user privacy through camera tracking or suffer from invasive cloud logging. StressKB demonstrates a radically private alternative: real-time stress detection executed entirely on an edge microcontroller (ESP32) using typing biometrics and ambient illumination.*
  >
  > *Our core architectural requirement is Zero-Knowledge Privacy: keystroke characters are never stored, logged, or transmitted across the wire. The browser typing engine captures only millisecond dwell times, inter-key flight intervals, and coarse key classes—such as Letter, Backspace, or Punctuation. No typed words ever leave your local computer."*

---

### Minute 2: ESP32 TinyML Inference & Real-Time Alert Layer
* **Visual**: Click `⚡ 1-Click Demo (Stressed Session)` or type under pressure mode. Show console receiving streaming `FEAT` and `PRED` lines, OLED displaying the live score, and motor buzzing on alert.
* **Speaker Script**:
  > *"Here, the laptop streams sanitized timing packets over USB serial to the ESP32 running TinyML at 115,200 baud. Every 15 seconds, a 30-second sliding window computes 18 statistical features using online Welford algorithms—tracking typing speed, error rates, pause frequencies, and backspace bursts.*
  >
  > *These features are normalized against the user's pre-recorded calm baseline and fed into an on-device Random Forest classifier exported via emlearn. Notice the low latency: host inference runs in under 7 microseconds, and less than 60 microseconds on the ESP32’s 240 MHz Tensilica core.*
  >
  > *To prevent false alarms, our stateful Decision Engine applies an exponential moving average (alpha = 0.4) with a confidence gate of 0.6. When high stress persists across three consecutive windows, the ESP32 fires an immediate alert, activating the haptic vibration motor and updating the OLED display."*

---

### Minute 3: 11-Section Clinical Report & Micro-Break Recommendations
* **Visual**: Show web app transitioning to the **Report Viewer** (`docs/REPORT_SPEC.md`), displaying the interactive timeline, top-contributing indicators, pattern flags, and break recommendations.
* **Speaker Script**:
  > *"At the conclusion of the session, StressKB compiles an 11-section empirical session report. Here you see the stress timeline, the distribution across Calm, Moderate, and High stress states, and a breakdown of the top indicators—showing that accelerated error correction and shortened dwell times were the primary contributors.*
  >
  > *The system identified specific behavioral patterns, including 'Rushed' and 'Frustrated' backspace bursts, corroborated against post-session self-report ratings. Most importantly, it generates actionable ergonomic break suggestions—such as the 20-20-20 visual rest rule and box-breathing exercises—to guide the user before stress leads to burnout.*
  >
  > *StressKB proves that TinyML can provide actionable, edge-computed physiological feedback while maintaining uncompromising user privacy."*

---

## 2. Live Demo Contingency & Backup-Plan Checklist

During live demonstrations, hardware and connection anomalies can occur. Follow this ordered contingency plan:

| Scenario / Failure Mode | Indicator / Symptom | Recovery Action | Fallback State |
| :--- | :--- | :--- | :--- |
| **1. Disconnected Serial Cable** | Chrome modal displays `No compatible device found` or Web Serial fails. | Verify USB data cable (ensure it is not a power-only charge cable). Select COM port in Web Serial prompt. | Check `Use software emulator (no physical device required)` checkbox. The pure-JS `FakeESP32` emulator executes the identical protocol, model inference, and decision layer. |
| **2. Missing Peripherals (Bare Board)** | No OLED display or BH1750 light sensor connected to ESP32. | None required! The firmware auto-detects missing I2C devices at boot without hanging (`0 devices found`), setting sensor flags to 0 and proceeding gracefully. | Bare-board mode operates with serial and virtual decision engine. |
| **3. ESP32 Brownout / Reset Mid-Session** | Serial console displays `READY,0.1,1` in the middle of a live session. | The browser `HandshakeController` immediately detects reconnect and re-synchronizes without crashing. | Click `Send HELLO,1` to re-verify handshake, then restart session or trigger 1-Click Demo. |
| **4. Watchdog Timeout / Missing Events** | Serial console outputs `WARN,LINK_LOST,No events for 5s`. | Resume typing or send heartbeat. Firmware automatically emits `WARN,LINK_OK` on the next keypress. | Heartbeat timer in browser keeps connection alive when idle. |
| **5. Offline Browser (No Internet)** | WiFi drops during presentation. | All core assets (CSS, JS, icons, Chart.js fallback, and demo datasets) run 100% locally from the repo directory. | Open `web/index.html` directly via local browser file or local HTTP server (`python -m http.server 8000`). |
| **6. 1-Click Offline Demo Guarantee** | Any physical hardware glitch occurs on stage. | Click the prominent orange button: `⚡ 1-Click Demo (Stressed Session)`. | Replays pre-calibrated pressure typing sequence through the software emulator, demonstrating live HUD, alert trigger, and full 11-section report in ~5 seconds. |

---

## 3. Verification & Validation Commands

To verify that the complete system and all failure drills are passing before stepping on stage:

```bash
# 1. Run all unit tests, fuzz tests, model agreement tests, and failure drills
make test

# 2. Run standalone session validation across all fixture files
python tools/validate_sessions.py web/tests/fixtures/*.json
```
