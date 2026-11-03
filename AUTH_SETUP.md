# Firebase Authentication, local SQLite, and roles

## What the app now implements

- Firebase Admin ID-token verification with revocation checking.
- `POST /api/auth/sync` creates/updates a local profile and allocates a unique `#` plus six-digit Study UID in a SQLite transaction.
- Roles are read from `user_roles`; an allowlisted, verified email (`ADMIN_EMAILS`) or trusted Firebase custom claim can bootstrap admin. Client request bodies never assign roles.
- API gates protect personal decks, saved words, reviews, groups, leaderboards, and `/api/admin/*`.
- Admin API supports vocabulary CRUD, user overview, feedback filtering/status changes, and writes admin actions to `admin_audit_log`.
- The web UI has Firebase email/password, Facebook popup, phone OTP, login gates, account navigation, streak metrics, group area, and an admin tab. The UI is intentionally inactive until Firebase Web config is set.

## Firebase Console

1. Choose the same Firebase project for Web Auth and the Node API.
2. In **Authentication → Sign-in method**, enable Email/Password, Phone, and Facebook. Facebook also requires a Facebook App ID/secret in Firebase Console and the Firebase OAuth redirect URI in the Facebook app. Keep the Facebook secret out of this repository.
3. In **Authentication → Settings → Authorized domains**, add the host that serves the web app.
4. For Phone Auth, configure the reCAPTCHA flow and SMS region policy. Use Firebase test phone numbers during development to avoid real SMS charges.
5. Register a Web app and copy its Web config values into `apps/web/.env.local`:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
```

These Web config values identify the Firebase project; they are not Admin credentials. Restart Vite after editing them.

## Node Admin SDK credentials (ADC)

The API uses Application Default Credentials; it does not require a service-account key file. Install the [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk) for a Google account that can access the Firebase project, reopen PowerShell, then run:

```powershell
gcloud auth application-default login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
```

Create `apps/api/.env` (this path is ignored by Git) with:

```dotenv
FIREBASE_PROJECT_ID=your-project-id
ADMIN_EMAILS=verified-admin@example.com
API_PORT=8787
```

The admin email must be verified in Firebase Auth. For a deployed backend, use a platform workload identity/ADC or secret manager instead of copying a private key into source control. The API also accepts `GOOGLE_APPLICATION_CREDENTIALS` if your environment already provisions a protected credential file, but never commit that file.

## Start and verify manually

From the app root, install workspace dependencies and start the local API/web dev servers:

```powershell
pnpm install
pnpm dev
```

Open the local Vite address. Register/sign in, confirm the API returns a profile and Study UID, then check:

- A guest can search/write/hear pronunciation; Save, Review, Streak, Groups, and Admin open the login dialog.
- A signed-in non-admin gets a `#123456` style UID and can save/unsave words and sync review schedules.
- An email in `ADMIN_EMAILS` must first be email-verified, then sign out/in or refresh the ID token and call `/api/auth/sync` again to receive the SQLite admin role.
- `GET /api/admin/users`, `/api/admin/feedbacks`, and `/api/admin/words` return 403 for ordinary users and work for admins.

No service-account key or Firebase config was found in the workspace during implementation. The frontend config is therefore still a template; do not paste private keys into chat. The project can build without the config, but actual sign-in/token verification requires both the Web config and ADC setup.

## SQLite schema and API routes

The local database is `apps/api/data/user.sqlite` and is ignored by Git. It contains `users.firebase_uid`, unique `users.study_uid`, `roles`, `user_roles`, `user_auth_identities`, `user_decks`, `user_deck_words`, `flashcard_reviews`, `review_events`, `daily_study_stats`, `study_groups`, `group_members`, `group_invites`, `group_deck_shares`, `feedbacks`, and `admin_audit_log`.

- `POST /api/auth/sync`, `GET /api/auth/me`
- `GET|POST|PUT|DELETE /api/me/decks`, `GET|POST|DELETE /api/me/saved-words`, `GET /api/me/reviews`, `POST /api/me/reviews/:wordId`, `GET /api/me/stats`
- `GET /api/community/me`, `GET /api/community/activity`, `GET /api/community/invites`, `PATCH /api/community/invites/:id`
- `POST /api/groups`, `POST /api/groups/:id/invites`, `GET /api/groups/:id/leaderboard`, `POST /api/groups/:id/decks`
- `GET|POST /api/admin/words`, `PUT|DELETE /api/admin/words/:id`, `GET /api/admin/users`, `GET /api/admin/feedbacks`, `PATCH /api/admin/feedbacks/:id`

## Deployment boundary

SQLite is on the machine running the API. Binding the local API to `127.0.0.1` intentionally makes this a single-machine/local setup. Firebase Auth alone does not make local SQLite accessible to other users. For public multi-user access, deploy a protected API and a shared database (for example, Cloudflare Worker + D1); do not expose a workstation SQLite file or open the local API to the internet.
