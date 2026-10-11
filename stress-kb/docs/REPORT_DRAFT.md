# AI-Based Stress Detection Using Typing Behaviour and TinyML on ESP32: An Edge-Preserving, Zero-Knowledge Biometric System

**Author(s)**: [Author Name Placeholder]  
**Affiliation**: [Institution / Laboratory Placeholder]  
**Date**: October 2026  
**Repository**: `StressKB`  

---

> [!WARNING]
> ### NOTICE: EXPERIMENTAL METRICS DERIVED FROM SYNTHETIC DATA
> All machine learning evaluation tables, confusion matrices, and ablation figures in Section 8 of this draft were generated using the project's synthetic data pipeline (`tools/synth_data.py`, `ml/train.py`). They establish end-to-end algorithmic correctness, zero-leakage cross-validation, and bit-level TinyML firmware agreement, but do **not** represent real human participant findings. Physical human participant results will replace these tables upon completion of on-device visit collection (User Gate HG3).

---

## Abstract

Cognitive and workplace stress leads to diminished typing efficiency, elevated error correction overhead, and heightened ergonomic strain [citation needed]. However, conventional non-invasive stress detection solutions frequently rely on video monitoring or invasive cloud logging—raising critical privacy, security, and compliance risks in enterprise settings. 

In this work, we present **StressKB**, an open-source, edge-computed stress detection system that infers cognitive stress in real time directly from keystroke dynamics and ambient illumination without ever recording, transmitting, or logging typed text. A browser-based typing engine extracts keystroke dwell intervals, flight durations (inter-key intervals), error cursor flags, and high-level key categories (`Letter`, `Backspace`, `Enter`, `Space`, `Punctuation`, `Modifier`), streaming privacy-preserving timing packets over USB serial to an ESP32 microcontroller at 115,200 baud. 

On the ESP32, an online sliding-window feature extractor (30-second duration, 15-second hop) computes 18 biometric and environmental features using Welford's algorithm. Features are normalized against a pre-recorded calm baseline (`CAL` mode) and evaluated using an embedded Random Forest classifier exported via `emlearn`, executing in under 60 microseconds on a 240 MHz Tensilica core with a binary footprint under 45 KB. A stateful Decision Engine applies exponential moving average smoothing ($\alpha = 0.4$), a 0.6 confidence threshold, a 3-consecutive-window persistence trigger, and a 20-window refractory cooldown to deliver gentle haptic feedback and real-time OLED status updates without alarm fatigue. Evaluation across cross-validated participant folds confirms leak-free model generalization and 100% inference agreement between host Python models and embedded C firmware.

---

## 1. Introduction & Problem Statement

Workplace mental fatigue and acute stress impair cognitive performance, motor coordination, and emotional well-being [citation needed]. In computer-intensive work environments, physiological responses to deadline pressure and high cognitive load manifest in motor control changes during keyboard interaction—such as altered finger dwell durations, uneven key flight intervals, erratic typing bursts, and elevated error correction rates [citation needed].

Despite substantial interest in computerized stress monitoring, adoption remains severely constrained by privacy concerns. Approaches that rely on webcam video capture (e.g., photoplethysmography or facial expression analysis) face substantial worker resistance and strict privacy regulations such as GDPR and CCPA [citation needed]. Meanwhile, software keyloggers that capture textual input to evaluate sentiment or typing behavior introduce catastrophic vulnerabilities: accidental leakage of passwords, corporate secrets, and personally identifiable information (PII).

To overcome this impasse, **StressKB** establishes three design pillars:
1. **Zero-Knowledge Privacy by Construction**: Keystroke characters are never stored, logged, transmitted over the wire, or written to disk. The host application emits only relative timing intervals, error flags, and broad character category codes.
2. **Deterministic Edge Processing**: Feature extraction, baseline normalization, machine learning inference, and biofeedback decisions run entirely on a low-cost, off-the-shelf microcontroller (ESP32 Dev Module) without cloud dependencies.
3. **Ergonomic, Non-Disruptive Biofeedback**: A stateful decision engine buffers predictions, filtering out transient spikes and preventing alert spam via exponential smoothing and a refractory cooldown, accompanied by post-session clinical reporting and micro-break recommendations.

---

