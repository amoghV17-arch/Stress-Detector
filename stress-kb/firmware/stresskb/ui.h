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

#ifdef ARDUINO
// Lightweight zero-dependency PCF8574 16x2 I2C LCD driver
class LCD1602_I2C {
public:
    LCD1602_I2C(uint8_t addr = 0x27) : addr_(addr), backlight_(0x08) {}

    bool begin() {
        Wire.beginTransmission(addr_);
        if (Wire.endTransmission() != 0) return false;

        delay(50);
        write4Bits(0x03 << 4);
        delayMicroseconds(4500);
        write4Bits(0x03 << 4);
        delayMicroseconds(4500);
        write4Bits(0x03 << 4);
        delayMicroseconds(150);
        write4Bits(0x02 << 4);

        send(0x28, 0); // 2 lines, 5x8 dots
        send(0x0C, 0); // Display ON, cursor OFF, blink OFF
        clear();
        send(0x06, 0); // Entry mode: increment
        return true;
    }

    void clear() {
        send(0x01, 0);
        delayMicroseconds(2000);
    }

    void setCursor(uint8_t col, uint8_t row) {
        int row_offsets[] = { 0x00, 0x40, 0x14, 0x54 };
        send(0x80 | (col + row_offsets[row & 1]), 0);
    }

    void printPadded(const char* str, uint8_t width = 16) {
        uint8_t len = 0;
        if (str) {
            while (*str && len < width) {
                send((uint8_t)(*str++), 1);
                len++;
            }
        }
        while (len < width) {
            send(' ', 1);
            len++;
        }
    }

private:
    uint8_t addr_;
    uint8_t backlight_;

    void send(uint8_t value, uint8_t mode) {
        uint8_t high = value & 0xF0;
        uint8_t low = (value << 4) & 0xF0;
        write4Bits(high | mode);
        write4Bits(low | mode);
    }

    void write4Bits(uint8_t value) {
        expanderWrite(value);
        pulseEnable(value);
    }

    void expanderWrite(uint8_t data) {
        Wire.beginTransmission(addr_);
        Wire.write(data | backlight_);
        Wire.endTransmission();
    }

    void pulseEnable(uint8_t data) {
        expanderWrite(data | 0x04);
        delayMicroseconds(1);
        expanderWrite(data & ~0x04);
        delayMicroseconds(50);
    }
};
#endif

enum class DisplayDevice {
    NONE,
    OLED_SSD1306,
    LCD_1602
};

class DisplayController {
public:
    DisplayController() : isPresent_(false), devType_(DisplayDevice::NONE), i2cAddr_(I2C_ADDR_OLED) {}

    bool begin() {
#ifdef ARDUINO
        // 1. Probe 16x2 I2C LCD (0x27 or 0x3F)
        Wire.beginTransmission(I2C_ADDR_LCD1602);
        if (Wire.endTransmission() == 0) {
            i2cAddr_ = I2C_ADDR_LCD1602;
            lcd_ = new LCD1602_I2C(i2cAddr_);
            if (lcd_->begin()) {
                devType_ = DisplayDevice::LCD_1602;
                isPresent_ = true;
                lcd_->setCursor(0, 0);
                lcd_->printPadded("StressKB Ready");
                lcd_->setCursor(0, 1);
                lcd_->printPadded("Connected 115200");
                return true;
            }
        } else {
            Wire.beginTransmission(0x3F);
            if (Wire.endTransmission() == 0) {
                i2cAddr_ = 0x3F;
                lcd_ = new LCD1602_I2C(i2cAddr_);
                if (lcd_->begin()) {
                    devType_ = DisplayDevice::LCD_1602;
                    isPresent_ = true;
                    lcd_->setCursor(0, 0);
                    lcd_->printPadded("StressKB Ready");
                    lcd_->setCursor(0, 1);
                    lcd_->printPadded("Connected 115200");
                    return true;
                }
            }
        }

        // 2. Probe SSD1306 OLED (0x3C or 0x3D)
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
            devType_ = DisplayDevice::OLED_SSD1306;
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
    DisplayDevice getDeviceType() const { return devType_; }

    void render(const DisplayData& data) {
        FormattedScreen fs = computeScreenLayout(data);
#ifdef ARDUINO
        if (!isPresent_) return;

        // Render on 16x2 I2C LCD
        if (devType_ == DisplayDevice::LCD_1602 && lcd_) {
            char line1[17];
            char line2[17];
            if (data.screen == ScreenType::MAIN) {
                snprintf(line1, sizeof(line1), "%-11s %2.0f%%", fs.title, (double)(data.confidence * 100.0f));
                snprintf(line2, sizeof(line2), "%-16s", fs.statusLine);
            } else if (data.screen == ScreenType::CAL) {
                snprintf(line1, sizeof(line1), "CALIBRATING...  ");
                snprintf(line2, sizeof(line2), "Win: %u/6 Valid", (unsigned int)data.calWindows);
            } else {
                snprintf(line1, sizeof(line1), "%-16s", fs.title);
                snprintf(line2, sizeof(line2), "%-16s", fs.metricLine);
            }
            lcd_->setCursor(0, 0);
            lcd_->printPadded(line1, 16);
            lcd_->setCursor(0, 1);
            lcd_->printPadded(line2, 16);
            return;
        }

        // Render on SSD1306 OLED
        if (devType_ == DisplayDevice::OLED_SSD1306 && oled_) {
            oled_->clearDisplay();
            oled_->setTextSize(1);
            oled_->setTextColor(SSD1306_WHITE);
            oled_->setCursor(0, 0);
            oled_->println(fs.title);
            oled_->drawFastHLine(0, 12, 128, SSD1306_WHITE);
            oled_->setCursor(0, 18);
            oled_->println(fs.metricLine);
            oled_->setCursor(0, 32);
            oled_->println(fs.statusLine);
            oled_->setCursor(0, 48);
            oled_->println(fs.footerLine);
            oled_->display();
            return;
        }
#else
        (void)fs;
#endif
    }

private:
    bool isPresent_;
    DisplayDevice devType_;
    uint8_t i2cAddr_;
#ifdef ARDUINO
    Adafruit_SSD1306* oled_{nullptr};
    LCD1602_I2C* lcd_{nullptr};
#endif
};

} // namespace stresskb
