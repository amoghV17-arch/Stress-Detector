// hello.ino — M0 spike sketch
// Protocol v1: prints READY,0.1,1 at boot, replies READY,0.1,1 to HELLO,1, blinks LED.

#include <Arduino.h>

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

const char FW_VER[] = "0.1";
const int PROTO_VER = 1;

String rxBuffer = "";
unsigned long lastBlink = 0;
bool ledState = false;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  // Set buffer size before Serial.begin per PROTOCOL.md
  Serial.setRxBufferSize(2048);
  Serial.begin(115200);

  // Wait briefly for serial to stabilize after reset
  delay(100);

  // Announce readiness on boot
  Serial.print("READY,");
  Serial.print(FW_VER);
  Serial.print(",");
  Serial.println(PROTO_VER);
  Serial.flush();
}

void loop() {
  // Non-blocking blink
  unsigned long now = millis();
  if (now - lastBlink >= 500) {
    lastBlink = now;
    ledState = !ledState;
    digitalWrite(LED_BUILTIN, ledState ? HIGH : LOW);
  }

  // Read serial lines
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      rxBuffer.trim();
      if (rxBuffer.length() > 0) {
        if (rxBuffer == "HELLO,1" || rxBuffer.indexOf("HELLO,1") >= 0) {
          Serial.print("READY,");
          Serial.print(FW_VER);
          Serial.print(",");
          Serial.println(PROTO_VER);
          Serial.flush();
        } else if (rxBuffer.indexOf("HELLO") >= 0) {
          Serial.println("WARN,MALFORMED,HELLO");
          Serial.flush();
        } else {
          Serial.print("WARN,UNKNOWN_CMD,");
          Serial.println(rxBuffer);
          Serial.flush();
        }
      }
      rxBuffer = "";
    } else {
      if (rxBuffer.length() < 160) {
        rxBuffer += c;
      }
    }
  }
}
