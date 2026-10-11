#!/usr/bin/env python3
"""synth_data.py — Generates realistic synthetic session datasets.
Generates 10 participants x 5 sessions = 50 sessions in ml/data/synthetic/.
Clearly marked synthetic per docs/REPORT_SPEC.md and docs/MILESTONES.md.
"""

import os
import json
import math
import random
import argparse
from reference_features import process_event_stream

CONDITIONS_ORDER = [
    # 4x4 Latin Square
    [('calm', 'normal'), ('calm', 'dim'), ('pressure', 'dim'), ('pressure', 'normal')],
    [('calm', 'dim'), ('pressure', 'normal'), ('calm', 'normal'), ('pressure', 'dim')],
    [('pressure', 'normal'), ('pressure', 'dim'), ('calm', 'dim'), ('calm', 'normal')],
    [('pressure', 'dim'), ('calm', 'normal'), ('pressure', 'normal'), ('calm', 'dim')]
]

def generate_participant_data(user_idx: int, out_dir: str):
    random.seed(100 + user_idx)
    uid = f"u{user_idx:02d}"

    # Participant intrinsic profile
    base_kpm = random.uniform(140.0, 220.0) # ~2.3 - 3.6 keys/s
    base_dwell = random.uniform(65.0, 95.0)
    base_error_rate = random.uniform(0.01, 0.04)

    # 1. Step 0: CAL session (180 s)
    cal_session_id = f"s01"
    cal_session = generate_session(
        uid, cal_session_id, "CAL", "calm", "normal", 180,
        base_kpm, base_dwell, base_error_rate, is_cal=True
    )
    cal_file = os.path.join(out_dir, f"{uid}_{cal_session_id}_CAL.json")
    with open(cal_file, 'w', encoding='utf-8') as f:
        json.dump(cal_session, f, indent=2)

    # Calculate baseline transformed features mu and sd from CAL valid windows
    valid_windows = [w['f'] for w in cal_session['windows'] if w['valid'] == 1]
    if not valid_windows:
        raise RuntimeError(f"CAL session for {uid} had 0 valid windows")

    # Transform features 17 and 18: x17 = ln(1+lux_mean), x18 = lux_std / (lux_mean+1)
    trans_windows = []
    for w in valid_windows:
        tw = list(w)
        tw[16] = math.log(1.0 + tw[16])
        tw[17] = tw[17] / (tw[16] + 1.0)
        trans_windows.append(tw)

    n_win = len(trans_windows)
    mu = [sum(tw[f] for tw in trans_windows) / n_win for f in range(18)]
    sd = [math.sqrt(sum((tw[f] - mu[f])**2 for tw in trans_windows) / n_win) for f in range(18)]

    # 2. Steps 1..4: 4 RUN sessions (300 s each)
    cond_row = CONDITIONS_ORDER[user_idx % 4]
    for s_idx in range(4):
        sess_num = s_idx + 2
        sid = f"s{sess_num:02d}"
        cond, lighting = cond_row[s_idx]

        run_session = generate_session(
            uid, sid, "RUN", cond, lighting, 300,
            base_kpm, base_dwell, base_error_rate, is_cal=False,
            baseline_mu=mu, baseline_sd=sd
        )
        run_file = os.path.join(out_dir, f"{uid}_{sid}_RUN.json")
        with open(run_file, 'w', encoding='utf-8') as f:
            json.dump(run_session, f, indent=2)


