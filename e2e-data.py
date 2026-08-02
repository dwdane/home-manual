# e2e-data.py
"""End-to-end tests for the two data paths a real rollout depends on.

    python3 e2e-data.py

1. Starter import: on a fresh install, the first-run wizard offers
   "Restore it instead"; importing a starter backup must land the house
   with its rooms and facts, no wizard required. The fixture is generated
   here so the repo carries no personal starter data.
2. v1 -> v2 migration: a database created by v1 (profile meta + untagged
   tasks/assets/log) must convert in place on first v2 boot - the profile
   becomes a house subject and every record gets its subjectId.
"""

from __future__ import annotations

import http.server
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PORT = 8792

failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    """Record one assertion."""
    if cond:
        print(f"ok    {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name}{' - ' + detail if detail else ''}")


def serve() -> http.server.ThreadingHTTPServer:
    """Quiet static server."""

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):  # noqa: D102
            pass

    handler = partial(Quiet, directory=str(HERE))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


V1_SEED = """
() => new Promise((resolve, reject) => {
  const req = indexedDB.open('home-manual', 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('tasks', { keyPath: 'id' });
    db.createObjectStore('assets', { keyPath: 'id' });
    db.createObjectStore('log', { keyPath: 'id' });
  };
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction(['meta', 'tasks', 'assets', 'log'], 'readwrite');
    tx.objectStore('meta').put({ key: 'profile', value: null });
    tx.objectStore('meta').put({
      key: 'profile',
      value: { houseName: 'Old v1 House', centralAC: true, waterHeater: 'tank' },
    });
    tx.objectStore('tasks').put({
      id: 'task_v1a', title: 'Old filter task', cat: 'hvac',
      every: { n: 3, unit: 'm' }, nextDue: '2026-09-01', lastDone: '2026-06-01',
      photoIds: [], paused: false, custom: false, key: 'hvac-filter',
      windows: null, yearGap: 1, note: '', link: '', why: '', how: '',
      assetId: null, assetHint: '', oneShot: false,
    });
    tx.objectStore('assets').put({
      id: 'asset_v1a', name: 'Old Fridge', brand: 'GE', model: 'X1',
      serial: '', warrantyEnds: '', roomId: null, specs: [], link: '', note: '',
    });
    tx.objectStore('log').put({
      id: 'log_v1a', taskId: 'task_v1a', date: '2026-06-01', note: 'v1 entry',
    });
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => reject(tx.error);
  };
  req.onerror = () => reject(req.error);
})
"""


STARTER_FIXTURE = {
    "app": "home-manual",
    "version": "2.0.0",
    "exported": "2026-08-01T12:00:00.000Z",
    "includesPhotos": False,
    "meta": {"activeSubjectId": "sub_starter"},
    "data": {
        "subjects": [{
            "id": "sub_starter", "kind": "house", "name": "Starter House",
            "created": "2026-08-01", "seeded": False,
            "features": {"type": "house", "stories": 2, "beds": 3, "baths": 2,
                         "climateFreeze": True, "foundation": "slab",
                         "garage": "1", "gutters": True, "yard": True,
                         "centralAC": True, "furnace": "electric",
                         "waterHeater": "tank", "fridgeFilter": True,
                         "dishwasher": True, "washer": "front",
                         "dryer": "electric", "warrantyStart": ""},
            "specs": [{"k": "Builder", "v": "Fixture Builder LLC"}],
        }],
        "rooms": [
            {"id": "room_a", "subjectId": "sub_starter", "name": "Kitchen",
             "floor": "Main", "dims": "12x13", "paint": [], "specs": [],
             "note": ""},
            {"id": "room_b", "subjectId": "sub_starter", "name": "Garage",
             "floor": "Main", "dims": "12x20", "paint": [], "specs": [],
             "note": ""},
        ],
        "tasks": [], "assets": [], "log": [], "photos": [], "inspections": [],
    },
}


