#pragma once

// motor.h — Vibration motor PWM controller per docs/FEATURES.md & HARDWARE.md
// Pure pattern timing function host-testable on PC.
// Arduino ESP32 core 2.x and 3.x guards included.

#include <stdint.h>
#include <stddef.h>
#include "config.h"

#ifdef ARDUINO
#include <Arduino.h>
#include <esp_arduino_version.h>
#endif

namespace stresskb {

enum class MotorPattern {
    NONE = 0,
    SINGLE,  // 150 ms pulse
    DOUBLE,  // 150 ms on, 150 ms off, 150 ms on
    LONG     // 400 ms pulse
};

/**
 * Pure timing function: returns the PWM duty (0 to MOTOR_DUTY_CAP) at elapsedMs.
 */
inline uint8_t getMotorDutyAtTime(MotorPattern pattern, uint32_t elapsedMs) {
    switch (pattern) {
        case MotorPattern::SINGLE:
            if (elapsedMs < 150) return MOTOR_DUTY_CAP;
            return 0;

        case MotorPattern::DOUBLE:
            if (elapsedMs < 150) return MOTOR_DUTY_CAP;
            if (elapsedMs < 300) return 0;
            if (elapsedMs < 450) return MOTOR_DUTY_CAP;
            return 0;

        case MotorPattern::LONG:
            if (elapsedMs < 400) return MOTOR_DUTY_CAP;
            return 0;

        case MotorPattern::NONE:
        default:
            return 0;
    }
}

/**
 * Returns total duration in milliseconds for a pattern.
 */
inline uint32_t getMotorPatternDuration(MotorPattern pattern) {
    switch (pattern) {
        case MotorPattern::SINGLE: return 150;
        case MotorPattern::DOUBLE: return 450;
        case MotorPattern::LONG:   return 400;
        case MotorPattern::NONE:
        default: return 0;
    }
}

class MotorController {
public:
    MotorController()
        : isPresent_(false), currentPattern_(MotorPattern::NONE),
          patternStartMillis_(0), currentDuty_(0) {}

    void begin() {
#ifdef ARDUINO
        #if HAS_MOTOR
        isPresent_ = true;
        #if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        // Core 3.x API
        ledcAttach(PIN_MOTOR, MOTOR_PWM_FREQ, MOTOR_PWM_RES);
        ledcWrite(PIN_MOTOR, 0);
        #else
        // Core 2.x API
        ledcSetup(MOTOR_PWM_CHANNEL, MOTOR_PWM_FREQ, MOTOR_PWM_RES);
        ledcAttachPin(PIN_MOTOR, MOTOR_PWM_CHANNEL);
        ledcWrite(MOTOR_PWM_CHANNEL, 0);
        #endif
        #else
        isPresent_ = false;
        #endif
#else
        isPresent_ = (HAS_MOTOR != 0);
#endif
    }

    void trigger(MotorPattern pattern, unsigned long nowMillis) {
        if (!isPresent_ || pattern == MotorPattern::NONE) return;
        currentPattern_ = pattern;
        patternStartMillis_ = nowMillis;
        applyDuty(getMotorDutyAtTime(pattern, 0));
    }

    void stop() {
        currentPattern_ = MotorPattern::NONE;
        applyDuty(0);
    }

    void update(unsigned long nowMillis) {
        if (currentPattern_ == MotorPattern::NONE) return;

        uint32_t elapsed = (uint32_t)(nowMillis - patternStartMillis_);
        uint32_t duration = getMotorPatternDuration(currentPattern_);

        if (elapsed >= duration) {
            stop();
        } else {
            uint8_t duty = getMotorDutyAtTime(currentPattern_, elapsed);
            if (duty != currentDuty_) {
                applyDuty(duty);
            }
        }
    }

    bool isPresent() const { return isPresent_; }
    uint8_t getCurrentDuty() const { return currentDuty_; }
    MotorPattern getCurrentPattern() const { return currentPattern_; }

private:
    bool isPresent_;
    MotorPattern currentPattern_;
    unsigned long patternStartMillis_;
    uint8_t currentDuty_;

    void applyDuty(uint8_t duty) {
        currentDuty_ = duty;
#ifdef ARDUINO
        if (isPresent_) {
            #if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
            ledcWrite(PIN_MOTOR, duty);
            #else
            ledcWrite(MOTOR_PWM_CHANNEL, duty);
            #endif
        }
#endif
    }
};

} // namespace stresskb
