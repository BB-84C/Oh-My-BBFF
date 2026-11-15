import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const text = path => readFile(join(root, path), 'utf8')
async function markdown(directory) {
  const files = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) files.push(...await markdown(path))
    else if (item.name.endsWith('.md')) files.push(path)
  }
  return files
}
const retired = /\b(?:noProgress|spawn_teammate|agent_id|ownerId|maxMembers|spawnTeammate|tryMembership|listMembers|waitForChange|agent-experience|cordis-plugin-development|cordis-composition-reference|editing-cordis-compositions)\b|Team\s*≥\s*0\.9\.1|\.opencode\/artifacts/u

test('all eight skills and references are clear of retired 0.2.1 mechanics', async () => {
  const files = await markdown(join(root, 'skills'))
  assert.equal(files.length, 18)
  for (const path of files) assert.doesNotMatch(await readFile(path, 'utf8'), retired, path)
})

test('lead instructions use named agents, inbox-only waits and current model evidence', async () => {
  const leading = await text('skills/bbff-team-leading/SKILL.md')
  for (const expected of ['Use Agent Teams', 'per-root', 'reviewer/checker', 'send_message({agent', 'maxActiveSubagents', 'no native member-count cap', 'dsh-doc', 'task-board changes do not wake', 'next request', 'committed request header']) assert(leading.includes(expected), expected)
  assert.match(leading, /list_agents[^\n]*`name`[^\n]*`status`[^\n]*`description`/)
  const triage = await text('skills/bbff-team-leading/references/member-triage.md')
  assert.match(triage, /interrupt_agent[^\n]*off by default/)
  assert.match(triage, /if[^\n]*exposed[^\n]*authorized/i)
  assert.match(await text('skills/writing-plans/SKILL.md'), /owner[^\n]*native name/)
  assert.match(await text('skills/bbff-team-member/SKILL.md'), /send_message\(\{agent: "lead", message\}\)/)
})

test('packaging uses a shipped runtime resolver rather than the test-only preloader', async () => {
  const info = JSON.parse(await text('package.json'))
  assert.equal(info.version, '1.0.0')
  assert.equal(info.engines.dsh, '>=0.2.2-rc.2')
  assert(info.files.includes('scripts/dsh-runtime.mjs'))
  assert.equal(info.scripts.prepack, 'node scripts/dsh-runtime.mjs --release --write-manifest')
  assert(!Object.values(info.scripts).some(script => script.includes('dsh-test-runtime')))
})
