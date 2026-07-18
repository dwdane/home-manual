# e2e.py
"""End-to-end browser test for Home Manual.

Drives a real headless Chromium through first-run setup, task completion,
both modals, and the update banner, asserting at each step that nothing is
covering the interface. A blocking overlay is invisible to syntax checks and
to static analysis, so this is the layer that catches it.

Requires playwright:

    uv run --with playwright python e2e.py
    # first time only: python -m playwright install chromium

Serves the project folder on a local port for the duration of the run.
Writes screenshots to ./screens/ for visual review.
"""

from __future__ import annotations

import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SHOTS = HERE / "screens"
PORT = 8971

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    """Assert a condition without aborting the run."""
    if condition:
        print(f"ok    {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name}{' - ' + detail if detail else ''}")


def serve() -> socketserver.TCPServer:
    """Start a quiet static file server rooted at the project folder."""

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):  # noqa: D102 - silence request logging
            pass

    handler = functools.partial(Quiet, directory=str(HERE))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def top_element_at_center(page) -> str:
    """Describe the topmost element at the middle of the viewport."""
    return page.evaluate(
        """() => {
            const el = document.elementFromPoint(
                window.innerWidth / 2, window.innerHeight / 2);
            if (!el) return 'none';
            const owner = el.closest('#taskModal, #assetModal, #updateBanner');
            return owner ? owner.id : (el.id || el.className || el.tagName);
        }"""
    )


def run() -> int:
    """Execute the full walkthrough. Returns a process exit code."""
    SHOTS.mkdir(exist_ok=True)
    httpd = serve()
    errors: list[str] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844})
            # Only same-origin problems matter. Web fonts are loaded from
            # Google and may legitimately fail on a restricted network without
            # affecting the app.
            base = f"http://127.0.0.1:{PORT}"
            page.on("pageerror", lambda e: errors.append(f"JS: {e}"))
            page.on(
                "response",
                lambda r: errors.append(f"{r.status} {r.url}")
                if r.url.startswith(base) and r.status >= 400
                else None,
            )

            page.goto(f"http://127.0.0.1:{PORT}/index.html")
            page.wait_for_timeout(900)

            # --- first run: the setup wizard, and nothing on top of it -------
            check("setup wizard visible on first run", page.is_visible("#screen-setup"))
            blocker = top_element_at_center(page)
            check(
                "nothing overlays the app at boot",
                blocker not in ("taskModal", "assetModal", "updateBanner"),
                f"topmost element is #{blocker}",
            )
            check("task modal hidden at boot", page.is_hidden("#taskModal"))
            check("asset modal hidden at boot", page.is_hidden("#assetModal"))
            check("update banner hidden at boot", page.is_hidden("#updateBanner"))
            page.screenshot(path=str(SHOTS / "01-setup.png"))

            # --- build the schedule -----------------------------------------
            page.click("#btnSetupSave")
            page.wait_for_timeout(700)
            check("today screen after setup", page.is_visible("#screen-today"))
            rows = page.locator("#todayList .task").count()
            check("today screen lists tasks", rows > 0, f"{rows} rows")
            page.screenshot(path=str(SHOTS / "02-today.png"))

            # --- tab navigation ---------------------------------------------
            for tab, screen in [
                ("plan", "#screen-plan"),
                ("things", "#screen-things"),
                ("settings", "#screen-settings"),
                ("today", "#screen-today"),
            ]:
                page.click(f'#tabs button[data-tab="{tab}"]')
                page.wait_for_timeout(250)
                check(f"{tab} tab opens", page.is_visible(screen))
            page.screenshot(path=str(SHOTS / "03-settings.png"))

            # --- complete a task --------------------------------------------
            page.click('#tabs button[data-tab="today"]')
            page.wait_for_timeout(250)
            before = page.locator("#todayList .task").count()
            done_btn = page.locator("#todayList .mini-done").first
            if done_btn.count():
                done_btn.click()
                page.wait_for_timeout(400)
                after = page.locator("#todayList .task").count()
                check("completing a task updates the list", after <= before)
            else:
                check("a done button exists on the today screen", False)

            # --- task modal opens and closes --------------------------------
            page.click('#tabs button[data-tab="plan"]')
            page.wait_for_timeout(300)
            page.locator("#planList .task-main").first.click()
            page.wait_for_timeout(300)
            check("task modal opens", page.is_visible("#taskModal"))
            page.screenshot(path=str(SHOTS / "04-task-modal.png"))
            page.click("#taskClose")
            page.wait_for_timeout(300)
            check("task modal closes", page.is_hidden("#taskModal"))
            check(
                "app is interactive after closing the task modal",
                top_element_at_center(page) not in ("taskModal", "assetModal"),
            )

            # --- asset modal opens and closes -------------------------------
            page.click('#tabs button[data-tab="things"]')
            page.wait_for_timeout(300)
            page.click("#btnAddAsset")
            page.wait_for_timeout(300)
            check("asset modal opens", page.is_visible("#assetModal"))
            page.fill("#afName", "Furnace")
            page.click("#assetSave")
            page.wait_for_timeout(400)
            check("asset modal closes on save", page.is_hidden("#assetModal"))
            check("saved asset appears", page.locator("#assetList").inner_text().find("Furnace") >= 0)
            page.screenshot(path=str(SHOTS / "05-things.png"))

            # --- update banner dismiss --------------------------------------
            page.evaluate("document.getElementById('updateBanner').hidden = false")
            page.wait_for_timeout(200)
            check("update banner can be shown", page.is_visible("#updateBanner"))
            page.screenshot(path=str(SHOTS / "06-banner.png"))
            page.click("#btnDismissUpdate")
            page.wait_for_timeout(250)
            check("update banner dismisses", page.is_hidden("#updateBanner"))

            # --- reload keeps data ------------------------------------------
            page.reload()
            page.wait_for_timeout(900)
            check("returning user skips the wizard", page.is_visible("#screen-today"))
            check(
                "nothing overlays the app on reload",
                top_element_at_center(page) not in ("taskModal", "assetModal"),
            )

            check("no console or page errors", not errors, "; ".join(errors[:3]))
            browser.close()
    finally:
        httpd.shutdown()

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S): {', '.join(failures)}")
        return 1
    print(f"ALL E2E CHECKS PASSED - screenshots in {SHOTS}")
    return 0


if __name__ == "__main__":
    sys.exit(run())