def generate_session(uid, sid, mode, condition, lighting, duration_s,
                     base_kpm, base_dwell, base_error_rate, is_cal=False,
                     baseline_mu=None, baseline_sd=None):

    # Adjust parameters based on stress condition
    is_pressure = (condition == 'pressure')
    if is_pressure:
        speed_factor = random.uniform(1.08, 1.25)
        error_factor = random.uniform(2.5, 4.5)
        dwell_factor = random.uniform(0.85, 0.95) # faster key taps
        pause_factor = random.uniform(1.5, 3.0)   # more hesitation pauses
        burst_factor = random.uniform(2.0, 4.0)   # backspace bursts
        stress_label = random.choice([4, 5]) if random.random() < 0.85 else 3
        rushed_label = random.choice([4, 5])
    else:
        speed_factor = 1.0
        error_factor = 1.0
        dwell_factor = 1.0
        pause_factor = 1.0
        burst_factor = 1.0
        stress_label = random.choice([1, 2]) if random.random() < 0.85 else 3
        rushed_label = random.choice([1, 2])

    current_kpm = base_kpm * speed_factor
    mean_iki = (60.0 / current_kpm) * 1000.0 # ms

    # Generate stream of raw lines
    lines = []
    events_json = []
    focus_json = []
    lux_json = []

    seq = 1
    t = 150
    session_end_ms = duration_s * 1000

    # Lux settings
    base_lux = random.uniform(320.0, 450.0) if lighting == 'normal' else random.uniform(20.0, 45.0)

    # Paragraph character classes distribution
    classes = ['L', 'L', 'L', 'S', 'L', 'L', 'L', 'S', 'L', 'P', 'S']

    last_heartbeat = 0
    last_lux = 0

    while t < session_end_ms:
        # Check heartbeat
        if t - last_heartbeat >= 1000:
            last_heartbeat = (t // 1000) * 1000
            lines.append(f"T,{last_heartbeat}")

        # Check lux
        if t - last_lux >= 1000:
            last_lux = (t // 1000) * 1000
            lux_val = max(5.0, random.gauss(base_lux, base_lux * 0.05))
            lines.append(f"R,{last_lux},{lux_val:.1f}")
            lux_json.append([last_lux, round(lux_val, 1)])

        # Random focus loss
        if random.random() < 0.003:
            seq += 1
            lines.append(f"F,{seq},{t},0")
            focus_json.append([seq, t, 0])
            pause_time = int(random.uniform(1500, 4000))
            t += pause_time
            seq += 1
            lines.append(f"F,{seq},{t},1")
            focus_json.append([seq, t, 1])
            continue

        # Check if pause
        if random.random() < (0.015 * pause_factor):
            pause_ms = int(random.uniform(2100, 5000))
            t += pause_ms
            continue

        # Normal typing event
        dwell = int(max(30.0, random.gauss(base_dwell * dwell_factor, 12.0)))
        err = 1 if (random.random() < base_error_rate * error_factor) else 0

        # Class
        if err == 1 and random.random() < (0.4 * burst_factor):
            # Backspace burst
            for b in range(random.randint(3, 5)):
                seq += 1
                lines.append(f"K,{seq},{t},{dwell},B,0")
                events_json.append([seq, t, dwell, 'B', 0])
                t += int(random.gauss(180, 20))
            continue

        cls = random.choice(classes)
        seq += 1
        lines.append(f"K,{seq},{t},{dwell},{cls},{err}")
        events_json.append([seq, t, dwell, cls, err])

        # Step time
        iki = int(max(80.0, random.gauss(mean_iki, mean_iki * 0.25)))
        t += iki

    # Final heartbeat to close all windows
    lines.append(f"T,{session_end_ms}")

    # Process through reference feature extraction engine
    windows_raw = process_event_stream(lines)
    windows_json = []
    for w in windows_raw:
        windows_json.append({
            'win_id': w['win_id'],
            't_end': w['t_end'],
            'n_keys': w['n_keys'],
            'valid': w['valid'],
            'f': w['features']
        })

    baseline_obj = {
        'present': 1 if (baseline_mu is not None) else 0,
        'mu': [round(x, 3) for x in (baseline_mu or [0.0]*18)],
        'sd': [round(x, 3) for x in (baseline_sd or [0.0]*18)]
    }

    session = {
        "schema": 1,
        "synthetic": True,
        "meta": {
            "session_id": sid,
            "user_id": uid,
            "mode": mode,
            "condition": condition,
            "lighting": lighting,
            "has_light_sensor": True,
            "started_iso": "2026-10-11T10:00:00.000Z",
            "fw_version": "0.1",
            "app_version": "1.0"
        },
        "task": {
            "allowed_s": duration_s,
            "elapsed_s": duration_s,
            "restarts": 0,
            "total_chars": len(events_json),
            "uncorrected_errors": int(len(events_json) * base_error_rate)
        },
        "events": events_json,
        "focus": focus_json,
        "lux": lux_json,
        "baseline": baseline_obj,
        "windows": windows_json,
        "alerts": [],
        "selfreport": {
            "stress": stress_label,
            "rushed": rushed_label,
            "tired": random.choice([2, 3])
        },
        "warnings": []
    }
    return session


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic dataset for StressKB")
    parser.add_argument("--output", default="ml/data/synthetic", help="Output directory")
    parser.add_argument("--participants", type=int, default=10, help="Number of participants")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    print(f"Generating synthetic dataset for {args.participants} participants in {args.output}...")

    for i in range(1, args.participants + 1):
        generate_participant_data(i, args.output)

    total_files = len(os.listdir(args.output))
    print(f"Successfully generated {total_files} synthetic session files.")

if __name__ == '__main__':
    main()
