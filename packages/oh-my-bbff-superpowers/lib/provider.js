import { readFile, readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { parseSkill } from './content.js'

export function createSkillProvider(skillsRoot, providerName) {
  return {
    name: providerName,
    async list(options = {}) {
      options.signal?.throwIfAborted()
      let entries
      try { entries = await readdir(skillsRoot, { withFileTypes: true }) }
      catch (error) { if (error.code === 'ENOENT') return []; throw error }
      const candidates = []
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue
        const directory = join(skillsRoot, entry.name)
        const path = join(directory, 'SKILL.md')
        let raw
        try { raw = await readFile(path, { encoding: 'utf8', signal: options.signal }) }
        catch (error) { if (error.code === 'ENOENT') continue; throw error }
        const { content: _content, ...metadata } = parseSkill(raw, entry.name, path)
        candidates.push({
          ...metadata, path,
          invocation: { modelInvocable: true, userInvocable: true },
          provider: providerName, source: 'bundled', rank: BUNDLED_SKILL_RANK,
          resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
          locator: path,
        })
      }
      options.signal?.throwIfAborted()
      return candidates
    },
    async get(candidate, options = {}) {
      const { rank: _rank, locator, ...summary } = candidate
      // Intentionally no body cache: installed text edits are visible on next get.
      const raw = await readFile(locator, { encoding: 'utf8', signal: options.signal })
      return { ...summary, ...parseSkill(raw, candidate.name, locator) }
    },
  }
}
