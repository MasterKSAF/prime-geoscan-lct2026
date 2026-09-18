# Independent pre-release checks · 2026-09-18

Scope: current local source tree after packaging/portability changes. Historical
0.3.0 evidence was read, not regenerated. No Git operations were performed by this
checker. Results do not constitute an official jury score or flight clearance.

## Completed checks

- `npm run typecheck`: exit 0; `typecheck.log`.
- `npm run test:planner`: exit 0; 160 passed, 0 failed, 0 skipped;
  `npm-test-planner.log`.
- The same Node test command with `spec` and `junit` reporters: exit 0;
  160 passed, 0 failed, 0 skipped; `unit-tests-verified.xml`.
- The 16 `artifactHashes` recorded in
  `output/mission-showcase-0.3.0/summary.json`: 16 matched, 0 mismatched;
  `historical-artifact-hashes.json`. No historical artifact or assembler was run.
- Acceptance rerun with the clean-archive Docker stand healthy at port 3016:
  exit 0; A1–A8 all passed, 0 failed, 0 skipped;
  `acceptance-tests-verified.xml`. A8 exercised the real HTTP API.

## Preserved unsuccessful environment attempts

- `unit-tests.xml`: initial sandbox invocation could not create Node subprocesses
  (`spawn EPERM`). All 18 test files failed to start; no product assertion failed.
  The authorized subprocess rerun is `unit-tests-verified.xml` above.
- `acceptance-tests.xml`: A1–A7 passed; A8 could not connect to the required
  loopback API at port 3016 (`ECONNREFUSED`) while the Docker stand was stopped.
  This initial file is not an 8/8 acceptance result. The subsequent healthy-stand
  rerun is `acceptance-tests-verified.xml` above; the initial attempt is preserved.

The typecheck and test logs are new artifacts under this release-check directory.
The historical 17 September logs remain distinct from the 18 September checks.
