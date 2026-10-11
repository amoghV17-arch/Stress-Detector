# HARDWARE.md — Mog's part

Agent: context only (pins live in `config.h`). Mog: do a gate when PROGRESS.md says WAITING_ON_USER, then paste the result back.

## Parts
ESP32 dev board (ESP32-WROOM-32) with a DATA-capable USB cable; BH1750 module (GY-302); 0.96" SSD1306 I2C OLED;
coin vibration motor; NPN transistor (BC547 or 2N2222); diode (1N4148 or 1N4007); 1 kΩ resistor; 100 µF capacitor;
push button (optional); breadboard and jumper wires. Buy the BH1750 and OLED modules with header pins already soldered
(some listings ship loose pins), so no soldering is needed.

## Staged hardware (what you can do with what you have)
Mog currently has only the ESP32. The firmware runs on a bare board and skips missing parts, so almost everything can start now.

| Stage | You have | Gates you can run |
|---|---|---|
| A | ESP32 + data USB cable | HG0, HG1, HG4, and the typing-app/serial/replay parts of HG5 (serial shows alert = 1; motor and OLED checks wait for stage C) |
| B | + BH1750 (pins soldered) + 4 female-to-female jumper wires | HG2 (light part), and HG3 data collection |
| C | + OLED, coin motor, BC547/2N2222, diode, 1 kΩ, 100 µF, half-size breadboard, jumpers, optional button | HG2 (full), HG5 (motor and OLED checks), HG6 |

Buy order: **1) BH1750 + jumper wires first** (needed before real data collection), **2) the rest** (OLED, motor driver parts, breadboard) before the demo.
Do not start HG3 data collection before the BH1750 arrives if you can avoid it: without it every session has no light data, the light
feature is useless, and the with/without-light ablation is impossible. If you must collect early, the sessions are flagged
(`has_light_sensor = false`) and excluded from that ablation only.

## Pins (must match firmware/stresskb/config.h)
| Part | Connection |
|---|---|
| BH1750 | VCC→3V3, GND→GND, SDA→GPIO21, SCL→GPIO22, ADDR→GND (address 0x23) |
| OLED SSD1306 | VCC→3V3, GND→GND, SDA→GPIO21, SCL→GPIO22 (same I2C bus, address 0x3C; some boards use 0x3D) |
| Motor driver | GPIO25 → 1 kΩ → transistor base; emitter→GND; motor between 3V3 and collector; diode across the motor with the stripe (cathode) on the 3V3 side; 100 µF between 3V3 and GND near the motor |
| Status LED | onboard LED (GPIO2 on most boards) |
| Button (optional) | GPIO27 to GND, firmware uses INPUT_PULLUP |

Everything shares one GND. Check the motor's rated voltage before powering it from 3V3. Never connect the motor straight to a GPIO.

## One-time software setup
- Arduino IDE → Boards Manager → install "esp32" by Espressif. Write the version number in PROGRESS.md.
- Board: ESP32 Dev Module. Libraries: Adafruit SSD1306, Adafruit GFX, BH1750 (by Christopher Laws).
- Upload speed 921600; if upload fails use 115200 and hold the BOOT button while "Connecting..." shows.
- Only one program can hold the serial port: close Arduino Serial Monitor before using the web app.
- Use Chrome or Edge at `http://localhost:8000` (`make serve`). Web Serial does not work in Firefox or Safari.

## Gates (do, expect, report)

**HG0 — Hello test**: flash the hello sketch; open the page; Connect; choose the port. Expect READY within 5 s; unplug/replug and reconnect works. Report: PASS/FAIL, board model, core version, any error text.

**HG1 — Replay check**: flash `stresskb`; run `python tools/replay.py --port <PORT> --verify tests/golden/` (PORT like COM3 or /dev/ttyUSB0). Expect PASS for every golden file. Report: the full console output.

**HG2 — Peripherals**: wire everything; flash with `TEST_MODE`. Expect: I2C scan shows 0x23 and 0x3C; OLED cycles screens; motor plays SINGLE/DOUBLE/LONG; lux changes when you cover the sensor; the ESP32 does NOT reset when the motor fires. Report: the I2C scan lines and what worked or failed (if it resets, say so).

**HG3 — Data collection**: run participant visits per MILESTONES M4 and copy the JSON files into `ml/data/real/`; run `python tools/validate_sessions.py`. Expect a clean validator summary with >= 8 participants (minimum 5). Report: the validator summary.

**HG4 — On-device model**: flash the model build; run `python tools/replay.py --port <PORT> --verify-pred ml/export/heldout/`. Expect agreement within the tolerance the agent states. Report: output and the inference time printed on serial.

**HG5 — Calibration and alerts**: calibrate yourself (3 minutes calm typing); power-cycle the board; start a RUN session and confirm the BASE line shows present = 1; replay a stressed session and confirm the alert and the motor; unplug USB mid-session and confirm LINK LOST and the motor stops. Report: PASS/FAIL for each item.

**HG6 — Demo drills**: three consecutive clean demo runs following docs/DEMO.md; run each failure drill (unplug USB, reset the board mid-session, close the tab, cover the light sensor, motor unplugged); record a backup video. Report: what failed and what you changed.

## Quick fixes
| Symptom | Try |
|---|---|
| Port not listed | Use a data cable, install the CP210x or CH340 driver, try another USB port |
| "Port busy" / cannot open | Close Serial Monitor and other tabs using the port |
| Upload stuck on "Connecting..." | Hold BOOT, lower the upload speed |
| Board resets when the motor fires | Check the diode direction and the capacitor; lower the duty cap in config.h |
| I2C scan shows nothing | Check SDA/SCL swap, 3V3 vs 5V on the module, loose breadboard rows |
| OLED blank but scan shows 0x3C/0x3D | Set the OLED address in config.h |

## Ethics
Get consent from every participant, keep IDs anonymous, never record what is typed, and let anyone stop at any time.
