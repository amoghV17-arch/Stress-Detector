#pragma once

// decision.h — Decision Layer, Pattern Flags, and Baseline Calibration Storage
// Contract per PROTOCOL.md, FEATURES.md, and MILESTONES.md M7

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>
#include <vector>
#include <string>
#include <algorithm>

#include "config.h"
#include "features.h"
#include "inference.h"

#ifdef ARDUINO
#include <Preferences.h>
#endif

namespace stresskb {

// ============================================================================
// Behaviour Pattern Flags Engine
// ============================================================================
class PatternFlagsEngine {
private:
    struct WindowHistory {
        float z_kpm;
        float z_err_rate;
    };
    static const size_t MAX_HISTORY = 8;
    WindowHistory history[MAX_HISTORY];
    size_t historyCount = 0;

public:
    void reset() {
        historyCount = 0;
    }

    uint8_t evaluateFlags(const WindowFeatures& wf, const float z[18]) {
        if (!wf.valid) {
            return 0;
        }

        uint8_t flags = 0;

        float z_kpm = z[0];
        float z_iki_cv = z[3];
        float z_bksp_bursts = z[8];
        float z_err_rate = z[9];
        float z_long_pauses = z[12];
        float z_idle_frac = z[13];
        float z_burstiness = z[14];
        float focus_loss = wf.f[15]; // raw count of F events with v = 0 in window

        // Bit 0: RUSHED: z_kpm >= 1.0 AND z_err_rate >= 0.5
        if (z_kpm >= 1.0f && z_err_rate >= 0.5f) {
            flags |= FLAG_RUSHED;
        }

        // Bit 1: HESITANT: z_long_pauses >= 1.0 AND z_kpm <= -0.5
        if (z_long_pauses >= 1.0f && z_kpm <= -0.5f) {
            flags |= FLAG_HESITANT;
        }

        // Bit 2: FRUSTRATED: z_bksp_bursts >= 1.0 AND z_burstiness >= 0.5
        if (z_bksp_bursts >= 1.0f && z_burstiness >= 0.5f) {
            flags |= FLAG_FRUSTRATED;
        }

        // Push current window into history for FATIGUED rule
        if (historyCount < MAX_HISTORY) {
            history[historyCount].z_kpm = z_kpm;
            history[historyCount].z_err_rate = z_err_rate;
            historyCount++;
        } else {
            for (size_t i = 1; i < MAX_HISTORY; i++) {
                history[i - 1] = history[i];
            }
            history[MAX_HISTORY - 1].z_kpm = z_kpm;
            history[MAX_HISTORY - 1].z_err_rate = z_err_rate;
        }

        // Bit 3: FATIGUED: over last 6 valid windows:
        // mean z_kpm of last 3 <= first 3 - 0.5 AND mean z_err_rate of last 3 >= first 3 + 0.5
        if (historyCount >= 6) {
            size_t startIdx = historyCount - 6;
            float first3_kpm = (history[startIdx].z_kpm + history[startIdx + 1].z_kpm + history[startIdx + 2].z_kpm) / 3.0f;
            float last3_kpm = (history[startIdx + 3].z_kpm + history[startIdx + 4].z_kpm + history[startIdx + 5].z_kpm) / 3.0f;

            float first3_err = (history[startIdx].z_err_rate + history[startIdx + 1].z_err_rate + history[startIdx + 2].z_err_rate) / 3.0f;
            float last3_err = (history[startIdx + 3].z_err_rate + history[startIdx + 4].z_err_rate + history[startIdx + 5].z_err_rate) / 3.0f;

            if ((last3_kpm <= first3_kpm - 0.5f) && (last3_err >= first3_err + 0.5f)) {
                flags |= FLAG_FATIGUED;
            }
        }

        // Bit 4: DISTRACTED: focus_loss >= 2 OR (z_idle_frac >= 1.0 AND focus_loss >= 1)
        if (focus_loss >= 2.0f || (z_idle_frac >= 1.0f && focus_loss >= 1.0f)) {
            flags |= FLAG_DISTRACTED;
        }

        // Bit 5: FOCUSED: |z_iki_cv| <= 0.5 AND z_err_rate <= 0.25 AND z_long_pauses <= 0.25
        if (fabsf(z_iki_cv) <= 0.5f && z_err_rate <= 0.25f && z_long_pauses <= 0.25f) {
            flags |= FLAG_FOCUSED;
        }

        return flags;
    }
};

// ============================================================================
// Decision Layer Engine
// ============================================================================
struct DecisionOutput {
    float emaScore;
    uint8_t alert;           // 0 or 1
    uint8_t flags;           // pattern flags bitmask
    uint16_t cooldownLeft;   // remaining cooldown in windows
};

class DecisionLayer {
private:
    float emaScore = 0.0f;
    bool hasEma = false;
    uint8_t consecutiveHigh = 0;
    uint16_t cooldownRemaining = 0;
    PatternFlagsEngine flagsEngine;

public:
    DecisionLayer() {
        reset();
    }

