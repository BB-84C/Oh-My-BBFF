# v1.6 root self-registration — read-only consumer impact

DECIDED: host root registers its runtime package descriptor through the same
family.register path, before service publication. family.list() includes root.
Root metadata retains id/packageName/version/apiBase/contract identity. Modules-
only consumers filter entry.id !== family.root.id; masks/traits/layer consumers
MUST NOT filter root away. FROZEN v1.6 specification; no runtime source implementation
changed. Final accepted fixes also cover retained preset parents and pressure/
projection/assistant adapter boundaries; these do not change root-inclusion semantics.

## Checked source places

| Package/place | Current old-exclusion dependency | v1.6 delta |
|---|---|---|
| [Widgets host apply](../oh-my-bbff-widgets/index.js#L43) and [registry](../oh-my-bbff-widgets/lib/family.js#L68-L82) | Root metadata is separate; actual registry initially contains only external registrations. | Host self-registers root descriptor via ordinary register before provide. Generic registry need not hide/specially synthesize root. Unit fixtures of a bare registry can remain explicit about what they register. |
| [Widgets source attribution](../oh-my-bbff-widgets/lib/exposure.js#L307-L318) | Explicit root.tools branch hardcodes root id/title before searching list(). | Catalog uses the same descriptor owner/traits path for root; remove redundant identity special case. |
| [Widgets provenance package set](../oh-my-bbff-widgets/lib/exposure-provenance.js#L50-L57) | list() packages plus separate root addition; BBFF membership also incorrectly uses package prefix. | Build registered package Set plus root identity; Set deduplicates root. No prefix inference, no need to exclude root. |
| [Widgets family UI rows](../oh-my-bbff-widgets/client.js#L1501-L1527) and [count](../oh-my-bbff-widgets/client.js#L1550) | Rows/count directly consume modules; currently every row is external. ANY settings section incorrectly marks a settings-only module loaded. | Root becomes an explicit row/count member. If a view means other modules, filter by root.id. Per-module section.moduleId fixes loaded attribution for root and others; do not filter away root's layer/trait/mask metadata. |
| [Scope governance refresh](../oh-my-bbff-scope/lib/governance.js#L23-L30) | Reads all compatible list() rows, no explicit root exclusion. | Keep all compatible rows including root. Root declarations use the same current overlay/governance handling; no root name branch. |
| [Scope catalog ownership](../oh-my-bbff-scope/lib/catalog.js#L115-L119) | Iterates descriptor tools; today root's read_user_notes has no owner from this path. | Shared catalog root row supplies correct declared owner; do not exclude it. This old collector is retired by task43, not extended into a second provider. |
| [Team family injection](../oh-my-bbff-team/index.js#L175-L180) | Only registers an annotator; no list() consumption or count assumption. | No current exclusion dependency found. Future trait/required/layer readers retain root row. |
| [Memory family contribution](../oh-my-bbff-memory/lib/dreaming/exposure.js#L4-L10) and registration entry | Only registers descriptor/contributor; no list() consumption/count assumption found. | No current exclusion dependency found. Do not introduce an external-only assumption in future consumers. |

Search scope: executable .js files in all four source packages, including vendored
contract helpers. Searches covered family.list, family metadata/payload/module
arrays, module counts and bbffFamily/FAMILY_SERVICE aliases. Vendored helpers only
register descriptors and do not enumerate list(). This is a bounded source review,
not a claim of runtime deployment or exhaustive inspection of unknown external
consumers. Implementation tests must cover a self-registered root plus external
modules, bootstrapping current overlays and the optional modules-only filter.