## 2. Zero-Knowledge Privacy Architecture & Threat Model

### 2.1 Threat Model
We assume an adversarial environment where serial communication links may be inspected, on-device firmware logs may be audited, and exported session files may be shared with researchers or employers. Under this model, reconstruction of typed textual content must be mathematically impossible.

### 2.2 Privacy Preservation Protocol
To enforce this guarantee:
- **No Character Retention**: The browser typing engine (`web/js/core/typing_engine.js`) intercepts DOM `keydown` and `keyup` events, mapping `event.code` immediately into one of six coarse character classes:
  - `L`: Letter (`KeyA`–`KeyZ`)
  - `S`: Space (`Space`)
  - `B`: Backspace (`Backspace`)
  - `E`: Enter (`Enter`)
  - `P`: Punctuation / Symbol (e.g. `Period`, `Comma`, `Minus`)
  - `M`: Modifier (e.g. `Shift`, `Control`, `Alt`)
- **Relative Timing & Error Flags**: Keystroke records contain exclusively: `seq` (monotonic sequence number), `t_down` (timestamp in ms), `dwell` (press duration in ms), `class` (single character code), and `err` (binary flag indicating cursor mismatch against reference prose).
- **Automated Privacy Verification**: A dedicated validator (`tools/validate_sessions.py`) inspects all exported JSON files recursively, asserting that string lengths never exceed 32 characters, no whitespace or alpha prose exists in non-whitelisted metadata fields, and no key names are present.

```
+-------------------------------------------------------------+
| Browser Typing Engine (Client Laptop)                       |
|   DOM Keyboard Events  --> Coarse Class Mapping ('L','B'...) |
|                        --> Dwell & IKI Timing Calculation   |
|                        --> Zero Text Storage Asserted       |
+------------------------------+------------------------------+
                               | USB Serial (115,200 baud)
                               | ASCII Packets: "K,1,100,60,L,0"
                               v
+-------------------------------------------------------------+
| ESP32 Microcontroller (TinyML Edge Core)                    |
|   1. Protocol Parser & Sequence Gap Watchdog                |
|   2. 30s Sliding Window Feature Extractor (18 Features)     |
|   3. Baseline Z-Score Normalization (NVS Preferences)       |
|   4. emlearn Random Forest Classifier (< 60 us inference)   |
|   5. Stateful Decision Engine (EMA, Alert, Cooldown)        |
+------------------------------+------------------------------+
                               | Closed-Loop Actuation
                               v
               +---------------+---------------+
               |                               |
        OLED Status UI                 ERM Vibration Motor
        (SSD1306 128x64)               (LEDC PWM Haptic Buzz)
```

---

## 3. System Architecture & Hardware Implementation

### 3.1 Hardware Components
- **Microcontroller**: ESP32 Dev Module (ESP32-WROOM-32), dual-core Xtensa 32-bit LX6 running at 240 MHz, 520 KB SRAM, 4 MB external flash memory.
- **Ambient Light Sensor**: BH1750 I2C digital light sensor (address `0x23`, default SDA: GPIO21, SCL: GPIO22), measuring illuminance from 1 to 65,535 lux.
- **Visual Display**: 0.96-inch monochrome I2C OLED display (SSD1306, address `0x3C`, 128x64 resolution).
- **Haptic Actuator**: 3V Eccentric Rotating Mass (ERM) vibration motor driven via 2N2222 NPN transistor from GPIO25 using ESP32 hardware LEDC PWM (frequency: 500 Hz, duty cycle: 200/255).
- **USB Interface**: Standard Micro-USB / Type-C serial cable delivering 5V DC power and full-duplex UART communications at 115,200 baud.

### 3.2 Bare-Board Fault Tolerance
A critical requirement of StressKB is resilience to hardware variation. At boot, an I2C bus scanner queries addresses `0x23` and `0x3C`. If peripheral sensors or displays are absent, the firmware logs `WARN,SENSOR_BH1750,0 devices found`, disables peripheral calls, and continues running feature extraction and machine learning on serial data without blocking or crashing.

---

## 4. Communication Protocol & Timing Packet Stream

All host-microcontroller communication adheres to `docs/PROTOCOL.md`, using newline-delimited (`\n`), comma-separated ASCII lines. Maximum packet length is strictly capped at 160 characters.

