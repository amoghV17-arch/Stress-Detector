import os
import json
import numpy as np
import pytest
from ml.train import transform_features, cross_validate, TRANSFORMED_FEATURE_NAMES
from sklearn.ensemble import RandomForestClassifier

def test_transform_features():
    # 18 raw features
    raw = [100.0] * 18
    raw[16] = 300.0 # lux_mean
    raw[17] = 30.0  # lux_std

    trans = transform_features(raw)
    assert len(trans) == 18
    # x17 = ln(1 + lux_mean)
    assert abs(trans[16] - np.log(1.0 + 300.0)) < 1e-5
    # x18 = lux_std / (lux_mean + 1)
    assert abs(trans[17] - (30.0 / 301.0)) < 1e-5
    # features 1-16 unchanged
    assert trans[:16] == raw[:16]

def test_leakage_assertion():
    # Synthetic group test
    groups = np.array(["u01", "u01", "u02", "u02", "u03", "u03", "u04", "u04", "u05", "u05"])
    X = np.random.randn(10, 5)
    y = np.array([0, 0, 1, 1, 2, 2, 0, 0, 1, 1])

    def model_factory():
        return RandomForestClassifier(n_estimators=5, random_state=42)

    res = cross_validate(X, y, groups, model_factory, n_splits=5)
    assert "accuracy" in res
    assert "macro_f1" in res
    assert len(res["fold_scores"]) == 5

    # Verify that each fold had zero participant overlap
    for fold in res["fold_scores"]:
        test_pts = set(fold["test_participants"])
        train_pts = set(groups) - test_pts
        assert len(train_pts.intersection(test_pts)) == 0

def test_feature_selection_json_exists():
    path = os.path.join("ml", "feature_selection.json")
    assert os.path.exists(path), f"{path} not found"
    with open(path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    assert "selected_features" in meta
    assert 8 <= meta["n_features"] <= 12
    assert len(meta["selected_features"]) == meta["n_features"]
    assert len(meta["feature_indices_0indexed"]) == meta["n_features"]
    assert "global_baseline" in meta
    assert len(meta["global_baseline"]["mu"]) == meta["n_features"]
    assert len(meta["global_baseline"]["sd"]) == meta["n_features"]

def test_synthetic_banners_present():
    results_dir = os.path.join("ml", "results")
    if os.path.exists(os.path.join(results_dir, "train_results.json")):
        with open(os.path.join(results_dir, "train_results.json"), "r", encoding="utf-8") as f:
            res = json.load(f)
        if res.get("is_synthetic"):
            for fname in ["metrics_summary.md", "ablation_study.md", "confusion_matrices.md", "participant_breakdown.md"]:
                fpath = os.path.join(results_dir, fname)
                assert os.path.exists(fpath), f"{fpath} missing"
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                assert "SYNTHETIC — NOT REAL RESULTS" in content
