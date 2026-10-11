// stresskb.ino — StressKB ESP32 Firmware Main Sketch
// Implements docs/PROTOCOL.md, docs/FEATURES.md, and docs/HARDWARE.md

#include <Arduino.h>
#include <Wire.h>
#include "config.h"
#include "protocol.h"
#include "features.h"
#include "sensors.h"
#include "ui.h"
#include "motor.h"
#include "inference.h"

using namespace stresskb;

// Peripherals
LightSensor lightSensor;
DisplayController display;
MotorController motor;

// Line receive buffer
char rxLineBuffer[MAX_LINE_LEN + 8];
size_t rxLineLen = 0;

// Watchdog and state
unsigned long lastActivityMillis = 0;
bool sessionActive = false;
bool linkLost = false;
uint32_t expectedSeq = 1;
char currentMode[8] = "RUN";
char currentUserId[16] = "default";
uint32_t currentCalWindows = 0;

// Status LED blink
unsigned long lastBlinkMillis = 0;
bool ledState = false;

// Display state
DisplayData displayData;

// Window Engine
WindowEngine windowEngine;

// I2C bus scanner at boot
void scanI2CBus() {
    Serial.println("I2C: Scanning bus (SDA=21, SCL=22)...");
    byte count = 0;
    for (byte addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.print("I2C: Device found at 0x");
            if (addr < 16) Serial.print("0");
            Serial.println(addr, HEX);
            count++;
        }
    }
    if (count == 0) {
        Serial.println("I2C: No devices found (bare-board mode)");
    } else {
        Serial.print("I2C: Total devices found: ");
        Serial.println(count);
    }
}

// Window closed callback: prints FEAT line over serial per PROTOCOL.md
void onWindowClosed(const WindowFeatures& wf, void* /*userData*/) {
    Serial.print("FEAT,");
    Serial.print(wf.winId);
    Serial.print(",");
    Serial.print(wf.tEnd);
    Serial.print(",");
    Serial.print(wf.nKeys);
    Serial.print(",");
    Serial.print(wf.valid);
    for (int i = 0; i < 18; i++) {
        Serial.print(",");
        Serial.print(wf.f[i], 3);
    }
    Serial.println();

    if (strcmp(currentMode, "CAL") == 0 && wf.valid) {
        currentCalWindows++;
        displayData.calWindows = currentCalWindows;
        displayData.screen = ScreenType::CAL;
    } else if (strcmp(currentMode, "RUN") == 0 || strcmp(currentMode, "REPLAY") == 0) {
        // Run TinyML model inference per M6
        auto inf = ModelInference::predict(wf, nullptr, nullptr, false);

        // Emit PRED line per PROTOCOL.md:
        // PRED,<win_id>,<cls>,<p_low>,<p_med>,<p_high>,<flags>,<alert>,<state>
        Serial.print("PRED,");
        Serial.print(inf.winId);
        Serial.print(",");
        Serial.print(inf.cls);
        Serial.print(",");
        Serial.print(inf.p[0], 2);
        Serial.print(",");
        Serial.print(inf.p[1], 2);
        Serial.print(",");
        Serial.print(inf.p[2], 2);
        Serial.print(",0,0,"); // flags=0, alert=0 (decision layer in M7)
        Serial.println(inf.state);

        if (!wf.valid) {
            displayData.screen = ScreenType::INSUFFICIENT;
            displayData.totalKeys = wf.nKeys;
        } else {
            displayData.screen = ScreenType::MAIN;
            if (inf.cls == 0) displayData.level = StressLevel::LOW;
            else if (inf.cls == 1) displayData.level = StressLevel::MEDIUM;
            else displayData.level = StressLevel::HIGH;
            displayData.confidence = std::max(inf.p[0], std::max(inf.p[1], inf.p[2]));
        }
    }
    display.render(displayData);
}

void checkWatchdog() {
    if (!sessionActive) return;
    unsigned long now = millis();
    if (!linkLost && (now - lastActivityMillis >= WATCHDOG_TIMEOUT_MS)) {
        linkLost = true;
        motor.stop();
        Serial.println("WARN,LINK_LOST,No events for 5s");
        displayData.linkOk = false;
        displayData.screen = ScreenType::LINK_LOST;
        display.render(displayData);
    }
}

void kickWatchdog() {
    lastActivityMillis = millis();
    if (linkLost) {
        linkLost = false;
        Serial.println("WARN,LINK_OK,Link restored");
        displayData.linkOk = true;
        displayData.screen = (strcmp(currentMode, "CAL") == 0) ? ScreenType::CAL : ScreenType::MAIN;
        display.render(displayData);
    }
}

void checkSequence(uint32_t seq) {
    if (seq != expectedSeq) {
        Serial.print("WARN,GAP,");
        Serial.print(expectedSeq);
        Serial.print(",");
        Serial.println(seq);
    }
    expectedSeq = seq + 1;
}

void setup() {
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, LOW);

    // Buffer size must be set before Serial.begin per PROTOCOL.md
    Serial.setRxBufferSize(SERIAL_RX_BUFFER_SIZE);
    Serial.begin(SERIAL_BAUD_RATE);
    delay(100);

    // Boot announcement
    Serial.print("READY,");
    Serial.print(FW_VERSION);
    Serial.print(",");
    Serial.println(PROTOCOL_VERSION);

    // Initialize I2C Wire bus
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    delay(50);
    scanI2CBus();

    // Initialize peripherals (non-blocking, tolerant of missing parts)
    lightSensor.begin();
    display.begin();
    motor.begin();

    windowEngine = WindowEngine(onWindowClosed, nullptr);

    displayData.screen = ScreenType::MAIN;
    displayData.linkOk = true;
    display.render(displayData);
}

