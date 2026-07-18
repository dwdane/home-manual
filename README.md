# Home Manual

The manual your house didn't come with. An offline, local-only PWA that builds
a maintenance schedule from the house you describe, keeps the model numbers
and filter sizes for everything you own, and counts down warranties. No
accounts, no servers, no analytics — everything stays on the device.

Version 1.0.0. Derived from the Home Inspector v1.1.0 PWA architecture.

---

## What it does

Describe the house once — foundation, water heater type, fireplace, softener,
shower filter, front-load washer, sprinklers, garden, dog — and the app seeds
a schedule containing only the tasks that house actually needs. A slab house
never sees crawlspace checks; no dog means no vaccine reminders.

**Today** shows what's due, bucketed into Overdue / This week / This month /
Coming up. Mark done (which logs it and computes the next due date) or snooze
a week. Seasonal tasks are automatically spread across the weeks of their
month at seed time, so eight spring tasks become two per weekend instead of
eight on May 1st.

**Schedule** is every task with its cadence. Tap any task to change its
interval, season, next-due date, notes, product link, or linked Thing — or
pause it. Add fully custom tasks.

**Things** is the asset registry: fridge, washer, HVAC, TV, the dog. Each
carries brand, model, serial, location, purchase date, warranty end (with a
live countdown that goes amber under 90 days), free-form sizes and part
numbers (each with one-tap **Copy** and **Amazon search** buttons), and saved
links (the exact reorder page, the manual PDF). Search covers everything, so
standing in the hardware store you type "furnace" and get the filter size.

**Warranty milestones**: enter the closing date of a new-construction house
and the app schedules the 60-day punch list, 6-month follow-up, the 11-month
independent inspection (the important one), and the final claim deadline.

**Reminders**: a local-only PWA cannot push notifications while closed — that
requires a server. Instead, *Export schedule to calendar (.ics)* turns every
task into a repeating all-day calendar event with an alert. Import it into
iOS/Google Calendar once and the phone's native calendar does the nagging.
Re-export after big schedule changes. The Today tab badge also shows the
overdue count whenever the app opens.

**Backup / restore**: one JSON file with the profile, tasks, things, and
history. Use it to move to a new phone or share the setup between spouses'
phones (each device is independent — this is a deliberate simplicity
tradeoff, see below).

---

## The task library (≈90 tasks)

Seeded per the house profile; every cadence is editable afterward.

- **Air & Heat** — HVAC filter, AC pre-season service, furnace pre-winter
  service, condensate line flush, condenser coil clean, register vacuuming,
  humidifier pad, gas fireplace service, chimney sweep (wood), ERV/HRV core.
- **Water & Plumbing** — tank flush, anode rod, tankless descale, T&P valve
  test, shower hard-water filter, fridge filter, sediment filter, softener
  salt, sump pump test, septic pumping, well test, disposal freshen,
  dishwasher filter, front-loader gasket wipe, washer clean cycle, supply
  hose inspection, under-sink leak checks, toilet dye test, aerators,
  shutoff-valve exercise.
- **Exterior** — gutters (spring + fall), roof look-over, exterior caulk,
  grading/downspouts, siding wash, garage door lube + safety reverse, deck
  fastener check, deck reseal, driveway crack seal, crawlspace check,
  basement perimeter walk, pest inspection, hose bib winterization, window
  weep holes.
- **Safety** — monthly detector test, annual battery swap, 10-year detector
  age check, extinguisher check, dryer vent duct cleaning, GFCI test,
  emergency kit, radon test.
- **Deep Cleaning** — windows in/out, fridge coils, range hood filter, oven,
  ceiling fans, baseboards, mattress rotation, carpet extraction, grout
  sealing, garage clean-out, bin washing, dishwasher cleaner cycle.
- **Garden & Yard** — hydrangea pruning, rose pruning, dormant fruit-tree
  pruning, spring + fall lawn feeding, pre-emergent, aerate/overseed, mulch,
  shrub feeding, bulb planting, perennial division, tree hazard walk,
  sprinkler startup and blow-out, mower service.
- **Pets (dog)** — monthly heartworm, monthly flea/tick, annual exam, rabies
  booster, DHPP booster, bordetella, license renewal, nail trims. Keep the
  vaccine certificate dates in the dog's Things entry and set the booster
  task dates from it.
- **Warranty** — the four builder-warranty milestones above, seeded from the
  closing date.

---

## Files

Everything sits in one flat folder — no subdirectories — so the files can be
uploaded straight from an iPhone through GitHub's web uploader.

