// Team naming convention only. Native subagent names are validated by the native start
// (subagents.startActivation rejects invalid, reserved and duplicate names); Team does not copy the
// native length limit or the root's name, it defers to that validator.
// MEMBER_NAME_RE: lower-kebab names Team proposes for new members and formation seats.
// EXISTING_MEMBER_NAME_RE: existing identities — native names, Team aliases of unnamed 0.2.1
// members (their binding name or seat) and session ids.
export const MEMBER_NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const EXISTING_MEMBER_NAME_RE = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/
