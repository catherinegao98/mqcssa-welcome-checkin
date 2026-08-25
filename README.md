# MQCSSA Welcome Check-In

A scan-to-check-in site for the welcome party. Guests scan a QR code, land on
this page, and instantly get a group + number (M01, Q02, U03, C04, S05, A06,
M07, …) that stays the same if they scan again from the same phone. Groups
cycle through the six letters M‑Q‑U‑C‑S‑A (no repeats, so every letter maps
to exactly one group) — the page itself is branded "MQCSSA Welcome Party."

Three views, same URL:

- `yoursite.com/` — the check-in flow guests land on.
- `yoursite.com/?display` — a big QR code for a screen/poster at the door.
  It always points back to the check-in flow.
- `yoursite.com/?admin` — a live tally of check-ins per group, plus a reset
  button for testing before the event.

## 1. Files in this folder

- `index.html`, `style.css`, `app.js` — the site itself.
- `firebase-config.js` — where your Firebase project's keys go (step 2).
- `database.rules.json` — security rules to paste into Firebase (step 3).

## 2. Create a free Firebase project (~3 minutes)

This is the "backend" that keeps everyone's number in sync, even if many
people scan at the exact same moment.

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and sign in with any Google account.
2. **Add project** → give it any name (e.g. `mqcssa-checkin`) → you can skip
   Google Analytics → **Create project**.
3. In the left sidebar: **Build → Realtime Database → Create Database**.
   Pick any region close to you, and start in **test mode** (we'll lock it
   down with `database.rules.json` in step 3).
4. In the left sidebar: **Project settings** (gear icon) → scroll to
   **Your apps** → click the `</>` (web) icon → give the app any nickname →
   **Register app**. Firebase shows you a `firebaseConfig` object.
5. Copy those values into `firebase-config.js` in this folder, replacing
   every `REPLACE_ME`.

## 3. Lock down the database rules

Still in the Firebase console: **Realtime Database → Rules** tab → replace
the contents with everything inside `database.rules.json` from this folder →
**Publish**.

This makes sure: a device's number can never be changed once it's set (only
deleted, which the reset button uses), and the counter can only ever hold a
positive number.

## 4. Put it on GitHub Pages

If you don't have a repo yet, create one at
[github.com/new](https://github.com/new) (any name, e.g.
`mqcssa-welcome-checkin`), then from this folder:

```bash
git init
git add .
git commit -m "MQCSSA welcome check-in site"
git branch -M main
git remote add origin https://github.com/catherinegao98/YOUR-REPO-NAME.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: Deploy
from a branch → Branch: `main` / `/(root)` → Save**. GitHub gives you a URL
like `https://catherinegao98.github.io/YOUR-REPO-NAME/` within a minute or
two — that's the link to put in your QR code (or just open
`.../?display` on a laptop and project that screen at the door).

## 5. Test before the party

- Open the site on two different phones and confirm the numbers advance
  correctly and cycle M → Q → C → S → S → A.
- Rescan on one of them and confirm the number doesn't change.
- Open `?admin` to watch the live tally, and use **Reset event** to zero
  everything out once you're done testing.

## Notes

- No names or personal info are collected — just a random device ID stored
  in the browser, mapped to a number.
- `?admin` isn't password-protected — anyone with that exact link can see
  counts and reset. Don't post that link publicly; only share the plain
  site link (or `?display`) on your QR code/poster.
- Firebase's free "Spark" plan comfortably covers a single event like this.