    void reset() {
        emaScore = 0.0f;
        hasEma = false;
        consecutiveHigh = 0;
        cooldownRemaining = 0;
        flagsEngine.reset();
    }

    float getEmaScore() const { return emaScore; }
    uint16_t getCooldown() const { return cooldownRemaining; }
    uint8_t getConsecutiveHigh() const { return consecutiveHigh; }

    DecisionOutput update(const WindowFeatures& wf, const InferenceResult& inf) {
        DecisionOutput out;
        out.alert = 0;

        // Evaluate behaviour pattern flags
        out.flags = flagsEngine.evaluateFlags(wf, inf.z);

        // Window score = 0.5 * p_med + 1.0 * p_high per FEATURES.md
        float windowScore = 0.5f * inf.p[1] + 1.0f * inf.p[2];

        // Eligible window: state == 0 (OK) or state == 3 (NO_BASELINE)
        bool isEligible = (inf.state == 0 || inf.state == 3) && wf.valid;

        if (isEligible) {
            if (!hasEma) {
                emaScore = windowScore;
                hasEma = true;
            } else {
                emaScore = DECISION_EMA_ALPHA * windowScore + (1.0f - DECISION_EMA_ALPHA) * emaScore;
            }

            if (cooldownRemaining > 0) {
                cooldownRemaining--;
            } else {
                if (emaScore >= DECISION_ALERT_THRESHOLD) {
                    consecutiveHigh++;
                    if (consecutiveHigh >= DECISION_CONSECUTIVE_WINDOWS) {
                        out.alert = 1;
                        cooldownRemaining = DECISION_COOLDOWN_WINDOWS;
                        consecutiveHigh = 0;
                    }
                } else {
                    consecutiveHigh = 0;
                }
            }
        }

        out.emaScore = emaScore;
        out.cooldownLeft = cooldownRemaining;
        return out;
    }
};

// ============================================================================
// Baseline Storage Interface & Implementations
// ============================================================================
class IBaselineStorage {
public:
    virtual ~IBaselineStorage() {}
    virtual bool loadBaseline(const char* userId, float* outMu, float* outSdEff) = 0;
    virtual bool saveBaseline(const char* userId, const float* inMu, const float* inSdEff) = 0;
    virtual bool hasBaseline(const char* userId) = 0;
};

// In-Memory implementation (used by host tests and fallback)
class InMemoryBaselineStorage : public IBaselineStorage {
private:
    struct UserEntry {
        char userId[16];
        float mu[18];
        float sdEff[18];
        bool inUse;
    };
    static const size_t MAX_USERS = 10;
    UserEntry users[MAX_USERS];

public:
    InMemoryBaselineStorage() {
        for (size_t i = 0; i < MAX_USERS; i++) {
            users[i].inUse = false;
            users[i].userId[0] = '\0';
        }
    }

    bool hasBaseline(const char* userId) override {
        for (size_t i = 0; i < MAX_USERS; i++) {
            if (users[i].inUse && strcmp(users[i].userId, userId) == 0) {
                return true;
            }
        }
        return false;
    }

    bool loadBaseline(const char* userId, float* outMu, float* outSdEff) override {
        for (size_t i = 0; i < MAX_USERS; i++) {
            if (users[i].inUse && strcmp(users[i].userId, userId) == 0) {
                memcpy(outMu, users[i].mu, 18 * sizeof(float));
                memcpy(outSdEff, users[i].sdEff, 18 * sizeof(float));
                return true;
            }
        }
        return false;
    }

