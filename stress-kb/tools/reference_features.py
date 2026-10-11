#!/usr/bin/env python3
"""reference_features.py — Reference feature extraction implementation.
Source of truth per docs/FEATURES.md.
Used to generate golden vectors in tests/golden/ and verify C++ features.h.
"""

import math
import csv
import json
import sys
from typing import List, Dict, Any, Tuple

def compute_window_features(k_events: List[Dict], f_events: List[Dict], lux_samples: List[Dict]) -> Tuple[int, List[float]]:
    """
    Computes (is_valid, features[18]) for events in a 30-second window.
    k_events: list of dicts with keys: seq, t, dwell, cls, err
    f_events: list of dicts with keys: seq, t, v
    lux_samples: list of dicts with keys: t, lux
    """
    n_keys = len(k_events)

    # Sort events by t (and seq)
    k_events = sorted(k_events, key=lambda e: (e['t'], e['seq']))

    # Compute IKIs between consecutive K events
    short_ikis = []
    long_pauses = 0
    long_pause_sum = 0.0

    for i in range(1, n_keys):
        iki = k_events[i]['t'] - k_events[i - 1]['t']
        if iki <= 2000:
            short_ikis.append(iki)
        else:
            long_pauses += 1
            long_pause_sum += min(float(iki), 30000.0)

    # Validity criteria per FEATURES.md:
    # A window is valid iff n_keys >= 20 AND it has at least 3 inter-key gaps <= 2000 ms.
    is_valid = 1 if (n_keys >= 20 and len(short_ikis) >= 3) else 0

    if not is_valid:
        return 0, [0.0] * 18

    # 1. kpm: n_keys / 0.5
    f1_kpm = n_keys / 0.5

    # 2. iki_mean, 3. iki_std, 4. iki_cv
    iki_mean = sum(short_ikis) / len(short_ikis)
    iki_var = sum((x - iki_mean) ** 2 for x in short_ikis) / len(short_ikis)
    iki_std = math.sqrt(iki_var)
    iki_cv = (iki_std / iki_mean) if iki_mean > 0 else 0.0

    # 5. dwell_mean, 6. dwell_std (dwell > 0, clipped to 2000)
    valid_dwells = [min(2000.0, float(e['dwell'])) for e in k_events if e['dwell'] > 0]
    if valid_dwells:
        dwell_mean = sum(valid_dwells) / len(valid_dwells)
        dwell_var = sum((x - dwell_mean) ** 2 for x in valid_dwells) / len(valid_dwells)
        dwell_std = math.sqrt(dwell_var)
    else:
        dwell_mean = 0.0
        dwell_std = 0.0

    # 7. overlap_ratio:
    # among consecutive pairs with short IKI and known dwell: share where t_down[i] < t_down[i-1] + dwell[i-1]
    overlap_pairs = 0
    overlap_count = 0
    for i in range(1, n_keys):
        prev = k_events[i - 1]
        curr = k_events[i]
        iki = curr['t'] - prev['t']
        if iki <= 2000 and prev['dwell'] > 0:
            overlap_pairs += 1
            if curr['t'] < prev['t'] + min(2000.0, float(prev['dwell'])):
                overlap_count += 1
    overlap_ratio = (overlap_count / overlap_pairs) if overlap_pairs > 0 else 0.0

    # 8. bksp_rate: count(class B) / n_keys
    bksp_count = sum(1 for e in k_events if e['cls'] == 'B')
    bksp_rate = bksp_count / n_keys

    # 9. bksp_bursts: number of runs of >= 3 consecutive B events
    bksp_bursts = 0
    current_b_run = 0
    for e in k_events:
        if e['cls'] == 'B':
            current_b_run += 1
            if current_b_run == 3:
                bksp_bursts += 1
        else:
            current_b_run = 0

    # 10. err_rate: count(err = 1) / max(1, count(class L, S, P))
    lsp_count = sum(1 for e in k_events if e['cls'] in ('L', 'S', 'P'))
    err_count = sum(1 for e in k_events if e['err'] == 1)
    err_rate = err_count / max(1, lsp_count)

    # 11. corr_latency:
    # for each err = 1 key, ms until first later B event in window within 10 000 ms; mean over such pairs; 0 if none
    corr_latencies = []
    for i in range(n_keys):
        if k_events[i]['err'] == 1:
            for j in range(i + 1, n_keys):
                if k_events[j]['cls'] == 'B':
                    dt = k_events[j]['t'] - k_events[i]['t']
                    if dt <= 10000:
                        corr_latencies.append(dt)
                    break
    corr_latency = (sum(corr_latencies) / len(corr_latencies)) if corr_latencies else 0.0

    # 12. post_err_slow:
    # for each err key: mean of next up to 3 short IKI after it / iki_mean; mean over errors with >= 1 gap; 1.0 if none
    post_err_ratios = []
    for i in range(n_keys):
        if k_events[i]['err'] == 1:
            next_gaps = []
            for j in range(i + 1, min(n_keys, i + 4)):
                gap = k_events[j]['t'] - k_events[j - 1]['t']
                if gap <= 2000:
                    next_gaps.append(gap)
            if next_gaps and iki_mean > 0:
                m = sum(next_gaps) / len(next_gaps)
                post_err_ratios.append(m / iki_mean)
    post_err_slow = (sum(post_err_ratios) / len(post_err_ratios)) if post_err_ratios else 1.0

    # 13. long_pauses
    f13_long_pauses = float(long_pauses)

    # 14. idle_frac: sum of those long gaps (each clipped to 30 000) / 30 000, capped at 1
    idle_frac = min(1.0, long_pause_sum / 30000.0)

    # 15. burstiness: (iki_std - iki_mean) / (iki_std + iki_mean) over short IKI
    if (iki_std + iki_mean) > 0:
        burstiness = (iki_std - iki_mean) / (iki_std + iki_mean)
    else:
        burstiness = 0.0

    # 16. focus_loss: count of F events with v = 0 in the window
    focus_loss = float(sum(1 for e in f_events if e['v'] == 0))

    # 17. lux_mean, 18. lux_std
    if lux_samples:
        lux_values = [float(s['lux']) for s in lux_samples]
        l_mean = sum(lux_values) / len(lux_values)
        l_var = sum((x - l_mean) ** 2 for x in lux_values) / len(lux_values)
        lux_mean = l_mean
        lux_std = math.sqrt(l_var)
    else:
        lux_mean = 0.0
        lux_std = 0.0

    features = [
        f1_kpm,
        iki_mean,
        iki_std,
        iki_cv,
        dwell_mean,
        dwell_std,
        overlap_ratio,
        bksp_rate,
        float(bksp_bursts),
        err_rate,
        corr_latency,
        post_err_slow,
        f13_long_pauses,
        idle_frac,
        burstiness,
        focus_loss,
        lux_mean,
        lux_std
    ]

    return 1, features


