#!/usr/bin/env python3
"""train.py — StressKB TinyML model training pipeline.
Source of truth per docs/FEATURES.md and docs/MILESTONES.md M5.
Features:
- GroupKFold by participant (strict leakage assertion)
- Per-participant normalisation from CAL
- Models: RandomForest and MLPClassifier
- Targets: 3-class self-report and binary condition
- Ablation: with vs without ambient light features (17, 18)
- Feature selection (8-12 features) saved to ml/feature_selection.json
"""

import os
import sys
import glob
import json
import math
import argparse
import numpy as np
from typing import Dict, List, Tuple, Any

from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
import joblib

FEATURE_NAMES = [
    "kpm", "iki_mean", "iki_std", "iki_cv", "dwell_mean", "dwell_std",
    "overlap_ratio", "bksp_rate", "bksp_bursts", "err_rate", "corr_latency",
    "post_err_slow", "long_pauses", "idle_frac", "burstiness", "focus_loss",
    "lux_mean", "lux_std"
]

TRANSFORMED_FEATURE_NAMES = [
    "kpm", "iki_mean", "iki_std", "iki_cv", "dwell_mean", "dwell_std",
    "overlap_ratio", "bksp_rate", "bksp_bursts", "err_rate", "corr_latency",
    "post_err_slow", "long_pauses", "idle_frac", "burstiness", "focus_loss",
    "lux_mean_log", "lux_std_rel"
]

def transform_features(raw_f: List[float]) -> List[float]:
    """Applies model-input transform per FEATURES.md:
    x17 = ln(1 + lux_mean)
    x18 = lux_std / (lux_mean + 1)
    Features 1-16 unchanged.
    """
    f = list(raw_f)
    lux_mean = float(f[16])
    lux_std = float(f[17])
    f[16] = math.log(1.0 + max(0.0, lux_mean))
    f[17] = lux_std / (max(0.0, lux_mean) + 1.0)
    return f

