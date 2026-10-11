#!/usr/bin/env python3
"""Generate the 8 golden vector event CSVs and expected features JSONs.
Covers:
1. normal_typing
2. no_errors
3. all_backspaces
4. long_idle
5. fewer_than_20_keys
6. dwell_zero
7. focus_losses
8. burst_2000_lines
"""

import os
import json
from reference_features import process_event_stream

os.makedirs('tests/golden', exist_ok=True)

def write_and_process(name: str, lines: list):
    csv_path = f"tests/golden/{name}.csv"
    json_path = f"tests/golden/{name}.expected.json"

    with open(csv_path, 'w', encoding='utf-8') as f:
        for l in lines:
            f.write(l + '\n')

    windows = process_event_stream(lines)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(windows, f, indent=2)

    print(f"Generated {name}: {len(lines)} lines -> {len(windows)} windows")

# 1. normal_typing: 60s session, regular typing at ~180 kpm (iki ~250ms), some backspaces and errors, 1Hz lux
lines = []
seq = 1
t = 200
classes = ['L', 'L', 'L', 'S', 'L', 'L', 'B', 'L', 'P', 'S']
for i in range(150):
    t += 250
    cls = classes[i % len(classes)]
    err = 1 if (i % 15 == 14) else 0
    dwell = 70 + (i % 20)
    lines.append(f"K,{seq},{t},{dwell},{cls},{err}")
    seq += 1
    if (i % 4 == 0):
        lines.append(f"R,{t},350.0")
lines.append(f"T,65000") # closes window 0, 1, 2
write_and_process("normal_typing", lines)

# 2. no_errors: 45s session, 100% correct (err = 0 throughout), no backspaces
lines = []
seq = 1
t = 100
for i in range(120):
    t += 280
    cls = 'S' if (i % 6 == 5) else 'L'
    dwell = 80
    lines.append(f"K,{seq},{t},{dwell},{cls},0")
    seq += 1
    if i % 3 == 0:
        lines.append(f"R,{t},400.0")
lines.append(f"T,50000")
write_and_process("no_errors", lines)

# 3. all_backspaces: heavily corrected session with runs of >= 3 backspaces (bursts)
lines = []
seq = 1
t = 150
for i in range(100):
    t += 200
    # Create multiple runs of 4 backspaces
    is_burst = (i // 5) % 2 == 1
    cls = 'B' if is_burst else 'L'
    err = 1 if (cls == 'L' and i % 3 == 0) else 0
    dwell = 90
    lines.append(f"K,{seq},{t},{dwell},{cls},{err}")
    seq += 1
lines.append(f"T,40000")
write_and_process("all_backspaces", lines)

# 4. long_idle: gaps > 2000 ms, testing long_pauses and idle_frac
lines = []
seq = 1
t = 500
# 10 keys quickly
for i in range(10):
    t += 200
    lines.append(f"K,{seq},{t},80,L,0")
    seq += 1
# Big pause of 5000 ms
t += 5000
# 15 keys quickly
for i in range(15):
    t += 200
    lines.append(f"K,{seq},{t},80,L,0")
    seq += 1
# Another big pause of 8000 ms
t += 8000
# 10 keys
for i in range(10):
    t += 200
    lines.append(f"K,{seq},{t},80,L,0")
    seq += 1
lines.append(f"T,45000")
write_and_process("long_idle", lines)

# 5. fewer_than_20_keys: only 15 keys in 30s -> invalid window (valid = 0, features all 0)
lines = []
seq = 1
t = 1000
for i in range(15):
    t += 1500
    lines.append(f"K,{seq},{t},80,L,0")
    seq += 1
lines.append(f"T,35000")
write_and_process("fewer_than_20_keys", lines)

# 6. dwell_zero: all dwell = 0 events (e.g. keyup lost / touch), excluded from dwell stats and overlap
lines = []
seq = 1
t = 200
for i in range(80):
    t += 300
    lines.append(f"K,{seq},{t},0,L,0")
    seq += 1
lines.append(f"T,40000")
write_and_process("dwell_zero", lines)

# 7. focus_losses: multiple F events with v = 0 and v = 1
lines = []
seq = 1
t = 200
for i in range(60):
    t += 300
    lines.append(f"K,{seq},{t},85,L,0")
    seq += 1
    if i == 15:
        lines.append(f"F,{seq},{t + 50},0") # focus lost
        seq += 1
        lines.append(f"F,{seq},{t + 800},1") # focus regained
        seq += 1
    if i == 30:
        lines.append(f"F,{seq},{t + 50},0") # focus lost
        seq += 1
lines.append(f"T,40000")
write_and_process("focus_losses", lines)

# 8. burst_2000_lines: stress test with 2000 lines
lines = []
seq = 1
t = 10
for i in range(2000):
    t += 15 # very rapid stream
    if i % 10 == 0:
        lines.append(f"T,{t}")
    elif i % 25 == 0:
        lines.append(f"R,{t},250.0")
    elif i % 50 == 0:
        lines.append(f"F,{seq},{t},0")
        seq += 1
    else:
        dwell = 25
        err = 1 if (i % 20 == 0) else 0
        cls = 'B' if (i % 15 == 0) else 'L'
        lines.append(f"K,{seq},{t},{dwell},{cls},{err}")
        seq += 1
lines.append(f"T,45000")
write_and_process("burst_2000_lines", lines)

print("All 8 golden vector cases generated successfully!")