def test_starter_import(pw) -> None:
    """Fresh install -> restore a generated starter from the wizard."""
    import json
    import tempfile

    fixture = Path(tempfile.mkdtemp()) / "starter.json"
    fixture.write_text(json.dumps(STARTER_FIXTURE))

    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(f"http://127.0.0.1:{PORT}/")
    page.wait_for_timeout(700)

    check("fresh install shows the wizard", page.is_visible("#screen-setup"))
    check("wizard offers restore on first run", page.is_visible("#btnSetupRestore"))

    with page.expect_file_chooser() as fc:
        page.click("#btnSetupRestore")
    fc.value.set_files(str(fixture))
    page.on("dialog", lambda d: d.accept())
    page.wait_for_timeout(1500)

    # importBackup reloads the page; give it a beat and land on Home.
    page.wait_for_timeout(1000)
    check("starter import lands in the app", page.is_visible("#screen-home"))
    check(
        "starter house is active",
        page.locator('.subject-card:has-text("Starter House")').count() == 1,
    )

    page.click('#tabs button[data-tab="manual"]')
    page.wait_for_timeout(400)
    rooms = page.locator("#manualBody [data-room]").count()
    check("both rooms imported", rooms == 2, str(rooms))
    check(
        "house facts imported",
        page.locator('#manualBody .spec-v:has-text("Fixture Builder")').count() == 1,
    )

    page.click('#tabs button[data-tab="tasks"]')
    page.wait_for_timeout(300)
    check(
        "starter arrives with an empty task list (build-your-own)",
        page.locator("#taskGroups .task").count() == 0,
    )

    # The idea browser is the intended next step; confirm Add suggested works.
    page.click("#btnAddTask")
    page.wait_for_timeout(200)
    page.click("#atBrowse")
    page.wait_for_timeout(300)
    page.locator('[data-addcat]').first.click()
    page.wait_for_timeout(500)
    added = page.locator("#taskGroups .task").count()
    check("Add suggested fills the category", added >= 3, str(added))

    browser.close()


def test_v1_migration(pw) -> None:
    """A v1 database must convert in place on first v2 boot."""
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})

    # Seed a v1 database on the origin before the app ever runs.
    page.goto(f"http://127.0.0.1:{PORT}/version.json")
    seeded = page.evaluate(V1_SEED)
    check("v1 database seeded", bool(seeded))

    page.goto(f"http://127.0.0.1:{PORT}/")
    page.wait_for_timeout(900)

    check("migrated boot skips the wizard", not page.is_visible("#screen-setup"))
    check(
        "v1 profile became a house subject",
        page.locator('.subject-card:has-text("Old v1 House")').count() == 1,
    )

    page.click('#tabs button[data-tab="tasks"]')
    page.wait_for_timeout(300)
    check(
        "v1 task survived with its history",
        page.locator('#taskGroups .task-title:has-text("Old filter task")').count() == 1,
    )
    check(
        "v1 last-done shows on the row",
        page.locator('#taskGroups .task-sub:has-text("Done Jun 1")').count() == 1,
    )

    page.click('#tabs button[data-tab="manual"]')
    page.wait_for_timeout(300)
    check(
        "v1 asset shows as equipment",
        page.locator('#manualBody .card-hd:has-text("Old Fridge")').count() == 1,
    )

    # Open the task; its v1 log entry should render in History.
    page.click('#tabs button[data-tab="tasks"]')
    page.wait_for_timeout(200)
    page.locator("#taskGroups .task-main").first.click()
    page.wait_for_timeout(300)
    check(
        "v1 log entry renders in the sheet",
        page.locator('#sheet0Body .hist-note:has-text("v1 entry")').count() == 1,
    )

    browser.close()


def run() -> None:
    """Both journeys against a clean server."""
    httpd = serve()
    with sync_playwright() as pw:
        print("--- starter import ---")
        test_starter_import(pw)
        print("--- v1 -> v2 migration ---")
        test_v1_migration(pw)
    httpd.shutdown()

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S)")
        sys.exit(1)
    print("ALL DATA-PATH CHECKS PASSED")


if __name__ == "__main__":
    run()
