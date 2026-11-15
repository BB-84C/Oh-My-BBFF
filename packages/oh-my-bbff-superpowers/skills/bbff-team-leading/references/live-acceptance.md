# Live Acceptance Protocol

This document outlines a general method for accepting changes on shared live systems. The BBFF plugin install flow is one application of these principles.

## 1. Serialized Change Slot
- **Why**: Prevent concurrent modifications and ensure atomicity.
- **How**: Only one live change is processed at a time. Define a request and an authorized executor for the protected live target. For a BBFF install, use INSTALL-REQUEST/GRANTED for the exact artifact hash (the member sends an `INSTALL-REQUEST` with the artifact path, byte count, SHA-256 hash, changed-file list and rollback target; the Lead recomputes the hash and replies `GRANTED` for that exact hash only). After the grant, the authorized executor applies that artifact, exercises the agreed live scenarios, reads back the installed identity and behavior, and returns evidence. The Lead inspects it and reports the remaining owner acceptance separately. A rebuild requires a new grant.
- **Passes when**: A rebuilt artifact triggers a new, distinct request.

## 2. Owner-Editable Data Baseline
- **Why**: Detect and account for concurrent owner edits (settings, rules, memory) without overwriting them.
- **How**: Hash the owner's files (role settings, plugin settings, rules, memory files) immediately before and after the change call. If a hash changes, inspect `changelog.jsonl` entries inside that exact call window. `source:"settings-ui"` or an owner `userInstruction` attributes an owner edit: record it and continue. Changed bytes without such attribution are a product failure. Do not restore owner data; never hardcode a historical hash.
- **Passes when**: Every changed owner file is either unchanged or attributed to an owner edit inside the window.

## 3. Live State
- **Why**: Ensure system integrity during live updates.
- **How**: Check semantic invariants. Never use a frozen snapshot; live state must move forward. Example invariants: no active run, same resident session, wake counter and last-wake time never decrease, lease consistent with idle.
- **Passes when**: Every invariant holds after the change; values that legitimately advanced are not failures.

## 4. Measurement Validity
- **Why**: Ensure performance benchmarks are representative.
- **How**: Record host CPU/load per sample. If saturated or timeout, mark "invalid, retest". Also record top processes; a sample cut off by a client timeout is also invalid. Keep both failed and valid samples.
- **Passes when**: Every verdict cites a valid sample; invalid samples are kept and labelled.

## 5. Rollback Target
- **Why**: Ensure immediate return to known-good state if product fails.
- **How**: Record rollback target and hash before the change. Roll back only for validated product failure, never for invalid measurement.
- **Passes when**: Clean revert verified against target hash upon failure.

## 6. Negative Control
- **Why**: Prove the acceptance check is discriminating and not an empty pass.
- **How**: Run check on previous version or frozen baseline artifact.
- **Passes when**: Gate fails on older artifact as expected.

## 7. Receipt Wording
- **Why**: Explicitly communicate verification boundaries to the owner.
- **How**: Use three strict, unmerged states:
  1. "installed, Lead verification pending"
  2. "installed, Lead verified, awaiting owner"
  3. "owner accepted" (only when owner explicitly confirms).
  UI changes must include a real screenshot of rendered surface after refresh; offline renders must be labeled "candidate, not live".
- **Passes when**: Status receipt strictly matches one of the three states and UI includes refreshed screenshot evidence.
