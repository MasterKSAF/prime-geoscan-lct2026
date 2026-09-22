# Browser QA — external obstacles, 22.09.2026

Isolated Playwright CLI session `obstacles-final`; local Docker at 127.0.0.1:3016. No changes to user's browser storage or remote accounts.

- Opened Gallery → Demo 2 → replacement preview → editor. Full embedded source loaded.
- Calculated both objectives via solve-with-obstacles. Two feasible-model candidates, 36 pass / 0 fail / 6 unknown in the UI.
- Approved the explicitly model-only plan, ran at x300, observed completed state: 14:31 model time; remaining batteries about 84% / 78%.
- Missions → completed mission → Report → Download evidence ZIP. Download independently verified by CLI; output `archive-verification.json`. All original KML bytes preserved.
- Restarted Docker and reloaded the page: completed operation and its exact source still available.
- Original KML upload through file chooser: 3201 accepted, 15 rings repaired, 0 rejected. Applied to a new document revision; previous completed operation preserved.
- Saved catalog has 1 entry; searched UHHH103009, focused its actual position. Toggled visibility off/on without removing map or source.
- Uploaded `rejected.kml` containing DTD: explicit rejection, previous `primorsky-obstacles.kml` stayed attached, busy state cleared.
- Saved revised draft, reloaded: saved draft and original completed operation both listed separately.
- After the worker fix and reload: console reported 0 messages, errors and warnings.

Found/fixed: production Worker URL was file:// instead of same-origin; replaced URL constructor with Vite worker import and handled constructor errors. Restored editor now switches to the editable form after applying a layer. Added visible input borders and keyboard-accessible InfoHint.

HTTP fault tests also exposed a known local runtime issue: oversized rejection sometimes truncates the error body; one immediate following request returned 503. A repeat passed with 413/403/200/413/200/200. See `output/obstacles-20260922/http-verification.json`; this transport issue is not claimed fixed.

Screenshots: `calculated.png` (initial smaller viewport), `completed.png`, `imported-layer.png`, `obstacle-focus.png`. Final UI recheck after restart is recorded separately. No evidence of real flight, real terrain clearance or physical battery calibration is implied.

Final restart check, 13:22 UTC: Docker healthy, image sha256:c7b600c87c7524b86e2683b0ddc01703a44e1caa5f7373f0fc621ba564e0cbd3. Saved draft reopened, saved source parsed by the production worker: 3201 accepted / 15 repaired / 0 rejected. `final-layer.png` visually inspected, `final-console.txt`: 0 errors and warnings. Full image build: 509/509 tests. New-source scoped lint and host typecheck passed. Limited four-pattern credential scan: 92 planner source files, 0 findings; not a comprehensive secrets audit.