#ifdef TEST_MODE
unsigned long lastTestModeCycle = 0;
int testStep = 0;
void runTestModeCycle(unsigned long now) {
    if (now - lastTestModeCycle >= 3000) {
        lastTestModeCycle = now;
        testStep = (testStep + 1) % 4;
        Serial.print("TEST_MODE: Step ");
        Serial.println(testStep);

        if (testStep == 0) {
            motor.trigger(MotorPattern::SINGLE, now);
            displayData.screen = ScreenType::MAIN;
            displayData.stressLevel = 0;
        } else if (testStep == 1) {
            motor.trigger(MotorPattern::DOUBLE, now);
            displayData.screen = ScreenType::MAIN;
            displayData.stressLevel = 1;
        } else if (testStep == 2) {
            motor.trigger(MotorPattern::LONG, now);
            displayData.screen = ScreenType::MAIN;
            displayData.stressLevel = 2;
        } else {
            displayData.screen = ScreenType::CAL;
            displayData.calWindows = 6;
        }
        display.render(displayData);
    }
}
#endif

void loop() {
    unsigned long now = millis();

    // Motor non-blocking update
    motor.update(now);

    // Ambient light 1 Hz update
    float currentLux = 0.0f;
    if (lightSensor.update(now, currentLux)) {
        displayData.lux = currentLux;
        if (sessionActive && strcmp(currentMode, "REPLAY") != 0) {
            Serial.print("LUX,");
            Serial.print(now - lastActivityMillis);
            Serial.print(",");
            Serial.println(currentLux, 1);
            windowEngine.addLux(now - lastActivityMillis, currentLux);
        }
    }

#ifdef TEST_MODE
    runTestModeCycle(now);
#endif

    // Non-blocking status LED blink
    unsigned long blinkInterval = sessionActive ? (linkLost ? 100 : 250) : 1000;
    if (now - lastBlinkMillis >= blinkInterval) {
        lastBlinkMillis = now;
        ledState = !ledState;
        digitalWrite(PIN_STATUS_LED, ledState ? HIGH : LOW);
    }

    checkWatchdog();

    // Read incoming serial lines
    while (Serial.available()) {
        char c = (char)Serial.read();
        if (c == '\r') continue;
        if (c == '\n') {
            rxLineBuffer[rxLineLen] = '\0';
            if (rxLineLen > 0) {
                ParsedCommand cmd;
                if (ProtocolParser::parseLine(rxLineBuffer, cmd)) {
                    if (sessionActive && (cmd.type == CommandType::KEY || cmd.type == CommandType::FOCUS || cmd.type == CommandType::HEARTBEAT)) {
                        kickWatchdog();
                    }

                    switch (cmd.type) {
                        case CommandType::HELLO:
                            Serial.print("READY,");
                            Serial.print(FW_VERSION);
                            Serial.print(",");
                            Serial.println(PROTOCOL_VERSION);
                            break;

                        case CommandType::START:
                            sessionActive = true;
                            linkLost = false;
                            expectedSeq = 1;
                            currentCalWindows = 0;
                            strncpy(currentMode, cmd.mode, sizeof(currentMode) - 1);
                            strncpy(currentUserId, cmd.userId, sizeof(currentUserId) - 1);
                            windowEngine.reset();
                            lastActivityMillis = millis();

                            displayData.linkOk = true;
                            displayData.screen = (strcmp(currentMode, "CAL") == 0) ? ScreenType::CAL : ScreenType::MAIN;
                            display.render(displayData);

                            Serial.println("ACK,S");
                            if (strcmp(currentMode, "RUN") == 0) {
                                // Default model baseline (present = 0)
                                Serial.print("BASE,");
                                Serial.print(currentUserId);
                                Serial.print(",0");
                                for (int i = 0; i < 36; i++) {
                                    Serial.print(",0.000");
                                }
                                Serial.println();
                            }
                            break;

                        case CommandType::STOP:
                            sessionActive = false;
                            motor.stop();
                            Serial.println("ACK,S");
                            if (strcmp(currentMode, "CAL") == 0) {
                                if (currentCalWindows >= 6) {
                                    Serial.print("CAL,DONE,");
                                    Serial.println(currentCalWindows);
                                } else {
                                    Serial.print("WARN,CAL_TOO_SHORT,");
                                    Serial.println(currentCalWindows);
                                }
                            }
                            displayData.screen = ScreenType::MAIN;
                            display.render(displayData);
                            break;

                        case CommandType::KEY:
                            checkSequence(cmd.seq);
                            windowEngine.addKey(cmd.seq, cmd.t, cmd.dwell, cmd.keyClass, cmd.err);
                            break;

                        case CommandType::FOCUS:
                            checkSequence(cmd.seq);
                            windowEngine.addFocus(cmd.seq, cmd.t, cmd.focusVal);
                            break;

                        case CommandType::HEARTBEAT:
                            windowEngine.addHeartbeat(cmd.t);
                            break;

                        case CommandType::REPLAY_LUX:
                            displayData.lux = cmd.lux;
                            windowEngine.addLux(cmd.t, cmd.lux);
                            break;

                        default:
                            break;
                    }
                } else {
                    if (cmd.warnCode[0] != '\0') {
                        Serial.print("WARN,");
                        Serial.print(cmd.warnCode);
                        if (cmd.warnDetail[0] != '\0') {
                            Serial.print(",");
                            Serial.print(cmd.warnDetail);
                        }
                        Serial.println();
                    }
                }
            }
            rxLineLen = 0;
        } else {
            if (rxLineLen < MAX_LINE_LEN) {
                rxLineBuffer[rxLineLen++] = c;
            }
        }
    }
}
