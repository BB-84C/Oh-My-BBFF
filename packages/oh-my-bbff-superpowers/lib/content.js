import { parse } from 'yaml'
import { isSkillName } from '@deepseek-ai/dsh-skill'

// Match the native filesystem provider's YAML envelope and body trimming.
// Language and description-length checks belong to the authoring gate, not runtime.
export function parseSkill(raw, expectedName, path) {
  const envelope = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (!envelope) throw new Error(`${path}: missing YAML frontmatter`)
  let data
  try { data = parse(envelope[1]) } catch (error) { throw new Error(`${path}: invalid YAML: ${error.message}`) }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${path}: frontmatter must be a mapping`)
  if (typeof data.name !== 'string' || !isSkillName(data.name)) throw new Error(`${path}: invalid skill name`)
  if (data.name !== expectedName) throw new Error(`${path}: name must equal directory name ${expectedName}`)
  if (typeof data.description !== 'string' || !data.description.trim()) throw new Error(`${path}: description must be non-empty`)
  return {
    name: data.name,
    description: data.description,
    ...(typeof data.whenToUse === 'string' && data.whenToUse ? { whenToUse: data.whenToUse } : {}),
    ...(data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? { metadata: data.metadata } : {}),
    content: raw.slice(envelope[0].length).trim(),
  }
}
