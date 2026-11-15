# SDK0.1.11 amended v1.6 runtime — integration milestone

0.1.11 adds only the normalized model-selection persisted-event variant; full
projection state/wire decoding is unchanged. ContractSHA remains72d53f21754fd13c39385238c35f393e887243ef19d27ca9e7750e69bcb5d115;
adapterSHA is68f5a357d61bb4f82df15904c7ccc27611d82e1e663e0ecdf28f6f9b70ede5f6.
The previous0.1.10 pair remains superseded provenance. The shared public async
read seam and native-reference consumer proof are documented in DSH_ADAPTER.md.
All three consumers were notified together before packing; each owns its vendor sync.

The canonical contract.js + dsh-adapter.js pair is REAL runtime JavaScript, not
stubs. Source0.1.10 adds complete reviewed native effects and exact team-spawn
semantic grouping, with all172 source/alias sites covered and future new-tool /
unsupported-registration-syntax negative tests. The human table is
NATIVE_TOOL_EFFECTS.md; generic factories have no tool identities. Dynamic MCP
remains upstream-owned unknown; the reserved transport has its own row.
The0.1.8/0.1.9 resource, goal/user-event and cached-root amendments remain.
Superseded0.1.8/0.1.9 exact bytes/hashes are archived, not rewritten. contract.js
bytes are unchanged. Exact verification counts/current pair hashes are in the
readiness receipt; no consumer should guess a moving pair.
This is NOT the root catalog/provider release and NOT permission to install a
bundle without the Lead's serialized slot. Other packages own their vendor copies.

Official source sync/check:

```powershell
node packages/oh-my-bbff-sdk/scripts/sync-into.mjs --target <bundle-dir>
node packages/oh-my-bbff-sdk/scripts/sync-into.mjs --check --target <bundle-dir>
```

Both runtimes are required: contract→lib/bbff-contract.js and adapter→lib/dsh-adapter.js.
Current full SHA values are in the task42 runtime-ready.json receipt. Future
runtime changes require a new version/hash notice; do not assume moving bytes.

## Boundaries that remain explicit

- Report-group membership is NOT effect:read and grants no entitlement.
  team_task_update is shared-board write. requiredTools is dependency/warning,
  never a bypass. team-spawn is EXACT native teammate-spawn membership, not all
  delegation. A real native registration test verifies it and nearest-scope
  Team/global collisions.
- Native effects are complete source classifications, not a current registration
  roster. Session-only todo/present/plan-exit/structured-answer bookkeeping is
  read; conditional workspace dependency installation is recorded explicitly.
  The name-only API conservatively describes its write capability, not guessed
  current config. Unknown effects stay visible/unknown; Team's explicit policy
  is allow(default)/deny, never an implicit effect:read conversion.
- nativeToolSource is a native NAME-CONTRACT explanation, not universal live
  definition ownership proof. send_message/list_agents/interrupt_agent have
  multiple known owners: return unknown+diagnostic rather than pick one.
- apply_patch/custom aliases have no corroborated installed source; unknown
  effect never defaults to read. Optional superagent name/shape hints remain
  unsupported/incomplete without verified owning evidence.
- nativeSubagentProvider returns the native factory DEFAULT name, not a claim
  that this deployment enabled/configured that provider. Query public registry.
- promptSectionConvention('subagent-delegation') provides the public order key and
  an EMPTY concrete key: actual native context names depend on configured toolName.
- modelSelectionFacts requires {view:'state'|'wire'}. Wire next never becomes a
  pending user override. Mutation support remains unverified; no clear API exists
  in this adapter.
- resourceAddress is HOST ONLY. Input file requires sessionId/path. It returns
  native address/resourceKind data; sessions use navigationTarget without fake
  resource URI/kind; subagents additionally expose the native direct-parent target.
  Clients consume the returned fields without copying address or kind grammar.
- sessionEventFacts normalizes optional goal id/revision/createdAt/updatedAt
  inside goal; clears carry clearedId/revision/updatedAt without raw event data.
  All recognized variants carry optional seq/time. user-message returns text
  (text blocks only, uncapped/untrimmed), source (kind string only), isHuman
  (native user source predicate, not user-role inference). Injected goal,
  instruction and plugin user-role messages are not human. Missing optional
  evidence is absent, never fabricated from current wall time.
- Original FROZEN v1.6 hashes are retained as superseded provenance in CONTRACT.md.
  Runtime pair changes after this0.1.10 notice again require a new version/hash notice.

## instructionLoaderFacts accepted inputs

The unknown slots mean NATIVE DATA, not guessed consumer defaults. Supply actual
effective instruction-plugin config only after establishing the target composition:

```js
{
  resolvedConfig: {
    projectRootMarkers: ['.git'],
    instructionFileCandidates: ['AGENTS.md', 'CLAUDE.md'],
    localInstructionFileCandidates: ['AGENTS.local.md', 'CLAUDE.local.md'],
    maxBytes: /* actual REQUIRED resolved value */,
    maxSourceBytes: /* actual per-source bound */
  },
  fileEvidence: [{
    absolutePath, displayPath, bytes, content,
    // Optional: exists:false,evidence:'current-stat' proves only current absence,
    // NOT removal of previously admitted instructions.
  }],
  loadEvidence: { message, rendered } // optional, only genuine matching evidence
}
```

- message is the genuine committed producer-tagged user message, source
  kind=agent-instructions/form=instructions with source.changes records. It is
  not an arbitrary user prompt and not a bare system-prompt assembly.
- rendered is the SAME native render trace {text,omitted,truncated}. A separately
  invoked preview/loader result is NOT target-session receipt. The helper requires
  corroborating committed message text and exact file identity before status.
- Truncated/omitted facts come from that matched trace. Full loaded body additionally
  requires the actual exact body in admitted render text. Source digest alone
  proves identity, not full-byte injection. Inputs are cooperative evidence: this
  pure function cannot authenticate a malicious in-process caller's forged DTO.
- Without genuine matching receipt/body evidence, output remains unknown with
  diagnostics. Existence is not loaded, missing receipt is not removal, and no
  intrinsic65536 or whole-session budget is invented.
- Native maxBytes applies per rendered baseline/dynamic batch; maxSourceBytes
  oversize skips a source. Do not call native loader/Agent assembly to manufacture
  an observation for the UI. Candidate-path discovery uses actual native public
  reader results; adapter's candidates value here is configured basename metadata,
  not proof every path was loaded.

Concrete fixture examples live in test-bbff-sdk-runtime.mjs; fixtures prove the
codec mechanism, not a claim that the owner's files were loaded. No owner's
profile/preset or instruction-body read was performed for this milestone.
