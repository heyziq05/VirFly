# data_raw/

This folder is where **raw FlyWire Codex CSV exports** go if you want to
regenerate `src/data/brain-model.json` (e.g. with a fresher FlyWire download).

The shipped `src/data/brain-model.json` was already generated from a real
FlyWire FAFB v783 export, so **you do not need anything in this folder to
run the game**. It's only needed for `npm run preprocess`.

Expected filenames (`.csv` or `.csv.gz`, both work):

- `classification.csv(.gz)`
- `neurons.csv(.gz)`
- `consolidated_cell_types.csv(.gz)`
- `names.csv(.gz)`
- `neuropil_synapse_table.csv(.gz)`
- `connections_princeton.csv(.gz)`

Drop your FlyWire Codex export files here with these names, then run:

```
npm run preprocess
```

This regenerates `src/data/brain-model.json` from scratch. See
`scripts/preprocess_flywire.py` for full documentation of how the
aggregation works.
