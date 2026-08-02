# e2e.py
"""End-to-end smoke test in headless Chromium via Playwright.

    python3 e2e.py

Serves the app directory, drives the real first-run journey at iPhone
viewport, and fails on any same-origin console error. After every step an
overlay probe runs elementFromPoint at several screen points and fails if an
unexpected modal layer is eating taps - the class of bug that shipped as
v1.0.0's invisible full-screen scrim.

Screenshots land in screens/ for eyeball review.
"""

from __future__ import annotations

import http.server
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SHOTS = HERE / "screens"
SHOTS.mkdir(exist_ok=True)

PORT = 8791

failures: list[str] = []
step_no = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    """Record one assertion."""
    if cond:
        print(f"ok    {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name}{' - ' + detail if detail else ''}")


def serve() -> http.server.ThreadingHTTPServer:
    """Static file server for the app directory, quiet logs."""

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):  # noqa: D102
            pass

    handler = partial(Quiet, directory=str(HERE))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def overlay_probe(page, label: str, expect_sheet: bool = False) -> None:
    """Fail if a modal layer is intercepting taps when none should be."""
    covered = page.evaluate(
        """() => {
          const pts = [[187, 200], [187, 420], [60, 640], [320, 640]];
          for (const [x, y] of pts) {
            let el = document.elementFromPoint(x, y);
            while (el) {
              if (el.classList && el.classList.contains('modal')) return true;
              el = el.parentElement;
            }
          }
          return false;
        }"""
    )
    if expect_sheet:
        check(f"{label}: sheet layer present", covered)
    else:
        check(f"{label}: no stray overlay eating taps", not covered)


def shot(page, name: str) -> None:
    """Numbered screenshot."""
    global step_no
    step_no += 1
    page.screenshot(path=str(SHOTS / f"{step_no:02d}-{name}.png"))