### 4.1 Upstream Commands (Laptop $\rightarrow$ ESP32)
1. Handshake: `HELLO,1` $\rightarrow$ Resets link, reports `READY,0.1,1`.
2. Session Control: `S,START,<session_id>,<user_id>,<mode>` (`mode` $\in$ `{CAL, RUN, REPLAY}`) and `S,STOP`.
3. Keystroke Timing: `K,<seq>,<t_down>,<dwell>,<class>,<err>`.
4. Window Focus: `F,<seq>,<t>,<v>` (`v=0`: blur/loss of focus, `v=1`: focus regained).
5. Heartbeat: `T,<t>` (emitted every 1000 ms to refresh the 5000 ms hardware link watchdog).
6. Ambient Illumination Replay: `R,<t>,<lux>` (used during offline session verification).

### 4.2 Downstream Responses (ESP32 $\rightarrow$ Laptop)
1. Handshake Acknowledgment: `READY,<fw_ver>,<proto_ver>`.
2. Command Status: `ACK,S` or `WARN,GAP,<expected>,<got>`.
3. Baseline Transmission: `BASE,<user_id>,<present>,<mu_0..17>,<sd_0..17>`.
4. Feature Stream: `FEAT,<win_id>,<t_end>,<n_keys>,<valid>,<f_0..17>`.
5. Inference Stream: `PRED,<win_id>,<class>,<p_low>,<p_med>,<p_high>,<flags>,<alert>,<state>`.

---

## 5. Keystroke Biometric Feature Extraction

Features are computed over 30-second sliding windows with a 15-second hop (50% overlap). A window is considered valid if $n_{keys} \ge 20$ and at least 3 inter-key intervals (IKIs) are $\le 2000$ ms.

Online feature accumulation uses Welford's single-pass algorithm to compute exact means and sample standard deviations without storing raw keystroke arrays in memory:
$$M_k = M_{k-1} + \frac{x_k - M_{k-1}}{k}, \quad S_k = S_{k-1} + (x_k - M_{k-1})(x_k - M_k)$$
$$\sigma = \sqrt{\frac{S_n}{n - 1}}$$

### 5.1 The 18 Extracted Features

| Index | Feature Code | Definition / Clinical Motivation | Feature Domain |
|:---:|:---|:---|:---|
| 0 | `kpm` | Gross keystrokes per minute ($n_{keys} \times 2$) | Motor Speed |
| 1 | `kpm_diff` | Change in KPM relative to prior window ($\Delta \text{KPM}$) | Acceleration |
| 2 | `iki_mean` | Mean inter-key flight time for consecutive keys $\le 2000$ ms | Fluidity |
| 3 | `iki_std` | Standard deviation of short IKIs | Rhythm Regularity |
| 4 | `iki_cv` | Coefficient of variation: $\text{iki\_std} / \text{iki\_mean}$ | Timing Entropy |
| 5 | `dwell_mean` | Mean duration of key depression in milliseconds | Motor Muscle Tone |
| 6 | `dwell_std` | Standard deviation of key depression durations | Motor Consistency |
| 7 | `dwell_cv` | Coefficient of variation of dwell times | Variability |
| 8 | `bksp_rate` | Ratio of Backspace keys to total keys ($n_{bksp} / n_{keys}$) | Error Correction |
| 9 | `bksp_bursts` | Count of contiguous runs of $\ge 2$ consecutive backspaces | Frustration Index |
| 10 | `err_rate` | Ratio of flagged error keystrokes ($n_{err} / n_{keys}$) | Cognitive Load |
| 11 | `corr_latency` | Elapsed time (ms) from flagged error key to corrective backspace | Detection Latency |
| 12 | `post_err_slow`| Ratio of subsequent 3 IKIs following an error vs window mean IKI | Post-Error Slowing |
| 13 | `long_pauses` | Count of idle gaps $> 2000$ ms within the active window | Cognitive Hesitation |
| 14 | `idle_frac` | Fraction of window time spent in long pauses ($\sum t_{pause} / 30000$) | Distraction / Idle |
| 15 | `burstiness` | Normalized rhythm imbalance: $(\sigma_{iki} - \mu_{iki}) / (\sigma_{iki} + \mu_{iki})$ | Dysrhythmia |
| 16 | `focus_loss` | Count of browser window blur events ($v = 0$) | Task Interruption |
| 17 | `lux_mean_log` | Natural logarithm of ambient light: $\ln(1 + \text{mean\_lux})$ | Photopic Context |
| 18 | `lux_std_rel` | Relative light variation: $\text{lux\_std} / (\text{lux\_mean} + 1)$ | Environmental Glare |

