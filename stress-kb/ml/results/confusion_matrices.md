# Confusion Matrix Breakdown

> [!WARNING]
> **SYNTHETIC — NOT REAL RESULTS**
> These metrics and tables were generated using synthetic participant sessions (`tools/synth_data.py`).
> They validate pipeline functionality and TinyML export, but do not represent physical human participant findings.


Out-of-fold confusion matrix for the deployable Random Forest model on 3-class stress target (Low: 0, Medium: 1, High: 2).

| True Class \ Predicted | Predicted Low | Predicted Medium | Predicted High | Total |
|---|---|---|---|---|
| **True Low** | 379 | 0 | 1 | 380 |
| **True Medium** | 0 | 0 | 38 | 38 |
| **True High** | 3 | 4 | 335 | 342 |

### Per-Class Recall and Precision
| Class | Precision | Recall | Support |
|---|---|---|---|
| Low | 0.992 | 0.997 | 380 |
| Medium | 0.000 | 0.000 | 38 |
| High | 0.896 | 0.980 | 342 |
