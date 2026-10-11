#!/usr/bin/env python3
"""replay.py — Stream recorded CSV or session JSON to serial port or simulator.
Supports --port, --speed, --verify, and --regen.
"""

import os
import sys
import time
import json
import argparse
import glob
from typing import List, Dict, Any, Optional

try:
    import serial
except ImportError:
    serial = None

# Import reference engine for simulation fallback
from reference_features import process_event_stream

def load_events(file_path: str) -> List[str]:
    """Loads raw protocol lines from a CSV or session JSON."""
    lines = []
    if file_path.endswith('.json'):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        lines.append(f"HELLO,1")
        lines.append(f"S,START,{data.get('meta', {}).get('session_id', 's01')},{data.get('meta', {}).get('user_id', 'u01')},{data.get('meta', {}).get('mode', 'REPLAY')}")
        # Merge events, focus, lux by timestamp
        all_items = []
        for e in data.get('events', []):
            # [seq, t_down, dwell, cls, err]
            all_items.append((e[1], f"K,{e[0]},{e[1]},{e[2]},{e[3]},{e[4]}"))
        for f_item in data.get('focus', []):
            # [seq, t, v]
            all_items.append((f_item[1], f"F,{f_item[0]},{f_item[1]},{f_item[2]}"))
        for l_item in data.get('lux', []):
            # [t, lux]
            all_items.append((l_item[0], f"R,{l_item[0]},{l_item[1]}"))

        all_items.sort(key=lambda x: x[0])
        for _, l in all_items:
            lines.append(l)
        lines.append("S,STOP")
    else:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    lines.append(line)
    return lines


class SerialStreamer:
    def __init__(self, port: str, baud: int = 115200):
        if serial is None:
            raise RuntimeError("pyserial is not installed. Run pip install pyserial.")
        self.ser = serial.Serial(port, baud, timeout=1.0)
        time.sleep(1.0) # Allow ESP32 reset after open

    def send_line(self, line: str):
        self.ser.write((line + '\n').encode('ascii'))

    def read_lines(self) -> List[str]:
        lines = []
        while self.ser.in_waiting:
            line = self.ser.readline().decode('ascii', errors='ignore').strip()
            if line:
                lines.append(line)
        return lines

    def close(self):
        self.ser.close()


def replay_file(file_path: str, port: Optional[str] = None, speed: float = 0, verify: bool = False) -> bool:
    print(f"Replaying {file_path} (speed={speed}x, port={'SIMULATOR' if not port else port})...")
    lines = load_events(file_path)

    received_lines = []

    if port:
        streamer = SerialStreamer(port)
        # Handshake
        streamer.send_line("HELLO,1")
        time.sleep(0.1)
        received_lines.extend(streamer.read_lines())

        start_time = time.time()
        for i, line in enumerate(lines):
            streamer.send_line(line)
            if speed > 0:
                time.sleep(1.0 / (speed * 100))
            if i % 20 == 0:
                received_lines.extend(streamer.read_lines())

        time.sleep(0.5)
        received_lines.extend(streamer.read_lines())
        streamer.close()
    else:
        # Software Simulator replay
        expected_windows = process_event_stream(lines)
        for w in expected_windows:
            feat_str = ",".join(f"{x:.3f}" for x in w['features'])
            received_lines.append(f"FEAT,{w['win_id']},{w['t_end']},{w['n_keys']},{w['valid']},{feat_str}")

    feat_lines = [l for l in received_lines if l.startswith('FEAT')]
    print(f"Received {len(feat_lines)} FEAT lines.")

    if verify:
        # Check against expected json if available
        base_name = file_path.rsplit('.', 1)[0]
        exp_path = base_name + ".expected.json"
        if os.path.exists(exp_path):
            with open(exp_path, 'r', encoding='utf-8') as f:
                exp_data = json.load(f)

            if len(feat_lines) != len(exp_data):
                print(f"FAIL: Expected {len(exp_data)} windows, got {len(feat_lines)}")
                return False

            for i, exp in enumerate(exp_data):
                parts = feat_lines[i].split(',')
                win_id = int(parts[1])
                valid = int(parts[4])
                feats = [float(x) for x in parts[5:23]]

                if win_id != exp['win_id'] or valid != exp['valid']:
                    print(f"FAIL: Window {i} metadata mismatch")
                    return False

                for f_idx in range(18):
                    c_val = feats[f_idx]
                    e_val = exp['features'][f_idx]
                    abs_err = abs(c_val - e_val)
                    rel_err = abs_err / abs(e_val) if abs(e_val) > 1e-5 else abs_err
                    if abs_err > 1e-3 and rel_err > 1e-3:
                        print(f"FAIL in win {win_id} feat {f_idx + 1}: c={c_val} exp={e_val}")
                        return False
            print(f"PASS: {file_path} matches golden expectation 100%.")
            return True
        else:
            print(f"Verified {len(feat_lines)} FEAT lines (no .expected.json file found).")
            return True

    return True


def regen_session(file_path: str):
    print(f"Regenerating features for {file_path}...")
    if not file_path.endswith('.json'):
        print(f"Skipping non-JSON file: {file_path}")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    lines = load_events(file_path)
    new_windows = process_event_stream(lines)

    # Convert to schema 1 window objects
    updated_windows = []
    for w in new_windows:
        updated_windows.append({
            'win_id': w['win_id'],
            't_end': w['t_end'],
            'n_keys': w['n_keys'],
            'valid': w['valid'],
            'f': w['features']
        })

    data['windows'] = updated_windows
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"Updated {len(updated_windows)} windows in {file_path}")


def main():
    parser = argparse.ArgumentParser(description="StressKB Replay Tool")
    parser.add_argument("input", help="CSV or session JSON file, or directory for batch verify")
    parser.add_argument("--port", help="Serial port (COMx or /dev/ttyUSBx). If omitted, uses software simulator.")
    parser.add_argument("--speed", type=float, default=0, help="Replay speed factor (0 = maximum speed)")
    parser.add_argument("--verify", action="store_true", help="Verify FEAT lines against expected JSON")
    parser.add_argument("--regen", action="store_true", help="Regenerate FEAT lines and update session JSON")

    args = parser.parse_args()

    if args.regen:
        if os.path.isdir(args.input):
            files = glob.glob(os.path.join(args.input, "**/*.json"), recursive=True)
            for f in files:
                regen_session(f)
        else:
            regen_session(args.input)
        return

    files = []
    if os.path.isdir(args.input):
        files = glob.glob(os.path.join(args.input, "*.csv"))
        args.verify = True
    else:
        files = [args.input]

    all_pass = True
    for f in files:
        ok = replay_file(f, port=args.port, speed=args.speed, verify=args.verify)
        if not ok:
            all_pass = False

    if args.verify:
        if all_pass:
            print("\nALL VERIFICATION TESTS PASSED.")
            sys.exit(0)
        else:
            print("\nVERIFICATION FAILURES DETECTED.")
            sys.exit(1)

if __name__ == '__main__':
    main()
