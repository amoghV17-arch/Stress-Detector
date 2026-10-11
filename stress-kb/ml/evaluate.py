#!/usr/bin/env python3
"""evaluate.py — Generates metric tables and figures for StressKB report.
Outputs:
- ml/results/metrics_summary.md
- ml/results/ablation_study.md
- ml/results/confusion_matrices.md
- ml/results/participant_breakdown.md
- ml/results/figures/confusion_matrix_rf_3class.png
- ml/results/figures/feature_importance.png

Banners everything derived from synthetic data with:
> [!WARNING]
> **SYNTHETIC — NOT REAL RESULTS**
"""

import os
import sys
import json
import argparse
import numpy as np

# Set headless matplotlib backend before importing pyplot
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def get_synthetic_banner(is_synthetic: bool) -> str:
    if is_synthetic:
        return (
            "> [!WARNING]\n"
            "> **SYNTHETIC — NOT REAL RESULTS**\n"
            "> These metrics and tables were generated using synthetic participant sessions (`tools/synth_data.py`).\n"
            "> They validate pipeline functionality and TinyML export, but do not represent physical human participant findings.\n\n"
        )
    return ""

def generate_markdown_reports(results_path: str, out_dir: str = "ml/results"):
    os.makedirs(out_dir, exist_ok=True)
    fig_dir = os.path.join(out_dir, "figures")
    os.makedirs(fig_dir, exist_ok=True)

    with open(results_path, 'r', encoding='utf-8') as fp:
        res = json.load(fp)

    is_synthetic = res.get('is_synthetic', False)
    banner = get_synthetic_banner(is_synthetic)

    # 1. Metrics Summary Table
    metrics_summary_path = os.path.join(out_dir, "metrics_summary.md")
    rf_stress = res['cv_rf_stress']
    mlp_stress = res['cv_mlp_stress']
    rf_selected = res['cv_rf_selected']
    rf_cond = res['cv_rf_cond']

    n_sel = res['feature_selection']['n_features']

    summary_md = [
        "# Model Performance Evaluation Summary\n",
        banner,
        f"- **Dataset**: {res['n_participants']} participants, {res['n_windows']} valid windows (30s window / 15s hop)",
        "- **Validation Protocol**: GroupKFold (grouped by participant, 0% cross-fold leakage)\n",
        "## Overall Model Comparison\n",
        "| Model | Target Task | Features Used | Accuracy | Macro F1-Score |",
        "|---|---|---|---|---|",
        f"| Random Forest (100 trees) | Self-Report Stress (3-Class) | All 18 features | {rf_stress['accuracy']:.3f} | {rf_stress['macro_f1']:.3f} |",
        f"| MLP Classifier (32x16) | Self-Report Stress (3-Class) | All 18 features | {mlp_stress['accuracy']:.3f} | {mlp_stress['macro_f1']:.3f} |",
        f"| **Random Forest (Deployable)** | **Self-Report Stress (3-Class)** | **Top {n_sel} selected features** | **{rf_selected['accuracy']:.3f}** | **{rf_selected['macro_f1']:.3f}** |",
        f"| Random Forest (Secondary) | Experimental Condition (Binary) | All 18 features | {rf_cond['accuracy']:.3f} | {rf_cond['macro_f1']:.3f} |",
        "\n### Selected Feature Subset for TinyML Deployment",
        f"The top {n_sel} features selected for firmware deployment on ESP32 Dev Module:\n",
        "| Index | Feature Code | Description | Importance |",
        "|---|---|---|---|"
    ]

    sel_indices = res['feature_selection']['feature_indices_0indexed']
    importances = res['feature_selection']['feature_importances']
    for idx in sel_indices:
        name = res['feature_selection']['selected_features'][sel_indices.index(idx)]
        imp = importances.get(name, 0.0)
        summary_md.append(f"| {idx+1} | `{name}` | Feature index #{idx+1} per FEATURES.md | {imp:.4f} |")

    with open(metrics_summary_path, 'w', encoding='utf-8') as fp:
        fp.write("\n".join(summary_md) + "\n")
    print(f"Generated {metrics_summary_path}")

    # 2. Ablation Study Table
    ablation_path = os.path.join(out_dir, "ablation_study.md")
    abl_with = res['cv_ablation_with_light']
    abl_no = res['cv_ablation_no_light']

    ablation_md = [
        "# Feature Ablation Study: Environmental Light Impact\n",
        banner,
        "Ablation comparison between models with and without ambient light sensor inputs (features 17: `lux_mean_log` and 18: `lux_std_rel`).",
        "All models evaluated via 5-fold participant-grouped cross validation on 3-class self-report stress.\n",
        "| Feature Configuration | Input Features Count | Accuracy | Macro F1 | Delta F1 vs Base |",
        "|---|---|---|---|---|",
        f"| Full Multimodal (Typing + Ambient Light) | 18 | {abl_with['accuracy']:.3f} | {abl_with['macro_f1']:.3f} | Base |",
        f"| Keystroke Timing & Dynamics Only (No Light) | 16 | {abl_no['accuracy']:.3f} | {abl_no['macro_f1']:.3f} | {abl_no['macro_f1'] - abl_with['macro_f1']:+.3f} |",
        "\n### Interpretation",
        "Keystroke dynamics provide the primary diagnostic signal for typing stress detection.",
        "Ambient light features provide contextual information (e.g. distinguishing dimly lit night sessions from bright daylight), helping isolate circadian/lighting confounders from typing stress."
    ]

    with open(ablation_path, 'w', encoding='utf-8') as fp:
        fp.write("\n".join(ablation_md) + "\n")
    print(f"Generated {ablation_path}")

    # 3. Confusion Matrix Breakdown
    cm_path = os.path.join(out_dir, "confusion_matrices.md")
    cm_rf = np.array(rf_selected['confusion_matrix'])
    classes = res['feature_selection']['classes']

    cm_md = [
        "# Confusion Matrix Breakdown\n",
        banner,
        "Out-of-fold confusion matrix for the deployable Random Forest model on 3-class stress target (Low: 0, Medium: 1, High: 2).\n",
        "| True Class \\ Predicted | Predicted Low | Predicted Medium | Predicted High | Total |",
        "|---|---|---|---|---|"
    ]

    for i, c_name in enumerate(classes):
        row = cm_rf[i]
        total = int(np.sum(row))
        cm_md.append(f"| **True {c_name}** | {row[0]} | {row[1]} | {row[2]} | {total} |")

    cm_md.append("\n### Per-Class Recall and Precision")
    cm_md.append("| Class | Precision | Recall | Support |")
    cm_md.append("|---|---|---|---|")
    for i, c_name in enumerate(classes):
        col_sum = np.sum(cm_rf[:, i])
        row_sum = np.sum(cm_rf[i, :])
        prec = (cm_rf[i, i] / col_sum) if col_sum > 0 else 0.0
        rec = (cm_rf[i, i] / row_sum) if row_sum > 0 else 0.0
        cm_md.append(f"| {c_name} | {prec:.3f} | {rec:.3f} | {int(row_sum)} |")

    with open(cm_path, 'w', encoding='utf-8') as fp:
        fp.write("\n".join(cm_md) + "\n")
    print(f"Generated {cm_path}")

    # 4. Per-Participant Breakdown
    pp_path = os.path.join(out_dir, "participant_breakdown.md")
    pp_scores = res.get('per_participant_scores', {})

    pp_md = [
        "# Per-Participant Performance Breakdown\n",
        banner,
        "Evaluation of out-of-fold generalisation across individual participants (leave-participant-out GroupKFold).\n",
        "| Participant ID | Windows Evaluated | Accuracy | Macro F1 |",
        "|---|---|---|---|"
    ]

    for pid, scores in sorted(pp_scores.items()):
        pp_md.append(f"| `{pid}` | {scores['n_windows']} | {scores['accuracy']:.3f} | {scores['macro_f1']:.3f} |")

    with open(pp_path, 'w', encoding='utf-8') as fp:
        fp.write("\n".join(pp_md) + "\n")
    print(f"Generated {pp_path}")

    # 5. Generate Figures
    # 5a. Confusion Matrix Heatmap
    plt.figure(figsize=(6, 5))
    plt.imshow(cm_rf, interpolation='nearest', cmap=plt.cm.Blues)
    title_str = "Confusion Matrix (Random Forest)\n"
    if is_synthetic:
        title_str += "[SYNTHETIC — NOT REAL RESULTS]"
    plt.title(title_str, fontsize=12, fontweight='bold', color='crimson' if is_synthetic else 'black')
    plt.colorbar()
    tick_marks = np.arange(len(classes))
    plt.xticks(tick_marks, classes)
    plt.yticks(tick_marks, classes)

    thresh = cm_rf.max() / 2.0
    for i in range(cm_rf.shape[0]):
        for j in range(cm_rf.shape[1]):
            plt.text(j, i, format(cm_rf[i, j], 'd'),
                     ha="center", va="center",
                     color="white" if cm_rf[i, j] > thresh else "black")

    plt.ylabel('Ground Truth Label')
    plt.xlabel('Predicted Label')
    plt.tight_layout()
    cm_fig_path = os.path.join(fig_dir, "confusion_matrix_rf_3class.png")
    plt.savefig(cm_fig_path, dpi=150)
    plt.close()
    print(f"Saved figure {cm_fig_path}")

    # 5b. Feature Importance Bar Chart
    plt.figure(figsize=(10, 6))
    names = list(importances.keys())
    imps = [importances[k] for k in names]
    # Sort by importance ascending for horizontal bar chart
    order = np.argsort(imps)
    sorted_names = [names[i] for i in order]
    sorted_imps = [imps[i] for i in order]

    colors = ['#1f77b4' if k not in res['feature_selection']['selected_features'] else '#2ca02c' for k in sorted_names]
    plt.barh(np.arange(len(sorted_names)), sorted_imps, color=colors)
    plt.yticks(np.arange(len(sorted_names)), sorted_names)
    plt.xlabel('Random Forest Gini Importance')
    title_imp = "Feature Importances (Green = Selected for TinyML)\n"
    if is_synthetic:
        title_imp += "[SYNTHETIC — NOT REAL RESULTS]"
    plt.title(title_imp, fontsize=12, fontweight='bold', color='crimson' if is_synthetic else 'black')
    plt.tight_layout()
    fi_fig_path = os.path.join(fig_dir, "feature_importance.png")
    plt.savefig(fi_fig_path, dpi=150)
    plt.close()
    print(f"Saved figure {fi_fig_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate StressKB training results")
    parser.add_argument("--results-json", default="ml/results/train_results.json", help="Path to train_results.json")
    parser.add_argument("--out-dir", default="ml/results", help="Directory for output markdown tables and figures")
    args = parser.parse_args()

    generate_markdown_reports(args.results_json, args.out_dir)
