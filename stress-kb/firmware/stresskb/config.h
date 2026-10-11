#pragma once

// config.h — StressKB Hardware and Protocol Configuration
// Contract per AGENTS.md, PROTOCOL.md, FEATURES.md, HARDWARE.md

#include <stdint.h>
#include <stddef.h>

// Firmware version
#define FW_VERSION "0.1"
#define PROTOCOL_VERSION 1

// Serial communication
#define SERIAL_BAUD_RATE 115200
#define SERIAL_RX_BUFFER_SIZE 2048
#define MAX_LINE_LEN 160

// Hardware peripheral presence flags (staged hardware support)
// Can be overridden at build time (e.g. -DTEST_MODE or bare-board testing)
#ifndef HAS_BH1750
#define HAS_BH1750 1 // BH1750 ambient light sensor on I2C
#endif

#ifndef HAS_OLED
#define HAS_OLED 1   // SSD1306 128x64 OLED on I2C
#endif

#ifndef HAS_MOTOR
#define HAS_MOTOR 1  // Coin vibration motor on GPIO25
#endif

// Pin Definitions (comments on every pin per AGENTS.md)
// I2C bus (shared by BH1750 and OLED SSD1306)
#define PIN_I2C_SDA 21 // GPIO21: I2C Data line
#define PIN_I2C_SCL 22 // GPIO22: I2C Clock line

// I2C Addresses
#define I2C_ADDR_BH1750 0x23 // GY-302 ADDR tied to GND
#define I2C_ADDR_OLED   0x3C // SSD1306 0.96" OLED display (fallback 0x3D)

// Actuators and Indicators
#define PIN_MOTOR 25     // GPIO25: NPN transistor base via 1k resistor driving motor
#define PIN_STATUS_LED 2 // GPIO2: Onboard status LED
#define PIN_BUTTON 27    // GPIO27: Optional tactile button to GND (INPUT_PULLUP)

// Motor PWM / LEDC Settings
#define MOTOR_PWM_CHANNEL 0
#define MOTOR_PWM_FREQ 5000
#define MOTOR_PWM_RES 8
#define MOTOR_DUTY_CAP 200 // Max duty cycle out of 255 (limits inrush current)

// Timing & Windowing (all times in milliseconds)
#define WINDOW_LEN_MS 30000 // 30-second window
#define WINDOW_HOP_MS 15000 // 15-second hop
#define WATCHDOG_TIMEOUT_MS 5000 // 5 seconds link watchdog
#define LUX_SAMPLE_INTERVAL_MS 1000 // 1 Hz ambient light reading

// Window Validity Criteria
#define MIN_KEYS_PER_WINDOW 20
#define MIN_SHORT_IKIS_PER_WINDOW 3
#define SHORT_IKI_THRESHOLD_MS 2000

// Decision Layer Constants per FEATURES.md
#define DECISION_EMA_ALPHA 0.4f
#define DECISION_ALERT_THRESHOLD 0.6f
#define DECISION_CONSECUTIVE_WINDOWS 3
#define DECISION_COOLDOWN_WINDOWS 20 // 20 windows (approx 5 min)
#define CONFIDENCE_GATE 0.6f

// Behaviour pattern flags bitmask
#define FLAG_RUSHED     (1 << 0)
#define FLAG_HESITANT   (1 << 1)
#define FLAG_FRUSTRATED (1 << 2)
#define FLAG_FATIGUED   (1 << 3)
#define FLAG_DISTRACTED (1 << 4)
#define FLAG_FOCUSED    (1 << 5)

// Ring buffer capacity (no dynamic allocation in hot paths)
#define MAX_WINDOW_EVENTS 256
#define MAX_LUX_SAMPLES 64
