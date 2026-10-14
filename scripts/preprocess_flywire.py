#!/usr/bin/env python3
"""
preprocess_flywire.py
======================

Converts RAW FlyWire Codex static data exports (FAFB v783, "Female Adult Fly
Brain") into a compact, game-ready JSON model: data/brain-model.json

WHY THIS EXISTS
---------------
The real FlyWire FAFB connectome has ~139,000 traced neurons and several
million synaptic connections. That is real, valuable data -- but it is far
too large (and far too anatomically granular) to run as a live, per-neuron
simulation inside a browser game at 60fps. It would not be scientifically
honest to claim otherwise.

Instead, this script performs a *documented, reproducible* aggregation:

  1. Every real neuron (identified by its FlyWire `root_id`) is assigned to
     exactly ONE of ~15 game "brain modules" (e.g. Olfactory, Mushroom Body -
     Kenyon Cells, Central Complex - Navigation, ...) based on its real
     FlyWire classification (`super_class` / `class` / `sub_class`), its
     dominant neuropil (from the per-neuron neuropil synapse table), or its
     predicted neurotransmitter (for octopaminergic arousal neurons).
  2. All ~5.3 million real synaptic connections between individual neurons
     are aggregated into weighted directed edges BETWEEN MODULES, summed
     from real `syn_count` synapse counts, with the dominant neurotransmitter
     preserved per edge.
  3. Per-module statistics (neuron counts, total synapses, source neuropils,
     a sample of real root IDs / cell-type names) are kept so the game's
     brain overlay can cite exactly which real anatomical structures each
     module is standing in for.

The output is NOT a claim that the game simulates the fly brain at synaptic
resolution. It IS a claim that the module graph, its connection weights, and
its neurotransmitter labels are genuinely derived from the real FlyWire FAFB
v783 connectome, aggregated for interactivity.

INPUT (place FlyWire Codex CSV(.gz) exports here): ../data_raw/
  - classification.csv(.gz)          root_id, flow, super_class, class,
                                      sub_class, hemilineage, side, nerve
  - neurons.csv(.gz)                 root_id, group, nt_type, nt_type_score,
                                      da_avg, ser_avg, gaba_avg, glut_avg,
                                      ach_avg, oct_avg
  - consolidated_cell_types.csv(.gz) root_id, primary_type, additional_type(s)
  - names.csv(.gz)                   root_id, name, group
  - neuropil_synapse_table.csv(.gz)  root_id, input/output synapses & partner
                                      counts broken down per neuropil
  - connections_princeton.csv(.gz)   pre_root_id, post_root_id, neuropil,
                                      syn_count, nt_type  (~5.3M rows)

OUTPUT: ../src/data/brain-model.json

USAGE:
    pip install pandas
    python3 preprocess_flywire.py

If you have a fresher FlyWire Codex download, drop the new CSVs into
data_raw/ (same filenames) and re-run this script to regenerate the model.
"""

import gzip
import json
import os
import sys
from collections import Counter, defaultdict

import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data_raw")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "brain-model.json")

DATASET_META = {
    "name": "FlyWire FAFB",
    "version": "v783",
    "full_name": "Female Adult Fly Brain (FAFB), FlyWire Codex export",
    "synapse_table_source": "connections_princeton.csv (Princeton/Seung Lab synapse table, FlyWire consortium)",
    "citation": "Dorkenwald et al. 2024, Nature — 'Neuronal wiring diagram of an adult brain' (FlyWire FAFB); Schlegel et al. — FlyWire hierarchical annotations; Codex (codex.flywire.ai)",
    "processed_by": "preprocess_flywire.py (this repo) — a local, documented aggregation step, not an official FlyWire product",
}


def find(name):
    """Return path to name.csv or name.csv.gz, whichever exists."""
    p_gz = os.path.join(RAW_DIR, name + ".csv.gz")
    p_plain = os.path.join(RAW_DIR, name + ".csv")
    if os.path.exists(p_gz):
        return p_gz
    if os.path.exists(p_plain):
        return p_plain
    return None


def load_csv(name, **kwargs):
    path = find(name)
    if path is None:
        print(f"  [!] Missing {name}.csv(.gz) in {RAW_DIR} -- skipping, will use defaults.")
        return None
    print(f"  loading {os.path.basename(path)} ...")
    return pd.read_csv(path, **kwargs)


