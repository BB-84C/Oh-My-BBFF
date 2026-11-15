import {isMessageRef} from './bbff-contract.js'
import { wmsg as msg } from './locale-keys.js'
/** The Host explicitly chooses normal-card content; engineering data stays diagnostic. */
const SKILL_SOURCE_LABELS=Object.freeze({'project-dsh':msg('exposure.source.project'),'project-agents':msg('exposure.source.project'),runtime:msg('exposure.source.runtime'),'user-dsh':msg('exposure.source.user'),'user-agents':msg('exposure.source.user'),custom:msg('exposure.source.custom'),bundled:msg('exposure.source.bundled')})
function badge(row){const owner=row.owner;if(owner?.kind==='bbff'&&owner.module)return {label:msg('exposure.badge.module',{module:owner.module.title}),tone:'neutral'};if(owner?.kind==='mcp'&&owner.server)return {label:msg('exposure.badge.mcp',{server:owner.server}),tone:'neutral'};if(owner?.kind==='dsh')return {label:'DSH',tone:'neutral'};const source=row.skillSource;if(source&&Object.hasOwn(SKILL_SOURCE_LABELS,source))return {label:SKILL_SOURCE_LABELS[source],tone:'neutral'};return null}
export function decorateExposure(result,settings={}){
 if(!result?.exposure)return result
 const value=result.exposure,decorate=row=>({...row,display:{sourceBadge:badge(row),availabilityLabel:row.available===false?(isMessageRef(row.reason)?row.reason:msg('exposure.unavailable')):null}}),ready=result.ok===true&&value.toolView?.mode!=='error'
 return {...result,exposure:{...value,skills:(value.skills||[]).map(decorate),tools:(value.tools||[]).map(decorate),mcp:(value.mcp||[]).map(decorate),display:{ready,diagnosticsEnabled:settings.showDiagnostics===true,mcpCompletenessNote:value.mcpCompleteness?.affectsVisibleList===true?msg('exposure.mcp-incomplete'):null}}}
}
