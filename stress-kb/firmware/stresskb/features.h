#pragma once

// features.h — Window engine and 18-feature extraction per docs/FEATURES.md
// Plain C++17 header with no Arduino dependencies. Fully host-testable.

#include <stdint.h>
#include <stddef.h>
#include <math.h>
#include <algorithm>
#include <vector>
#include "config.h"

namespace stresskb {

struct KeyEvent {
    uint32_t seq{0};
    uint32_t t{0};
    uint32_t dwell{0};
    char cls{'M'};
    uint8_t err{0};
};

struct FocusEvent {
    uint32_t seq{0};
    uint32_t t{0};
    uint8_t v{0};
};

struct LuxSample {
    uint32_t t{0};
    float lux{0.0f};
};

struct WindowFeatures {
    uint32_t winId{0};
    uint32_t tEnd{0};
    uint32_t nKeys{0};
    uint8_t valid{0};
    float f[18]{0.0f};
};

// Welford's online algorithm for computing population mean and variance
struct Welford {
    size_t count{0};
    double mean{0.0};
    double M2{0.0};

    void add(double x) {
        count++;
        double delta = x - mean;
        mean += delta / count;
        double delta2 = x - mean;
        M2 += delta * delta2;
    }

    double getMean() const {
        return count > 0 ? mean : 0.0;
    }

    double getVariance() const {
        return count > 0 ? M2 / count : 0.0; // Population variance
    }

    double getStd() const {
        return sqrt(getVariance());
    }
};

class WindowEngine {
public:
    using WindowCallback = void (*)(const WindowFeatures& feat, void* userData);

    WindowEngine(WindowCallback cb = nullptr, void* userData = nullptr)
        : callback_(cb), userData_(userData) {
        reset();
    }

    void reset() {
        openWinIdx_ = 0;
        kBuffer_.clear();
        fBuffer_.clear();
        luxBuffer_.clear();
    }

    void addKey(uint32_t seq, uint32_t t, uint32_t dwell, char cls, uint8_t err) {
        KeyEvent ev{seq, t, dwell, cls, err};
        kBuffer_.push_back(ev);
        checkWindowClosures(t);
    }

    void addFocus(uint32_t seq, uint32_t t, uint8_t v) {
        FocusEvent ev{seq, t, v};
        fBuffer_.push_back(ev);
        checkWindowClosures(t);
    }

    void addHeartbeat(uint32_t t) {
        checkWindowClosures(t);
    }

    void addLux(uint32_t t, float lux) {
        LuxSample s{t, lux};
        luxBuffer_.push_back(s);
        checkWindowClosures(t);
    }

    uint32_t getOpenWindowIndex() const {
        return openWinIdx_;
    }

private:
    WindowCallback callback_{nullptr};
    void* userData_{nullptr};
    uint32_t openWinIdx_{0};

    std::vector<KeyEvent> kBuffer_;
    std::vector<FocusEvent> fBuffer_;
    std::vector<LuxSample> luxBuffer_;

    void checkWindowClosures(uint32_t currentT) {
        while (true) {
            uint32_t winStart = 15000 * openWinIdx_;
            uint32_t winEnd = winStart + 30000;
            if (currentT < winEnd) {
                break;
            }
            closeWindow(openWinIdx_, winStart, winEnd);
            openWinIdx_++;

            // Prune old events that will never fall into future windows
            // The next window starts at 15000 * openWinIdx_
            uint32_t nextWinStart = 15000 * openWinIdx_;
            pruneBuffers(nextWinStart);
        }
    }

    void pruneBuffers(uint32_t minT) {
        // Remove elements with t < minT
        auto kIt = std::remove_if(kBuffer_.begin(), kBuffer_.end(), [minT](const KeyEvent& e) {
            return e.t < minT;
        });
        kBuffer_.erase(kIt, kBuffer_.end());

        auto fIt = std::remove_if(fBuffer_.begin(), fBuffer_.end(), [minT](const FocusEvent& e) {
            return e.t < minT;
        });
        fBuffer_.erase(fIt, fBuffer_.end());

        auto luxIt = std::remove_if(luxBuffer_.begin(), luxBuffer_.end(), [minT](const LuxSample& e) {
            return e.t < minT;
        });
        luxBuffer_.erase(luxIt, luxBuffer_.end());
    }

