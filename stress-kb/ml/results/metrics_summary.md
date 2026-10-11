# Model Performance Evaluation Summary

> [!WARNING]
> **SYNTHETIC — NOT REAL RESULTS**
> These metrics and tables were generated using synthetic participant sessions (`tools/synth_data.py`).
> They validate pipeline functionality and TinyML export, but do not represent physical human participant findings.


- **Dataset**: 10 participants, 760 valid windows (30s window / 15s hop)
- **Validation Protocol**: GroupKFold (grouped by participant, 0% cross-fold leakage)

## Overall Model Comparison

| Model | Target Task | Features Used | Accuracy | Macro F1-Score |
|---|---|---|---|---|
| Random Forest (100 trees) | Self-Report Stress (3-Class) | All 18 features | 0.941 | 0.644 |
| MLP Classifier (32x16) | Self-Report Stress (3-Class) | All 18 features | 0.899 | 0.624 |
| **Random Forest (Deployable)** | **Self-Report Stress (3-Class)** | **Top 10 selected features** | **0.939** | **0.644** |
| Random Forest (Secondary) | Experimental Condition (Binary) | All 18 features | 0.993 | 0.993 |

### Selected Feature Subset for TinyML Deployment
The top 10 features selected for firmware deployment on ESP32 Dev Module:

| Index | Feature Code | Description | Importance |
|---|---|---|---|
| 2 | `iki_mean` | Feature index #2 per FEATURES.md | 0.1637 |
| 3 | `iki_std` | Feature index #3 per FEATURES.md | 0.0597 |
| 5 | `dwell_mean` | Feature index #5 per FEATURES.md | 0.1732 |
| 8 | `bksp_rate` | Feature index #8 per FEATURES.md | 0.0928 |
| 9 | `bksp_bursts` | Feature index #9 per FEATURES.md | 0.0801 |
| 10 | `err_rate` | Feature index #10 per FEATURES.md | 0.0719 |
| 11 | `corr_latency` | Feature index #11 per FEATURES.md | 0.0360 |
| 12 | `post_err_slow` | Feature index #12 per FEATURES.md | 0.0463 |
| 16 | `focus_loss` | Feature index #16 per FEATURES.md | 0.1061 |
| 17 | `lux_mean_log` | Feature index #17 per FEATURES.md | 0.0716 |