def process_event_stream(lines: List[str]) -> List[Dict[str, Any]]:
    """
    Simulates the window engine over a stream of PROTOCOL.md lines.
    Lines can be K, F, T, R.
    Windows: 30000 ms, 15000 ms hop. Window k covers [15000*k, 15000*k + 30000).
    A window closes when any K/F/T/R time >= its end; several may close at once. win_id = k.
    """
    events_k = []
    events_f = []
    events_r = []

    windows = []
    open_win_k = 0

    def check_close(current_t):
        nonlocal open_win_k
        while True:
            win_start = 15000 * open_win_k
            win_end = win_start + 30000
            if current_t < win_end:
                break
            # Close window open_win_k
            k_win = [e for e in events_k if win_start <= e['t'] < win_end]
            f_win = [e for e in events_f if win_start <= e['t'] < win_end]
            r_win = [e for e in events_r if win_start <= e['t'] < win_end]

            is_valid, feat = compute_window_features(k_win, f_win, r_win)
            windows.append({
                'win_id': open_win_k,
                't_end': win_end,
                'n_keys': len(k_win),
                'valid': is_valid,
                'features': [round(x, 6) for x in feat]
            })
            open_win_k += 1

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(',')
        cmd = parts[0]
        if cmd == 'K':
            # K,seq,t_down,dwell,class,err
            seq = int(parts[1])
            t = int(parts[2])
            dwell = int(parts[3])
            cls = parts[4]
            err = int(parts[5])
            events_k.append({'seq': seq, 't': t, 'dwell': dwell, 'cls': cls, 'err': err})
            check_close(t)
        elif cmd == 'F':
            # F,seq,t,v
            seq = int(parts[1])
            t = int(parts[2])
            v = int(parts[3])
            events_f.append({'seq': seq, 't': t, 'v': v})
            check_close(t)
        elif cmd == 'T':
            # T,t
            t = int(parts[1])
            check_close(t)
        elif cmd == 'R':
            # R,t,lux
            t = int(parts[1])
            lux = float(parts[2])
            events_r.append({'t': t, 'lux': lux})
            check_close(t)

    return windows


def main():
    if len(sys.argv) < 2:
        print("Usage: reference_features.py <input.csv> [output.json]")
        sys.exit(1)

    csv_path = sys.argv[1]
    with open(csv_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    windows = process_event_stream(lines)

    if len(sys.argv) >= 3:
        out_path = sys.argv[2]
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(windows, f, indent=2)
        print(f"Processed {len(windows)} windows -> {out_path}")
    else:
        print(json.dumps(windows, indent=2))

if __name__ == '__main__':
    main()
