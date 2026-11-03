# Third-party data and software notices

## HSK 3.0 word dataset

- Dataset: HSK 3.0 word lists, incremental levels 1–6, 5,400 entries.
- Source edition: November 2025 official HSK examination syllabus.
- Compiler: Gushi, https://gushichinese.com/hsk-3.0/downloads
- License for Gushi dataset and adaptations: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/.
- Attribution: “HSK 3.0 syllabus data by Gushi, CC BY-SA 4.0” with a link to the source page.
- English meanings are adapted from CC-CEDICT (CC BY-SA 4.0). Example sentences are largely from Tatoeba (CC BY 2.0 FR) and Gushi-authored content. The individual JSON metadata records the exact sources. Keep it with the downloaded files and preserve the attribution and share-alike terms.
- Official syllabus landing page: https://www.chinesetest.cn/syllabus. This app is independent and is not an official HSK product.

## User-supplied hsk30-master vocabulary

- Source files supplied by the user: `apps/api/data/hsk30-master-expanded.csv`, with the original `hsk30-master-README.md` and `hsk30-master-LICENSE.txt` retained alongside the app data.
- The source README reports 11,092 entries in its main CSV and describes an expanded list with simplified/traditional variants. The app imports non-example Han entries, keeps existing newer-catalog definitions, adds unseen simplified and traditional surfaces, and fills missing Pinyin/POS where available.
- The upstream LICENSE is MIT and is retained. Its README says the data is derived from other MIT-licensed repositories and government syllabi, while expressly questioning the status of data copyright. Treat this attribution as source documentation, not a legal determination that every underlying record is unrestricted.
- This file has no English/Vietnamese definitions or usage examples for most entries; the app leaves those fields blank rather than inventing them. Levels 7–9 are grouped as “HSK 7–9” because the source does not subdivide them.

## Hanzi Writer

- Code: Hanzi Writer by David Chanin and contributors, MIT License, https://github.com/chanind/hanzi-writer.
- Character stroke graphics: `hanzi-writer-data`, derived from Make Me a Hanzi and Arphic fonts. The graphics are under the Arphic Public License. Keep the unmodified `ARPHICPL.TXT` alongside redistributed stroke data; identify any modifications if made. Source: https://github.com/chanind/hanzi-writer-data.

## Pinyin Pro

- `pinyin-pro`, MIT License, https://github.com/zh-lx/pinyin-pro. Used for local Chinese word segmentation and contextual Pinyin generation. Its output is treated as a candidate and may be flagged for review; the app does not claim perfect polyphonic disambiguation.

## React, TypeScript, Vite, Tailwind CSS, Express, Vitest

Open-source packages with their license files retained in the installed dependency tree and lockfile. Exact resolved versions and license metadata are recorded by the package manager after dependency installation.

## Cloudflare deployment tooling

- Cloudflare Workers, D1, Wrangler and the Cloudflare Vite/Workers runtime are used as hosted services and deployment tooling. Wrangler and the Vite plugin retain their upstream licenses in the package manager installation; no Cloudflare server code is copied into this application.
