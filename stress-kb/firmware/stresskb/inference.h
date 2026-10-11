#pragma once

// inference.h — TinyML Model Inference and Feature Normalisation
// Contract per PROTOCOL.md, FEATURES.md, and MILESTONES.md M6

#include <stdint.h>
#include <stddef.h>
#include <math.h>
#include <algorithm>
#include "config.h"
#include "features.h"
#include "model/model_config.h"
#include "model/stress_model.h"

namespace stresskb {

struct InferenceResult {
    uint32_t winId;
    uint8_t cls;      // 0: Low, 1: Medium, 2: High, 255: None
    float p[3];       // p_low, p_med, p_high
    uint8_t state;    // 0: OK, 1: UNCERTAIN, 2: INSUFFICIENT, 3: NO_BASELINE
    float z[18];      // All 18 normalised z-features (used by pattern flags)
};

class ModelInference {
public:
    static inline float clampZ(float val, float minVal = -5.0f, float maxVal = 5.0f) {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }

    // Normalises raw features into all 18 z-scores per FEATURES.md
    static void computeZFeatures(const WindowFeatures& wf,
                                 const float* user_mu,
                                 const float* user_sd_eff,
                                 bool has_baseline,
                                 float* out_z) {
        // 1. Model-input transform
        float x[18];
        for (int i = 0; i < 16; i++) {
            x[i] = wf.f[i];
        }
        float lux_mean = (wf.f[16] > 0.0f) ? wf.f[16] : 0.0f;
        float lux_std = (wf.f[17] > 0.0f) ? wf.f[17] : 0.0f;
        x[16] = logf(1.0f + lux_mean);
        x[17] = lux_std / (lux_mean + 1.0f);

        // 2. Select baseline
        const float* mu = has_baseline ? user_mu : MODEL_ALL_GLOBAL_MU;
        const float* sd_eff = has_baseline ? user_sd_eff : MODEL_ALL_GLOBAL_SD_EFF;

        // 3. Compute z-scores with [-5, 5] clipping
        for (int i = 0; i < 18; i++) {
            float denom = (sd_eff[i] > 1e-4f) ? sd_eff[i] : 1e-3f;
            out_z[i] = clampZ((x[i] - mu[i]) / denom, -5.0f, 5.0f);
        }
    }

    // Runs TinyML inference on a closed window
    static InferenceResult predict(const WindowFeatures& wf,
                                   const float* user_mu,
                                   const float* user_sd_eff,
                                   bool has_baseline) {
        InferenceResult res;
        res.winId = wf.winId;
        res.p[0] = 0.0f;
        res.p[1] = 0.0f;
        res.p[2] = 0.0f;

        // Compute 18 z-features
        computeZFeatures(wf, user_mu, user_sd_eff, has_baseline, res.z);

        if (!wf.valid) {
            res.cls = 255;
            res.state = 2; // INSUFFICIENT
            return res;
        }

        // Extract selected feature subset
        float model_input[MODEL_N_FEATURES];
        for (int i = 0; i < MODEL_N_FEATURES; i++) {
            uint8_t idx = MODEL_FEATURE_INDICES[i];
            model_input[i] = res.z[idx];
        }

        // Run emlearn C Random Forest prediction
        stress_model_predict_proba(model_input, MODEL_N_FEATURES, res.p, MODEL_N_CLASSES);

        // Determine predicted class (argmax) and confidence (max)
        uint8_t bestCls = 0;
        float maxProb = res.p[0];
        for (uint8_t c = 1; c < MODEL_N_CLASSES; c++) {
            if (res.p[c] > maxProb) {
                maxProb = res.p[c];
                bestCls = c;
            }
        }
        res.cls = bestCls;

        // Determine classification state
        if (!has_baseline) {
            res.state = 3; // NO_BASELINE
        } else if (maxProb < CONFIDENCE_GATE) {
            res.state = 1; // UNCERTAIN
        } else {
            res.state = 0; // OK
        }

        return res;
    }
};

} // namespace stresskb