def load_data(data_dir: str) -> Tuple[Dict[str, Any], bool]:
    """Loads all session JSON files from data_dir.
    Computes per-participant CAL baselines and normalises RUN sessions.
    Returns dataset dictionary and boolean is_synthetic.
    """
    files = sorted(glob.glob(os.path.join(data_dir, "*.json")))
    if not files:
        raise FileNotFoundError(f"No JSON session files found in {data_dir}")

    sessions = []
    is_synthetic = False
    for path in files:
        with open(path, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
            sessions.append(data)
            if data.get('synthetic', False):
                is_synthetic = True

    # Organize sessions by participant
    user_cal = {} # user_id -> list of transformed valid windows
    user_runs = {} # user_id -> list of session dicts
    all_cal_transformed_windows = []

    for s in sessions:
        uid = s['meta']['user_id']
        mode = s['meta']['mode']
        valid_windows = [w for w in s.get('windows', []) if w.get('valid', 0) == 1]

        if mode == 'CAL':
            user_cal[uid] = []
            for w in valid_windows:
                tw = transform_features(w['f'])
                user_cal[uid].append(tw)
                all_cal_transformed_windows.append(tw)
        elif mode == 'RUN':
            if uid not in user_runs:
                user_runs[uid] = []
            user_runs[uid].append(s)

    # Compute global baseline from all valid CAL windows across all participants
    if all_cal_transformed_windows:
        all_cal_mat = np.array(all_cal_transformed_windows, dtype=np.float64)
        global_mu = np.mean(all_cal_mat, axis=0)
        global_sd = np.std(all_cal_mat, axis=0, ddof=0)
    else:
        global_mu = np.zeros(18, dtype=np.float64)
        global_sd = np.ones(18, dtype=np.float64)

    global_sd_eff = np.maximum(global_sd, np.maximum(0.1 * np.abs(global_mu), 1e-3))

    # Compute per-participant baseline
    user_baseline = {}
    for uid, cal_wins in user_cal.items():
        if cal_wins:
            mat = np.array(cal_wins, dtype=np.float64)
            mu = np.mean(mat, axis=0)
            sd = np.std(mat, axis=0, ddof=0)
            sd_eff = np.maximum(sd, np.maximum(0.1 * np.abs(mu), 1e-3))
            user_baseline[uid] = (mu, sd_eff, sd)
        else:
            user_baseline[uid] = (global_mu, global_sd_eff, global_sd)

    # Build feature matrix and target vectors
    X_list = []
    y_stress_list = [] # 0: Low, 1: Med, 2: High
    y_cond_list = []   # 0: Calm, 1: Pressure
    groups_list = []   # user_id
    sessions_list = [] # session_id
    light_sensor_list = [] # boolean

    for uid, run_sessions in user_runs.items():
        mu, sd_eff, _ = user_baseline.get(uid, (global_mu, global_sd_eff, global_sd))

        for s in run_sessions:
            sid = s['meta']['session_id']
            has_light = s['meta'].get('has_light_sensor', True)
            cond = s['meta'].get('condition', 'calm')
            y_c = 1 if cond == 'pressure' else 0

            stress_val = s.get('selfreport', {}).get('stress', 2)
            if stress_val <= 2:
                y_s = 0 # Low
            elif stress_val == 3:
                y_s = 1 # Medium
            else:
                y_s = 2 # High

            for w in s.get('windows', []):
                if w.get('valid', 0) != 1:
                    continue
                tw = transform_features(w['f'])
                # z = clip((x - mu) / sd_eff, -5, 5)
                z = np.clip((np.array(tw, dtype=np.float64) - mu) / sd_eff, -5.0, 5.0)

                X_list.append(z)
                y_stress_list.append(y_s)
                y_cond_list.append(y_c)
                groups_list.append(uid)
                sessions_list.append(sid)
                light_sensor_list.append(has_light)

    dataset = {
        'X': np.array(X_list, dtype=np.float32),
        'y_stress': np.array(y_stress_list, dtype=np.int64),
        'y_cond': np.array(y_cond_list, dtype=np.int64),
        'groups': np.array(groups_list),
        'sessions': np.array(sessions_list),
        'has_light': np.array(light_sensor_list),
        'global_mu': global_mu.tolist(),
        'global_sd': global_sd.tolist(),
        'user_baseline': user_baseline,
        'is_synthetic': is_synthetic,
        'n_participants': len(set(groups_list)),
        'n_windows': len(X_list)
    }

    return dataset, is_synthetic

def cross_validate(X: np.ndarray, y: np.ndarray, groups: np.ndarray, model_factory, n_splits: int = 5):
    """Evaluates model using GroupKFold by participant with explicit leakage assertion."""
    unique_groups = np.unique(groups)
    splits = min(n_splits, len(unique_groups))
    gkf = GroupKFold(n_splits=splits)

    oof_preds = np.zeros(len(y), dtype=np.int64)
    oof_probs = np.zeros((len(y), len(np.unique(y))), dtype=np.float32)

    fold_scores = []

    for fold, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups)):
        train_p = set(groups[train_idx])
        test_p = set(groups[test_idx])

        # Strict leakage assertion per M5
        overlap = train_p.intersection(test_p)
        assert len(overlap) == 0, f"DATA LEAKAGE DETECTED in fold {fold}: {overlap}"

        clf = model_factory()
        clf.fit(X[train_idx], y[train_idx])

        pred = clf.predict(X[test_idx])
        oof_preds[test_idx] = pred

        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba(X[test_idx])
            unique_classes = np.unique(y)
            for col_idx, cls_val in enumerate(clf.classes_):
                target_col = np.where(unique_classes == cls_val)[0][0]
                oof_probs[test_idx, target_col] = probs[:, col_idx]

        acc = accuracy_score(y[test_idx], pred)
        f1 = f1_score(y[test_idx], pred, average='macro', zero_division=0)
        fold_scores.append({'fold': fold, 'acc': acc, 'f1': f1, 'test_participants': list(test_p)})

    total_acc = accuracy_score(y, oof_preds)
    total_f1 = f1_score(y, oof_preds, average='macro', zero_division=0)
    cm = confusion_matrix(y, oof_preds)

    return {
        'oof_preds': oof_preds.tolist(),
        'oof_probs': oof_probs.tolist(),
        'accuracy': float(total_acc),
        'macro_f1': float(total_f1),
        'confusion_matrix': cm.tolist(),
        'fold_scores': fold_scores
    }

