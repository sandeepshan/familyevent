# Get-Together Central 🎉

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

## 4. Turn on Storage CORS (needed for ZIP downloads & PowerPoint export)

The **"Download all (ZIP)"** and **"Export PowerPoint"** buttons on the Photos tab need to read your photo files directly out of Firebase Storage from the browser. By default, a brand-new Storage bucket doesn't allow this cross-origin read — the buttons will look like they work but produce an empty/failed file. This is a **one-time setup step**, separate from the security rules above.

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) if you don't already have it (or use [Cloud Shell](https://console.cloud.google.com) in your browser — no install needed).
2. This project already includes a **`cors.json`** file with the right settings. From this project's folder, run:

   ```bash
   gcloud config set project familyevent
   gcloud storage buckets update gs://familyevent.appspot.com --cors-file=cors.json
   ```

   (Swap `familyevent.appspot.com` for your own bucket name if different — you can find it in **Storage** in the Firebase console, or in `js/firebase-config.js` as `storageBucket`.)
3. That's it — no need to redeploy the app. Try the ZIP or PowerPoint download again after a minute or two.

> If you ever see a toast saying photos "couldn't be loaded," this CORS step is almost always the cause — the app will tell you as much right in the message.

## 4b. Already live? Re-publish your Firestore rules for the Crew & volunteers feature

If your committee's app is already deployed and working, you only need this step: the new **Crew & volunteers** roster on the Home tab uses a new `crewRoles` collection, which needs its own line in your Firestore security rules (already included in the `firestore.rules` file in this project — you just need to re-publish it).

1. **Firestore Database → Rules** tab in the Firebase console → delete what's there → paste the entire contents of the updated **`firestore.rules`** from this project → **Publish**.

That's it — no other setup steps are needed for this round of changes; everything else (the new games, phone numbers, photo wall, weather, share links) works with your existing Firebase setup.

## 4c. Already live? Re-publish your rules again for Teams & scoreboard and receipt photos

Two more small additions need their own rule lines:

- The **Teams & scoreboard** feature (Games tab) uses a new `scoreboardTeams` Firestore collection.
- Attaching a **receipt photo** to a budget item uploads to a new `receipts/` path in Storage.

Both are already included in the updated `firestore.rules` and `storage.rules` files in this project — you just need to re-publish both:

1. **Firestore Database → Rules** tab → delete what's there → paste the entire contents of the updated **`firestore.rules`** → **Publish**.
2. **Storage → Rules** tab → delete what's there → paste the entire contents of the updated **`storage.rules`** → **Publish**.

Everything else in this round (dark mode, the "who owes what" share card, the keepsake PDF) works with your existing setup — no rules changes needed for those.

## 5. Run it locally to check (optional but recommended)

From this folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

You should see the app (not the "connect Firebase" banner). Try adding a test family on the Attendees tab — if it shows up, everything's wired correctly. Delete your test data before sharing with the committee.

## 6. Push to GitHub and deploy on Netlify

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

## 7. Share it and set it up

1. Open the link yourself first, click the **⚙️ gear** icon (top right) and set the event name, date, venue, currency and (optionally) a budget target.
2. Share the link with the committee. The first time anyone adds something, the app asks for their name once (stored on their device) so entries show "added by ___" — no account needed.
3. Anyone can install it like an app: on phones, "Add to Home Screen" from the browser share menu — it'll behave like a normal app icon (that's the PWA manifest + service worker doing their job).

---

## What's inside

