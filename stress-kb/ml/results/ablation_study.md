# Feature Ablation Study: Environmental Light Impact

> [!WARNING]
> **SYNTHETIC — NOT REAL RESULTS**
> These metrics and tables were generated using synthetic participant sessions (`tools/synth_data.py`).
> They validate pipeline functionality and TinyML export, but do not represent physical human participant findings.


Ablation comparison between models with and without ambient light sensor inputs (features 17: `lux_mean_log` and 18: `lux_std_rel`).
All models evaluated via 5-fold participant-grouped cross validation on 3-class self-report stress.

| Feature Configuration | Input Features Count | Accuracy | Macro F1 | Delta F1 vs Base |
|---|---|---|---|---|
| Full Multimodal (Typing + Ambient Light) | 18 | 0.941 | 0.644 | Base |
| Keystroke Timing & Dynamics Only (No Light) | 16 | 0.941 | 0.644 | +0.000 |

### Interpretation
Keystroke dynamics provide the primary diagnostic signal for typing stress detection.
Ambient light features provide contextual information (e.g. distinguishing dimly lit night sessions from bright daylight), helping isolate circadian/lighting confounders from typing stress.