def run() -> None:
    """The whole journey."""
    httpd = serve()
    errors: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.on(
            "console",
            lambda m: errors.append(m.text)
            if m.type == "error" and "127.0.0.1" in (m.location or {}).get("url", "")
            else None,
        )
        page.on("pageerror", lambda e: errors.append(str(e)))

        # -- 1. first run: the wizard ------------------------------------
        page.goto(f"http://127.0.0.1:{PORT}/")
        page.wait_for_timeout(700)
        check("first run opens the house wizard", page.is_visible("#screen-setup"))
        check("tab bar hidden during setup", not page.is_visible("#tabs"))
        shot(page, "wizard")

        page.fill('input[data-f="name"]', "Test House")
        page.click('div[data-f="foundation"] .seg-opt:has-text("Crawlspace")')
        crawl_on = page.eval_on_selector(
            'div[data-f="foundation"] .seg-opt:has-text("Crawlspace")',
            "el => el.classList.contains('on')",
        )
        check("seg control toggles", crawl_on)
        overlay_probe(page, "wizard")

        page.click("#btnSetupSave")
        page.wait_for_timeout(600)

        # -- 2. tasks seeded ----------------------------------------------
        check("lands on Tasks after save", page.is_visible("#screen-tasks"))
        groups = page.locator("#taskGroups .cat-group").count()
        rows = page.locator("#taskGroups .task").count()
        check("categories rendered", groups >= 5, str(groups))
        check("a healthy seeded list", rows >= 30, str(rows))
        crawl_row = page.locator('#taskGroups .task-title:has-text("crawlspace")').count()
        check("crawlspace task present (feature respected)", crawl_row >= 1)
        overlay_probe(page, "tasks")
        shot(page, "tasks")

        # Collapse and expand a category
        first_cat = page.locator("#taskGroups .cat-hd").first
        first_cat.click()
        page.wait_for_timeout(150)
        hidden_group = page.eval_on_selector(
            "#taskGroups .cat-group div[hidden]", "el => !!el"
        )
        check("category collapses", bool(hidden_group))
        page.locator("#taskGroups .cat-hd").first.click()
        page.wait_for_timeout(150)

        # -- 3. open a task, mark it done ---------------------------------
        page.locator("#taskGroups .task-main").first.click()
        page.wait_for_timeout(300)
        overlay_probe(page, "task sheet", expect_sheet=True)
        shot(page, "task-sheet")
        page.click("#tsDone")
        page.wait_for_timeout(300)
        check("done sheet stacks above", page.is_visible("#sheet1"))
        shot(page, "done-sheet")
        page.click("#dnSave")
        page.wait_for_timeout(400)
        overlay_probe(page, "after completion")
        done_rows = page.locator('#taskGroups .task-sub:has-text("Done ")').count()
        check("completion recorded on the row", done_rows >= 1, str(done_rows))

        # -- 4. add from the idea browser ---------------------------------
        page.click("#btnAddTask")
        page.wait_for_timeout(200)
        page.click("#atBrowse")
        page.wait_for_timeout(300)
        overlay_probe(page, "idea browser", expect_sheet=True)
        shot(page, "idea-browser")
        before = page.locator("#taskGroups .task").count()
        add_btn = page.locator(".lib-add:not([disabled])").first
        add_btn.click()
        page.wait_for_timeout(250)
        became_check = page.locator(".lib-add[disabled]").count()
        check("idea + turns into a check", became_check >= 1)
        page.click("#sheet0Close")
        page.wait_for_timeout(300)
        after = page.locator("#taskGroups .task").count()
        check("idea landed on the list", after == before + 1, f"{before}->{after}")

        # -- 5. manual: add a room and equipment --------------------------
        page.click('#tabs button[data-tab="manual"]')
        page.wait_for_timeout(300)
        check("manual renders house sections", page.is_visible("#manualBody"))
        page.click("#btnManualAdd")
        page.wait_for_timeout(200)
        page.click("#maRoom")
        page.wait_for_timeout(250)
        page.fill("#rmName", "Kitchen")
        page.fill("#rmDims", "12'2 x 13'6")
        page.click("#rmSave")
        page.wait_for_timeout(300)
        check("room card appears", page.locator('#manualBody .card-hd:has-text("Kitchen")').count() >= 1)

        page.click("#btnManualAdd")
        page.wait_for_timeout(200)
        page.click("#maEquip")
        page.wait_for_timeout(250)
        page.fill("#aqName", "Refrigerator")
        page.select_option("#aqRoom", label="Kitchen")
        page.click("#aqSave")
        page.wait_for_timeout(300)
        check("equipment card appears", page.locator('#manualBody .card-hd:has-text("Refrigerator")').count() >= 1)
        overlay_probe(page, "manual")
        shot(page, "manual")

        # Search filters
        page.fill("#manualSearch", "refrig")
        page.wait_for_timeout(250)
        check(
            "search narrows the manual",
            page.locator('#manualBody .card-hd:has-text("Kitchen")').count() == 0
            and page.locator('#manualBody .card-hd:has-text("Refrigerator")').count() == 1,
        )
        page.fill("#manualSearch", "")
        page.wait_for_timeout(250)

        # -- 6. photos: rails and empty state -----------------------------
        page.click('#tabs button[data-tab="photos"]')
        page.wait_for_timeout(300)
        check("photo type rail built", page.locator("#photoTypeRail .chip").count() >= 5)
        check("photo where rail includes the room", page.locator('#photoWhereRail .chip:has-text("Kitchen")').count() == 1)
        check("photos empty state", page.locator("#photoGrid .empty").count() == 1)
        overlay_probe(page, "photos")
        shot(page, "photos")

        # -- 6b. photo pipeline: gallery import -> tag -> grid -> viewer ---
        from PIL import Image as PILImage

        fixture_png = SHOTS / "_fixture.png"
        PILImage.new("RGB", (64, 64), (200, 60, 40)).save(fixture_png)

        page.click("#btnCamera")
        page.wait_for_timeout(200)
        with page.expect_file_chooser() as fc:
            page.click("#cpGal")
        fc.value.set_files(str(fixture_png))
        page.wait_for_timeout(700)
        check("tag sheet opens after import", page.is_visible("#tgSave"))
        page.select_option("#tgRoom", label="Kitchen")
        page.fill("#tgCaption", "Move-in")
        page.click("#tgSave")
        page.wait_for_timeout(500)
        check("photo lands in the grid", page.locator("#photoGrid .ph").count() == 1)
        check("month header groups it", page.locator("#photoGrid .month-hd").count() == 1)

        page.click('#photoWhereRail .chip:has-text("Kitchen")')
        page.wait_for_timeout(300)
        check("room filter keeps the tagged photo", page.locator("#photoGrid .ph").count() == 1)
        page.click('#photoWhereRail .chip:has-text("Everywhere")')
        page.wait_for_timeout(300)

        page.locator("#photoGrid .ph").first.click()
        page.wait_for_timeout(300)
        check("photo sheet shows the caption", page.input_value("#phCaption") == "Move-in")
        check("save-to-phone escape hatch present", page.is_visible("#phToPhone"))
        overlay_probe(page, "photo sheet", expect_sheet=True)
        shot(page, "photo-sheet")
        page.click("#sheet0Close")
        page.wait_for_timeout(250)
        fixture_png.unlink(missing_ok=True)

        # -- 7. inspection -------------------------------------------------
        page.click('#tabs button[data-tab="more"]')
        page.wait_for_timeout(250)
        shot(page, "more")
        page.click("#btnInspection")
        page.wait_for_timeout(300)
        check("inspection home shows", page.is_visible("#screen-inspect"))
        page.click("#inStart")
        page.wait_for_timeout(350)
        items = page.locator(".insp-item").count()
        check("inspection walk generated", items >= 25, str(items))
        page.locator('.insp-item [data-st="ok"]').first.click()
        page.wait_for_timeout(250)
        progress = page.inner_text("#inspectProgress")
        check("progress counts", progress.startswith("1/"), progress)
        page.locator('.insp-item [data-st="flag"]').nth(1).click()
        page.wait_for_timeout(250)
        check("flag opens the note box", page.locator(".insp-flag-box").count() >= 1)
        overlay_probe(page, "inspection")
        shot(page, "inspection")
        page.click("#btnInspectBack")
        page.wait_for_timeout(250)

        # -- 8. updates ----------------------------------------------------
        page.click("#btnCheckUpdate")
        page.wait_for_timeout(700)
        status = page.inner_text("#updateStatus")
        check("update check reports latest", "latest" in status, status)
        check("no update banner on current version", not page.is_visible("#updateBanner"))

        # -- 9. subject switching flows ------------------------------------
        page.click('#tabs button[data-tab="home"]')
        page.wait_for_timeout(300)
        check("subject rail shows the house", page.locator('.subject-card:has-text("Test House")').count() == 1)
        shot(page, "home")
        page.click('#tabs button[data-tab="tasks"]')
        page.wait_for_timeout(200)
        page.click("#taskSubjectChip")
        page.wait_for_timeout(250)
        overlay_probe(page, "switcher", expect_sheet=True)
        page.click("#swAdd")
        page.wait_for_timeout(250)
        page.click("#addPet")
        page.wait_for_timeout(250)
        page.fill('#ssFields input[data-f="name"]', "Biscuit")
        page.click("#ssSave")
        page.wait_for_timeout(400)
        check("pet becomes active with its own tasks", "Biscuit" in page.inner_text("#taskSubjectChip"))
        pet_rows = page.locator("#taskGroups .task").count()
        check("pet seeded with its library", pet_rows >= 8, str(pet_rows))
        overlay_probe(page, "pet tasks")
        shot(page, "pet-tasks")

        browser.close()

    httpd.shutdown()

    print()
    if errors:
        print("CONSOLE ERRORS:")
        for e in errors[:10]:
            print(f"  {e}")
        failures.append("console errors")
    if failures:
        print(f"{len(failures)} FAILURE(S)")
        sys.exit(1)
    print("ALL E2E CHECKS PASSED")


if __name__ == "__main__":
    run()