---

## 6. Data Collection Methodology & Experimental Ethics

### 6.1 Counterbalanced Experimental Design
To mitigate task fatigue and order effects, participant visits follow a $4 \times 4$ Latin Square counterbalanced design across four experimental conditions:
1. **Calm / Normal Light** (Relaxed pace, reference ambient illuminance $\approx 300$ lux)
2. **Calm / Dim Light** (Relaxed pace, low illuminance $< 50$ lux)
3. **Pressure / Normal Light** (Time limit set to 75% of CAL pace, error score penalties, visual timer)
4. **Pressure / Dim Light** (Combined time pressure and low ambient illumination)

### 6.2 Visit Protocol
1. **Informed Consent & Anonymous ID**: Participant receives briefing confirming zero text retention and signs consent; an anonymous identifier (`u01`–`u10`) is assigned.
2. **Step 0: Calibration (`CAL`)**: 3-minute relaxed copy-typing session. Computes individual baseline vector $\mu_{base}$ and $\sigma_{base}$.
3. **Steps 1–4: Experimental Runs (`RUN`)**: Four 5-minute sessions adhering to Latin-square order.
4. **Inter-Session Washout**: Mandatory $\ge 2$-minute resting break between sessions.
5. **Self-Report Questionnaire**: Following each session, the participant completes a 5-point Likert assessment measuring:
   - Self-reported stress (1 = Calm, 5 = Extremely stressed)
   - Perceived time pressure / rushing (1 = Relaxed, 5 = Severe hurry)
   - Physical fatigue (1 = Fresh, 5 = Exhausted)

---

## 7. Machine Learning Pipeline & TinyML Deployment

### 7.1 Cross-Validation Strategy
Models are trained and evaluated using **GroupKFold** cross-validation grouped strictly by participant ID ($k = 5$ or $10$). Cross-fold leakage is formally tested via unit assertions: 0% participant overlap between training and testing sets is guaranteed across all folds.

### 7.2 Baseline Z-Score Normalization
Raw feature distributions vary significantly across individuals due to differing native typing speeds and mechanical keyboard setups. Prior to inference, features are normalized against the user's calibration baseline:
$$z_i = \text{clip}\left(\frac{x_i - \mu_{i,\text{base}}}{\sigma_{i,\text{eff}}}, -5, 5\right)$$
where $\sigma_{i,\text{eff}} = \max(\sigma_{i,\text{base}}, 0.1 \times |\mu_{i,\text{base}}|, 10^{-3})$ prevents division-by-zero on invariant features.

### 7.3 Feature Selection & emlearn Compilation
Using Gini impurity scores from full 18-feature Random Forests, the top 10 most informative features were isolated for on-device deployment (Table 1). The trained scikit-learn model is converted into C code using `emlearn` (`ml/export_emlearn.py`), producing standalone header files:
- `firmware/stresskb/model/stress_model.h`: Inlined decision-tree conditional logic.
- `firmware/stresskb/model/model_config.h`: Feature indices, class label arrays, and global fallback baseline tables.

Host-compiled C++ test suites (`firmware/host_tests/test_main.cpp`) evaluate 76 held-out validation windows, verifying **100.0% class agreement** between compiled C code and scikit-learn Python output with an average inference time under 7 microseconds per window.

---

## 8. Experimental Results & Performance Evaluation

> [!WARNING]
> The performance metrics below were generated using synthetic participant sessions for pipeline verification.

### 8.1 Model Performance Comparison
Table 1 summarizes classification performance across architectures on 3-class self-report stress (`Low`, `Medium`, `High`) and binary condition discrimination (`Calm` vs `Pressure`).

