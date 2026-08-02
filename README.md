# Home Manual v2.1.0

The manual your house didn't come with. A private, offline-first web app for
the whole household: houses, vehicles, and pets - what everything is, what it
needs, when it last got done, and the photos to prove it.

Everything lives on the phone in the browser's local database. Nothing is
uploaded anywhere, there are no accounts, and it works with no signal.

## What's in v2

- **Multiple subjects.** Add houses, vehicles, and pets; switch between them
  from the Home screen or the name chip at the top of any tab.
- **The Manual tab.** The reference half of the app: house facts (sq footage,
  builder contact, shutoff locations), rooms with dimensions, paint colors
  and sheens, window sizes, and equipment with model numbers, filter sizes,
  warranty dates, and Copy / Find buttons for reordering.
- **Build-your-own tasks.** The task list starts however you want: seeded
  from the house's features, or empty. Browse ~120 task ideas organized by
  category, with a + next to each and "Add suggested" per category. Tasks can
  be unscheduled - they hold their history ("septic last pumped March 2026")
  without nagging.
- **Completion flow.** Marking anything done asks when, takes a note (filter
  brand, mileage), and offers to schedule the next one: the usual cadence,
  1/3/6/12 months, a picked date, or nothing.
- **Instructions on tasks.** Common tasks ship with short how-tos (fridge
  filter, tankless descale, garage-door reverse test); add your own steps,
  notes, and photos of the manual, tucked inside the task.
- **Photo library.** Quick camera button, downscaled storage, tagging by
  room / equipment / kind (photo, receipt, warranty, manual page, paperwork),
  browsable by month and filterable. Move-in photos and one-year-warranty
  photos are just photos with dates.
- **Yearly check-up.** A guided self-inspection walk generated from the
  house's features. OK / Flag / Skip each item, note and photograph problems,
  and keep the record.
- **Vehicles** (gas / hybrid / EV aware: oil, rotations, filters, wipers) and
  **pets** (species-aware vaccines, meds, chip number, papers).

### New in 2.1

- **Tasks grouped by subject.** Every house, vehicle, and pet is its own
  collapsible section on the Tasks tab - fold one shut, open another, no
  switching required. Tapping a card on Home jumps straight to that
  subject's tasks.
- **Guided setup.** A new house arrives with its rooms and equipment roughed
  in from the wizard answers; a progress card on the Manual tab tracks
  "equipment with model #" and "rooms with sizes" until the walk-through is
  done. Rare equipment (dehumidifier, radon fan, EV charger...) offered as
  one-tap picks.
- **What to buy, inside the task.** If a task's equipment has a model number
  or sizes on file, they show right in the task sheet.
- **Lists.** Project and shopping lists on Home - a weekend deck project, a
  hardware run - with check-offs.
- **People & policies.** Insurance policies with numbers and document scans,
  plus the plumber / electrician / vet with tap-to-call.
- **Visible errors.** If anything ever fails, a red banner says so instead
  of a button silently doing nothing.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell: five tabs, setup wizard, inspection screen, sheets |
| `app.css` | Styling ("shop notebook" theme) |
| `config.js` | App identity: name, version, database schema, tabs |
| `app.js` | Screens and interactions |
| `store.js` | IndexedDB layer, v1 migration, backup/restore |
| `schedule.js` | Date math, recurrence, seeding, calendar export |
| `library.js` | Task libraries, wizard fields, inspection bank |
| `photos.js` | Camera intake, downscaling, thumbnails |
| `updates.js` | Update detection and force reinstall |
| `sw.js` | Offline cache (bump `CACHE_VERSION` each release) |
| `version.json` | Published version (bump each release) |
| `manifest.webmanifest`, `icon-*.png` | Install metadata |
| `make-icons.py` | Regenerates the icons |
| `check-ui.py`, `test-schedule.mjs`, `e2e.py`, `e2e-data.py` | Test suite |

## Hosting (GitHub Pages)

All files sit at the repo root with Pages serving the main branch. Upload
replacements through github.com in Safari; Pages redeploys in about a minute.

**Keep personal data out of the repo.** The repo is public: no addresses, no
starter/backup JSON files, no photos. Pre-filled starter files for a specific
house are private documents - keep them in the Files app or iCloud and import
them on-device.

## Installing on a phone

**iPhone:** open the site in **Safari** (must be Safari), Share button ->
**Add to Home Screen**. **Android:** Chrome -> menu -> **Add to Home
screen** / **Install app**.

The app's data belongs to the browser profile of the installed icon. Deleting
the icon (iOS) or clearing site data erases it - export a backup first.

## Starter files

A starter is just a backup JSON with a house pre-entered (rooms, dimensions,
window schedule, builder contact). **Restore on a fresh install only** -
restoring REPLACES everything in the app. On the first-run screen, tap
**"Have a backup or starter file? Restore it instead"** and pick the file
from the Files app.

Starters arrive with an **empty task list** on purpose. To add tasks: Tasks
tab -> **+** -> **Browse task ideas** -> add items one at a time or **Add
suggested** per category. Then check the pre-filled features (More -> Edit
next to the house) and correct anything guessed - heat type, water heater,
range, washer/dryer.

## Upgrading from v1

Nothing to do. v2 uses the same database; on first launch it converts the v1
profile into a house, keeps every task, completion, and equipment record,
and carries on. The update banner appears on the old version once v2 is
deployed - tap **Load it now**.

## Where photos live (read this)

The browser gives a web app no way to write into the iOS/Android photo
library silently, so:

- **Taken inside the app** (the in-app camera button): stored ONLY in the
  app and its backups. The photo library never sees it.
- **Taken with the phone's Camera app, then added via "Choose from my
  photos"**: lives in BOTH places. The app keeps its downscaled copy; the
  original stays in the camera roll. This is the durable habit for anything
  that matters (warranty damage, receipts).
- Any photo already in the app can be pushed out with **"Save a copy to my
  phone"** on the photo screen - it opens the share sheet (Save Image /
  Save to Files).
- **Backup + photos** in More exports everything, images included, as one
  file you can park in iCloud.

## Updates

The app checks `version.json` on every launch and foreground return, and
shows a banner when a new version is downloaded and ready. Manual check and
**Force reinstall** (for a stuck cache; data untouched) live in More.

If iOS ever refuses to pick up a deploy: upload the new files, delete the
home-screen icon, then Settings -> Apps -> Safari -> Advanced -> Website
Data -> delete the `github.io` entry, reopen the site, reinstall. Data does
not survive that path - export a backup first.

## Backups

More -> Backup writes a JSON file (tags and captions only) or Backup +
photos (full, much larger). Restore replaces everything. Photos are stored
downscaled (~1600 px JPEG) to keep the browser's storage quota comfortable.

## Releasing a change

1. Edit the files.
2. Bump the version in **three places** or updates will not install:
   `config.js` (`version`), `sw.js` (`CACHE_VERSION`), `version.json`
   (`version`).
3. Run the checks:

   ```
   python3 check-ui.py
   node test-schedule.mjs
   python3 e2e.py          # needs: pip install playwright; playwright install chromium
   python3 e2e-data.py
   ```

4. Upload everything to the repo root.

`check-ui.py` fails the release if the three versions disagree, if a JS
module is missing from the service worker precache, or if the global
`[hidden]` CSS guard is ever removed (removing it turns every closed sheet
into an invisible full-screen overlay that blocks all taps - the v1.0.0 bug).