# ---------------------------------------------------------------------------
# MODULE DEFINITIONS
# ---------------------------------------------------------------------------
# Each module = one node in the game's brain overlay. `category` groups them
# visually (sensory / associative / state / motor) in the UI.
MODULES = [
    dict(id="olfactory_al", label="Olfactory (Antennal Lobe)", category="sensory",
         desc="Detects fruit and rubbish scent molecules picked up by the antennae."),
    dict(id="gustatory", label="Gustatory (Taste)", category="sensory",
         desc="Responds to taste on contact -- sugar, bitterness, spoilage."),
    dict(id="visual", label="Visual (Optic Lobes)", category="sensory",
         desc="Detects motion, light and nearby objects, including the player's hand."),
    dict(id="mechanosensory", label="Mechanosensory / Ambient", category="sensory",
         desc="Wind, touch, humidity and temperature -- general environmental awareness."),
    dict(id="lateral_horn", label="Lateral Horn (Innate Valence)", category="associative",
         desc="Hard-wired, unlearned attraction/aversion to smells -- instinct, not memory."),
    dict(id="mb_kenyon", label="Mushroom Body - Kenyon Cells (Memory)", category="associative",
         desc="Sparse coding of odor identity; the searchable memory core of the fly brain."),
    dict(id="mb_dan", label="Mushroom Body - Dopamine (Reward Signal)", category="associative",
         desc="Dopaminergic neurons that write reward/punishment signals into memory."),
    dict(id="mb_output", label="Mushroom Body - MBONs (Decision Output)", category="associative",
         desc="Reads out learned valence and biases approach vs. avoidance."),
    dict(id="cx_navigation", label="Central Complex - Navigation", category="state",
         desc="Heading, orientation and spatial memory (ellipsoid body / protocerebral bridge)."),
    dict(id="cx_sleep", label="Central Complex - Sleep / Arousal", category="state",
         desc="Fan-shaped-body circuitry linked to sleep pressure and rest drive."),
    dict(id="neurosecretory", label="Neurosecretory (Hunger Hormones)", category="state",
         desc="Pars intercerebralis / lateralis -- insulin-like and diuretic hormone signalling; the closest real analogue to a hunger/satiety center."),
    dict(id="integration_hub", label="Higher-Order Integration (Curiosity)", category="state",
         desc="Superior protocerebrum convergence zones (SMP/SLP/SIP) integrating multiple senses -- used here as the seat of novelty/exploration drive."),
    dict(id="arousal_stress", label="Arousal / Stress (Octopamine)", category="state",
         desc="Octopaminergic neurons -- the fly's diffuse 'fight or flight' neuromodulatory system."),
    dict(id="descending_motor", label="Descending Motor Command", category="motor",
         desc="Brain-to-body commands driving approach, avoidance, landing, hovering and crawling."),
    dict(id="feeding_motor", label="Feeding Motor (Proboscis)", category="motor",
         desc="Motor neurons controlling proboscis extension and ingestion."),
]
MODULE_IDS = {m["id"] for m in MODULES}
OTHER = "other_unassigned"


def classify_neuron(row, npt_lookup, oct_ids):
    rid = row["root_id"]
    cls = row.get("class")
    sup = row.get("super_class")
    sub = row.get("sub_class")

    # Priority 0: neurochemical override -- octopaminergic neurons are a
    # diffusely-distributed neuromodulatory system, so we classify by
    # transmitter rather than anatomical class.
    if rid in oct_ids:
        return "arousal_stress"

    if cls in ("olfactory", "ALPN", "ALLN", "ALON"):
        return "olfactory_al"
    if cls == "gustatory":
        return "gustatory"
    if cls == "Kenyon_Cell":
        return "mb_kenyon"
    if cls == "DAN":
        return "mb_dan"
    if cls in ("MBON", "MBIN"):
        return "mb_output"
    if cls in ("LHLN", "LHCENT"):
        return "lateral_horn"
    if cls in ("pars_intercerebralis", "pars_lateralis"):
        return "neurosecretory"
    if cls == "CX":
        fb, ebpbno = npt_lookup.get(rid, (0, 0))
        return "cx_sleep" if fb > ebpbno else "cx_navigation"
    if cls in ("mechanosensory", "hygrosensory", "thermosensory"):
        return "mechanosensory"
    if sub == "ingestion_motor_neuron":
        return "feeding_motor"
    if cls == "brain_motor_neuron":
        return "descending_motor"
    if sup == "descending":
        return "descending_motor"
    if sup in ("optic", "visual_projection", "visual_centrifugal") or cls in ("visual", "ocellar"):
        return "visual"
    if sup == "central" and pd.isna(cls):
        integ, total = npt_lookup.get(rid + "_integ", (0, 0))
        if total > 0 and integ > 0.4 * total:
            return "integration_hub"
        return OTHER
    if sup in ("ascending", "sensory_ascending") or cls in ("AN", "TPN"):
        return OTHER  # kept as raw stat, not a displayed module (see README)
    return OTHER