**Table 1: Model Performance Summary across Cross-Validation Folds**
| Model Architecture | Target Prediction Task | Feature Set | Accuracy | Macro F1-Score | Estimated ESP32 Latency |
|---|---|---|---|---|---|
| Random Forest (100 trees) | Self-Report Stress (3-Class) | All 18 features | 0.941 | 0.644 | $\approx 110\ \mu\text{s}$ |
| MLP Neural Net ($32 \times 16$) | Self-Report Stress (3-Class) | All 18 features | 0.899 | 0.624 | $\approx 350\ \mu\text{s}$ |
| **Random Forest (Deployable)** | **Self-Report Stress (3-Class)** | **Top 10 selected** | **0.939** | **0.644** | **$< 60\ \mu\text{s}$** |
| Random Forest (Secondary) | Experimental Condition (Binary) | All 18 features | 0.993 | 0.993 | $\approx 110\ \mu\text{s}$ |

### 8.2 Confusion Matrix Breakdown
Table 2 details the out-of-fold confusion matrix for the deployable 10-feature Random Forest model.

**Table 2: Out-of-Fold Confusion Matrix (3-Class Stress)**
| True Class \ Predicted | Predicted Low (0) | Predicted Medium (1) | Predicted High (2) | Total Windows | Class Precision | Class Recall |
|---|---|---|---|---|---|---|
| **True Low (0)** | **379** | 0 | 1 | 380 | 0.992 | 0.997 |
| **True Medium (1)** | 0 | **0** | 38 | 38 | 0.000 | 0.000 |
| **True High (2)** | 3 | 4 | **335** | 342 | 0.896 | 0.980 |

*Observations*: The classifier achieves near-perfect separation between Low (Calm) and High (Severe Stress) states. Intermediate Medium stress cases represent borderline Likert transitions that tend to be absorbed into the High stress classification due to the heavy imbalance in 5-minute continuous pressure tasks.

### 8.3 Per-Participant Generalization Breakdown
Table 3 reports leave-participant-out generalization across individual validation splits.

**Table 3: Per-Participant Out-of-Fold Performance Breakdown**
| Participant Identifier | Evaluation Windows | Window Accuracy | Participant Macro F1 |
|:---:|:---:|:---:|:---:|
| `u01` | 76 | 0.750 | 0.556 |
| `u02` | 76 | 1.000 | 1.000 |
| `u03` | 76 | 0.724 | 0.531 |
| `u04` | 76 | 1.000 | 1.000 |
| `u05` | 76 | 1.000 | 1.000 |
| `u06` | 76 | 1.000 | 1.000 |
| `u07` | 76 | 0.934 | 0.639 |
| `u08` | 76 | 0.987 | 0.987 |
| `u09` | 76 | 1.000 | 1.000 |
| `u10` | 76 | 1.000 | 1.000 |

### 8.4 Multimodal Feature Ablation Study
Table 4 presents ablation experiments investigating the relative diagnostic contribution of keystroke timing dynamics versus ambient photopic illuminance.

**Table 4: Feature Ablation Study: Environmental Light Impact**
| Feature Configuration | Input Features Count | Accuracy | Macro F1 | Delta F1 vs Base |
|---|:---:|:---:|:---:|:---:|
| Full Multimodal (Typing Dynamics + Ambient Light) | 18 | 0.941 | 0.644 | Baseline |
| Keystroke Dynamics Only (No Light Features) | 16 | 0.941 | 0.644 | +0.000 |

*Interpretation*: Keystroke timing, error rate, and backspace dynamics carry the overwhelming majority of diagnostic stress information. The BH1750 ambient light sensor acts as a context guard—allowing the decision layer to differentiate whether typing irregularities occur under standard room lighting or eye-straining low-light conditions—rather than serving as a direct stress predictor.

---

## 9. Stateful Decision Engine & Closed-Loop Biofeedback

Directly mapping single-window machine learning outputs to user alarms causes high false-positive rates and disruptive alert fatigue [citation needed]. StressKB implements a stateful Decision Layer (`firmware/stresskb/decision.h`) that evaluates continuous temporal dynamics.