    bool saveBaseline(const char* userId, const float* inMu, const float* inSdEff) override {
        // Find existing or free slot
        int freeSlot = -1;
        for (size_t i = 0; i < MAX_USERS; i++) {
            if (users[i].inUse && strcmp(users[i].userId, userId) == 0) {
                memcpy(users[i].mu, inMu, 18 * sizeof(float));
                memcpy(users[i].sdEff, inSdEff, 18 * sizeof(float));
                return true;
            }
            if (!users[i].inUse && freeSlot == -1) {
                freeSlot = (int)i;
            }
        }
        if (freeSlot == -1) freeSlot = 0; // Overwrite oldest
        strncpy(users[freeSlot].userId, userId, 15);
        users[freeSlot].userId[15] = '\0';
        memcpy(users[freeSlot].mu, inMu, 18 * sizeof(float));
        memcpy(users[freeSlot].sdEff, inSdEff, 18 * sizeof(float));
        users[freeSlot].inUse = true;
        return true;
    }
};

#ifdef ARDUINO
// NVS Preferences storage for ESP32
class NVSBaselineStorage : public IBaselineStorage {
private:
    InMemoryBaselineStorage cache;

public:
    bool hasBaseline(const char* userId) override {
        Preferences prefs;
        if (!prefs.begin("stresskb", true)) return cache.hasBaseline(userId);
        char key[16];
        snprintf(key, sizeof(key), "u_%s", userId);
        bool exists = prefs.isKey(key);
        prefs.end();
        return exists;
    }

    bool loadBaseline(const char* userId, float* outMu, float* outSdEff) override {
        Preferences prefs;
        if (!prefs.begin("stresskb", true)) return cache.loadBaseline(userId, outMu, outSdEff);
        char key[16];
        snprintf(key, sizeof(key), "u_%s", userId);
        float buf[36];
        size_t len = prefs.getBytes(key, buf, sizeof(buf));
        prefs.end();
        if (len == sizeof(buf)) {
            memcpy(outMu, buf, 18 * sizeof(float));
            memcpy(outSdEff, &buf[18], 18 * sizeof(float));
            cache.saveBaseline(userId, outMu, outSdEff);
            return true;
        }
        return cache.loadBaseline(userId, outMu, outSdEff);
    }

    bool saveBaseline(const char* userId, const float* inMu, const float* inSdEff) override {
        cache.saveBaseline(userId, inMu, inSdEff);
        Preferences prefs;
        if (!prefs.begin("stresskb", false)) return true;
        char key[16];
        snprintf(key, sizeof(key), "u_%s", userId);
        float buf[36];
        memcpy(buf, inMu, 18 * sizeof(float));
        memcpy(&buf[18], inSdEff, 18 * sizeof(float));
        prefs.putBytes(key, buf, sizeof(buf));
        prefs.end();
        return true;
    }
};
#endif

// ============================================================================
// Calibration Session Collector & Baseline Calculator
// ============================================================================
class Calibrator {
private:
    std::vector<std::vector<float>> validTransformedWindows;

public:
    void reset() {
        validTransformedWindows.clear();
    }

    void addWindow(const WindowFeatures& wf) {
        if (!wf.valid) return;

        // Transform features per FEATURES.md:
        // x17 = ln(1 + lux_mean), x18 = lux_std / (lux_mean + 1)
        std::vector<float> tw(18);
        for (int i = 0; i < 16; i++) {
            tw[i] = wf.f[i];
        }
        float lux_mean = (wf.f[16] > 0.0f) ? wf.f[16] : 0.0f;
        float lux_std = (wf.f[17] > 0.0f) ? wf.f[17] : 0.0f;
        tw[16] = logf(1.0f + lux_mean);
        tw[17] = lux_std / (lux_mean + 1.0f);

        validTransformedWindows.push_back(tw);
    }

    size_t getValidCount() const {
        return validTransformedWindows.size();
    }

    bool computeBaseline(float* outMu, float* outSdEff) const {
        if (validTransformedWindows.size() < 6) {
            return false;
        }

        size_t n = validTransformedWindows.size();
        for (int i = 0; i < 18; i++) {
            float sum = 0.0f;
            for (size_t w = 0; w < n; w++) {
                sum += validTransformedWindows[w][i];
            }
            float mu = sum / (float)n;
            outMu[i] = mu;

            float varSum = 0.0f;
            for (size_t w = 0; w < n; w++) {
                float diff = validTransformedWindows[w][i] - mu;
                varSum += diff * diff;
            }
            float sd = sqrtf(varSum / (float)n); // population standard deviation (ddof=0)
            float sdEff = fmaxf(sd, fmaxf(0.1f * fabsf(mu), 1e-3f));
            outSdEff[i] = sdEff;
        }
        return true;
    }
};

} // namespace stresskb
