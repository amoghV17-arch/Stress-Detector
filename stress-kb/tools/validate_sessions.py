#!/usr/bin/env python3
"""validate_sessions.py — Comprehensive session log schema and privacy validator.
Contract per docs/REPORT_SPEC.md, docs/FEATURES.md, and docs/MILESTONES.md M4.
Rejects any file containing typed characters or violating schema 1.
"""

import os
import sys
import json
import glob
import argparse
from typing import Dict, Any, List, Tuple

ALLOWED_STRINGS = {
    'CAL', 'RUN', 'REPLAY',
    'calm', 'pressure',
    'normal', 'dim',
    'L', 'S', 'B', 'E', 'P', 'M',
    'GAP', 'MALFORMED', 'UNKNOWN_CMD', 'LINK_LOST', 'LINK_OK',
    'SENSOR_BH1750', 'CAL_TOO_SHORT', 'OVERFLOW'
}

def is_allowed_string(s: str) -> bool:
    # Allow protocol tokens, alphanumeric IDs <= 16 chars, numbers, ISO dates
    if s in ALLOWED_STRINGS:
        return True
    if len(s) <= 16 and (s.isalnum() or '_' in s or '-' in s):
        return True
    # ISO timestamp e.g. 2026-10-11T12:00:00.000Z
    if len(s) >= 19 and ('T' in s and (':' in s or '-' in s)):
        return True
    return False

def scan_for_typed_characters(obj: Any, path: str = "") -> List[str]:
    """Recursively checks that no typed text or sentence fragments exist."""
    errors = []
    if isinstance(obj, str):
        # Text with spaces, punctuation, or length > 24 is likely leaked text
        if ' ' in obj and obj not in ('Normal Room Light', 'Dim / Low Light', 'Check USB cable', 'No serial traffic', 'Motor Stopped', 'Baseline Ready', 'Type normally...', 'Keep typing...', 'Evaluating...', 'Not detected', 'No events for 5s', 'Link restored', 'Line exceeds 160 chars'):
            errors.append(f"Suspicious leaked text string at {path}: '{obj}'")
        elif len(obj) > 30 and not is_allowed_string(obj):
            errors.append(f"Oversized string at {path}: '{obj[:30]}...'")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            errors.extend(scan_for_typed_characters(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            errors.extend(scan_for_typed_characters(item, f"{path}[{i}]"))
    return errors

def validate_session(file_path: str) -> Tuple[bool, List[str], Dict[str, Any]]:
    errors = []
    metadata = {}

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return False, [f"Invalid JSON: {str(e)}"], {}

    # 1. Schema check
    if data.get('schema') != 1:
        errors.append(f"Invalid schema version: {data.get('schema')}, expected 1")

    # 2. Required root keys per REPORT_SPEC.md
    req_keys = ['schema', 'meta', 'task', 'events', 'focus', 'lux', 'baseline', 'windows', 'alerts', 'selfreport', 'warnings']
    for k in req_keys:
        if k not in data:
            errors.append(f"Missing required key: '{k}'")

    meta = data.get('meta', {})
    user_id = meta.get('user_id', '')
    session_id = meta.get('session_id', '')
    mode = meta.get('mode', '')
    condition = meta.get('condition', '')
    lighting = meta.get('lighting', '')
    has_light = meta.get('has_light_sensor', True)

    metadata = {
        'file': os.path.basename(file_path),
        'user_id': user_id,
        'session_id': session_id,
        'mode': mode,
        'condition': condition,
        'lighting': lighting,
        'has_light_sensor': has_light,
        'total_events': len(data.get('events', [])),
        'total_windows': len(data.get('windows', [])),
        'valid_windows': sum(1 for w in data.get('windows', []) if w.get('valid') == 1),
        'self_stress': data.get('selfreport', {}).get('stress', None),
        'synthetic': data.get('synthetic', False)
    }

    # 3. Privacy check (strictly no characters)
    privacy_errs = scan_for_typed_characters(data)
    if privacy_errs:
        errors.extend(privacy_errs)

    # 4. Event format check
    for i, ev in enumerate(data.get('events', [])):
        if not isinstance(ev, list) or len(ev) < 5:
            errors.append(f"Malformed event at index {i}: {ev}")
            break
        # [seq, t_down, dwell, class, err]
        cls = ev[3]
        if cls not in ('L', 'S', 'B', 'E', 'P', 'M'):
            errors.append(f"Invalid key class '{cls}' at event {i}")
            break

    # 5. Label and selfreport check
    sr = data.get('selfreport', {})
    if mode == 'RUN':
        if sr.get('stress') not in (1, 2, 3, 4, 5):
            errors.append(f"Invalid selfreport stress score: {sr.get('stress')}")

    # 6. Coverage check
    n_total_win = metadata['total_windows']
    n_valid_win = metadata['valid_windows']
    if n_total_win > 0:
        cov = n_valid_win / n_total_win
        metadata['coverage'] = cov
        if cov < 0.6 and n_total_win >= 4:
            metadata['low_coverage_warning'] = True

    return (len(errors) == 0), errors, metadata


def main():
    parser = argparse.ArgumentParser(description="StressKB Session Validator")
    parser.add_argument("path", help="Session JSON file or directory containing sessions")
    args = parser.parse_args()

    files = []
    if os.path.isdir(args.path):
        files = glob.glob(os.path.join(args.path, "**/*.json"), recursive=True)
    else:
        files = [args.path]

    if not files:
        print(f"No JSON files found in {args.path}")
        sys.exit(0)

    print(f"Validating {len(files)} session file(s)...\n")

    all_valid = True
    by_user = {}
    by_cond = {}
    no_light_count = 0

    for fpath in files:
        ok, errs, meta = validate_session(fpath)
        status = "OK" if ok else "FAIL"
        print(f"[{status}] {os.path.basename(fpath)}: user={meta.get('user_id')} mode={meta.get('mode')} win={meta.get('valid_windows')}/{meta.get('total_windows')}")
        if not ok:
            all_valid = False
            for e in errs:
                print(f"    ERROR: {e}")

        uid = meta.get('user_id', 'unknown')
        by_user.setdefault(uid, []).append(meta)

        cond_key = f"{meta.get('condition')}_{meta.get('lighting')}"
        by_cond[cond_key] = by_cond.get(cond_key, 0) + 1

        if not meta.get('has_light_sensor', True):
            no_light_count += 1

    print("\n" + "="*50)
    print("VALIDATION SUMMARY")
    print("="*50)
    print(f"Total session files inspected: {len(files)}")
    print(f"Unique participants: {len(by_user)} ({list(by_user.keys())})")
    print(f"Sessions without light sensor: {no_light_count}")
    print("Condition distribution:")
    for c, count in by_cond.items():
        print(f"  - {c}: {count}")

    if all_valid:
        print("\nALL FILES PASSED VALIDATION (0 schema or privacy errors).")
        sys.exit(0)
    else:
        print("\nVALIDATION FAILED (errors detected).")
        sys.exit(1)

if __name__ == '__main__':
    main()
