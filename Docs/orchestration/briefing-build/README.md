# Rebuilding the briefing (31 Oct)

`unifolio-change-briefing.html` is the base page plus patches. To change it, edit the patch sources here, then rebuild. Run from this folder (`N` = this folder):

```bash
N=.
python build_sections.py "$N"          # writes sections/sec_spikes.html (embeds tools/*.py)
python build_sections2.py "$N"         # writes sections/sec_fscheck.html and sec_valgaps.html
python apply_31oct.py "$N" base-before-31oct-patches.html briefing_final.html
python to_fragment.py briefing_final.html fragment.html text.txt   # fragment for the Artifact tool
```

`base-before-31oct-patches.html` is the page before the 31 Oct patches; `apply_31oct.py` is not idempotent, so always apply it to that base, never to its own output. After a rebuild, check every `<script>` with `node --check`, open the page in a browser, copy `briefing_final.html` to `../unifolio-change-briefing.html`, and publish `fragment.html` with the Artifact tool. Hand-edits to `../unifolio-change-briefing.html` are overwritten by the next rebuild: change the sources instead.

Where things live: decisions are in `patch_decisions.js`, item cards in `patch_items.js`, audits in `patch_audits.js`, mock-ups in `patch_mocks*.js`, styling in `patch*.css`, and the static sections (Step 0 results, factsheet check, playbook, equity rule) in `build_sections*.py` and `sections/`.
