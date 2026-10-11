#pragma once

// ui.h — OLED Display (SSD1306) and Screen State Formatter per docs/MILESTONES.md M3
// Screen state logic as pure function with host tests.

#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include "config.h"

#ifdef ARDUINO
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#endif

namespace stresskb {

enum class ScreenType {
    MAIN,
    CAL,
    LINK_LOST,
    INSUFFICIENT,
    UNCERTAIN
};

struct DisplayData {
    ScreenType screen{ScreenType::MAIN};
    uint8_t stressLevel{0};     // 0: Low, 1: Med, 2: High
    float confidence{0.0f};     // 0.0 - 1.0
    uint8_t patternFlags{0};    // Bitmask
    float lux{0.0f};            // Lux reading
    bool linkOk{true};          // Watchdog link status
    uint32_t calWindows{0};     // Valid calibration windows count
    uint32_t totalKeys{0};
};

struct FormattedScreen {
    char title[24]{0};
    char metricLine[24]{0};
    char statusLine[24]{0};
    char footerLine[24]{0};
};

/**
 * Pure function: formats text lines for each screen state.
 * Fully host-testable without any hardware or Arduino libraries.
 */
inline FormattedScreen computeScreenLayout(const DisplayData& d) {
    FormattedScreen s;

    if (!d.linkOk || d.screen == ScreenType::LINK_LOST) {
        snprintf(s.title, sizeof(s.title), "! LINK LOST !");
        snprintf(s.metricLine, sizeof(s.metricLine), "No serial traffic");
        snprintf(s.statusLine, sizeof(s.statusLine), "Check USB cable");
        snprintf(s.footerLine, sizeof(s.footerLine), "Motor Stopped");
        return s;
    }

    switch (d.screen) {
        case ScreenType::CAL:
            snprintf(s.title, sizeof(s.title), "CALIBRATION");
            snprintf(s.metricLine, sizeof(s.metricLine), "Windows: %u / 6", (unsigned int)d.calWindows);
            snprintf(s.statusLine, sizeof(s.statusLine), d.calWindows >= 6 ? "Baseline Ready" : "Type normally...");
            snprintf(s.footerLine, sizeof(s.footerLine), "Lux: %.0f lx", d.lux);
            break;

        case ScreenType::INSUFFICIENT:
            snprintf(s.title, sizeof(s.title), "INSUFFICIENT");
            snprintf(s.metricLine, sizeof(s.metricLine), "Keys: %u (< 20)", (unsigned int)d.totalKeys);
            snprintf(s.statusLine, sizeof(s.statusLine), "Keep typing...");
            snprintf(s.footerLine, sizeof(s.footerLine), "Lux: %.0f lx", d.lux);
            break;

        case ScreenType::UNCERTAIN:
            snprintf(s.title, sizeof(s.title), "UNCERTAIN");
            snprintf(s.metricLine, sizeof(s.metricLine), "Conf: %.0f%% (< 60%%)", d.confidence * 100.0f);
            snprintf(s.statusLine, sizeof(s.statusLine), "Evaluating...");
            snprintf(s.footerLine, sizeof(s.footerLine), "Lux: %.0f lx", d.lux);
            break;

        case ScreenType::MAIN:
        default: {
            const char* levelStr = "LOW";
            if (d.stressLevel == 1) levelStr = "MED";
            else if (d.stressLevel == 2) levelStr = "HIGH";

            snprintf(s.title, sizeof(s.title), "STRESS: %s", levelStr);
            snprintf(s.metricLine, sizeof(s.metricLine), "Conf: %.0f%%", d.confidence * 100.0f);

            // Determine dominant pattern flag
            const char* flagStr = "STEADY";
            if (d.patternFlags & FLAG_RUSHED) flagStr = "RUSHED";
            else if (d.patternFlags & FLAG_FRUSTRATED) flagStr = "FRUSTRATED";
            else if (d.patternFlags & FLAG_HESITANT) flagStr = "HESITANT";
            else if (d.patternFlags & FLAG_FATIGUED) flagStr = "FATIGUED";
            else if (d.patternFlags & FLAG_DISTRACTED) flagStr = "DISTRACTED";
            else if (d.patternFlags & FLAG_FOCUSED) flagStr = "FOCUSED";

            snprintf(s.statusLine, sizeof(s.statusLine), "Mode: %s", flagStr);
            snprintf(s.footerLine, sizeof(s.footerLine), "Lux: %.0f | Link OK", d.lux);
            break;
        }
    }

    return s;
}

class DisplayController {
public:
    DisplayController() : isPresent_(false), i2cAddr_(I2C_ADDR_OLED) {}

    bool begin() {
#ifdef ARDUINO
        #if HAS_OLED
        Wire.beginTransmission(I2C_ADDR_OLED);
        if (Wire.endTransmission() == 0) {
            i2cAddr_ = I2C_ADDR_OLED;
        } else {
            Wire.beginTransmission(0x3D);
            if (Wire.endTransmission() == 0) {
                i2cAddr_ = 0x3D;
            } else {
                isPresent_ = false;
                return false;
            }
        }

        oled_ = new Adafruit_SSD1306(128, 64, &Wire, -1);
        if (oled_->begin(SSD1306_SWITCHCAPVCC, i2cAddr_)) {
            isPresent_ = true;
            oled_->clearDisplay();
            oled_->setTextSize(1);
            oled_->setTextColor(SSD1306_WHITE);
            oled_->setCursor(0, 0);
            oled_->println("StressKB Initialized");
            oled_->display();
            return true;
        }
        #endif
        isPresent_ = false;
        return false;
#else
        isPresent_ = (HAS_OLED != 0);
        return isPresent_;
#endif
    }

    bool isPresent() const { return isPresent_; }

    void render(const DisplayData& data) {
        FormattedScreen fs = computeScreenLayout(data);
#ifdef ARDUINO
        if (!isPresent_ || !oled_) return;
        oled_->clearDisplay();
        oled_->setTextSize(1);
        oled_->setTextColor(SSD1306_WHITE);

        // Title
        oled_->setCursor(0, 0);
        oled_->println(fs.title);

        // Divider
        oled_->drawFastHLine(0, 12, 128, SSD1306_WHITE);

        // Metric line
        oled_->setCursor(0, 18);
        oled_->println(fs.metricLine);

        // Status line
        oled_->setCursor(0, 32);
        oled_->println(fs.statusLine);

        // Footer line
        oled_->setCursor(0, 48);
        oled_->println(fs.footerLine);

        oled_->display();
#else
        (void)fs;
#endif
    }

private:
    bool isPresent_;
    uint8_t i2cAddr_;
#ifdef ARDUINO
    Adafruit_SSD1306* oled_{nullptr};
#endif
};

} // namespace stresskb
