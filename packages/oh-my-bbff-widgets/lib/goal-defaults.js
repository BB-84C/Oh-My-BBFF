import { wmsg as msg } from './locale-keys.js'
/** Project resolved public Fiber configs; never read GoalService private resolved state. */
import {DSH_CONVENTIONS,resolvedGoalDefaults} from './dsh-adapter.js'
export function readGoalDefaults(ctx){
 const fallback=()=>({...resolvedGoalDefaults(undefined),source:msg('goal.defaults.source')})
 try{
  if(!ctx.get('goals'))return fallback()
  const basis=DSH_CONVENTIONS.find(row=>row.inference==='goal-defaults'),packages=ctx.get('pluginPackages'),store=ctx.reflect?.store
  if(!basis||!packages||!store)return fallback()
  const configs=[]
  for(const key of Object.getOwnPropertySymbols(store)){
   const impl=store[key]
   if(impl?.name!=='goals'||!impl.value||!impl.fiber?.entry)continue
   const entry=impl.fiber.entry,anchors=[entry.parent?.tree?.ctx?.baseUrl,ctx.baseUrl,ctx.root?.baseUrl].filter(Boolean)
   let owner
   for(const base of new Set(anchors)){try{owner=packages.packageOf(entry.options.name,base);if(owner)break}catch{}}
   if(owner?.name!==basis.ownerPackage||!basis.verifiedPackageVersions.includes(owner.version))continue
   const projected=resolvedGoalDefaults(impl.fiber.config)
   if(!projected.complete)return fallback()
   configs.push(projected.value.maxGoalRounds)
  }
  // If isolated providers disagree, no current-composition default is invented.
  if(!configs.length||new Set(configs).size!==1)return fallback()
  return {...resolvedGoalDefaults({defaultMaxGoalRounds:configs[0]}),source:msg('goal.defaults.source')}
 }catch{return fallback()}
}