```
index.html              App shell: five screens, tab bar, modals
manifest.webmanifest    Install metadata
sw.js                   Offline service worker with controlled update flow
app.css                 All styling
app.js                  UI, wiring, update flow, boot
library.js              Task content: the library and category definitions
schedule.js             Profile -> tasks, recurrence math, spreading, .ics
store.js                IndexedDB persistence and backup/restore
version.json            Published version number the app polls to detect updates
icon-192.png            Home screen icon
icon-512.png            Splash and store icon
icon-maskable-512.png   Android adaptive icon
make-icons.py           Regenerates the icon set (uv run --with pillow make-icons.py)
test-schedule.mjs       Engine smoke tests (node test-schedule.mjs)
README.md               This file
```

The last three files are development tools and documentation. They are
harmless to upload but are not required for the app to run — if you want the
smallest possible upload, skip them.

## Installing it from an iPhone

The whole flow works in mobile Safari; no computer needed.

1. **Unzip.** In the Files app, long-press the downloaded zip and choose
   *Uncompress*. You get a `home-manual` folder of loose files.
2. **Make the repo.** In Safari, go to github.com, tap the **+** (top right)
   → *New repository*. Name it `home-manual`, set it **Public** (Pages needs
   public on a free account), and tick *Add a README file* so the repo is
   initialized. Create it.
3. **Upload.** In the repo, tap *Add file* → *Upload files* → *choose your
   files* → *Browse* → navigate to the `home-manual` folder → tap *Select*
   (top right) → tap each file (or *Select All*) → *Open*. All files land at
   the repo root. Scroll down, tap **Commit changes**. Overwrite the
   placeholder README when prompted.
4. **Turn on Pages.** Repo → *Settings* → *Pages* → under *Branch* choose
   `main` / `/ (root)` → *Save*. Wait a minute or two; the page will show the
   live URL, `https://YOURNAME.github.io/home-manual/`.
5. **Install.** Open that URL **in Safari** (not Chrome — only Safari can add
   a PWA to the iOS home screen). Tap the Share button → *Add to Home
   Screen*. Launch it from the icon; it now runs full-screen and offline.

## Shipping an update

Three files must agree, or the phone will keep running the old build:

1. `version.json` &mdash; bump `version` (and optionally `released` / `notes`).
2. `sw.js` &mdash; bump `CACHE_VERSION`.
3. `app.js` &mdash; bump `APP_VERSION` to the same string as `version.json`.

Then upload the changed files to the repo (*Add file* &rarr; *Upload files*,
overwriting). Within a minute or two of publishing, opening the app will
detect the new version, download it in the background, and show a "Version
x.y.z is ready" banner. Tapping it swaps to the new build immediately.

How the detection works, and why it is belt-and-braces:

- `version.json` is fetched with `cache: 'no-store'` on every launch and every
  time the app returns to the foreground. It is the authority on what is
  published, and it is deliberately excluded from the offline cache-first
  strategy in the service worker.
- The service worker registration uses `updateViaCache: 'none'`, so `sw.js`
  itself is never served from the HTTP cache &mdash; the single most common
  reason a PWA never notices a deployment.
- If the version manifest says a new build exists but the worker has not
  picked it up (a stale CDN edge, a wedged worker), Settings says so plainly
  and offers **Force reinstall**, which deletes every cache, unregisters the
  worker, and reloads from the network. House data lives in IndexedDB and is
  untouched by this.

Note that GitHub Pages puts a CDN in front of the files, so a fresh deploy can
take a few minutes to reach every edge. If the app says an update is available
but keeps not installing it, wait five minutes before reaching for Force
reinstall.

Two things that catch people out:

- **The repo must be public** for GitHub Pages on the free tier. Nothing
  sensitive lives in these files — all your house data stays in the phone's
  local database and is never uploaded — but be aware the code is public.
- **Pages can take a few minutes** on first publish and will 404 until it
  finishes. That is normal; wait and reload.

Any other static host works the same way (Netlify drop, Cloudflare Pages).
Paths are all relative, so serving from a subfolder is fine.

## Design decisions worth knowing

- **Dates are ISO strings** (`YYYY-MM-DD`), compared lexically. No timezone
  math anywhere, no midnight-off-by-one bugs.
- **Turning a profile feature off pauses its tasks** rather than deleting
  them, so completion history and any customizations survive toggling.
- **Seasonal windows assume a temperate northern-hemisphere climate.** They
  are defaults; edit any task's month. Bigleaf hydrangeas that bloom on old
  wood should be moved to a post-bloom window — the task's note says so.
- **No sync.** Two phones are two databases; the backup file is the transfer
  mechanism. Real multi-device sync means a server and accounts, which is a
  different app.
- **No push notifications**, for the same serverless reason. The .ics export
  is the notification strategy, and it is genuinely more dependable than web
  push on iOS.