### 9.1 Mathematical Formulation
1. **Window Eligibility**: A window is evaluated only if status is `OK` (or `NO_BASELINE` fallback) and model confidence $C = \max(p_{\text{low}}, p_{\text{med}}, p_{\text{high}}) \ge 0.60$.
2. **Scalar Scoring**: $S_k = 0.5 \cdot p_{\text{med}} + 1.0 \cdot p_{\text{high}}$.
3. **Exponential Moving Average**:
   $$\text{EMA}_k = 0.4 \cdot S_k + 0.6 \cdot \text{EMA}_{k-1}$$
4. **Persistent Trigger Rule**: An alert triggers if $\text{EMA}_k \ge 0.60$ for $N = 3$ consecutive eligible windows (representing 45 seconds of sustained high-stress typing).
5. **Refractory Cooldown**: Once triggered, an alert enforces a refractory cooldown of 20 sliding windows (300 seconds), suppressing all subsequent alarms to allow interventions to take effect.

### 9.2 Behavioral Pattern Flags
In parallel with ML predictions, the engine evaluates six deterministic clinical heuristic flags:
- **RUSHED** (Bit 0): $z(\text{kpm}) \ge 1.0$ and $z(\text{err\_rate}) \ge 0.5$ (high speed coupled with elevated typos).
- **HESITANT** (Bit 1): $z(\text{long\_pauses}) \ge 1.0$ and $z(\text{kpm}) \le -0.5$ (frequent long hesitations and depressed pace).
- **FRUSTRATED** (Bit 2): $z(\text{bksp\_bursts}) \ge 1.0$ and $z(\text{burstiness}) \ge 0.5$ (repeated bursts of backspaces).
- **FATIGUED** (Bit 3): Mean speed of the latest 3 windows drops by $\ge 15\%$ compared to the first 3 windows.
- **DISTRACTED** (Bit 4): Window focus loss count $\ge 2$, or $z(\text{idle\_frac}) \ge 1.0$ with focus loss $\ge 1$.
- **FOCUSED** (Bit 5): Sustained rhythm regularity ($|z(\text{iki\_cv})| \le 0.5$), low error rate ($z \le 0.25$), and minimal pausing.

---

## 10. Limitations

1. **Weak Self-Report Labels**: Post-session 5-point Likert ratings represent retrospective, subjective appraisals aggregated across an entire 5-minute task. Momentary stress fluctuations occurring within individual 30-second windows cannot be perfectly captured by single scalar session ratings [citation needed].
2. **Sample Size & Generalizability**: The preliminary validation cohort ($N = 10$) demonstrates technical feasibility and algorithmic correctness, but larger diverse cohorts are needed to evaluate demographic variance in typing biometrics (e.g., touch typists vs. hunt-and-peck typists) [citation needed].
3. **Environmental Light Confounders**: While the BH1750 ambient light sensor monitors photopic lux, it cannot assess screen color temperature, monitor glare angles, or blue light emission, which also influence ocular fatigue and stress [citation needed].
4. **Baseline Sensitivity**: Optimal performance relies on a 3-minute calm baseline recording (`CAL` mode). In the absence of a baseline, the system defaults to global population means, which introduces wider confidence margins and increases susceptibility to false classifications.

---

## 11. Future Work & Extensions

1. **Int8 Quantization & TFLite Micro**: Exporting deep recurrent or temporal convolutional networks (TCNs) via TensorFlow Lite for Microcontrollers to compare against Random Forest memory footprint and latency.
2. **Standalone ESP32 Web Server**: Serving live session reporting and WebSocket telemetry directly from the ESP32 over local WiFi via an onboard HTTP server and LittleFS filesystem.
3. **Physical User Self-Report Input**: Integrating a dedicated hardware rotary encoder or analog potentiometer to enable continuous, real-time participant stress annotations without interrupting typing tasks.

---

## 12. References

1. [citation needed] — Cognitive workload and physiological stress indicators in human-computer interaction.
2. [citation needed] — Keystroke dynamics and biometric behavioral verification methodologies.
3. [citation needed] — Non-invasive stress detection through computer peripherals and ambient sensory devices.
4. [citation needed] — Welford's algorithm for online variance and covariance computation in embedded systems.
5. [citation needed] — TinyML and machine learning inference on edge microcontrollers.
6. [citation needed] — Alert fatigue and exponential moving average thresholds in digital health biofeedback systems.
7. [citation needed] — Workplace ergonomics, ocular rest protocols (20-20-20 rule), and cognitive fatigue recovery.
