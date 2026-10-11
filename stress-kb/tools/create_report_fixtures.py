import json
import os

fixtures_dir = os.path.join("web", "tests", "fixtures")
os.makedirs(fixtures_dir, exist_ok=True)

# 18 feature names:
# kpm, iki_mean, iki_std, iki_cv, dwell_mean, dwell_std, overlap_ratio, bksp_rate,
# bksp_bursts, err_rate, corr_latency, post_err_slow, long_pauses, idle_frac, burstiness,
# focus_loss, lux_mean, lux_std

def make_features(base_kpm=200, err_rate=0.03, bksp_rate=0.05, lux=300):
    return [
        base_kpm, 300.0, 75.0, 0.25, 75.0, 12.0, 0.15,
        bksp_rate, 1.0, err_rate, 950.0, 1.05, 1.0, 0.08, -0.4, 0.0,
        lux, 15.0
    ]

# 1. normal_session.json: Valid, high stress, has alerts, has selfreport
normal_windows = []
for i in range(10):
    # Higher kpm and higher errors in latter half to test trends
    kpm = 210 + i * 5
    err = 0.02 + i * 0.01
    f = make_features(base_kpm=kpm, err_rate=err, bksp_rate=0.08, lux=280)
    # Give windows 6,7,8 high stress predictions and alert on 7
    cls = 2 if i >= 5 else 1
    p = [0.1, 0.2, 0.7] if i >= 5 else [0.2, 0.6, 0.2]
    alert = 1 if i == 7 else 0
    flags = 1 if i >= 5 else 0 # bit 0 = RUSHED
    normal_windows.append({
        "win_id": i,
        "t_end": (i + 1) * 15000,
        "n_keys": 70,
        "valid": 1,
        "f": f,
        "pred": {
            "cls": cls,
            "p": p,
            "flags": flags,
            "alert": alert,
            "state": 0
        }
    })

normal_session = {
    "schema": 1,
    "synthetic": False,
    "meta": {
        "session_id": "s02",
        "user_id": "u01",
        "mode": "RUN",
        "condition": "pressure",
        "lighting": "normal",
        "has_light_sensor": True,
        "started_iso": "2026-10-11T12:00:00.000Z",
        "fw_version": "0.1",
        "app_version": "1.0"
    },
    "task": {
        "allowed_s": 300,
        "elapsed_s": 150,
        "restarts": 0,
        "total_chars": 700,
        "uncorrected_errors": 10
    },
    "events": [],
    "focus": [],
    "lux": [],
    "baseline": {
        "present": 1,
        "mu": [180.0, 310.0, 80.0, 0.26, 75.0, 12.0, 0.15, 0.05, 0.5, 0.02, 900.0, 1.0, 0.5, 0.05, -0.45, 0.0, 5.64, 0.05],
        "sd": [25.0, 30.0, 10.0, 0.05, 8.0, 2.0, 0.05, 0.02, 0.5, 0.01, 200.0, 0.1, 0.5, 0.03, 0.1, 0.2, 0.1, 0.02]
    },
    "windows": normal_windows,
    "alerts": [{"win_id": 7, "t": 120000}],
    "selfreport": {
        "stress": 4,
        "rushed": 4,
        "tired": 3
    },
    "warnings": []
}

# 2. low_coverage_session.json: 10 windows, only 2 valid (20% < 60%)
low_cov_windows = []
for i in range(10):
    valid = 1 if i < 2 else 0
    f = make_features(base_kpm=150)
    low_cov_windows.append({
        "win_id": i,
        "t_end": (i + 1) * 15000,
        "n_keys": 60 if valid else 10,
        "valid": valid,
        "f": f,
        "pred": {
            "cls": 0 if valid else 255,
            "p": [0.8, 0.1, 0.1] if valid else [0.0, 0.0, 0.0],
            "flags": 0,
            "alert": 0,
            "state": 0 if valid else 2
        }
    })

