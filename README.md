# HocTiengTrungCungKhai — local learning app

Local Mandarin study app for offline dictionary lookup, text segmentation, guided character writing, flashcard review, and feedback. This app is separate from the Spec Kit CLI in the parent repository.

## Stage scope

- Chinese input in simplified or traditional form; local tokenization and tone-marked Pinyin.
- HSK 3.0 catalog combining Gushi, the attached hsk30-master list and static user-supplied hsk30-main data. It includes searchable traditional forms; the pooled 7–9 data stays labeled “HSK 7–9”. Missing meanings/readings/examples remain unavailable.
- All meanings and word details come only from the bundled static dictionary. The app does not call generative models or external translation APIs. It does not synthesize sentence translations when no matching dictionary data exists.
- Search supports simplified/traditional Chinese, tone-marked or numbered Pinyin, Vietnamese and English. HSK 7–9 is a single pooled category in the supplied source, not three separately assigned levels.
- Guided stroke order, trace and free practice for up to 671 unique characters appearing in the combined HSK 1–2 vocabulary. This is derived from the word lists, not a separately published official handwriting subset. Stroke checking is Hanzi Writer quiz feedback, not freehand handwriting recognition.
- Firebase sign-in for email/password, Facebook and phone OTP; Firebase ID tokens are verified by `firebase-admin` before profile, personal library, review, group and admin APIs are allowed.
- Roles come from SQLite `user_roles`. New accounts receive a collision-checked `#XXXXXX` Study UID. SQLite stores personal decks, saved words, flashcard schedules, local-date review events, streak metrics and feedback.
- Guest lookup and writing practice do not store learning progress in browser storage. Theme preference is a UI setting; saved words/review schedules are created only for authenticated accounts.

## Data and licences

See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and [`apps/api/data/hsk30-main-source/SOURCE_NOTES.md`](./apps/api/data/hsk30-main-source/SOURCE_NOTES.md). The hsk30-main archive did not include a license for its Vietnamese glosses/examples, so public redistribution rights need confirmation. The Gushi catalog is CC BY-SA 4.0; stroke data is separately licensed.

## Requirements

- Windows 10/11, Node.js 24+ (uses the built-in synchronous `node:sqlite` API), and pnpm 10+.
- Internet only for dependency installation and optional Cloudflare hosting/authentication provider setup. Local dictionary lookup and review use the bundled vocabulary database.

## Setup on Windows PowerShell

```powershell
cd hanzi-viet
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Keep the two terminal processes running. Stop them with Ctrl+C.

For Firebase email/Facebook/phone sign-in, copy `apps/web/.env.example` to `apps/web/.env.local` and fill the public Web config. Copy `apps/api/.env.example` to `apps/api/.env`, set the same project ID and the verified bootstrap admin email, then configure ADC as described in [AUTH_SETUP.md](./AUTH_SETUP.md). Without these values the dictionary remains usable as Guest, but sign-in is disabled.

For production files, run `pnpm build`. Local production serving is added in this stage after the dev flow is verified.

## Tests

```powershell
pnpm test
```

The tests cover local segmentation/render contracts and stroke-practice state decisions. They do not verify linguistic correctness of every entry.

## Data setup

The repository includes the prepared dictionary catalog and local stroke graphics. To re-import the attached hsk30-main data, run `pnpm import:hsk30-main`; the attached hsk30-master source uses `pnpm import:hsk30-master`. Run `pnpm prepare:strokes` to regenerate stroke files. See the source notes before distributing derived data.

## Known limits

- Some English definitions and Hán-Việt readings remain “Chưa có dữ liệu”. No automatic meaning or reading is generated.
- Source HSK 7–9 is pooled and cannot be separated accurately into individual levels 7, 8 and 9.
- Pinyin is dictionary-context based; genuinely ambiguous or unknown readings are flagged for review.
- The Hanzi Writer stroke files contain stroke geometry and radical-stroke indices, but do not supply reviewed radical names/meanings or mnemonics. Those fields are shown as missing; learner-written mnemonic stays in the current session.
- There is no sentence-level translation: text is segmented and individual terms are looked up in the static dictionary.
- The auth integration is ready in source but requires the project's Web config and valid local ADC credentials. They are not present in this workspace; see `AUTH_SETUP.md`.
- SQLite and the API live on the machine running this app and the API binds to `127.0.0.1`. Firebase Auth does not make this local SQLite database available to other people. Public multi-user access requires a hosted API and a shared database, with server-side token verification.

## Public cloud hosting

See [CLOUD_DEPLOY.md](./CLOUD_DEPLOY.md) for Cloudflare Workers + D1 hosting, and [AUTH_SETUP.md](./AUTH_SETUP.md) for Firebase credentials, roles, and local API behavior. The cloud Worker path must be configured separately before it can provide authenticated multi-user sync.
