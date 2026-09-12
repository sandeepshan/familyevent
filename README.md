# Get-Together Central 🪔

A shared app for your committee to plan a family get-together together — attendees & headcount, budget & catering, a photo wall with slideshow, and fun family games. No logins, no passwords — anyone with the link can open it on their phone and start adding things.

It's a plain static site (HTML/CSS/JS, no build step) that uses **Firebase** (free tier) as the shared "backend" — that's what lets everyone see the same live data. You'll spend about 10–15 minutes on one-time setup, then deploy it to **Netlify** exactly like your other projects.

---

## 1. Create a Firebase project (free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, give it a name (e.g. `sharma-family-2026`), and finish the wizard (you can turn off Google Analytics — you don't need it).
3. Once the project opens, click the **`</>`** (web) icon on the project overview page to register a new web app. Give it a nickname (e.g. `event-app`) and click **Register app**. You do **not** need Firebase Hosting — you're deploying via Netlify.
4. Firebase will show you a `firebaseConfig` object that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "sharma-family-2026.firebaseapp.com",
     projectId: "sharma-family-2026",
     storageBucket: "sharma-family-2026.appspot.com",
     messagingSenderId: "...",
     appId: "1:...:web:...",
   };
   ```

   Copy these six values into **`js/firebase-config.js`** in this project, replacing the `PASTE_...` placeholders. (This file is safe to commit to GitHub — these values identify your project, like a URL, not a secret. Your data is protected by the rules in step 3 below, not by hiding these.)

## 2. Turn on Firestore and Storage

1. In the left sidebar, click **Build → Firestore Database → Create database**. Choose **production mode**, pick any region close to you, click **Enable**.
2. In the left sidebar, click **Build → Storage → Get started**. Choose **production mode** again, use the same region, click **Done**.

## 3. Paste in the security rules

By default, "production mode" blocks all reads and writes — you need to paste in the rules that let your committee (and only requests shaped like this app's data) read and write.

1. **Firestore Database → Rules** tab → delete what's there → paste the entire contents of **`firestore.rules`** from this project → **Publish**.
2. **Storage → Rules** tab → delete what's there → paste the entire contents of **`storage.rules`** from this project → **Publish**.

> **Heads up on privacy:** because there's no login, these rules can't tell your committee apart from a stranger who happens to find the URL — the link itself is what keeps this private, the same way a shared Google Doc link works. Don't post the link somewhere public. If you'd rather add a login step later, that's a bigger change — just ask and it can be added.

## 4. Run it locally to check (optional but recommended)

From this folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

You should see the app (not the "connect Firebase" banner). Try adding a test family on the Attendees tab — if it shows up, everything's wired correctly. Delete your test data before sharing with the committee.

## 5. Push to GitHub and deploy on Netlify

Same flow as your other projects:

```bash
cd event-app
git init
git add .
git commit -m "Initial commit"
gh repo create event-app --public --source=. --push
# (or create the repo on github.com and `git remote add origin ...` + `git push`)
```

Then in [Netlify](https://app.netlify.com): **Add new site → Import an existing project → GitHub** → pick the repo. Build settings: leave **build command empty** and set **publish directory to `.`** (the repo root) — there's no build step. Deploy.

Netlify will give you a URL like `https://sharma-family-2026.netlify.app`. That's the link to share with your committee (text, WhatsApp, email — however you'd share a Google Doc). You can rename the site (Site settings → Change site name) to something friendlier before sharing.

## 6. Share it and set it up

1. Open the link yourself first, click the **⚙️ gear** icon (top right) and set the event name, date, venue, currency and (optionally) a budget target.
2. Share the link with the committee. The first time anyone adds something, the app asks for their name once (stored on their device) so entries show "added by ___" — no account needed.
3. Anyone can install it like an app: on phones, "Add to Home Screen" from the browser share menu — it'll behave like a normal app icon (that's the PWA manifest + service worker doing their job).

---

## What's inside

| Tab | What it does |
|---|---|
| **Home** | Countdown to the event, live headcount & budget stats, quick-add buttons, a feed of what the committee has been adding. |
| **Attendees** | Add each family/person with adult / kids 5–12 / kids under 5 counts, RSVP status and notes. Running totals update live. CSV export for a printable headcount. |
| **Budget** | Add expenses by category (catering, water & beverages, disposables/supplies, decorations, venue, games & prizes, photography, misc.) with quantity × unit price. Shows totals by category, and automatically works out cost-per-adult / cost-per-person once you have attendees entered. CSV export. |
| **Photos** | Upload photos (stored in Firebase Storage, shown to everyone instantly). Fullscreen auto-playing slideshow. "Download all" bundles every photo into one ZIP file. |
| **Games** | 22 pre-loaded game ideas for an Indian family get-together (Antakshari, Tambola, Dumb Charades, Mehendi corner, Dandiya, Mr & Mrs quiz, kids' fancy dress, and more), filterable by type. Star the ones you want as "our lineup," add your own, or hit **🎲 Surprise us** to randomly pick what to play next. |

## Costs

Firebase's free "Spark" plan comfortably covers a single family event (Firestore: 1 GiB storage / 50k reads per day; Storage: 5 GB / 1 GB downloads per day free) — you're very unlikely to pay anything. If you reuse this project for a much bigger or recurring event, keep an eye on the Firebase console's usage tab.

## Customizing later

- **Change the theme colors:** edit the `:root` variables at the top of `css/styles.css`.
- **Add/remove budget categories:** edit the `BUDGET_CATEGORIES` array near the top of the Budget section in `js/app.js`.
- **Edit the seeded game list:** edit the `SEED_GAMES` array in `js/app.js` — this only seeds Firestore the very first time the `games` collection is empty, so if you've already opened the app once, add/remove games from the Games tab in the app itself (or delete everything in the `games` collection in the Firebase console to reseed).
