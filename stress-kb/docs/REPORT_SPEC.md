# REPORT_SPEC.md — session log schema and stress report

The report is built in the browser from ONE saved session JSON. It must work with no device attached.

## Session JSON (schema 1)
```json
{
  "schema": 1,
  "synthetic": false,
  "meta": { "session_id": "", "user_id": "", "mode": "CAL|RUN", "condition": "calm|pressure",
            "lighting": "normal|dim", "has_light_sensor": true, "started_iso": "", "fw_version": "", "app_version": "" },
  "task": { "allowed_s": 0, "elapsed_s": 0, "restarts": 0, "total_chars": 0, "uncorrected_errors": 0 },
  "events": [[seq, t_down, dwell, "L", 0]],
  "focus": [[seq, t, v]],
  "lux": [[t, lux]],
  "baseline": { "present": 1, "mu": [], "sd": [] },
  "windows": [ { "win_id": 0, "t_end": 30000, "n_keys": 0, "valid": 1, "f": [],
                 "pred": { "cls": 0, "p": [0, 0, 0], "flags": 0, "alert": 0, "state": 0 } } ],
  "alerts": [ { "win_id": 0, "t": 0 } ],
  "selfreport": { "stress": 1, "rushed": 1, "tired": 1 },
  "warnings": [ { "t": 0, "code": "", "detail": "" } ]
}
```
No field may hold typed characters. `tools/validate_sessions.py` rejects files that do.
`"synthetic": true` files must show the banner "SYNTHETIC — NOT REAL RESULTS" on every report page.

## Report sections (all required)
1. **Session summary**: user, mode/condition, lighting, duration, keystrokes, valid windows / total, baseline used (personal or default).
2. **Overall stress**: level (Low/Medium/High from mean score, see FEATURES.md), mean confidence, % of valid windows per level.
3. **Timeline**: per-window stress score and confidence line chart, alert moments marked, uncertain/insufficient windows shaded.
4. **Indicator table**: for each of the 18 features, session mean z-score vs the user's baseline, an arrow (up/down if |z| >= 0.5, else flat), and a plain-language meaning. Highlight the top 3 contributors by |z|.
5. **Behaviour patterns**: for each flag (Rushed, Hesitant, Frustrated, Fatigued, Distracted, Focused) the % of valid windows where it was active, with the rule that fired.
6. **Trends**: first third vs last third of valid windows for speed, errors, pauses, backspace bursts. State "increasing / decreasing / stable".
7. **Context**: mean lux and variation; note "low light" below 50 lux and "unstable light" if lux_std/lux_mean > 0.3.
8. **Reliability**: valid-window coverage, count of uncertain windows, mean confidence, warnings (GAP, LINK_LOST, SENSOR_BH1750), whether the baseline was personal.
9. **Alerts**: number and times of vibration alerts, and the pattern flags active at each.
10. **Self-report comparison**: model level vs reported level; mark agreement or disagreement. Hidden if no self-report.
11. **Disclaimer**: "Behavioural estimate from typing patterns. Not a medical or psychological assessment." Plus generic, non-clinical break suggestions when the level is High.

## Validity rules
- If valid windows < 60% of total windows, or fewer than 4 valid windows: show "Insufficient data" and skip sections 2, 5, 6, 10.
- If `meta.has_light_sensor` is false: skip section 7 and show "No light sensor in this session" instead.
- If no personal baseline: show a visible "default baseline" warning in sections 1 and 8.
- Mode CAL sessions produce a baseline summary page (features mean/sd), not a stress report.

## Output
Print-friendly stylesheet (browser "Save as PDF"), plus "Download JSON" and "Download CSV" (one row per window) buttons.
Charts: Chart.js from a CDN with a pinned version. All numbers in the report come from functions in `web/js/core/report.js`
that are unit tested against fixture sessions in `web/tests/fixtures/`.