low_cov_session = {
    "schema": 1,
    "synthetic": False,
    "meta": {
        "session_id": "s03",
        "user_id": "u01",
        "mode": "RUN",
        "condition": "calm",
        "lighting": "normal",
        "has_light_sensor": True,
        "started_iso": "2026-10-11T12:10:00.000Z",
        "fw_version": "0.1",
        "app_version": "1.0"
    },
    "task": {"allowed_s": 300, "elapsed_s": 150, "restarts": 0, "total_chars": 150, "uncorrected_errors": 2},
    "events": [],
    "focus": [],
    "lux": [],
    "baseline": normal_session["baseline"],
    "windows": low_cov_windows,
    "alerts": [],
    "selfreport": {"stress": 1, "rushed": 1, "tired": 1},
    "warnings": [{"t": 45000, "code": "GAP", "detail": "No events for 5s"}]
}

# 3. no_baseline_session.json: baseline.present = 0
no_base_windows = []
for i in range(8):
    f = make_features(base_kpm=180)
    no_base_windows.append({
        "win_id": i,
        "t_end": (i + 1) * 15000,
        "n_keys": 65,
        "valid": 1,
        "f": f,
        "pred": {
            "cls": 1,
            "p": [0.2, 0.6, 0.2],
            "flags": 0,
            "alert": 0,
            "state": 3
        }
    })

no_base_session = {
    "schema": 1,
    "synthetic": False,
    "meta": {
        "session_id": "s04",
        "user_id": "u02",
        "mode": "RUN",
        "condition": "calm",
        "lighting": "normal",
        "has_light_sensor": True,
        "started_iso": "2026-10-11T12:20:00.000Z",
        "fw_version": "0.1",
        "app_version": "1.0"
    },
    "task": {"allowed_s": 300, "elapsed_s": 120, "restarts": 0, "total_chars": 520, "uncorrected_errors": 4},
    "events": [],
    "focus": [],
    "lux": [],
    "baseline": {"present": 0, "mu": [], "sd": []},
    "windows": no_base_windows,
    "alerts": [],
    "selfreport": {"stress": 2, "rushed": 2, "tired": 2},
    "warnings": []
}

# 4. synthetic_session.json: synthetic: true
synth_session = dict(normal_session)
synth_session["synthetic"] = True
synth_session["meta"] = dict(normal_session["meta"])
synth_session["meta"]["session_id"] = "s05_synth"

# 5. cal_session.json: mode = "CAL"
cal_windows = []
for i in range(12):
    f = make_features(base_kpm=175 + (i % 3) * 5, err_rate=0.02, lux=250)
    cal_windows.append({
        "win_id": i,
        "t_end": (i + 1) * 15000,
        "n_keys": 60,
        "valid": 1,
        "f": f,
        "pred": {"cls": 255, "p": [0, 0, 0], "flags": 0, "alert": 0, "state": 0}
    })

cal_session = {
    "schema": 1,
    "synthetic": False,
    "meta": {
        "session_id": "s01_cal",
        "user_id": "u01",
        "mode": "CAL",
        "condition": "calm",
        "lighting": "normal",
        "has_light_sensor": True,
        "started_iso": "2026-10-11T11:45:00.000Z",
        "fw_version": "0.1",
        "app_version": "1.0"
    },
    "task": {"allowed_s": 180, "elapsed_s": 180, "restarts": 0, "total_chars": 720, "uncorrected_errors": 5},
    "events": [],
    "focus": [],
    "lux": [],
    "baseline": {"present": 0, "mu": [], "sd": []},
    "windows": cal_windows,
    "alerts": [],
    "selfreport": None,
    "warnings": []
}

files = [
    ("normal_session.json", normal_session),
    ("low_coverage_session.json", low_cov_session),
    ("no_baseline_session.json", no_base_session),
    ("synthetic_session.json", synth_session),
    ("cal_session.json", cal_session)
]

for fname, data in files:
    path = os.path.join(fixtures_dir, fname)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {path}")
