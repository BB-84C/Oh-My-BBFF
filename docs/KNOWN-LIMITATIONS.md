# Known limitations

This page lists what does not work yet, what is bounded on purpose, and what comes from DeepSeek
Harness itself rather than from Oh-My-BBFF. It applies to the current release family, which
requires **DeepSeek Harness 0.2.2 or newer**. Facts only. Nothing here is a promise about a future
release.

## First run and clean install

1. **A fresh DeepSeek Harness home has no workspace.** Choose a workspace folder before starting a
   session. Until one is selected, the message box stays disabled and says so.
2. **BBFF settings actions need an open session.** Applying the instruction budget, waking the
   Dreaming Resident, and other operator actions are authorized against the session that is open.
   With no session open the action is refused and the page shows an HTTP 400 status.
3. **After uninstalling a plugin, re-enable it from its detail page** rather than adding it again.
   Adding it again can report that it is already installed, while the detail page has the working
   **Enable** control.
4. **The Plugins page can take several seconds to list installed plugins** the first time it is
   opened after a restart.
5. **The instruction budget takes effect after a restart.** Memory writes the new cap into the DSH
   profile patch, and DSH reads that patch at boot. If another plugin install later re-serializes
   the patch, the settings page reports drift and offers a regenerate preview. The cap already in
   effect is shown next to it.

## Installing the family bundle

1. **The Plugins page lists only `oh-my-bbff` when the bundle is installed.** The five member
   packages are dependencies of the bundle and do not get their own rows there. To switch a single
   module off, add a disable entry for its row to the profile patch
   (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`), or install that module on its own instead of
   the bundle.
2. **The bundle pins the five member packages to one release.** Updating one member on its own can
   leave the profile with a version the bundle was not tested with. Update the bundle instead.
3. **Install either the bundle or the individual packages, not both.** A mixed install keeps one
   loader row per plugin and the later layer wins, so the result works but the version that runs
   may not be the one you expect.
4. **Removing the bundle removes the five member packages from the profile as well.** Nothing of
   the family stays loaded afterwards.
5. **The Web UI Add-plugin path uses the running DSH server's package manager settings.** If the
   profile's package store was created with different package manager settings, the install can
   fail with an unexpected-store error. Install from the same DSH installation that will run the
   plugins, or use the terminal command.
## Agent Teams

1. **Agent Teams must be on in the conversation before the Lead can hire core seats.** The Team
   card and the hiring tools require the conversation's team switch to be enabled.
2. **Only the `standard` and `cordis` (Creator) agent presets are supported.** Other presets warn
   that Team will not work properly.
3. **The Lead changes a member's model, and the change applies from that member's next turn.** If
   the Lead switches a running task between different model vendors, the task stops because the
   new model rejects the earlier steps. The Lead re-sends the task after the switch.
4. **Native `list_agents` is disabled inside BBFF Team trees** because it decodes every
   descendant's session log. The Lead uses `bbff_team_roster` instead. The native subagent panel
   still uses the native path.
5. **An outsourced agent stays outsourced until the Lead assigns it a role.** A member created
   without a BBFF role is shown as outsourced, not as a core seat.

## Memory and Dreaming

1. **The budget caps the injected batch only.** Bytes and tokens are different units. Token counts
   are measured with a named reference tokenizer and are estimates for other models.
2. **There is no cross-file atomicity.** A multi-file write is guarded with best-effort rollback. A
   crash in the middle can leave a partially applied change that history and restore can repair.
3. **Dreaming wakes through DSH's native schedule.** Missed wakes follow the native schedule's
   behaviour, a wake that writes nothing is a normal outcome, and the Resident reviews only
   user-written increments.
4. **Router recall is weaker for scripts other than English, Han, kana and hangul.**
5. **On Windows, a memory file held open by the DSH process cannot be replaced.** The write fails
   with a permission error, the transaction rolls back so nothing is lost, and restarting DSH
   clears the hold.
6. **Compatibility directories are read-only.** Memory writes only to the canonical workspace
   memory directory. Archiving a file from a compatibility directory writes a shadow marker there
   and never edits the legacy file.

## Widgets and the panel

1. **Cards render a safe Markdown subset.** Images are not rendered, and raw HTML is shown
   literally.
2. **Goal changes need a live session.** A session with no running agent shows the goal board
   read-only.
3. **The status panel refreshes on a timer** (about five seconds by default). It is a status view,
   not a live stream.
4. **Notes never enter a prompt automatically.** The model can read them only through the
   `read_user_notes` tool, and only when you explicitly ask.

## Scope

1. **Scope is an availability control, not a sandbox or a secrecy boundary.** It decides what a
   workspace exposes. It does not restrict what a process can read or execute.
2. **Path matching is textual.** Symlinks and junctions are not resolved, and matching is
   case-insensitive on Windows.
3. **A session's root scope is fixed when the session starts.**

## Superpowers and the SDK

1. **Superpowers skill metadata is cached by DSH.** Skill bodies reload on every load, but catalog
   metadata or inventory changes need a provider reload.
2. **SDK consumers must feature-detect.** An incompatible module is reported and its cards do not
   render. It does not throw. Vendored contract files must match byte-for-byte.

## From DeepSeek Harness itself

1. **Cold session reads are not incremental.** Reading a session that is not loaded decodes its
   whole compressed log. Oh-My-BBFF's routine team, roster and card views avoid these reads. The
   native subagent panel still performs them, so very large teams can feel slower there.
2. **Tools, MCP servers and skills are scoped per profile, not per workspace.** Oh-My-BBFF Scope
   adds workspace availability rules on top. It cannot change the native scoping.
3. **DSH disables a plugin whose declared DSH version range does not match the running DSH.** The
   packages declare `engines.dsh >= 0.2.2`, so a DSH upgrade beyond that range re-enables them
   normally, and a DSH downgrade disables them.
4. **A hot reload during an in-flight agent turn can stop that turn.** Nothing runs and nothing is
   corrupted, so re-send the task. Install or upgrade while no agent turn is running.
5. **Custom presets that name a plugin row retired by a DSH upgrade fail validation** for every
   session until the preset is regenerated. Restart DSH after a DSH upgrade.
6. **Subagents created before the DSH 0.2.2 upgrade keep their session-id names.** There is no
   rename API. Only their display aliases in BBFF can be set.
7. **Native write tools always expose the optional sandbox-permission pair**, even when the
   session already has full access. Some models fill it on every call. An equal-mode request is a
   no-op and never escalates.
8. **Restart DSH after installing or upgrading over an older Oh-My-BBFF pre-release**, so the
   previous plugin generation stops its background work.

## What users should know

1. Install through the DSH plugin manager, Widgets first, then one module at a time. No restart is
   needed for ordinary plugin changes. The exceptions are the profile-patch budget above and a
   newly added language file's package metadata.
2. The BBFF UI follows DSH's language setting. Chinese shows Chinese, and every other language
   shows English. Add a language from **BBFF Settings → Language files**.
3. Shipped prompts and defaults are English. Text you write in any language is kept verbatim.
4. Model choices you make (role tiers, the Dreaming Resident, the DSH default) are never changed by
   the plugins.
5. Each release keeps a frozen rollback package. See the changelog of the package you are
   downgrading.