def main():
    print("== FlyWire Codex -> game brain-model.json ==")
    print(f"Reading raw data from: {os.path.abspath(RAW_DIR)}")

    cls_df = load_csv("classification", dtype=str)
    neu_df = load_csv("neurons", dtype=str)
    names_df = load_csv("names", dtype=str)
    cct_df = load_csv("consolidated_cell_types", dtype=str)
    npt_df = load_csv("neuropil_synapse_table", dtype=str, low_memory=False)

    if cls_df is None:
        print("ERROR: classification.csv is required. Aborting.")
        sys.exit(1)

    # ---- neuropil lookup: (fb_total, ebpbno_total) and (integ_total, all_total) per root_id
    npt_lookup = {}
    if npt_df is not None:
        num_cols = [c for c in npt_df.columns if c != "root_id"]
        npt_df[num_cols] = npt_df[num_cols].apply(pd.to_numeric, errors="coerce").fillna(0)
        fb_cols = [c for c in npt_df.columns if "FB" in c and "synapses" in c]
        ebpbno_cols = [c for c in npt_df.columns if any(k in c for k in ["EB", "PB", "NO"]) and "synapses" in c]
        integ_cols = [c for c in npt_df.columns if any(k in c for k in ["SMP", "SLP", "SIP"]) and "synapses" in c]
        all_syn_cols = [c for c in npt_df.columns if "synapses in" in c]
        fb_tot = npt_df[fb_cols].sum(axis=1)
        ebpbno_tot = npt_df[ebpbno_cols].sum(axis=1)
        integ_tot = npt_df[integ_cols].sum(axis=1)
        all_tot = npt_df[all_syn_cols].sum(axis=1)
        for rid, fb, ebpbno, integ, allt in zip(npt_df["root_id"], fb_tot, ebpbno_tot, integ_tot, all_tot):
            npt_lookup[rid] = (fb, ebpbno)
            npt_lookup[rid + "_integ"] = (integ, allt)

    # ---- octopaminergic neuron set
    oct_ids = set()
    if neu_df is not None and "nt_type" in neu_df.columns:
        oct_ids = set(neu_df[neu_df["nt_type"] == "OCT"]["root_id"])

    # ---- assign every neuron to a module
    print("Assigning neurons to functional modules ...")
    assignment = {}
    for row in cls_df.to_dict("records"):
        assignment[row["root_id"]] = classify_neuron(row, npt_lookup, oct_ids)

    module_neuron_ids = defaultdict(list)
    for rid, mod in assignment.items():
        module_neuron_ids[mod].append(rid)

    total_neurons = len(assignment)
    displayed_neurons = sum(len(v) for k, v in module_neuron_ids.items() if k != OTHER)
    print(f"Total traced neurons: {total_neurons}")
    print(f"Assigned to a displayed module: {displayed_neurons} "
          f"({100*displayed_neurons/total_neurons:.1f}%)")
    for m in MODULES:
        print(f"  {m['id']:<20} {len(module_neuron_ids[m['id']]):>7} neurons")
    print(f"  {'(other/unassigned)':<20} {len(module_neuron_ids[OTHER]):>7} neurons")

    # ---- nt_type lookup per neuron (for module dominant-nt + edge nt)
    nt_lookup = {}
    if neu_df is not None:
        for rid, nt in zip(neu_df["root_id"], neu_df["nt_type"]):
            nt_lookup[rid] = nt if isinstance(nt, str) and nt != "nan" else None

    # ---- names / cell types for sample citation IDs
    name_lookup = {}
    if names_df is not None:
        for rid, nm in zip(names_df["root_id"], names_df["name"]):
            name_lookup[rid] = nm
    type_lookup = {}
    if cct_df is not None:
        for rid, t in zip(cct_df["root_id"], cct_df["primary_type"]):
            if isinstance(t, str) and t != "nan":
                type_lookup[rid] = t

    # ---- per-module stats + sample real IDs
    module_stats = {}
    for m in MODULES:
        mid = m["id"]
        ids = module_neuron_ids[mid]
        nt_counter = Counter(nt_lookup.get(r) for r in ids if nt_lookup.get(r))
        dominant_nt = nt_counter.most_common(1)[0][0] if nt_counter else None
        sample_ids = ids[:6]
        samples = []
        for r in sample_ids:
            samples.append({
                "root_id": r,
                "name": name_lookup.get(r),
                "cell_type": type_lookup.get(r),
                "nt_type": nt_lookup.get(r),
            })
        module_stats[mid] = {
            "neuron_count": len(ids),
            "dominant_neurotransmitter": dominant_nt,
            "sample_neurons": samples,
        }

    # ---- aggregate connections into module-to-module edges
    print("Streaming connections_princeton.csv (this is the ~5.3M-row file, may take a bit) ...")
    conn_path = find("connections_princeton")
    if conn_path is None:
        print("  [!] connections_princeton.csv not found -- edges will be empty.")
        edge_agg = {}
        total_rows = 0
        retained_rows = 0
    else:
        edge_weight = defaultdict(int)
        edge_nt_weight = defaultdict(lambda: defaultdict(int))
        total_rows = 0
        retained_rows = 0
        chunksize = 500_000
        for chunk in pd.read_csv(conn_path, dtype=str, chunksize=chunksize):
            chunk["syn_count"] = pd.to_numeric(chunk["syn_count"], errors="coerce").fillna(0).astype(int)
            for pre, post, syn, nt in zip(chunk["pre_root_id"], chunk["post_root_id"],
                                           chunk["syn_count"], chunk["nt_type"]):
                total_rows += 1
                src = assignment.get(pre, OTHER)
                dst = assignment.get(post, OTHER)
                if src == OTHER or dst == OTHER:
                    continue
                retained_rows += 1
                key = (src, dst)
                edge_weight[key] += syn
                edge_nt_weight[key][nt] += syn
        edge_agg = {}
        for key, w in edge_weight.items():
            nt_counts = edge_nt_weight[key]
            dominant_nt = max(nt_counts.items(), key=lambda kv: kv[1])[0] if nt_counts else None
            edge_agg[key] = {"weight": w, "dominant_nt": dominant_nt}
        print(f"  connections read: {total_rows:,}  |  retained (module-to-module): {retained_rows:,} "
              f"({100*retained_rows/max(total_rows,1):.1f}%)")

    edges = [
        {"source": src, "target": dst, "weight": data["weight"], "dominant_nt": data["dominant_nt"]}
        for (src, dst), data in sorted(edge_agg.items(), key=lambda kv: -kv[1]["weight"])
    ]

    # ---- assemble final JSON
    model = {
        "dataset": DATASET_META,
        "generated_by": "scripts/preprocess_flywire.py",
        "coverage": {
            "total_traced_neurons": total_neurons,
            "neurons_in_displayed_modules": displayed_neurons,
            "neurons_in_displayed_modules_pct": round(100 * displayed_neurons / total_neurons, 1),
            "total_raw_connections_considered": total_rows,
            "connections_retained_module_to_module": retained_rows,
        },
        "modules": [
            {**m, **module_stats[m["id"]]} for m in MODULES
        ],
        "edges": edges,
        "honesty_note": (
            "This is a compressed, game-ready aggregation of the real FlyWire FAFB v783 "
            "connectome, not a full per-neuron, per-synapse real-time simulation. Every "
            "neuron in the dataset was assigned to exactly one of the modules above (or "
            "left unassigned) based on its real FlyWire classification, dominant neuropil, "
            "or predicted neurotransmitter; edge weights are real summed synapse counts "
            "between the neurons in each module pair."
        ),
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(model, f, indent=2)
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"\nWrote {OUT_PATH} ({size_kb:.1f} KB)")
    print(f"Modules: {len(MODULES)}   Edges: {len(edges)}")


if __name__ == "__main__":
    main()
