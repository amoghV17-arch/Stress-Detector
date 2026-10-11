# FEATURES.md — features, normalisation, labels, decisions (source of truth)

Reference implementation: `tools/reference_features.py` (Python). The firmware (`features.h`) must match it:
relative error <= 1e-3 or absolute error <= 1e-6 on every golden vector in `tests/golden/`.

## Windows
30 s window, 15 s hop (see PROTOCOL.md). `n_keys` = number of K events whose t_down lies in the window.
A window is **valid** iff `n_keys >= 20` AND it has at least 3 inter-key gaps <= 2000 ms.
Invalid windows still emit FEAT (valid = 0, all features 0) and never produce a classification.

## The 18 features (FEAT order)
IKI = gap in ms between consecutive K events (by seq) inside the window. "Short IKI" = IKI <= 2000 ms.
Dwell = 0 means unknown and is excluded from dwell stats and overlap.

| # | Name | Definition |
|---|---|---|
| 1 | kpm | n_keys / 0.5 (keystrokes per minute) |
| 2 | iki_mean | mean of short IKI |
| 3 | iki_std | population std of short IKI |
| 4 | iki_cv | iki_std / iki_mean |
| 5 | dwell_mean | mean dwell (dwell > 0, clipped to 2000) |
| 6 | dwell_std | population std of the same |
| 7 | overlap_ratio | among consecutive pairs with a short IKI and known dwell: share where t_down[i] < t_down[i-1] + dwell[i-1] |
| 8 | bksp_rate | count(class B) / n_keys |
| 9 | bksp_bursts | number of runs of >= 3 consecutive B events |
| 10 | err_rate | count(err = 1) / max(1, count(class L, S, P)) |
| 11 | corr_latency | for each err = 1 key, ms until the first later B event in the window within 10 000 ms; mean over such pairs; 0 if none |
| 12 | post_err_slow | for each err key: mean of the next up to 3 short IKI after it / iki_mean; mean over errors with >= 1 gap; 1.0 if none |
| 13 | long_pauses | count of gaps > 2000 ms between consecutive K events in the window |
| 14 | idle_frac | sum of those long gaps (each clipped to 30 000) / 30 000, capped at 1 |
| 15 | burstiness | (iki_std - iki_mean) / (iki_std + iki_mean) over short IKI |
| 16 | focus_loss | count of F events with v = 0 in the window |
| 17 | lux_mean | mean of 1 Hz lux samples in the window (BH1750) |
| 18 | lux_std | population std of the same |

Use Welford's online algorithm for mean/variance, fixed-size ring buffers, no dynamic allocation.

## Model-input transform and normalisation
1. Transform: `x17 = ln(1 + lux_mean)`, `x18 = lux_std / (lux_mean + 1)`; features 1-16 unchanged.
2. Baseline (from the user's CAL session): per-feature population mean `mu` and sd over valid windows of the transformed features.
3. `sd_eff = max(sd, 0.1 * |mu|, 1e-3)` (protects against zero-variance baselines, e.g. no errors during CAL).
4. `z = clip((x - mu) / sd_eff, -5, 5)`.
5. No baseline for the user: use the global `mu`/`sd` stored with the model (PRED state = 3).
Offline training must compute exactly the same per-participant normalisation from each participant's CAL session.

The model uses a **subset** of the 18 z-features (8-12) chosen in M5 and stored in `ml/feature_selection.json`
(mirrored in `config.h` as `MODEL_FEATURES[]`). All 18 are still computed for the report and the pattern flags.

## Labels
Self-report stress after each session (1-5): 1-2 -> Low (0), 3 -> Medium (1), 4-5 -> High (2).
Every window inherits its session's label (a known limitation, state it in the write-up).
Secondary target for robustness: condition (calm = 0 vs pressure = 1).

## Decision layer (constants in config.h)
- `score = 0.5 * p_med + 1.0 * p_high`, EMA with alpha 0.4 over valid, confident windows.
- Confidence = max(p). If confidence < 0.6 -> state UNCERTAIN, no alert, EMA not updated.
- Alert when the EMA >= 0.6 for 3 consecutive eligible windows, then a cooldown of 20 windows (about 5 min).
  Cooldown is counted in windows (not seconds) so replay behaves exactly like live use.
- Alert action: motor pattern DOUBLE (150 ms on, 150 off, 150 on) and OLED highlight.
- Report level from mean score over valid windows: < 0.33 Low, < 0.66 Medium, else High.

## Behaviour pattern flags (bitmask, evaluated on z-features each valid window)
Initial thresholds are guesses; tune them in M7 from real data and record the final values in `config.h`.

| Bit | Flag | Rule (z = normalised feature) |
|---|---|---|
| 0 | RUSHED | z_kpm >= 1.0 AND z_err_rate >= 0.5 |
| 1 | HESITANT | z_long_pauses >= 1.0 AND z_kpm <= -0.5 |
| 2 | FRUSTRATED | z_bksp_bursts >= 1.0 AND z_burstiness >= 0.5 |
| 3 | FATIGUED | over the last 6 valid windows: mean z_kpm of the last 3 <= first 3 - 0.5 AND mean z_err_rate of the last 3 >= first 3 + 0.5 |
| 4 | DISTRACTED | focus_loss >= 2 OR (z_idle_frac >= 1.0 AND focus_loss >= 1) |
| 5 | FOCUSED | |z_iki_cv| <= 0.5 AND z_err_rate <= 0.25 AND z_long_pauses <= 0.25 |

## Session-level, report-only metrics (not model inputs)
Speed trend and error trend (first third vs last third of valid windows), uncorrected error rate (final text vs target,
computed in the browser), time pressure (elapsed / allowed), restarts, self-report (stress / rushed / tired, 1-5).
