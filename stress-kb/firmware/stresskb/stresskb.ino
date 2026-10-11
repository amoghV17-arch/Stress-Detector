// stresskb.ino — StressKB ESP32 Firmware Main Sketch
// Implements docs/PROTOCOL.md and docs/FEATURES.md

#include <Arduino.h>
#include "config.h"
#include "protocol.h"
#include "features.h"

using namespace stresskb;

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

// Status LED blink
unsigned long lastBlinkMillis = 0;
bool ledState = false;

// Window Engine
WindowEngine windowEngine;

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
}

void checkWatchdog() {
    if (!sessionActive) return;
    unsigned long now = millis();
    if (!linkLost && (now - lastActivityMillis >= WATCHDOG_TIMEOUT_MS)) {
        linkLost = true;
        Serial.println("WARN,LINK_LOST,No events for 5s");
    }
}

void kickWatchdog() {
    lastActivityMillis = millis();
    if (linkLost) {
        linkLost = false;
        Serial.println("WARN,LINK_OK,Link restored");
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

    windowEngine = WindowEngine(onWindowClosed, nullptr);
}

void loop() {
    // Non-blocking status LED blink
    unsigned long now = millis();
    unsigned long blinkInterval = sessionActive ? (linkLost ? 100 : 500) : 1000;
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
                            strncpy(currentMode, cmd.mode, sizeof(currentMode) - 1);
                            strncpy(currentUserId, cmd.userId, sizeof(currentUserId) - 1);
                            windowEngine.reset();
                            lastActivityMillis = millis();
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
                            Serial.println("ACK,S");
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