def run_training_pipeline(data_dir: str, output_dir: str = "ml"):
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "results"), exist_ok=True)

    print(f"Loading data from {data_dir}...")
    dataset, is_synthetic = load_data(data_dir)
    print(f"Loaded {dataset['n_windows']} valid windows across {dataset['n_participants']} participants.")
    print(f"Synthetic data flag: {is_synthetic}")

    X = dataset['X']
    y_stress = dataset['y_stress']
    y_cond = dataset['y_cond']
    groups = dataset['groups']

    # 1. Train full RandomForest on 3-class stress
    def rf_factory():
        return RandomForestClassifier(n_estimators=100, max_depth=6, class_weight='balanced', random_state=42)

    def mlp_factory():
        return MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=500, random_state=42)

    print("\n--- Cross-validating RandomForest (3-class Stress) ---")
    cv_rf_stress = cross_validate(X, y_stress, groups, rf_factory)
    print(f"RF 3-class Accuracy: {cv_rf_stress['accuracy']:.4f}, Macro-F1: {cv_rf_stress['macro_f1']:.4f}")

    print("\n--- Cross-validating MLP (3-class Stress) ---")
    cv_mlp_stress = cross_validate(X, y_stress, groups, mlp_factory)
    print(f"MLP 3-class Accuracy: {cv_mlp_stress['accuracy']:.4f}, Macro-F1: {cv_mlp_stress['macro_f1']:.4f}")

    print("\n--- Cross-validating RandomForest (Binary Condition) ---")
    cv_rf_cond = cross_validate(X, y_cond, groups, rf_factory)
    print(f"RF Binary Condition Accuracy: {cv_rf_cond['accuracy']:.4f}, Macro-F1: {cv_rf_cond['macro_f1']:.4f}")

    # 2. Feature Importance & Selection (using RF)
    full_rf = rf_factory()
    full_rf.fit(X, y_stress)
    importances = full_rf.feature_importances_

    sorted_indices = np.argsort(importances)[::-1]
    # Select top 10 features (between 8 and 12 per M5 spec)
    n_selected = 10
    selected_indices = sorted_indices[:n_selected].tolist()
    # Sort indices ascending for canonical ordering
    selected_indices = sorted(selected_indices)

    selected_names = [TRANSFORMED_FEATURE_NAMES[i] for i in selected_indices]
    print("\n--- Feature Selection ---")
    print(f"Top {n_selected} features selected: {selected_names}")
    for idx in selected_indices:
        print(f"  [{idx+1:2d}] {TRANSFORMED_FEATURE_NAMES[idx]:15s}: {importances[idx]:.4f}")

    # Cross-validate RF on selected features only
    X_selected = X[:, selected_indices]
    cv_rf_selected = cross_validate(X_selected, y_stress, groups, rf_factory)
    print(f"RF (Selected {n_selected} features) Accuracy: {cv_rf_selected['accuracy']:.4f}, Macro-F1: {cv_rf_selected['macro_f1']:.4f}")

    # 3. Ablation Study: with light (all 18) vs without light (16 features)
    has_light_mask = dataset['has_light']
    X_light = X[has_light_mask]
    y_light = y_stress[has_light_mask]
    groups_light = groups[has_light_mask]

    X_no_light = X_light[:, :16] # exclude features 17 and 18

    cv_ablation_with_light = cross_validate(X_light, y_light, groups_light, rf_factory)
    cv_ablation_no_light = cross_validate(X_no_light, y_light, groups_light, rf_factory)

    # 4. Save Feature Selection JSON per M5 spec
    global_mu = dataset['global_mu']
    global_sd = dataset['global_sd']

    feature_selection_meta = {
        "n_features": n_selected,
        "selected_features": selected_names,
        "feature_indices_0indexed": selected_indices,
        "feature_indices_1indexed": [i + 1 for i in selected_indices],
        "feature_importances": {TRANSFORMED_FEATURE_NAMES[i]: float(importances[i]) for i in range(18)},
        "global_baseline": {
            "mu": [float(global_mu[i]) for i in selected_indices],
            "sd": [float(global_sd[i]) for i in selected_indices]
        },
        "all_global_baseline": {
            "mu": [float(m) for m in global_mu],
            "sd": [float(s) for s in global_sd]
        },
        "classes": ["Low", "Medium", "High"],
        "class_mapping": {"0": "Low", "1": "Medium", "2": "High"},
        "is_synthetic": is_synthetic
    }

    feat_sel_path = os.path.join(output_dir, "feature_selection.json")
    with open(feat_sel_path, 'w', encoding='utf-8') as fp:
        json.dump(feature_selection_meta, fp, indent=2)
    print(f"Saved feature selection metadata to {feat_sel_path}")

    # 5. Fit and save final exportable model trained on selected features
    final_model = rf_factory()
    final_model.fit(X_selected, y_stress)
    model_save_path = os.path.join(output_dir, "model_rf.joblib")
    joblib.dump(final_model, model_save_path)
    print(f"Saved trained model to {model_save_path}")

    # Compile all results into structured dictionary for evaluate.py
    results = {
        'is_synthetic': is_synthetic,
        'n_participants': dataset['n_participants'],
        'n_windows': dataset['n_windows'],
        'cv_rf_stress': cv_rf_stress,
        'cv_mlp_stress': cv_mlp_stress,
        'cv_rf_cond': cv_rf_cond,
        'cv_rf_selected': cv_rf_selected,
        'cv_ablation_with_light': cv_ablation_with_light,
        'cv_ablation_no_light': cv_ablation_no_light,
        'feature_selection': feature_selection_meta,
        'per_participant_scores': {}
    }

    # Per-participant breakdown for RF (selected features)
    oof_preds_arr = np.array(cv_rf_selected['oof_preds'])
    for p in np.unique(groups):
        p_mask = (groups == p)
        p_y = y_stress[p_mask]
        p_pred = oof_preds_arr[p_mask]
        p_acc = accuracy_score(p_y, p_pred)
        p_f1 = f1_score(p_y, p_pred, average='macro', zero_division=0)
        results['per_participant_scores'][str(p)] = {
            'n_windows': int(np.sum(p_mask)),
            'accuracy': float(p_acc),
            'macro_f1': float(p_f1)
        }

    results_json_path = os.path.join(output_dir, "results", "train_results.json")
    with open(results_json_path, 'w', encoding='utf-8') as fp:
        json.dump(results, fp, indent=2)
    print(f"Saved training results to {results_json_path}")

    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train StressKB TinyML pipeline")
    parser.add_argument("--data-dir", default=None, help="Directory containing session JSON files")
    parser.add_argument("--output-dir", default="ml", help="Output directory for models and results")
    args = parser.parse_args()

    data_dir = args.data_dir
    if not data_dir:
        # Default priority: ml/data/real if exists with >= 5 participants, else ml/data/synthetic
        real_dir = os.path.join("ml", "data", "real")
        real_files = glob.glob(os.path.join(real_dir, "*.json"))
        if len(real_files) >= 5:
            data_dir = real_dir
        else:
            data_dir = os.path.join("ml", "data", "synthetic")

    run_training_pipeline(data_dir, args.output_dir)