| Tab | What it does |
|---|---|
| **Home** | A festive hero banner with a live countdown, 4 key stats, a live weather forecast for the venue (once your event date is within ~2 weeks — via [Open-Meteo](https://open-meteo.com), no API key needed), a committee activity feed, a **🙋 Crew & volunteers** roster (sign up for setup/cleanup/hosting roles), a "Things to bring" list, a family guestbook, and a **📣 Share & remind** card with one-tap WhatsApp/email reminder links. |
| **Attendees** | Add each family/person with a phone number, adult / kids 5–12 / kids under 5 counts, table assignment, RSVP status and dietary notes. Running totals update live, with a weighted **catering headcount** (adult = 1, kid 5–12 = 0.5, kid under 5 = free). A dietary & allergy summary updates automatically. A "confirmed guests only" toggle filters the totals and cost split. Any family with a phone number gets a one-tap **💬 WhatsApp reminder** button in the table. CSV export. |
| **Budget** | Add expenses by category (catering, water & beverages, disposables/supplies, decorations, venue, games & prizes, photography, misc.) with just an item name and price — optionally assign it to a person, attach a **🧾 receipt photo**, and tick it off once it's done. Shows totals by category with optional per-category budget caps (bars turn red if you go over), and a collapsible **"Who owes what"** card that splits the bill fairly by catering headcount, with a paid/unpaid checkbox per family and a **📤 Share summary** button that generates a branded image card of the split — ready to send straight over WhatsApp. CSV export. |
| **Schedule** | A run-of-show builder: add programs (arrival, meals, games, performances, speeches…) with start/end times, and they appear as a printable vertical timeline, sorted automatically. Shows your event's overall date, time window and venue at the top. |
| **Photos** | Upload photos (stored in Firebase Storage, shown to everyone instantly). Like your favourites (❤️) and filter to "🌟 Highlights"; tap a photo's caption in the slideshow to tag a family/person in it. Fullscreen auto-playing slideshow, plus a **📺 Photo Wall (TV)** mode — a fullscreen, live auto-refreshing grid of every photo, perfect for casting to a TV at the venue so new uploads appear instantly for everyone to see. "Download all" bundles every photo into one ZIP file, **"Export PowerPoint"** generates a designed .pptx matching the app's own peacock/magenta/gold theme — a Malayalam word-cloud opener, a festive title slide, one framed slide per photo (highlights first), and a bilingual ("നന്ദി" / Thank You) closing slide that recaps the date, venue and a warm sign-off — and **"Keepsake PDF"** bundles a cover page, the schedule, the attendee list and the highlight photos into one combined document as a lasting memento. |
| **Games** | 23 pre-loaded game ideas tuned for a Malayali family get-together (Antakshari, Tambola, Malayalam movie Dumb Charades, Mehendi corner, Thiruvathira, Uriyadi, Pookalam contest, Kasavu & Mundu walk, Mr & Mrs quiz, kids' fancy dress, and more), filterable by type. Every game has a **📜 Script** with materials, step-by-step hosting instructions, and tips — and the two quiz games (Family Quiz Night, "Mr & Mrs" Couple Quiz) include a built-in **interactive quiz mode** with a full question bank, reveal-the-answer cards, and shuffle. A **🏆 Teams & scoreboard** card splits confirmed attendees into fair teams (balanced by weighted headcount, not just family count) with one tap, then keeps a live +1/+5 scoreboard everyone watching sees update in real time. Star games as "our lineup," add your own, or hit **🎲 Surprise us** to randomly pick what to play next. |

The app defaults to your event details (Friday, October 9 2026, 6:00–10:00 PM, Club Alamora, Tarneit) — change these anytime from ⚙️ settings.

## Built for the phone in your hand

Most of your committee will use this on their phones, so on screens narrower than ~720px:

- The tab bar moves to a fixed **bottom navigation bar** (like a normal phone app) instead of a horizontally-scrolling strip — every section is always one tap away, nothing hides off-screen.
- A **floating ➕ button** appears above the bottom bar on the Attendees, Budget, Schedule, Photos and Games tabs for quick-adding without scrolling back up to a header button (Home already has its own "Quick add" grid, so the floating button stays out of the way there).
- The Attendees and Budget tables — too wide to fit a phone screen as a normal table — become a stack of **cards**, one per family/expense, instead of forcing sideways scrolling.
- Photos are **compressed and resized in the browser before upload** (capped at 1920px on the long edge), so a full-resolution phone camera photo doesn't eat through venue WiFi or mobile data — this doesn't affect image quality in the slideshow, PowerPoint export, or photo wall.
- A brief loading spinner shows while the app connects to Firebase, instead of a blank white screen.
- A **🌙 dark mode toggle** (top right, next to ⚙️ settings) switches the whole app to a dark version of the same peacock/magenta/gold theme — it remembers your choice next time, and defaults to your phone's own light/dark setting the first time you open it.

## Costs

Firebase's free "Spark" plan comfortably covers a single family event (Firestore: 1 GiB storage / 50k reads per day; Storage: 5 GB / 1 GB downloads per day free) — you're very unlikely to pay anything. If you reuse this project for a much bigger or recurring event, keep an eye on the Firebase console's usage tab.

## Customizing later

- **Change the theme colors:** edit the `:root` variables at the top of `css/styles.css`.
- **Add/remove budget categories:** edit the `BUDGET_CATEGORIES` array near the top of the Budget section in `js/app.js`.
- **Edit the seeded game list:** edit the `SEED_GAMES` array in `js/app.js` — this only seeds Firestore the very first time the `games` collection is empty, so if you've already opened the app once, add/remove games from the Games tab in the app itself (or delete everything in the `games` collection in the Firebase console to reseed).
- **Edit the seeded crew roles:** same idea — edit the `SEED_CREW_ROLES` array in `js/app.js`, which only seeds Firestore the first time the `crewRoles` collection is empty. Add/remove roles from the Home tab in the app itself (or clear the `crewRoles` collection in the Firebase console to reseed).
- **Weather forecast:** the Home tab card looks up your venue text via a free geocoding service and shows a forecast once your event date is within about 2 weeks. If your venue name is unusual or very local, it may not find a match — the card just stays hidden in that case, no errors shown.
