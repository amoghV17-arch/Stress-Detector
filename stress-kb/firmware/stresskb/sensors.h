#pragma once

// sensors.h — Ambient light sensor (BH1750) abstraction
// Handles I2C detection, 1 Hz sampling, and bare-board tolerance.

#include <stdint.h>
#include <stddef.h>
#include "config.h"

#ifdef ARDUINO
#include <Arduino.h>
#include <Wire.h>
#include <BH1750.h>
#endif

namespace stresskb {

class LightSensor {
public:
    LightSensor() : isPresent_(false), lastSampleMillis_(0), currentLux_(0.0f) {}

    bool begin() {
#ifdef ARDUINO
        #if HAS_BH1750
        Wire.beginTransmission(I2C_ADDR_BH1750);
        if (Wire.endTransmission() == 0) {
            if (bh1750_.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, I2C_ADDR_BH1750, &Wire)) {
                isPresent_ = true;
                return true;
            }
        }
        #endif
        isPresent_ = false;
        Serial.println("WARN,SENSOR_BH1750,Not detected");
        return false;
#else
        // Host simulation: present if HAS_BH1750 != 0
        isPresent_ = (HAS_BH1750 != 0);
        return isPresent_;
#endif
    }

    bool isPresent() const {
        return isPresent_;
    }

    void setSimulatedLux(float lux) {
        currentLux_ = lux;
    }

    // Call periodically from loop()
    bool update(unsigned long nowMillis, float& outLux) {
        if (!isPresent_) {
            outLux = currentLux_; // 0.0 or replay
            return false;
        }

        if (nowMillis - lastSampleMillis_ >= LUX_SAMPLE_INTERVAL_MS) {
            lastSampleMillis_ = nowMillis;
#ifdef ARDUINO
            currentLux_ = bh1750_.readLightLevel();
            if (currentLux_ < 0.0f) {
                currentLux_ = 0.0f;
            }
#endif
            outLux = currentLux_;
            return true; // New sample available
        }
        outLux = currentLux_;
        return false;
    }

    float getLux() const {
        return currentLux_;
    }

private:
    bool isPresent_;
    unsigned long lastSampleMillis_;
    float currentLux_;
#ifdef ARDUINO
    BH1750 bh1750_;
#endif
};

} // namespace stresskb
