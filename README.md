# HocTiengTrungCungKhai — Stage 1A + 1B

Local Mandarin study app for Chinese text analysis/translation and guided character writing. This app is separate from the Spec Kit CLI in the parent repository.

## Stage scope

- Chinese input in simplified or traditional form; local tokenization and tone-marked Pinyin.
- HSK 3.0 catalog combining Gushi’s newer levels 1–6 and the user-supplied hsk30-master list. It includes additional 2021-syllabus terms and searchable traditional forms; the pooled 7–9 data stays labeled “HSK 7–9”. Missing English/Vietnamese meanings, POS or examples are shown as unavailable; the app does not invent them.
- Optional sentence translation through a user-configured, OpenAI-compatible LLM endpoint. The user must consent before text leaves the computer. Machine output is labeled and can be reported.
- Guided stroke order, trace and free practice for up to 671 unique characters appearing in the combined HSK 1–2 vocabulary. This is derived from the word lists, not a separately published official handwriting subset. Stroke checking is Hanzi Writer quiz feedback, not freehand handwriting recognition.
- Saved word IDs and writing notes stay in browser storage. Local SQLite stores error reports; it does not store submitted translation text or API credentials.

## Data and licences

See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). The HSK word dataset is Gushi’s CC BY-SA 4.0 dataset (English meanings adapted from CC-CEDICT; examples include Tatoeba and Gushi-authored content). The app must retain attribution and distribute adapted dataset fields under CC BY-SA 4.0. Stroke SVG data is under the separate Arphic Public License; its unmodified license file must accompany the data. Hanzi Writer code is MIT.

## Requirements

- Windows 10/11, Node.js 24+ (uses the built-in synchronous `node:sqlite` API), and pnpm 10+.
- Internet only for installing dependencies, initially obtaining licensed datasets, and using the optional LLM translation endpoint. Core analysis, dictionary, and writing practice run offline after setup.
- LLM API key/model only if sentence translation is needed.

## Setup on Windows PowerShell

```powershell
cd hanzi-viet
Copy-Item .env.example .env
# Edit .env with your endpoint/model/key if you want AI translation.
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Keep the two terminal processes running. Stop them with Ctrl+C.

For production files, run `pnpm build`. Local production serving is added in this stage after the dev flow is verified.

## Tests

```powershell
pnpm test
```

The tests cover local segmentation/render contracts and stroke-practice state decisions. They do not validate linguistic correctness of every entry or machine translation quality.

## Data setup

The repository includes the prepared dictionary catalog and local stroke graphics. To rebuild the newer HSK 1–6 source, run `pnpm download:hsk` and `pnpm import:hsk`; to merge the supplied older hsk30-master list again, run `pnpm import:hsk30-master`. Run `pnpm prepare:strokes` to regenerate stroke files. See `THIRD_PARTY_NOTICES.md` for attribution and source-license caveats.

## Known limits

- English definitions exist in the licensed catalog; reviewed Vietnamese glosses and Hán-Việt readings are not supplied by that source, so they remain “Chưa có dữ liệu” until separately reviewed/imported or provided as an explicitly labeled AI suggestion.
- The added hsk30-master data contributes Pinyin, POS, levels and traditional forms, but not dictionary definitions or example sentences. Its README records uncertainty about the underlying data's copyright status; original source README and MIT LICENSE are bundled for attribution.
- Pinyin is dictionary-context based; genuinely ambiguous or unknown readings are flagged for review.
- The Hanzi Writer stroke files contain stroke geometry and radical-stroke indices, but do not supply reviewed radical names/meanings or mnemonics. Those fields are shown as missing; learners can store their own mnemonic locally.
- AI translation may be inaccurate, costs may apply with the selected provider, and only the submitted text is sent after consent.
- No accounts, cloud sync, audio recording, handwriting recognition, SRS review, English/Việt curricula, community or notifications in this stage.

## Public cloud hosting

See [CLOUD_DEPLOY.md](./CLOUD_DEPLOY.md) for the Cloudflare Workers + D1 deployment path, free-plan limits, privacy boundaries and publish steps. The public deployment needs an owner-controlled Cloudflare account. AI translation additionally needs a model name and a provider key stored as a Cloudflare secret.
