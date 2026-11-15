# BBFF Team Evidence Reference

Use this guide when verifying work done by yourself or by a BBFF Team member on
DeepSeek Harness (DSH). Every item maps a claim to what proves it and how to
check it.

## 1. Code Change

- **Claim:** A bug is fixed, a feature is implemented, or logic is refactored.
- **What proves it:** The actual file modifications match the intended behavior,
  and the relevant tests pass against the modified state.
- **How to check:** Read the diff of the changed files and rerun the relevant
  tests yourself, or read the member's preserved test output and spot-check at
  least one test directly.

## 2. Release Package

- **Claim:** A release archive or tarball has been built and is ready to ship.
- **What proves it:** Archive integrity and exact correspondence between packed
  contents and source.
- **How to check:** Recompute the archive SHA-256 and byte size; unpack the
  archive and compare the changed files against the source tree.

## 3. Installed Package

- **Claim:** A plugin or package is installed and active in the target profile.
- **What proves it:** Installed files match the inspected package, the expected
  version is loaded, and the installed capability works in the target profile.
- **How to check:** Read back installed file hashes and the live version, then
  exercise the installed tool or workflow with a production-shaped input and
  inspect its semantic readback. Matching bytes and version alone do not prove
  the capability works: a plugin can be installed at the right version while
  its runtime hooks never attach.

## 4. UI Change

- **Claim:** A visual component, layout, or interactive control is updated.
- **What proves it:** The live rendered surface after a refresh shows the
  intended state.
- **How to check:** Capture a real screenshot of the rendered surface after a
  page refresh, then open and inspect it with an image-reading tool. An offline
  or fixture render must be labelled "candidate, not live".

## 5. Stored Data or Settings

- **Claim:** Configuration, memory, or persistent state has been updated.
- **What proves it:** The stored value reflects the change and survives reload
  when persistence is part of the claim.
- **How to check:** Read the stored value back after the change, and read it
  back again after a reload or restart where persistence is claimed.

## 6. Performance Claim

- **Claim:** A path is faster, uses less memory, or meets a latency budget.
- **What proves it:** A clean timing or resource sample captured alongside host
  load conditions.
- **How to check:** Inspect the sample together with host conditions (CPU usage
  and top processes). A sample taken on a saturated host or cut off by a client
  timeout is marked "invalid, retest", not a pass or a failure.

## 7. Owner-Editable Data

- **Claim:** A workflow ran without touching owner-controlled settings or files,
  or only applied an owner-requested edit.
- **What proves it:** Before-and-after hashes and change-log provenance.
- **How to check:** Hash the target immediately before and after the change; any
  difference must be attributed to an explicit owner edit in the change log
  inside that time window.

## 8. Team Member's Report

- **Claim:** A team member reports that a task or check is finished.
- **What proves it:** Direct verification of the underlying artifact or state.
- **How to check:** Treat a member's report as a claim until you have performed
  the corresponding check above yourself.
