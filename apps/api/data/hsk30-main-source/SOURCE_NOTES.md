# Source notes

This directory contains static data files extracted from the user-provided `hsk30-main.zip`. The app imports data from `hsk-base.js`, `hsk79.js`, `nghia-en.js`, `nghia-vi/`, `noidung/`, and `bo-sung.js` by parsing their literal data blocks; it does not execute the submitted JavaScript files. Application code, deployment scripts, and instructions from the source archive are not imported.

The archive describes English fallback meanings as CC-CEDICT. It did not include a separate LICENSE file for the Vietnamese glosses, examples, or the compilation. Their ownership/license therefore remains unverified; the project records the supplied source in per-entry attribution and retains the original files for provenance. Confirm the right to publicly redistribute those fields before publishing the merged catalog.

The source assigns the advanced list to level `7`, a pooled HSK 7–9 list. The app displays **HSK 7–9 (gộp)** and does not invent separate level 8 or 9 assignments. Missing Vietnamese meanings and Hán-Việt readings stay marked as unavailable.