    void closeWindow(uint32_t winId, uint32_t winStart, uint32_t winEnd) {
        WindowFeatures wf;
        wf.winId = winId;
        wf.tEnd = winEnd;

        // Gather events in [winStart, winEnd)
        std::vector<KeyEvent> kWin;
        for (const auto& e : kBuffer_) {
            if (e.t >= winStart && e.t < winEnd) {
                kWin.push_back(e);
            }
        }

        std::vector<FocusEvent> fWin;
        for (const auto& e : fBuffer_) {
            if (e.t >= winStart && e.t < winEnd) {
                fWin.push_back(e);
            }
        }

        std::vector<LuxSample> luxWin;
        for (const auto& e : luxBuffer_) {
            if (e.t >= winStart && e.t < winEnd) {
                luxWin.push_back(e);
            }
        }

        uint32_t nKeys = (uint32_t)kWin.size();
        wf.nKeys = nKeys;

        // Check short IKIs
        std::vector<uint32_t> shortIkis;
        uint32_t longPauses = 0;
        double longPauseSum = 0.0;

        for (size_t i = 1; i < nKeys; i++) {
            uint32_t iki = kWin[i].t - kWin[i - 1].t;
            if (iki <= 2000) {
                shortIkis.push_back(iki);
            } else {
                longPauses++;
                longPauseSum += std::min((double)iki, 30000.0);
            }
        }

        bool isValid = (nKeys >= 20) && (shortIkis.size() >= 3);
        wf.valid = isValid ? 1 : 0;

        if (!isValid) {
            for (int i = 0; i < 18; i++) wf.f[i] = 0.0f;
            if (callback_) callback_(wf, userData_);
            return;
        }

        // 1. kpm
        wf.f[0] = (float)(nKeys / 0.5);

        // 2. iki_mean, 3. iki_std, 4. iki_cv
        Welford ikiWelford;
        for (auto iki : shortIkis) ikiWelford.add((double)iki);
        double ikiMean = ikiWelford.getMean();
        double ikiStd = ikiWelford.getStd();
        wf.f[1] = (float)ikiMean;
        wf.f[2] = (float)ikiStd;
        wf.f[3] = (float)(ikiMean > 0.0 ? ikiStd / ikiMean : 0.0);

        // 5. dwell_mean, 6. dwell_std (dwell > 0, clipped to 2000)
        Welford dwellWelford;
        for (const auto& e : kWin) {
            if (e.dwell > 0) {
                double d = std::min(2000.0, (double)e.dwell);
                dwellWelford.add(d);
            }
        }
        wf.f[4] = (float)dwellWelford.getMean();
        wf.f[5] = (float)dwellWelford.getStd();

        // 7. overlap_ratio
        size_t overlapPairs = 0;
        size_t overlapCount = 0;
        for (size_t i = 1; i < nKeys; i++) {
            const auto& prev = kWin[i - 1];
            const auto& curr = kWin[i];
            uint32_t iki = curr.t - prev.t;
            if (iki <= 2000 && prev.dwell > 0) {
                overlapPairs++;
                if (curr.t < prev.t + std::min(2000u, prev.dwell)) {
                    overlapCount++;
                }
            }
        }
        wf.f[6] = (float)(overlapPairs > 0 ? (double)overlapCount / overlapPairs : 0.0);

        // 8. bksp_rate
        size_t bkspCount = 0;
        for (const auto& e : kWin) if (e.cls == 'B') bkspCount++;
        wf.f[7] = (float)((double)bkspCount / nKeys);

        // 9. bksp_bursts
        size_t bkspBursts = 0;
        size_t currentBRun = 0;
        for (const auto& e : kWin) {
            if (e.cls == 'B') {
                currentBRun++;
                if (currentBRun == 3) bkspBursts++;
            } else {
                currentBRun = 0;
            }
        }
        wf.f[8] = (float)bkspBursts;

        // 10. err_rate
        size_t lspCount = 0;
        size_t errCount = 0;
        for (const auto& e : kWin) {
            if (e.cls == 'L' || e.cls == 'S' || e.cls == 'P') lspCount++;
            if (e.err == 1) errCount++;
        }
        wf.f[9] = (float)((double)errCount / std::max((size_t)1, lspCount));

        // 11. corr_latency
        double corrLatSum = 0.0;
        size_t corrLatCount = 0;
        for (size_t i = 0; i < nKeys; i++) {
            if (kWin[i].err == 1) {
                for (size_t j = i + 1; j < nKeys; j++) {
                    if (kWin[j].cls == 'B') {
                        uint32_t dt = kWin[j].t - kWin[i].t;
                        if (dt <= 10000) {
                            corrLatSum += dt;
                            corrLatCount++;
                        }
                        break;
                    }
                }
            }
        }
        wf.f[10] = (float)(corrLatCount > 0 ? corrLatSum / corrLatCount : 0.0);

        // 12. post_err_slow
        double postErrSum = 0.0;
        size_t postErrCount = 0;
        for (size_t i = 0; i < nKeys; i++) {
            if (kWin[i].err == 1) {
                double gapSum = 0.0;
                size_t gapCount = 0;
                for (size_t j = i + 1; j < std::min(nKeys, i + 4); j++) {
                    uint32_t gap = kWin[j].t - kWin[j - 1].t;
                    if (gap <= 2000) {
                        gapSum += gap;
                        gapCount++;
                    }
                }
                if (gapCount > 0 && ikiMean > 0.0) {
                    double m = gapSum / gapCount;
                    postErrSum += (m / ikiMean);
                    postErrCount++;
                }
            }
        }
        wf.f[11] = (float)(postErrCount > 0 ? postErrSum / postErrCount : 1.0);

        // 13. long_pauses
        wf.f[12] = (float)longPauses;

        // 14. idle_frac
        wf.f[13] = (float)std::min(1.0, longPauseSum / 30000.0);

        // 15. burstiness
        wf.f[14] = (float)((ikiStd + ikiMean > 0.0) ? (ikiStd - ikiMean) / (ikiStd + ikiMean) : 0.0);

        // 16. focus_loss
        size_t focusLoss = 0;
        for (const auto& e : fWin) if (e.v == 0) focusLoss++;
        wf.f[15] = (float)focusLoss;

        // 17. lux_mean, 18. lux_std
        if (!luxWin.empty()) {
            Welford luxWelford;
            for (const auto& s : luxWin) luxWelford.add((double)s.lux);
            wf.f[16] = (float)luxWelford.getMean();
            wf.f[17] = (float)luxWelford.getStd();
        } else {
            wf.f[16] = 0.0f;
            wf.f[17] = 0.0f;
        }

        if (callback_) {
            callback_(wf, userData_);
        }
    }
};

} // namespace stresskb
