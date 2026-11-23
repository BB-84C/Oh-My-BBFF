window.__ModuleLoader__.load({
  id: 'oh-my-bbff-widgets',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/oh-my-bbff-widgets/v6/api'
    const GOAL_KIND = 'bbff-goal'
    const GOAL_TYPE_ID = 'oh-my-bbff-widgets/goal'
    const NOTES_ID = 'oh-my-bbff-notes'
    const SETTINGS_ID = 'oh-my-bbff-settings'

        const CSS = `
.gb-root { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); }
.gb-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:16px 20px 8px; flex-wrap:wrap; }
.gb-title { margin:0; font-size:16px; font-weight:600; }
.gb-sub { margin:4px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary); }
.gb-body { flex:1; min-height:0; overflow:auto; padding:6px 20px 20px; display:flex; flex-direction:column; gap:12px; }
.gb-btn { appearance:none; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; padding:5px 10px; border-radius:7px; cursor:pointer; }
.gb-btn:hover { border-color:var(--dsw-alias-border-l2); }
.gb-btn:disabled { opacity:.5; cursor:default; }
.gb-btn[data-primary="true"] { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
.gb-btn[data-danger="true"] { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); }
.gb-card { display:flex; flex-direction:column; max-height:var(--gb-card-max, 320px); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }
.gb-card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 34px 0 13px; flex-wrap:wrap; flex:0 0 auto; }
.gb-card-title { font-size:13px; font-weight:600; }
.gb-title-toggle { display:inline-flex; align-items:center; gap:4px; margin:0; padding:0; border:0; background:transparent; font:inherit; color:inherit; cursor:pointer; text-align:left; }
.gb-title-toggle:hover { color:var(--dsw-alias-brand-primary); }
.gb-title-toggle:focus-visible { outline:1px solid var(--dsw-alias-brand-primary); outline-offset:2px; border-radius:4px; }
.gb-chevron { font-size:10px; line-height:1; opacity:.75; }
.gb-card-wrap[data-collapsed="true"] .gb-card-body { display:none; }
.gb-card-wrap[data-collapsed="true"] .gb-card-resize { display:none; }
.gb-card-wrap[data-collapsed="true"] .gb-card { max-height:none; }
.gb-card-wrap[data-collapsed="true"] .gb-card-head { padding-bottom:11px; min-height:40px; box-sizing:border-box; }
.gb-card-body { padding:11px 13px 13px; display:flex; flex-direction:column; gap:9px; flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--dsw-alias-border-l2) transparent; }
.gb-settings-root > .gb-body > .gb-settings-card { flex:0 0 auto; max-height:none; min-width:0; }
.gb-settings-card > .gb-card-body { flex:0 0 auto; max-height:none; overflow:visible; }
.gb-settings-card > .gb-card-body[hidden] { display:none; }
.gb-settings-section-head { appearance:none; width:100%; box-sizing:border-box; margin:0; border:0; border-radius:12px; padding:12px 13px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.gb-settings-section-head:hover { background:var(--dsw-alias-interactive-bg-hover); }
.gb-settings-section-head:focus-visible { outline:1px solid var(--dsw-alias-brand-primary); outline-offset:-2px; }
.gb-settings-section-head .gb-card-title { display:inline-flex; align-items:center; gap:7px; }
.gb-settings-card > .gb-card-body { padding-top:0; }
.gb-card-body::-webkit-scrollbar { width:8px; }
.gb-card-body::-webkit-scrollbar-track { background:transparent; }
.gb-card-body::-webkit-scrollbar-thumb { background:var(--dsw-alias-border-l2); border-radius:999px; }
.gb-card-body::-webkit-scrollbar-thumb:hover { background:var(--dsw-alias-label-tertiary); }
.gb-card-wrap { position:relative; min-width:0; }
.gb-card-resize { position:absolute; left:10px; right:10px; bottom:0; height:8px; z-index:3; display:flex; align-items:flex-end; justify-content:center; padding:0; border:0; background:transparent; cursor:ns-resize; touch-action:none; opacity:0; pointer-events:none; user-select:none; transition:opacity .12s ease; }
.gb-card-resize::after { content:''; width:34px; height:3px; margin-bottom:1px; border-radius:999px; background:var(--dsw-alias-border-l2); }
.gb-card-wrap:hover > .gb-card-resize, .gb-card-resize:focus-visible { opacity:1; pointer-events:auto; }
.gb-card-resize:hover::after, .gb-card-resize:focus-visible::after { background:var(--dsw-alias-brand-primary); }
.gb-card-resize:focus-visible { outline:none; }
.gb-drag-handle { position:absolute; top:6px; right:6px; z-index:3; display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:5px; border:1px solid transparent; background:transparent; color:var(--dsw-alias-label-tertiary); font-size:11px; line-height:1; letter-spacing:-2px; cursor:grab; opacity:0; pointer-events:none; user-select:none; touch-action:none; transition:opacity .12s ease, background .12s ease, border-color .12s ease; }
.gb-card-wrap:hover > .gb-drag-handle, .gb-drag-handle:focus-visible { opacity:.85; pointer-events:auto; border-color:var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
.gb-drag-handle:hover { opacity:1; color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l2); }
.gb-drag-handle:active { cursor:grabbing; }
.gb-card-wrap[data-dragging="true"] { opacity:.45; }
.gb-card-wrap[data-dragging="true"] > .gb-card { border-style:dashed; border-color:var(--dsw-alias-brand-primary); }
.gb-layout-row { position:relative; display:flex; min-width:0; }
.gb-layout-row[data-layout="single"] { display:block; }
.gb-split { display:flex; align-items:stretch; min-width:0; }
.gb-split-slot { min-width:0; overflow:hidden; display:block; }
.gb-split-slot > .gb-card-wrap { min-width:0; }
.gb-split-slot .gb-card { box-sizing:border-box; }
.gb-split-slot .gb-card-head { padding-right:32px; }
.gb-split-divider { position:relative; flex:0 0 6px; width:6px; cursor:col-resize; touch-action:none; }
.gb-split-divider::before { content:''; position:absolute; top:6px; bottom:6px; left:2px; width:2px; border-radius:999px; background:var(--dsw-alias-border-l2); }
.gb-split-divider:hover::before, .gb-split-divider:focus-visible::before { background:var(--dsw-alias-brand-primary); }
.gb-split-divider:focus-visible { outline:none; }
.gb-layout-column { display:flex; flex-direction:column; min-width:0; min-height:0; }
.gb-layout-column[data-layout="single"] { display:block; }
.gb-layout-column.gb-stack { min-height:0; }
.gb-stack-slot { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.gb-stack-slot > .gb-card-wrap { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
/* A stacked card fills its slot; its body still scrolls internally and its
   bottom resize strip moves the share boundary (0.9.0 restored this). */
.gb-stack-slot .gb-card { flex:1 1 auto; min-height:0; height:auto; max-height:none; }
.gb-stack-slot .gb-card-body { min-height:0; overflow-y:auto; }
.gb-stack-slot .gb-card-resize { z-index:3; }
.gb-stack-divider { position:relative; flex:0 0 8px; height:8px; cursor:row-resize; touch-action:none; z-index:2; }
.gb-stack-divider::before { content:''; position:absolute; left:6px; right:6px; top:3px; height:2px; border-radius:999px; background:var(--dsw-alias-border-l2); }
.gb-stack-divider:hover::before, .gb-stack-divider:focus-visible::before { background:var(--dsw-alias-brand-primary); }
.gb-stack-divider:focus-visible { outline:none; }
.gb-row-drop { position:absolute; left:0; right:0; height:0; z-index:4; pointer-events:none; }
.gb-row-drop[data-pos="before"] { top:-7px; }
.gb-row-drop[data-pos="after"] { bottom:-7px; }
.gb-row-drop::before { content:''; position:absolute; left:0; right:0; top:0; height:2px; border-radius:2px; background:var(--dsw-alias-brand-primary); }
.gb-row-drop > .gb-drop-label { left:8px; top:0; transform:translateY(-50%); }
.gb-drop { position:absolute; inset:0; z-index:2; pointer-events:none; border-radius:12px; }
.gb-drop[data-kind="dock-left"] { right:50%; border:2px dashed var(--dsw-alias-brand-primary); background:var(--dsw-alias-interactive-bg-hover); }
.gb-drop[data-kind="dock-right"] { left:50%; border:2px dashed var(--dsw-alias-brand-primary); background:var(--dsw-alias-interactive-bg-hover); }
.gb-drop[data-kind="dock-top"] { bottom:50%; border:2px dashed var(--dsw-alias-brand-primary); background:var(--dsw-alias-interactive-bg-hover); }
.gb-drop[data-kind="dock-bottom"] { top:50%; border:2px dashed var(--dsw-alias-brand-primary); background:var(--dsw-alias-interactive-bg-hover); }
.gb-drop[data-fill="true"][data-kind="dock-left"], .gb-drop[data-fill="true"][data-kind="dock-right"] { left:0; right:0; top:0; bottom:0; }
.gb-drop-label { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:11px; line-height:1.4; padding:2px 8px; border-radius:999px; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); white-space:nowrap; }
.gb-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; padding:2px 8px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
.gb-badge[data-phase="active"] { color:var(--dsw-alias-state-success-primary); }
.gb-badge[data-phase="paused"] { color:var(--dsw-alias-state-warn-primary); }
.gb-badge[data-phase="blocked"] { color:var(--dsw-alias-state-error-primary); }
.gb-badge[data-phase="complete"] { color:var(--dsw-alias-brand-primary); }
.gb-textarea { width:100%; box-sizing:border-box; min-height:68px; resize:vertical; padding:8px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12.5px; line-height:1.5; }
.gb-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.gb-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
.gb-input { width:84px; padding:5px 8px; border-radius:7px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; }
.gb-meter { height:4px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); overflow:hidden; }
.gb-meter-fill { height:100%; background:var(--dsw-alias-brand-primary); }
.gb-meta { font-size:11px; color:var(--dsw-alias-label-secondary); }
.gb-list { display:flex; flex-direction:column; }
.gb-item { display:flex; align-items:flex-start; gap:8px; padding:6px 2px; border-top:1px solid var(--dsw-alias-border-l1); font-size:12.5px; }
.gb-item:first-child { border-top:0; }
.gb-handle { flex:0 0 auto; cursor:grab; color:var(--dsw-alias-label-secondary); user-select:none; font-size:11px; line-height:1.5; letter-spacing:-2px; padding:0 1px; opacity:0; }
.gb-item:hover .gb-handle { opacity:.75; }
.gb-handle:active { cursor:grabbing; }
.gb-item[data-dragging="true"] { opacity:.45; }
.gb-item[data-over="true"] { box-shadow: inset 0 2px 0 var(--dsw-alias-brand-primary); }
.gb-dot { width:13px; height:13px; flex:0 0 auto; margin-top:2px; border-radius:4px; border:1.5px solid var(--dsw-alias-border-l2); display:flex; align-items:center; justify-content:center; font-size:9px; line-height:1; cursor:pointer; }
.gb-item[data-status="in_progress"] .gb-dot { border-color:var(--dsw-alias-state-warn-primary); color:var(--dsw-alias-state-warn-primary); }
.gb-item[data-status="completed"] .gb-dot { border-color:var(--dsw-alias-state-success-primary); background:var(--dsw-alias-state-success-primary); color:var(--dsw-alias-bg-base); }
.gb-item[data-status="completed"] .gb-text { text-decoration:line-through; color:var(--dsw-alias-label-secondary); }
.gb-text { flex:1; min-width:0; word-break:break-word; }
.gb-del { appearance:none; border:0; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font:inherit; font-size:12px; padding:0 2px; }
.gb-del:hover { color:var(--dsw-alias-state-error-primary); }
.gb-err { padding:9px 11px; border-radius:8px; font-size:12px; color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); }
.gb-empty { padding:22px 8px; text-align:center; color:var(--dsw-alias-label-secondary); font-size:12.5px; }
.gb-add { display:flex; gap:8px; }
.gb-add input { flex:1; min-width:0; padding:7px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12.5px; }
.gb-chip { appearance:none; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:11.5px; padding:3px 8px; border-radius:999px; cursor:pointer; }
.gb-chip:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l2); }
.gb-chip[data-phase="active"] { color:var(--dsw-alias-state-success-primary); }
.gb-chip[data-phase="paused"] { color:var(--dsw-alias-state-warn-primary); }
.gb-chip[data-phase="blocked"] { color:var(--dsw-alias-state-error-primary); }
.gb-members { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
    .gb-team-columns { display:flex; flex-wrap:wrap; align-items:flex-start; gap:10px; min-width:0; }
    .gb-team-column { flex:1 1 150px; min-width:0; min-height:0; }
    .gb-team-column-title { font-size:11px; font-weight:600; letter-spacing:.02em; color:var(--dsw-alias-label-secondary); margin:0 0 4px; overflow-wrap:anywhere; }
    .gb-team-column .gb-members { flex-direction:column; flex-wrap:nowrap; }
    .gb-team-column .gb-member { width:100%; box-sizing:border-box; }
.gb-member { appearance:none; box-sizing:border-box; display:flex; align-items:flex-start; gap:7px; min-width:0; padding:6px 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; cursor:pointer; text-align:left; }
.gb-member:hover { border-color:var(--dsw-alias-border-l2); }
.gb-member[data-current="true"] { border-color:var(--dsw-alias-brand-primary); }
.gb-member[data-status="running"] .gb-dot { background:var(--dsw-alias-state-success-primary); border-color:var(--dsw-alias-state-success-primary); }
.gb-member[data-running="true"] .gb-dot { background:var(--dsw-alias-state-success-primary); border-color:var(--dsw-alias-state-success-primary); animation:gb-pulse 1.1s ease-in-out infinite; }
@keyframes gb-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.35; transform:scale(.78); } }
.gb-member[data-status="inactive"] .gb-dot { background:var(--dsw-alias-state-idle-primary); border-color:var(--dsw-alias-state-idle-primary); }
.gb-member[data-status="provisioning"] .gb-dot { border-color:var(--dsw-alias-state-warn-primary); }
.gb-member[data-status="failed"] .gb-dot { background:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.gb-member-body { display:flex; flex-direction:column; gap:1px; flex:1 1 auto; min-width:0; overflow:hidden; }
.gb-member-name { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; min-width:0; }
.gb-member-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary); min-width:0; max-width:100%; overflow-wrap:anywhere; word-break:break-word; white-space:normal; }
.gb-member-open { appearance:none; display:inline-flex; align-items:center; justify-content:center; flex:0 0 20px; width:20px; height:20px; margin:-2px -3px -2px 0; padding:2px; border:0; border-radius:var(--dsw-radius-sm); background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; }
.gb-member-open:hover, .gb-member-open:focus-visible { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.gb-task { padding:6px 0; border-top:1px solid var(--dsw-alias-border-l1); }
.gb-task:first-child { border-top:0; }
.gb-task-head { display:flex; align-items:center; gap:7px; font-size:12px; }
.gb-task-subject { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.gb-task[data-status="completed"] .gb-task-subject { text-decoration:line-through; color:var(--dsw-alias-label-secondary); }
.gb-task-desc { margin:6px 0 0 20px; font-size:11.5px; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; }
.gb-section { display:flex; flex-direction:column; gap:3px; min-width:0; }
.gb-section-title { margin:3px 0 0; font-size:10.5px; font-weight:600; color:var(--dsw-alias-label-secondary); }
.gb-file-row { display:flex; align-items:center; gap:7px; min-width:0; padding:5px 2px; border-top:1px solid var(--dsw-alias-border-l1); font-size:12px; }
.gb-file-row:first-child { border-top:0; }
.gb-file-row[role="button"] { cursor:pointer; }
.gb-file-row[role="button"]:hover { background:var(--dsw-alias-bg-layer-2); }
.gb-file-row[role="button"]:focus-visible { outline:none; background:var(--dsw-alias-bg-layer-2); }
.gb-file-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.gb-file-name[role="button"] { cursor:pointer; }
.gb-file-name[role="button"]:hover { color:var(--dsw-alias-brand-primary); }
.gb-check { flex:0 0 auto; margin:0; accent-color:var(--dsw-alias-brand-primary); cursor:pointer; }
.gb-row-compact { gap:5px; }
.gb-kit-check { display:inline-flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; }
.gb-kit-input { display:inline-flex; align-items:center; gap:6px; font-size:12px; }
.gb-kit-input .gb-input { width:96px; }
.gb-btn-ghost { background:transparent; border-color:transparent; color:var(--dsw-alias-label-secondary); }
.gb-btn-ghost:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-2); }
.gb-kit-label { color:var(--dsw-alias-label-primary); }
.gb-badge[data-tone="success"] { color:var(--dsw-alias-state-success-primary); }
.gb-badge[data-tone="warning"] { color:var(--dsw-alias-state-warn-primary); }
.gb-badge[data-tone="danger"], .gb-badge[data-tone="error"] { color:var(--dsw-alias-state-error-primary); }
.gb-badge[data-tone="info"] { color:var(--dsw-alias-brand-primary); }
.gb-badge[data-explained="true"] { position:relative; }
.gb-badge-explanation { display:none; white-space:pre-wrap; overflow-wrap:anywhere; }
.gb-badge[data-explained="true"]:hover .gb-badge-explanation, .gb-badge[data-explained="true"]:focus .gb-badge-explanation { display:block; position:fixed; z-index:100; max-width:min(420px,80vw); padding:9px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l1); border-radius:8px; }
.gb-ui-spinner { display:inline-block; width:12px; height:12px; flex:0 0 auto; border:2px solid var(--dsw-alias-label-tertiary); border-right-color:transparent; border-radius:50%; animation:gb-ui-spin .8s linear infinite; }
@keyframes gb-ui-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .gb-ui-spinner { animation:none; } }
.gb-setting { display:flex; flex-direction:column; gap:5px; min-width:0; padding:8px 0; border-bottom:1px solid var(--dsw-alias-border-l1); }
.gb-setting label { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; min-width:0; overflow-wrap:anywhere; }
.gb-setting .gb-input { width:120px; max-width:100%; min-width:0; box-sizing:border-box; flex:0 1 120px; }
.gb-setting input[type="text"] { width:320px; flex-basis:320px; }
.gb-setting textarea { box-sizing:border-box; flex:1 1 100%; min-width:0; }
.gb-setting [data-card-field] { min-width:0; }
.gb-setting code, .gb-diagnostics { overflow-wrap:anywhere; }
.gb-setting textarea, .gb-descriptor { white-space:pre-wrap; overflow-wrap:anywhere; max-width:100%; }
.gb-settings-card[data-settings-focused="true"] { outline:2px solid var(--dsw-alias-brand-primary); }
.gb-owner-details { flex:0 1 50%; min-width:0; max-width:50%; }
.gb-owner-details > .gb-badge[data-exposure-source] { max-width:100%; cursor:pointer; }
.gb-file-row:has(.gb-owner-details[open]) { flex-wrap:wrap; }
.gb-owner-details[open] { flex:1 0 100%; max-width:100%; }
.gb-owner-details pre { white-space:pre-wrap; overflow-wrap:anywhere; margin:6px 0; }
.gb-badge[data-exposure-source] { display:block; flex:0 0 auto; max-width:50%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.gb-exposure-main { display:flex; flex-direction:column; gap:1px; min-width:0; flex:1 1 auto; }
.gb-exposure-desc { font-size:11px; color:var(--dsw-alias-label-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.gb-exposure-block { display:flex; flex-direction:column; min-width:0; }
.gb-mcp-tools { display:flex; flex-wrap:wrap; gap:3px 9px; padding:1px 0 5px 22px; }
.gb-mcp-tool { font-size:11px; color:var(--dsw-alias-label-secondary); }
.gb-hint { margin-top:2px; font-size:10.5px; color:var(--dsw-alias-label-tertiary); }
.gb-badge[data-exists="false"] { color:var(--dsw-alias-state-warn-primary); }
.gb-status-dot { width:8px; height:8px; flex:0 0 auto; border-radius:999px; background:var(--dsw-alias-state-idle-primary); }
.gb-status-dot[data-active="true"] { background:var(--dsw-alias-state-success-primary); }
`

    async function post(body) {
      const response = await fetch(API, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const value = await response.json()
      // Host validation/CAS failures carry the latest payload and actionable diagnostics.
      if (!response.ok && (!value || typeof value !== 'object')) throw new Error('HTTP ' + response.status)
      return value
    }

    // ---------------------------------------------------------------------
    // 0.20.0 UI locale. The root registers every package's dictionaries with the
    // DSH locale service before any card renders; host text travels as message
    // references and is resolved here. No card picks a language itself.
    // ---------------------------------------------------------------------
    const ROOT_NAMESPACE = 'oh-my-bbff-widgets'
    const MESSAGE_REF_MARKER = 'bbff-message'
    const MODULE_NAMESPACES = new Map()
    const KIT_CACHE = new Map()
    let LOCALE_TRANSLATOR = null, LOCALE_VALUE = null, LOCALE_DISPOSERS = [], LOCALE_SUBSCRIBED = false, LOCALE_READY = false

    function localeService() {
      try { const resolved = clientService(ctxRef.current, 'locale'); return resolved.value || null } catch { return null }
    }
    /** Build a locale message reference (same wire shape as the SDK's msg()). */
    function messageRef(key, params, ns) {
      const value = { $bbff: MESSAGE_REF_MARKER, key: String(key) }
      if (params && typeof params === 'object' && Object.keys(params).length) value.params = { ...params }
      if (typeof ns === 'string' && ns) value.ns = ns
      return value
    }
    function isMessageRef(value) {
      return !!value && typeof value === 'object' && value.$bbff === MESSAGE_REF_MARKER && typeof value.key === 'string' && value.key !== ''
    }
    function legacyText(value) {
      try { const locale = localeService(); return locale && typeof locale.resolveText === 'function' ? String(locale.resolveText(value)) : String(value.en ?? '') } catch { return String(value.en ?? '') }
    }
    function bindNamespace(ns) {
      const locale = localeService()
      if (locale && typeof locale.bind === 'function') { try { return locale.bind(ns) } catch {} }
      return (key) => String(key)
    }
    function rootT(key, params) {
      if (LOCALE_TRANSLATOR) return String(LOCALE_TRANSLATOR(key, params))
      const locale = localeService()
      if (locale && typeof locale.bind === 'function') { try { return String(locale.bind(ROOT_NAMESPACE)(key, params)) } catch {} }
      return String(key)
    }
    function moduleNamespaceOf(moduleId) {
      if (!moduleId) return ROOT_NAMESPACE
      return MODULE_NAMESPACES.get(String(moduleId)) || ROOT_NAMESPACE
    }
    /**
     * 0.20.3 producer namespace: the package that owns a module's dictionary, or
     * `undefined` while the family registry has not named it yet (never guess).
     * A reference is always resolved in its producer's namespace.
     */
    function producerNamespaceOf(moduleId) {
      if (!moduleId) return ROOT_NAMESPACE
      const id = String(moduleId)
      if (id === ROOT_MODULE_ID) return ROOT_NAMESPACE
      return MODULE_NAMESPACES.get(id) || undefined
    }
    /**
     * Stamp every message reference in a collected payload with its producer
     * namespace (recursively into params). Untouched branches keep their identity,
     * so a payload without references is passed through unchanged.
     */
    function stampRefs(value, ns) {
      if (!ns || !value || typeof value !== 'object') return value
      if (isMessageRef(value)) {
        const base = typeof value.ns === 'string' && value.ns ? value : { ...value, ns }
        if (!value.params || typeof value.params !== 'object') return base === value ? value : base
        const params = Object.fromEntries(Object.entries(value.params).map(([name, item]) => [name, stampRefs(item, ns)]))
        return { ...base, params }
      }
      if (Array.isArray(value)) {
        let changed = false
        const next = value.map((item) => { const stamped = stampRefs(item, ns); if (stamped !== item) changed = true; return stamped })
        return changed ? next : value
      }
      let changed = false
      const next = {}
      for (const [name, item] of Object.entries(value)) { const stamped = stampRefs(item, ns); next[name] = stamped; if (stamped !== item) changed = true }
      return changed ? next : value
    }
    function moduleT(moduleId) { return bindNamespace(moduleNamespaceOf(moduleId)) }
    /** Host text that reports a failed reference as empty instead of echoing its key. */
    function resolvedHostText(value, moduleId) {
      const text = hostText(value, moduleId)
      if (isMessageRef(value) && text === value.key) return ''
      return text
    }
    function resolveParams(params, options) {
      if (!params || typeof params !== 'object') return undefined
      const resolved = {}
      for (const [name, item] of Object.entries(params)) {
        resolved[name] = isMessageRef(item) || (item && typeof item === 'object' && !Array.isArray(item) && typeof item.en === 'string')
          ? resolveHostValue(item, { ...options, params: undefined })
          : item
      }
      return resolved
    }
    /** Resolve host text: message reference, legacy localized map, or plain string. */
    function resolveHostValue(value, options = {}) {
      const t = typeof options.t === 'function' ? options.t : rootT
      const bind = typeof options.bind === 'function' ? options.bind : bindNamespace
      if (typeof value === 'string') return value
      if (isMessageRef(value)) {
        const translate = value.ns ? bind(value.ns) : t
        try { return String(translate(value.key, resolveParams({ ...(value.params || {}), ...(options.params || {}) }, options))) } catch { return String(value.key) }
      }
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.en === 'string') return legacyText(value)
      return ''
    }
    function hostText(value, moduleId, params) { return resolveHostValue(value, { t: moduleT(moduleId), bind: bindNamespace, params }) }
    function activeLocaleId() {
      try {
        const locale = localeService()
        const snapshot = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : locale && typeof locale.getLocale === 'function' ? locale.getLocale() : null
        return snapshot && typeof snapshot.active === 'string' ? snapshot.active : 'en'
      } catch { return 'en' }
    }

    /** Read the Host dictionaries and register every (package, language) with DSH. */
    async function loadLocales() {
      const value = await post({ action: 'locales' })
      if (!value || value.ok === false || !value.packages) throw new Error('locale dictionaries unavailable')
      const locale = localeService()
      if (!locale || typeof locale.register !== 'function') throw new Error('locale service unavailable')
      for (const dispose of LOCALE_DISPOSERS.splice(0)) { try { dispose() } catch {} }
      if (typeof locale.addLanguage === 'function') {
        for (const language of value.languages || []) {
          if (!language || typeof language.id !== 'string' || typeof language.label !== 'string') continue
          try { LOCALE_DISPOSERS.push(locale.addLanguage({ id: language.id, label: language.label, fallback: language.fallback || 'en' })) } catch {}
        }
      }
      for (const [packageName, languages] of Object.entries(value.packages)) {
        if (!languages || typeof languages !== 'object') continue
        for (const [languageId, section] of Object.entries(languages)) {
          const dictionary = section && section.ui
          if (!dictionary || typeof dictionary !== 'object') continue
          try { LOCALE_DISPOSERS.push(locale.register(packageName, languageId, dictionary)) } catch {}
        }
      }
      LOCALE_VALUE = value
      LOCALE_TRANSLATOR = typeof locale.bind === 'function' ? locale.bind(ROOT_NAMESPACE) : null
      LOCALE_READY = true
      if (!LOCALE_SUBSCRIBED && typeof locale.subscribe === 'function') {
        LOCALE_SUBSCRIBED = true
        try { ctxRef.current.effect(() => locale.subscribe(() => uiNotify()), 'oh-my-bbff: locale change') } catch { locale.subscribe(() => uiNotify()) }
      }
      uiNotify()
      return value
    }

    /** Refresh the moduleId -> packageName map from the family registry. */
    function syncModuleNamespaces(value) {
      if (!value || typeof value !== 'object') return
      const root = value.root
      if (root && typeof root.id === 'string' && typeof root.packageName === 'string') MODULE_NAMESPACES.set(root.id, root.packageName)
      for (const module of Array.isArray(value.modules) ? value.modules : []) {
        if (module && typeof module.id === 'string' && typeof module.packageName === 'string') MODULE_NAMESPACES.set(module.id, module.packageName)
      }
      KIT_CACHE.clear()
    }

    // Contract v1.2: module annotations (e.g. a crew role) as small badges.
    function annotationBadges(list) {
      if (!Array.isArray(list) || list.length === 0) return null
      return list.map((entry, index) => {
        const label = typeof entry.label === 'string' ? entry.label : hostText(entry.label, entry.module)
        if (!label) return null
        return h('span', {
          key: 'annotation-' + index,
          className: 'gb-badge',
          'data-tone': entry.tone || 'default',
          'data-annotation-module': entry.module || '',
          title: entry.title ? hostText(entry.title, entry.module) : label,
          style: { marginLeft: 6, fontSize: 10, padding: '0 6px', lineHeight: '16px', verticalAlign: 'middle' },
        }, label)
      })
    }

    // Provider · model · effort line under each Team member row.
    function routeLine(route, t, part) {
      const text = route ? [route.provider, route.model, route.effort].filter(Boolean).join(' · ') : ''
      if (!text) return null
      return h('span', {
        className: 'gb-member-meta gb-route',
        'data-route-inherited': route && route.inherited ? 'true' : 'false',
        title: text ? (route.inherited ? t('routeInherited') + ': ' + text : text) : t('routeUnknown'),
        style: { opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }, text ? (route.inherited ? text + ' (' + t('routeInherited') + ')' : text) : t('routeUnknown'))
    }

    function phaseLabel(t, phase) {
      if (phase === 'active') return t('phaseActive')
      if (phase === 'paused') return t('phasePaused')
      if (phase === 'blocked') return t('phaseBlocked')
      if (phase === 'complete') return t('phaseComplete')
      return phase
    }

    function errorMessage(value) {
      if (value === undefined || value === null) return ''
      if (typeof value === 'string') return value
      if (isMessageRef(value.error)) return hostText(value.error)
      if (typeof value.error === 'string' && value.error) return value.error
      if (typeof value.message === 'string' && value.message) return value.message
      return ''
    }



    // One Root-owned settings/state source, one timer shared by header and core cards.
    // No guessed shipped preferences: until the Host responds the UI shows unavailable.
    let ROOT_SETTINGS = null
    let ROOT_SETTINGS_PENDING = null
    let ROOT_TIMER = null
    let ROOT_TIMER_MS = null
    let ROOT_SETTINGS_USERS = 0
    let ROOT_DISPOSED = false
    let LAYOUT_RESET_REVISION = 0
    let PRESERVE_LAYOUT_SETTINGS_REVISION = null
    let SETTINGS_FOCUS = null
    let NAVIGATION_ERROR = ''
    const SESSION_STATES = new Map()
    function settingsValues() { return ROOT_SETTINGS && ROOT_SETTINGS.settings || {} }
    function acceptSettings(payload, options) {
      if (ROOT_DISPOSED || !payload || !payload.settings || !payload.defaults) return false
      if (ROOT_SETTINGS && Number(payload.revision) < Number(ROOT_SETTINGS.revision)) return false
      const changed = JSON.stringify(ROOT_SETTINGS) !== JSON.stringify(payload)
      ROOT_SETTINGS = payload
      if (options && options.preserveLayout) PRESERVE_LAYOUT_SETTINGS_REVISION = payload.revision
      for (const id of STATUS_CARD_IDS) {
        const value = payload.cardDefaults && payload.cardDefaults[id]
        if (value) STATUS_CARD_HEIGHTS[id] = value.defaultHeight
      }
      rescheduleRootPoll()
      if (changed) uiNotify()
      return true
    }
    function ensureRootSettings() {
      if (ROOT_SETTINGS_PENDING) return ROOT_SETTINGS_PENDING
      ROOT_SETTINGS_PENDING = post({ action: 'settings' }).then((value) => {
        acceptSettings(value)
        if (!value || value.ok === false) throw new Error(errorMessage(value) || 'Settings unavailable')
        return value
      }).finally(() => { ROOT_SETTINGS_PENDING = null })
      return ROOT_SETTINGS_PENDING
    }
    function activeSessionStates() { return Array.from(SESSION_STATES.values()).filter((entry) => entry.listeners.size > 0) }
    function rescheduleRootPoll() {
      const every = Number(settingsValues().refreshIntervalMs)
      const needed = !ROOT_DISPOSED && (ROOT_SETTINGS_USERS > 0 || activeSessionStates().length > 0)
      const next = needed && Number.isFinite(every) && every > 0 ? every : null
      if (next === ROOT_TIMER_MS) return
      if (ROOT_TIMER !== null) clearInterval(ROOT_TIMER)
      ROOT_TIMER_MS = next
      ROOT_TIMER = next === null ? null : setInterval(() => {
        const entries = activeSessionStates()
        if (entries.length) for (const entry of entries) refreshSessionState(entry.id)
        else ensureRootSettings().catch(() => {})
      }, next)
    }
    function sessionState(id) {
      if (!SESSION_STATES.has(id)) SESSION_STATES.set(id, { id, data: null, error: '', sequence: 0, epoch: 0, pending: null, listeners: new Set() })
      return SESSION_STATES.get(id)
    }
    function publishSessionState(id, data, error) {
      if (ROOT_DISPOSED) return
      const entry = sessionState(id)
      if (data) { entry.data = data; acceptSettings(data.settings) }
      entry.error = error || ''
      entry.sequence += 1
      entry.epoch += 1
      for (const listener of Array.from(entry.listeners)) listener()
    }
    function refreshSessionState(id) {
      const entry = sessionState(id)
      if (entry.pending) return entry.pending
      const epoch = entry.epoch
      const current = () => !ROOT_DISPOSED && SESSION_STATES.get(id) === entry && entry.epoch === epoch
      entry.pending = post({ action: 'state', sessionId: id }).then((value) => {
        if (!current()) return
        if (!value || value.ok === false) publishSessionState(id, null, errorMessage(value) || 'State unavailable')
        else publishSessionState(id, value, '')
      }).catch((error) => { if (current()) publishSessionState(id, null, errorMessage(error)) })
        .finally(() => { entry.pending = null })
      return entry.pending
    }
    function useRootSettings() {
      useUiVersion()
      React.useEffect(() => {
        ROOT_SETTINGS_USERS += 1
        ensureRootSettings().catch((error) => { NAVIGATION_ERROR = errorMessage(error); uiNotify() })
        rescheduleRootPoll()
        return () => { ROOT_SETTINGS_USERS = Math.max(0, ROOT_SETTINGS_USERS - 1); rescheduleRootPoll() }
      }, [])
      return ROOT_SETTINGS
    }
    function useSessionState(id) {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        if (!id) return undefined
        const entry = sessionState(id)
        const listener = () => bump((value) => value + 1)
        entry.listeners.add(listener)
        refreshSessionState(id)
        if (!ROOT_SETTINGS) ensureRootSettings().catch(() => {})
        rescheduleRootPoll()
        return () => {
          entry.listeners.delete(listener)
          if (!entry.listeners.size && SESSION_STATES.get(id) === entry) SESSION_STATES.delete(id)
          rescheduleRootPoll()
        }
      }, [id])
      return id ? sessionState(id) : { data: null, error: '', sequence: 0 }
    }
    function basisText(basis) {
      if (!basis || typeof basis !== 'object') return ''
      const moduleId = basis.module && basis.module.id
      const value = item => typeof item === 'string' || isMessageRef(item) ? hostText(item, moduleId) : item
      return [value(basis.source), basis.settingPath, Object.prototype.hasOwnProperty.call(basis, 'default') ? 'default: ' + (isMessageRef(basis.default) ? hostText(basis.default, moduleId) : JSON.stringify(basis.default)) : '',
        basis.module && (value(basis.module.title) || basis.module.id), value(basis.inference),
        [basis.packageName, basis.packageVersion].filter(Boolean).join('@')].filter(Boolean).join(' · ')
    }
    function KitBadge(props) {
      const explanation = basisText(props && props.explain)
      const title = [props && props.title, explanation].filter(Boolean).join('\n')
      return h('span', { className: 'gb-badge', 'data-explained': String(!!title), 'data-tone': props && props.tone || 'default', title: title || undefined, tabIndex: title ? 0 : undefined },
        props && props.children, title ? h('span', { className: 'gb-badge-explanation', role: 'tooltip' }, title) : null)
    }
    // Approved display contract: normal content is never derived from engineering diagnostics.
    let LAST_EXPOSURE = null
    const CLIENT_ERRORS = {}
    const SETTINGS_PRESENTATION_ISSUES = new Map()
    let SETTING_HELP_SEQUENCE = 0
    const CLIENT_SERVICE_ISSUES = new Map(), CLIENT_SERVICE_GENERATIONS = new Map(), CLIENT_SERVICE_OBSERVATIONS = {}
    let CLIENT_SERVICE_SEQUENCE = 0, NAVIGATION_ISSUE_KEY = ''
    function captureClientError(source, value) { CLIENT_ERRORS[source] = value || undefined; if (settingsValues().showDiagnostics === true) uiNotify() }
    function displayReady(data, key) { return !!data && (!data.display || data.display.ready && data.display.ready[key] === true) }
    function spinner(key) { return h('span', { className: 'gb-ui-spinner', role: 'status', 'aria-label': rootT('loadingAria'), 'data-ui-loading': key }) }
    function sourceBadge(entry, kind) {
      const badge = entry && entry.display && entry.display.sourceBadge
      const label = badge && (typeof badge.label === 'string' || isMessageRef(badge.label)) ? hostText(badge.label, entry.module) : ''
      return label ? h('span', { className: 'gb-badge', 'data-exposure-source': kind, 'data-tone': badge.tone || 'default' }, label) : null
    }
    function availabilityText(entry) {
      const value = entry && entry.display && entry.display.availabilityLabel
      return typeof value === 'string' || isMessageRef(value) ? hostText(value, entry.module) : ''
    }
    function rememberExposure(sessionId, data) { LAST_EXPOSURE = { sessionId, data }; if (settingsValues().showDiagnostics === true) uiNotify() }
    function keyedEntries(value) { return Array.isArray(value) ? value : value && Array.isArray(value.entries) ? value.entries : [] }
    function EngineeringDiagnostics(props) {
      const data = props.data, payload = props.payload
      // The Host state visibility flag is mandatory; a stale true state cannot override an OFF toggle.
      if (!data || data.display?.diagnosticsEnabled !== true || payload?.settings?.showDiagnostics !== true) return null
      const exposure = LAST_EXPOSURE && LAST_EXPOSURE.sessionId === props.sessionId ? LAST_EXPOSURE.data : null
      const entries = [...keyedEntries(data.diagnostics), ...keyedEntries(exposure?.diagnostics), ...keyedEntries(exposure?.catalog?.diagnostics), ...keyedEntries(UI_REGISTRY.diagnostics), ...keyedEntries(payload.diagnostics), ...CLIENT_SERVICE_ISSUES.values(), ...SETTINGS_PRESENTATION_ISSUES.values()]
      const seen = new Set(), sentences = new Set(), unique = []
      for (const entry of entries) {
        if (!entry || entry.transient === true || ['pending', 'running', 'loading'].includes(entry.state)) continue
        // Current UI locale first, otherwise the reason exactly as written. Text is never
        // dropped or substituted for its script; transient state is filtered by state, not language.
        const reason = isMessageRef(entry.reason)
          ? hostText(entry.reason, entry.moduleId)
          : ((entry.reasonLocales && typeof entry.reasonLocales === 'object' ? legacyText(entry.reasonLocales) : '') || String(entry.reason ?? ''))
        if (!reason.trim()) continue
        const key = entry.key || [entry.code, entry.inference, reason].join('\u0000')
        if (seen.has(key) || sentences.has(reason)) continue
        seen.add(key); sentences.add(reason); unique.push({ key, sentence: reason })
      }
      const ownerFacts = exposure ? ['skills', 'tools', 'mcp'].flatMap(kind => (exposure[kind] || []).map(row => ({ kind, name: row.name || row.server, owner: row.owner, ownerBasis: row.ownerBasis, sources: row.sources, present: row.present, stale: row.stale, seenThisRun: row.seenThisRun }))) : []
      const modules = UI_REGISTRY.familyModules.map(module => ({ id: module.id, title: module.title, version: module.version, packageName: module.packageName, compatible: module.compatible,
        registeredCards: UI_REGISTRY.cards.filter(card => uiModuleIdOf(card) === module.id).map(uiCardLayoutId), registeredSections: UI_REGISTRY.sections.filter(section => section.moduleId === module.id).map(sectionKey) }))
      const details = { entries, state: data.diagnostics, settings: { revision: payload.revision, descriptors: payload.descriptors, defaults: payload.defaults, limits: payload.limits, settingsSectionRule: payload.settingsSectionRule, fixedContracts: payload.fixedContracts }, timings: data.diagnostics?.timings, revisions: data.diagnostics?.revisions, nativeBackendLimitation: data.diagnostics?.nativeBackendLimitation,
        catalog: exposure?.catalog && { revision: exposure.catalog.revision, generatedAt: exposure.catalog.generatedAt, complete: exposure.catalog.complete, origin: exposure.catalog.origin }, ownerFacts, modules,
        unattributedSettings: UI_REGISTRY.sections.filter(section => !section.moduleId).map(section => ({ id: section.id, title: localizedTitle(section.title, moduleId) })),
        settingsPresentationIssues: [...SETTINGS_PRESENTATION_ISSUES.values()], clientServiceObservations: CLIENT_SERVICE_OBSERVATIONS, clientServiceFailures: [...CLIENT_SERVICE_ISSUES.values()],
        clientErrors: { ...CLIENT_ERRORS, settings: props.error || undefined, navigation: NAVIGATION_ERROR || undefined } }
      return h('section', { className: 'gb-setting', 'data-root-diagnostics': 'true' }, h('h3', null, rootT('diagnosticsTitle')),
        h('ul', { className: 'gb-diagnostics', 'data-diagnostic-notices': 'true' }, unique.map(entry => h('li', { key: entry.key, 'data-diagnostic-key': entry.key }, entry.sentence))),
        h('details', { 'data-diagnostic-raw': 'true' }, h('summary', null, rootT('diagnosticsRaw')),
          h('pre', { className: 'gb-descriptor', 'data-diagnostic-metadata': 'true' }, JSON.stringify(details, null, 2))))
    }

    function serviceFailureReason(code, details) {
      if (details && details.contextState === 'missing') return rootT('serviceFailure.contextMissing')
      if (code === 'client-service-missing') return rootT('serviceFailure.serviceMissing')
      if (code === 'client-service-access-threw') return rootT('serviceFailure.accessThrew')
      if (code === 'client-method-missing') return rootT('serviceFailure.methodMissing')
      if (code === 'client-call-threw') return rootT('serviceFailure.callThrew')
      return rootT('serviceFailure.navigation')
    }
    function recordServiceFailure(code, details, notify = true) {
      if (ROOT_DISPOSED) return false
      const key = String(details.service || 'widgets') + '.' + String(details.method || 'navigation')
      const issue = { key: 'client-service:' + key, level: 'warning', section: 'client-services', code,
        reason: serviceFailureReason(code, details), details: { ...details } }
      CLIENT_SERVICE_ISSUES.set(key, issue)
      NAVIGATION_ERROR = details.error || issue.reason
      NAVIGATION_ISSUE_KEY = key
      if (notify) uiNotify()
      return false
    }
    function clearServiceFailure(key, notify = true) {
      const changed = CLIENT_SERVICE_ISSUES.delete(key)
      if (NAVIGATION_ISSUE_KEY === key) { NAVIGATION_ERROR = ''; NAVIGATION_ISSUE_KEY = '' }
      if (changed && notify && !ROOT_DISPOSED) uiNotify()
    }
    function navigationFailure(reason, details = {}) {
      return recordServiceFailure(details.code || 'client-resource-unavailable', { ...details, error: String(reason || 'Resource unavailable') })
    }
    function clientService(ctx, key) {
      const attempts = []
      if (!ctx) return { value: null, attempts, failure: { code: 'client-service-missing', contextState: 'missing' } }
      //0.18.0 regressed this seam by putting property access and the get fallback in one try.
      try {
        const getter = ctx.get
        if (typeof getter === 'function') {
          const value = getter.call(ctx, key)
          if (value !== undefined && value !== null) return { value, via: 'get', attempts: [...attempts, { accessor: 'get', state: 'resolved' }], failure: null }
          attempts.push({ accessor: 'get', state: 'missing' })
        } else attempts.push({ accessor: 'get', state: 'unsupported' })
      } catch (error) { attempts.push({ accessor: 'get', state: 'threw', error: errorMessage(error) }) }
      try {
        const value = ctx[key]
        if (value !== undefined && value !== null) return { value, via: 'property', attempts: [...attempts, { accessor: 'property', state: 'resolved' }], failure: null }
        attempts.push({ accessor: 'property', state: 'missing' })
      } catch (error) { attempts.push({ accessor: 'property', state: 'threw', error: errorMessage(error) }) }
      return { value: null, attempts, failure: { code: attempts.some(row => row.state === 'threw') ? 'client-service-access-threw' : 'client-service-missing', contextState: 'present' } }
    }
    function invokeClientService(ctx, service, methodName, args) {
      const key = service + '.' + methodName, generation = ++CLIENT_SERVICE_SEQUENCE
      CLIENT_SERVICE_GENERATIONS.set(key, generation)
      const current = () => !ROOT_DISPOSED && CLIENT_SERVICE_GENERATIONS.get(key) === generation
      const resolved = clientService(ctx, service)
      const details = { service, method: methodName, attempts: resolved.attempts, contextState: resolved.failure?.contextState || 'present' }
      if (resolved.value === null) return recordServiceFailure(resolved.failure.code, { ...details, phase: 'resolve' })
      let method
      try { method = resolved.value[methodName] } catch (error) { return recordServiceFailure('client-service-access-threw', { ...details, phase: 'method-access', error: errorMessage(error) }) }
      if (typeof method !== 'function') return recordServiceFailure('client-method-missing', { ...details, phase: 'method-validation' })
      try {
        const result = method.apply(resolved.value, args)
        // Preserve the existing immediate boolean API; contain async failures and fence older completions.
        if (result && typeof result.then === 'function') Promise.resolve(result).then(
          () => { if (current()) clearServiceFailure(key) },
          error => { if (current()) recordServiceFailure('client-call-threw', { ...details, phase: 'promise-rejection', error: errorMessage(error) }) })
        else clearServiceFailure(key)
        return true
      } catch (error) { return recordServiceFailure('client-call-threw', { ...details, phase: 'call', error: errorMessage(error) }) }
    }
    function openResourceValue(ctx, value, aside) {
      if (!value || value.openable !== true) return navigationFailure('Resource unavailable')
      if (aside) {
        if (!value.address || !value.resourceKind) return navigationFailure('Sidebar resource unavailable')
        return invokeClientService(ctx, 'sidebarRight', 'openResource', [value.address, { kind: value.resourceKind, preferNewPane: true }])
      }
      if (!value.navigationTarget) return navigationFailure('Session navigation unavailable')
      return invokeClientService(ctx, 'uiWorkspace', 'openSession', [value.navigationTarget])
    }
    async function resolveResource(ctx, resource, aside) {
      try {
        const result = await post({ action: 'resource-address', resource })
        if (!result || result.ok === false || !result.value || !result.value.openable) {
          return navigationFailure([errorMessage(result), ...((result && result.diagnostics) || []).map((row) => row.reason || row.code)].filter(Boolean).join('; '))
        }
        const opened = openResourceValue(ctx, result.value, aside)
        if (opened && (result.complete === false || result.diagnostics && result.diagnostics.length)) {
          NAVIGATION_ERROR = (result.diagnostics || []).map((row) => row.reason || row.code).join('; ') || 'Resource evidence incomplete'
          uiNotify()
        }
        return opened
      } catch (error) { return navigationFailure(errorMessage(error)) }
    }

    async function fetchJson(url, options) {
      const response = await fetch(url, options)
      if (!response || response.ok === false) throw new Error('HTTP ' + String((response && response.status) || 'error'))
      return response.json()
    }

    /**
     * 0.13.0: the host exposure report (same `/v6/api` route the rest of the panel uses).
     * `POST {action:'exposure', sessionId}` → `{ok:true, exposure:{skills, tools, mcp, counts}}`.
     * The widget only renders and posts toggles — the host engine owns disabling.
     */
    function fetchExposure(sessionId) {
      return post({ action: 'exposure', sessionId })
    }

    /** `POST {action:'exposure-toggle', sessionId, kind, name, enabled}` → refreshed exposure. */
    function postExposureToggle(body) {
      return post({ action: 'exposure-toggle', ...body })
    }

    /** Read an exposure payload tolerantly: `{ok, exposure}` or a bare exposure object. */
    function normalizeExposure(value) {
      const source = value && value.exposure && typeof value.exposure === 'object' ? value.exposure : value
      if (!source || typeof source !== 'object' || source.ok === false) return null
      const skills = Array.isArray(source.skills) ? source.skills : null
      const tools = Array.isArray(source.tools) ? source.tools : null
      const mcp = Array.isArray(source.mcp) ? source.mcp : null
      if (!skills || !tools || !mcp) return null
      return { ...source, skills, tools, mcp }
    }

    // ---------------------------------------------------------------------
    // 0.14.0 family root — client UI service (`bbffUi`).
    // Modules receive this service through `ctx.inject(['bbffUi'])`; they never
    // import root internals. The root owns chrome and layout for their cards and
    // renders their settings sections in the BBFF settings seat.
    // ---------------------------------------------------------------------
    let UI_TOKENS = {}
    let UI_SESSION_ID = null
    const UI_SESSION_WATCHERS = new Set()

    function setUiSessionId(sessionId) {
      const next = sessionId ? String(sessionId) : null
      if (UI_SESSION_ID === next) return
      UI_SESSION_ID = next
      for (const watcher of Array.from(UI_SESSION_WATCHERS)) {
        try { watcher() } catch {}
      }
    }

    function useUiSession() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const watcher = () => bump((value) => value + 1)
        UI_SESSION_WATCHERS.add(watcher)
        return () => { UI_SESSION_WATCHERS.delete(watcher) }
      }, [])
      return UI_SESSION_ID
    }

    function useUiPoll(callback, intervalMs) {
      const callbackRef = React.useRef(callback)
      callbackRef.current = callback
      React.useEffect(() => {
        const every = Number(intervalMs)
        if (!Number.isFinite(every) || every <= 0) return undefined
        const timer = setInterval(() => {
          try { callbackRef.current?.() } catch {}
        }, every)
        return () => clearInterval(timer)
      }, [intervalMs])
    }

    /** Theme tokens for module components: selected `--dsw-alias-*` variables. */
    function readThemeTokens(ctx) {
      const tokens = {}
      try {
        const resolved = clientService(ctx, 'theme'), theme = resolved.value
        CLIENT_SERVICE_OBSERVATIONS.theme = { optional: true, via: resolved.via, attempts: resolved.attempts, failure: resolved.failure }
        const source = theme && (theme.tokens || (typeof theme.getTokens === 'function' ? theme.getTokens() : null) || (theme.current && theme.current.tokens))
        if (source && typeof source === 'object') {
          for (const key of Object.keys(source)) {
            if (typeof source[key] === 'string' || typeof source[key] === 'number') tokens[key] = String(source[key])
          }
        }
      } catch (error) { CLIENT_SERVICE_OBSERVATIONS.theme = { ...CLIENT_SERVICE_OBSERVATIONS.theme, error: errorMessage(error) } }
      if (Object.keys(tokens).length === 0 && typeof document !== 'undefined' && document.documentElement) {
        CLIENT_SERVICE_OBSERVATIONS.theme = { ...CLIENT_SERVICE_OBSERVATIONS.theme, fallback: 'document-computed-tokens' }
        try {
          const style = getComputedStyle(document.documentElement)
          const names = [
            '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
            '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
            '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
            '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
            '--dsw-alias-state-error-primary', '--dsw-alias-state-idle-primary',
          ]
          for (const name of names) {
            const value = style.getPropertyValue(name)
            if (value) tokens[name] = value.trim()
          }
        } catch {}
      }
      return tokens
    }

    function kitJson(path, options) {
      return fetch(String(path), options).then((response) => {
        if (!response || response.ok === false) throw new Error('HTTP ' + String((response && response.status) || 'error'))
        return response.json()
      })
    }

    const UI_KIT = Object.freeze({
      Button: (props) => h('button', {
        type: 'button',
        className: 'gb-btn' + (props && props.variant === 'ghost' ? ' gb-btn-ghost' : ''),
        ...(props && props.variant === 'primary' ? { 'data-primary': 'true' } : {}),
        disabled: !!(props && props.disabled),
        ...(props && props.title ? { title: String(props.title) } : {}),
        onClick: (event) => { try { props && props.onClick && props.onClick(event) } catch {} },
      }, props ? props.children : null),
      Input: (props) => {
        const input = h('input', {
          type: props && props.type === 'number' ? 'number' : 'text',
          className: 'gb-input',
          value: props && props.value !== undefined && props.value !== null ? String(props.value) : '',
          ...(props && props.min !== undefined ? { min: props.min } : {}),
          ...(props && props.max !== undefined ? { max: props.max } : {}),
          ...(props && props.step !== undefined ? { step: props.step } : {}),
          disabled: !!(props && props.disabled),
          onChange: (event) => { try { props && props.onChange && props.onChange(event.target.value) } catch {} },
        })
        if (!props || props.label === undefined || props.label === null) return input
        return h('label', { className: 'gb-kit-input' }, h('span', { className: 'gb-kit-label' }, props.label), input)
      },
      Row: (props) => h('div', { className: 'gb-row' + (props && props.compact ? ' gb-row-compact' : '') }, props ? props.children : null),
      Checkbox: (props) => {
        const input = h('input', {
          type: 'checkbox',
          className: 'gb-check',
          checked: !!(props && props.checked),
          disabled: !!(props && props.disabled),
          onChange: (event) => { try { props && props.onChange && props.onChange(!!event.target.checked) } catch {} },
        })
        if (!props || props.label === undefined || props.label === null) return input
        return h('label', { className: 'gb-kit-check' }, input, h('span', { className: 'gb-kit-label' }, props.label))
      },
      Badge: KitBadge,
      SettingsLayout,
      SettingHelp,
      Hint: (props) => h('div', { className: 'gb-hint' }, props ? props.children : null),
      Empty: (props) => h('div', { className: 'gb-empty' }, props ? props.children : null),
      Spinner: (props) => h('div', { className: 'gb-empty', 'data-spinner': 'true' }, (props && props.label) || '…'),
      ErrorText: (props) => h('div', { className: 'gb-err' }, props ? props.children : null),
      postJson: (path, body) => kitJson(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body === undefined ? {} : body),
      }),
      getJson: (path) => kitJson(path, { method: 'GET' }),
      useSession: useUiSession,
      usePoll: useUiPoll,
      openSession: (sessionId) => openSessionById(ctxRef.current, sessionId),
      openFile: (path, options) => openFilePreview(ctxRef.current, options && options.sessionId || UI_SESSION_ID, path),
      openSettingsSection: (moduleId, sectionId) => openSettingsSection(moduleId, sectionId),
      msg: messageRef,
      get tokens() { return UI_TOKENS },
    })

    /** One kit per module: `t` and `resolveText` resolve in that module's namespace. */
    function kitFor(moduleId) {
      const key = String(moduleId || '')
      const cached = KIT_CACHE.get(key)
      if (cached) return cached
      const translate = (name, params) => String(moduleT(moduleId)(name, params))
      const namespace = moduleId ? (MODULE_NAMESPACES.get(String(moduleId)) || String(moduleId)) : undefined
      // 0.20.3: the shared settings layout/help are Widgets components filled with a
      // member's descriptors. The member's `kit` is the module context, so the shared
      // pieces inherit it: refs are stamped with the producer package (a reference is
      // always resolved in its producer's namespace) and, when the payload carries no
      // module id of its own, the member's module is the default render context.
      const layoutProps = (props) => {
        const source = props && typeof props === 'object' ? props : {}
        const target = source.moduleId || moduleId || ROOT_MODULE_ID
        return { ...source, moduleId: target, descriptors: stampRefs(source.descriptors, producerNamespaceOf(target)) }
      }
      const helpProps = (props) => {
        const source = props && typeof props === 'object' ? props : {}
        const target = source.moduleId || moduleId || ROOT_MODULE_ID
        const ns = producerNamespaceOf(target)
        return { ...source, moduleId: target, field: stampRefs(source.field, ns), labels: stampRefs(source.labels, ns) }
      }
      const kit = Object.freeze({
        ...UI_KIT,
        get tokens() { return UI_TOKENS },
        t: translate,
        msg: (key, params) => messageRef(key, params, namespace),
        resolveText: (value, params) => resolveHostValue(value, { t: translate, bind: bindNamespace, params }),
        // Render the stateful component, not `renderSettingsLayout` directly: the
        // component owns `open`/`onOpenChange`, and the layout's summary calls
        // `props.onOpenChange(...)`. Calling the renderer here left both undefined,
        // so every member module's advanced block was a permanent no-op (issue #2).
        SettingsLayout: (props) => h(SettingsLayout, layoutProps(props)),
        SettingHelp: (props) => h(SettingHelp, helpProps(props)),
      })
      KIT_CACHE.set(key, kit)
      return kit
    }

    function uiRegister(kind, definition, validate) {
      const result = validate(definition)
      if (!result.ok) {
        try { console.warn('oh-my-bbff bbffUi: rejected ' + kind + ': ' + result.errors.join('; ')) } catch {}
        return () => {}
      }
      const entry = Object.freeze({ ...definition })
      UI_REGISTRY[kind].push(entry)
      if (kind === 'cards' && UI_REGISTRY.familyModules.length === 0) {
        try { refreshFamilyModules() } catch {}
      }
      uiNotify()
      return () => {
        const index = UI_REGISTRY[kind].indexOf(entry)
        if (index < 0) return
        UI_REGISTRY[kind].splice(index, 1)
        uiNotify()
      }
    }

    function createUiService() {
      return Object.freeze({
        contract: UI_CONTRACT_VERSION,
        kit: kitFor(null),
        msg: (key, params) => messageRef(key, params),
        registerCard: (definition) => uiRegister('cards', definition, validateUiCard),
        registerSettingsSection: (definition) => uiRegister('sections', definition, validateUiSettingsSection),
      })
    }

    /** Resolve module ids for registered cards: host `ui.cards` declaration first. */
    async function refreshFamilyModules() {
      try {
        const value = await post({ action: 'family' })
        if (!value || value.ok === false || !Array.isArray(value.modules)) return
        UI_REGISTRY.root = value.root || null
        UI_REGISTRY.diagnostics = value.diagnostics || []
        UI_REGISTRY.familyModules = value.modules.filter((module) => module && typeof module.id === 'string')
        syncModuleNamespaces({ root: value.root, modules: UI_REGISTRY.familyModules })
        uiNotify()
      } catch {}
    }

    /** Resolve relative file paths on the Host using the native session scope. */
    function openFilePreview(ctx, sessionId, path) {
      if (!sessionId || !path) return Promise.resolve(navigationFailure('File/session unavailable'))
      return resolveResource(ctx, { kind: 'file', sessionId, path: String(path) }, true)
    }
    function openSessionById(ctx, sessionId) {
      if (!sessionId) return Promise.resolve(navigationFailure('Session unavailable'))
      return resolveResource(ctx, { kind: 'session', sessionId }, false)
    }

    // ---------------------------------------------------------------------
    // Status-panel card layout: a pure two-level model plus localStorage repair.
    //   row:    { columns: [column...], widths?: [share...] }  widths = horizontal shares (sum 1)
    //   column: { cards: [id...], heights?: [share...] }       heights = vertical shares (sum 1)
    // A row can hold any number of columns side by side and a column any number
    // of stacked cards (0.9.0 removed the old two-card limits). Only rows and
    // columns that survive rendering are drawn; a card whose data is missing
    // keeps its slot so live refreshes never reshuffle the user's arrangement.
    // ---------------------------------------------------------------------
    const STATUS_CARD_IDS = ['skills', 'tools', 'mcp', 'goal', 'history', 'team', 'teamTasks', 'todos']
    const STATUS_LAYOUT_KEY = 'oh-my-bbff:status-layout:v1'
    const STATUS_LAYOUT_VERSION = 5
    // Minimum share of a row/column a single pane may occupy (so no pane collapses).
    const STATUS_SHARE_MIN = 0.06
    // 0.7.0: per-card max height (whole card incl. head), content scrolls inside the body.
    const STATUS_CARD_HEIGHTS = {} // Hydrated solely from Host cardDefaults.
    const STATUS_HEIGHT_MIN = 80
    const STATUS_HEIGHT_MAX = 900
    const STATUS_HEIGHT_STEP = 16
    // 0.10.0: a stacked column can have its own overall height cap (px).
    const STATUS_COLUMN_HEIGHT_MIN = 120
    // 0.11.0: a collapsed card renders only its head at this height.
    const STATUS_HEAD_HEIGHT = 42

    // ---------------------------------------------------------------------
    // 0.14.0 family root — client registry (`bbffUi`) and the live card catalog.
    // Core harness cards cover what the root itself owns (exposure, goals, collab,
    // todos); every module card joins the same layout model under the namespaced id
    // `moduleId/cardId`. `setActiveCardCatalog` is called by the panel before it
    // reads/writes layout, so the pure layout helpers keep working for the core
    // catalog on their own (and the pre-family test suite stays valid).
    // ---------------------------------------------------------------------
    const UI_SERVICE = 'bbffUi'
    const UI_CONTRACT_VERSION = 1
    const UI_REGISTRY = { cards: [], sections: [], familyModules: [], root: null, diagnostics: [], listeners: new Set(), version: 0 }
    // Client-side contract mirror of lib/bbff-contract.js (the vendored runtime is
    // an ES module the browser bundle cannot import). Rules are asserted against
    // the vendored validators by test-bbff-family.mjs.
    const UI_CONTRACT = {
      cardId: /^[a-z0-9][a-z0-9._-]{0,47}$/,
      moduleId: /^[a-z][a-z0-9-]{0,31}$/,
      titleMax: 60,
      descriptionMax: 240,
      heightMin: 80,
      heightMax: 900,
    }
    let ACTIVE_CARD_ENTRIES = statusCoreCardEntries()
    function statusCoreCardEntries() {
      return STATUS_CARD_IDS.map((id) => ({ id, kind: 'core', moduleId: '', cardId: id, ...(ROOT_SETTINGS && ROOT_SETTINGS.cardDefaults && ROOT_SETTINGS.cardDefaults[id] || {}) }))
    }
    function currentCardIds() {
      return ACTIVE_CARD_ENTRIES.map((entry) => entry.id)
    }
    function currentCardEntry(id) {
      for (const entry of ACTIVE_CARD_ENTRIES) if (entry.id === id) return entry
      return undefined
    }
    function setActiveCardCatalog(entries) {
      ACTIVE_CARD_ENTRIES = Array.isArray(entries) && entries.length > 0 ? entries.slice() : statusCoreCardEntries()
    }
    function uiNotify() {
      UI_REGISTRY.version += 1
      for (const listener of Array.from(UI_REGISTRY.listeners)) {
        try { listener() } catch {}
      }
    }
    function useUiVersion() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const listener = () => bump((value) => value + 1)
        UI_REGISTRY.listeners.add(listener)
        return () => { UI_REGISTRY.listeners.delete(listener) }
      }, [])
      return UI_REGISTRY.version
    }
    /** Register titles: a message reference, a legacy `{zh,en}` map, or a plain string. */
    function localizedTitle(value, moduleId) { return hostText(value, moduleId) }
    function uiModuleIdOf(card) {
      if (card && typeof card.moduleId === 'string' && UI_CONTRACT.moduleId.test(card.moduleId)) return card.moduleId
      for (const module of UI_REGISTRY.familyModules) {
        const cards = module && module.ui && Array.isArray(module.ui.cards) ? module.ui.cards : []
        if (cards.includes(card.id)) return String(module.id)
      }
      return 'module'
    }
    function uiCardLayoutId(card) {
      return uiModuleIdOf(card) + '/' + card.id
    }
    function cardPreference(entry) {
      const fallback = ROOT_SETTINGS && ROOT_SETTINGS.cardPreferenceDefaults || {}
      const declared = entry.kind === 'core' ? ROOT_SETTINGS && ROOT_SETTINGS.cardDefaults && ROOT_SETTINGS.cardDefaults[entry.id] || {} : entry.definition || {}
      const overrides = settingsValues().cardPreferences || {}
      const combined = { ...fallback, ...declared, ...(overrides[entry.id] || {}) }
      return Object.fromEntries(['visible', 'order', 'defaultHeight'].filter((key) => combined[key] !== undefined).map((key) => [key, combined[key]]))
    }
    /** Core identity belongs here; defaults/order/visibility are Host contract data. */
    function buildCardCatalog() {
      const core = statusCoreCardEntries().map((entry) => ({ ...entry, title: '' }))
      const cards = UI_REGISTRY.cards.map((card) => ({ id: uiCardLayoutId(card), kind: 'module', moduleId: uiModuleIdOf(card), cardId: card.id,
        title: localizedTitle(card.title, uiModuleIdOf(card)), definition: card }))
      return core.concat(cards).map((entry) => ({ ...entry, ...cardPreference(entry) }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
    }
    function uiText(value) {
      return typeof value === 'string' ? value.trim() : ''
    }
    function uiLocalizedTitleOk(value) {
      return !!value && typeof value === 'object'
        && typeof value.zh === 'string' && value.zh.trim().length > 0
        && typeof value.en === 'string' && value.en.trim().length > 0
    }
    function uiValidateTitle(target, kind, allowLocalized, errors) {
      if (isMessageRef(target.title)) return
      if (allowLocalized && uiLocalizedTitleOk(target.title)) {
        if (target.title.zh.trim().length > UI_CONTRACT.titleMax || target.title.en.trim().length > UI_CONTRACT.titleMax) {
          errors.push(kind + ' title is longer than ' + UI_CONTRACT.titleMax + ' characters')
        }
        return
      }
      const title = uiText(target.title)
      if (title.length === 0) errors.push(kind + ' title is required')
      else if (title.length > UI_CONTRACT.titleMax) errors.push(kind + ' title is longer than ' + UI_CONTRACT.titleMax + ' characters')
    }
    /** Mirror of the vendored `validateCard` (lib/bbff-contract.js). */
    function validateUiCard(card) {
      const errors = []
      if (!card || typeof card !== 'object') return { ok: false, errors: ['card must be an object'] }
      if (!UI_CONTRACT.cardId.test(String(card.id || ''))) errors.push('card.id must match /^[a-z0-9][a-z0-9._-]{0,47}$/')
      uiValidateTitle(card, 'card', true, errors)
      if (card.description !== undefined && !isMessageRef(card.description)) {
        if (uiText(card.description).length === 0) errors.push('card description is empty')
        else if (uiText(card.description).length > UI_CONTRACT.descriptionMax) errors.push('card description is longer than ' + UI_CONTRACT.descriptionMax + ' characters')
      }
      if (typeof card.component !== 'function') errors.push('card.component must be a function')
      if (card.order !== undefined && (!Number.isFinite(card.order) || card.order < 0)) errors.push('card.order must be a non-negative number')
      if (card.defaultHeight !== undefined && (!Number.isFinite(card.defaultHeight) || card.defaultHeight < UI_CONTRACT.heightMin || card.defaultHeight > UI_CONTRACT.heightMax)) {
        errors.push('card.defaultHeight must be ' + UI_CONTRACT.heightMin + '...' + UI_CONTRACT.heightMax + ' px')
      }
      if (card.legacyIds !== undefined && (!Array.isArray(card.legacyIds) || card.legacyIds.some((id) => typeof id !== 'string' || id.length === 0))) {
        errors.push('card.legacyIds must be non-empty strings')
      }
      return { ok: errors.length === 0, errors }
    }
    /** Mirror of the vendored `validateSettingsSection` (lib/bbff-contract.js). */
    function validateUiSettingsSection(section) {
      const errors = []
      if (!section || typeof section !== 'object') return { ok: false, errors: ['section must be an object'] }
      if (!UI_CONTRACT.cardId.test(String(section.id || ''))) errors.push('section.id must match /^[a-z0-9][a-z0-9._-]{0,47}$/')
      uiValidateTitle(section, 'section', true, errors)
      if (section.description !== undefined && !isMessageRef(section.description)) {
        if (uiText(section.description).length === 0) errors.push('section description is empty')
        else if (uiText(section.description).length > UI_CONTRACT.descriptionMax) errors.push('section description is longer than ' + UI_CONTRACT.descriptionMax + ' characters')
      }
      if (section.moduleId !== undefined && !UI_CONTRACT.moduleId.test(String(section.moduleId))) errors.push('section.moduleId must be a valid module id')
      if (typeof section.component !== 'function') errors.push('section.component must be a function')
      if (section.order !== undefined && (!Number.isFinite(section.order) || section.order < 0)) errors.push('section.order must be a non-negative number')
      return { ok: errors.length === 0, errors }
    }
    /** Repair a share array to `count` positive entries summing to 1. */
    function normalizeShares(raw, count) {
      if (!Number.isInteger(count) || count <= 0) return []
      const source = Array.isArray(raw) ? raw : []
      const values = []
      for (let index = 0; index < count; index++) {
        const number = Number(source[index])
        values.push(Number.isFinite(number) && number > 0 ? number : 0)
      }
      const total = values.reduce((sum, value) => sum + value, 0)
      let shares = total > 0 ? values.map((value) => value / total) : values.map(() => 1 / count)
      const min = Math.min(STATUS_SHARE_MIN, 1 / count)
      // Water-filling: lift any pane below the floor to it and scale the rest down,
      // repeating until every share sits at or above the floor (sum stays 1).
      for (let guard = 0; guard <= count + 1; guard++) {
        let deficit = 0
        let free = 0
        for (const value of shares) {
          if (value < min - 1e-12) deficit += min - value
          else free += value
        }
        if (deficit <= 1e-12) break
        const scale = free > 0 ? (free - deficit) / free : 0
        shares = shares.map((value) => (value < min - 1e-12 ? min : value * scale))
      }
      return shares
    }

    function equalShares(count) {
      return normalizeShares([], count)
    }

    /** Move the boundary between shares[index] and shares[index + 1] by `delta`. */
    function resizeSharePair(shares, index, delta) {
      const count = shares.length
      if (!Number.isInteger(index) || index < 0 || index + 1 >= count) return shares.slice()
      const min = Math.min(STATUS_SHARE_MIN, 1 / count)
      const left = shares[index]
      const right = shares[index + 1]
      const lower = min - left
      const upper = right - min
      const applied = upper < lower ? upper : Math.max(lower, Math.min(upper, Number(delta) || 0))
      const next = shares.slice()
      next[index] = left + applied
      next[index + 1] = right - applied
      return next
    }

    /** Insert one new share at `index`; the other shares keep their relative sizes. */
    function insertShare(shares, index, countBefore) {
      const count = Number.isInteger(countBefore) && countBefore > 0 ? countBefore : 0
      if (count === 0) return [1]
      const base = normalizeShares(shares, count)
      const scaled = base.map((value) => value * (count / (count + 1)))
      const at = Math.min(count, Math.max(0, Number.isInteger(index) ? index : count))
      scaled.splice(at, 0, 1 / (count + 1))
      return normalizeShares(scaled, count + 1)
    }

    /** Remove one share and renormalize the rest; a single-pane row/column drops its array. */
    function removeShare(shares, index, countBefore) {
      if (!Array.isArray(shares) || countBefore <= 1) return []
      const next = shares.filter((_, position) => position !== index)
      return normalizeShares(next, countBefore - 1)
    }

    function defaultCardHeight(id) {
      const entry = currentCardEntry(id)
      if (entry && Number.isFinite(entry.defaultHeight)) return entry.defaultHeight
      const value = STATUS_CARD_HEIGHTS[id]
      return Number.isFinite(value) ? value : ROOT_SETTINGS && ROOT_SETTINGS.cardPreferenceDefaults && ROOT_SETTINGS.cardPreferenceDefaults.defaultHeight || STATUS_HEIGHT_MIN
    }

    /** Clamp one card height into 80–900 px; invalid input falls back to `fallback`. */
    function clampCardHeight(value, fallback) {
      const base = Number.isFinite(Number(fallback)) ? Number(fallback) : STATUS_HEIGHT_MIN
      const number = Number(value)
      if (!Number.isFinite(number)) return Math.min(STATUS_HEIGHT_MAX, Math.max(STATUS_HEIGHT_MIN, Math.round(base)))
      return Math.min(STATUS_HEIGHT_MAX, Math.max(STATUS_HEIGHT_MIN, Math.round(number)))
    }

    function defaultHeights() {
      const heights = {}
      for (const id of currentCardIds()) heights[id] = defaultCardHeight(id)
      return heights
    }

    /** Repair a stored heights map: unknown ids dropped, invalid values replaced by the default, clamped. */
    function normalizeHeights(raw, knownIds) {
      const known = Array.isArray(knownIds) && knownIds.length > 0 ? knownIds : currentCardIds()
      const heights = {}
      for (const id of known) heights[id] = defaultCardHeight(id)
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return heights
      for (const id of known) {
        const value = raw[id]
        if (value === undefined || value === null || value === '') continue
        const number = Number(value)
        if (!Number.isFinite(number)) continue
        heights[id] = clampCardHeight(number, heights[id])
      }
      return heights
    }

    function defaultLayout() {
      return currentCardIds().map((id) => ({ columns: [{ cards: [id] }] }))
    }

    /** 0.10.0: a stacked column's own overall height cap; invalid values are dropped. */
    function normalizeColumnMaxHeight(value) {
      if (value === undefined || value === null || value === '') return undefined
      const number = Number(value)
      if (!Number.isFinite(number)) return undefined
      return Math.min(STATUS_HEIGHT_MAX, Math.max(STATUS_COLUMN_HEIGHT_MIN, Math.round(number)))
    }

    function copyColumn(column) {
      const cards = column.cards.slice()
      const copy = cards.length > 1 ? { cards, heights: normalizeShares(column.heights, cards.length) } : { cards }
      const maxHeight = normalizeColumnMaxHeight(column.maxHeight)
      if (maxHeight !== undefined) copy.maxHeight = maxHeight
      return copy
    }

    function copyRow(row) {
      const columns = row.columns.map(copyColumn)
      return columns.length > 1 ? { columns, widths: normalizeShares(row.widths, columns.length) } : { columns }
    }

    /**
     * Repair one column: unknown/duplicate ids dropped, any number of cards, heights
     * normalized and the optional overall max height clamped. The max height stays on
     * the column object even while it holds a single card, so a column that becomes a
     * stack again reuses it (a single card still renders with its own card height cap).
     */
    function normalizeColumn(raw, knownSet, seen) {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null
      const cards = []
      for (const id of raw.cards) {
        if (typeof id !== 'string' || !knownSet.has(id) || seen.has(id)) continue
        seen.add(id)
        cards.push(id)
      }
      if (cards.length === 0) return null
      const maxHeight = normalizeColumnMaxHeight(raw.maxHeight)
      const withMaxHeight = (column) => {
        if (maxHeight !== undefined) column.maxHeight = maxHeight
        return column
      }
      if (cards.length === 1) return withMaxHeight({ cards })
      // 0.8.0 v2 stored one ratio for a two-card stack; migrate it to a share pair.
      let source = raw.heights
      if (!Array.isArray(source) && raw.ratio !== undefined && cards.length === 2) {
        const ratio = Number(raw.ratio)
        const top = Number.isFinite(ratio) ? Math.min(1 - STATUS_SHARE_MIN, Math.max(STATUS_SHARE_MIN, ratio)) : 0.5
        source = [top, 1 - top]
      }
      return withMaxHeight({ cards, heights: normalizeShares(source, cards.length) })
    }

    /**
     * Repair any stored shape. Accepts the 0.9.0 v3 rows (`{columns, widths}`), the
     * 0.8.0 v2 rows (`{columns:[{cards,ratio}], ratio}`), the 0.6.0/0.7.0 v1 rows
     * (`{cards:[...]}` side by side) and the legacy bare rows array. v1 rows migrate
     * by giving each card its own column; v2 ratios become share pairs. Unknown ids
     * are dropped, duplicates deduped, missing ids appended as single-card rows and
     * every share array normalized to sum 1.
     */
    function normalizeLayout(raw, knownIds) {
      const known = Array.isArray(knownIds) && knownIds.length > 0 ? knownIds : currentCardIds()
      const knownSet = new Set(known)
      if (!Array.isArray(raw)) return defaultLayout()
      const rows = []
      const seen = new Set()
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue
        const columns = []
        let source = null
        if (Array.isArray(entry.columns)) {
          for (const column of entry.columns) {
            const normalized = normalizeColumn(column, knownSet, seen)
            if (normalized) columns.push(normalized)
          }
          source = entry.widths
          if (!Array.isArray(source) && entry.ratio !== undefined && columns.length === 2) {
            const ratio = Number(entry.ratio)
            const left = Number.isFinite(ratio) ? Math.min(1 - STATUS_SHARE_MIN, Math.max(STATUS_SHARE_MIN, ratio)) : 0.5
            source = [left, 1 - left]
          }
        } else if (Array.isArray(entry.cards)) {
          // v1 row: cards sat side by side, so each becomes its own column.
          for (const id of entry.cards) {
            if (typeof id !== 'string' || !knownSet.has(id) || seen.has(id)) continue
            seen.add(id)
            columns.push({ cards: [id] })
          }
          source = entry.ratio !== undefined && columns.length === 2 ? [Number(entry.ratio), 1 - Number(entry.ratio)] : null
        }
        if (columns.length === 0) continue
        rows.push(columns.length > 1 ? { columns, widths: normalizeShares(source, columns.length) } : { columns })
      }
      for (const id of known) if (!seen.has(id)) rows.push({ columns: [{ cards: [id] }] })
      return rows.length > 0 ? rows : defaultLayout()
    }

    /** Locate one card: `{ rowIndex, columnIndex, cardIndex }` or null. */
    function locateCard(layout, id) {
      const base = normalizeLayoutKeep(layout)
      for (let rowIndex = 0; rowIndex < base.length; rowIndex++) {
        for (let columnIndex = 0; columnIndex < base[rowIndex].columns.length; columnIndex++) {
          const cardIndex = base[rowIndex].columns[columnIndex].cards.indexOf(id)
          if (cardIndex >= 0) return { rowIndex, columnIndex, cardIndex }
        }
      }
      return null
    }

    /**
     * Remove one card; its column renormalizes its share array, and an emptied
     * column (or emptied row) disappears while the surviving arrays renormalize.
     */
    function detachCard(layout, id) {
      const base = normalizeLayoutKeep(layout)
      const rows = base.map(copyRow)
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]
        for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex++) {
          const column = row.columns[columnIndex]
          const cardIndex = column.cards.indexOf(id)
          if (cardIndex < 0) continue
          const wasStack = column.cards.length > 1
          const nextCards = column.cards.filter((card) => card !== id)
          const keptMaxHeight = normalizeColumnMaxHeight(column.maxHeight)
          const keepCap = (next) => {
            if (keptMaxHeight !== undefined) next.maxHeight = keptMaxHeight
            return next
          }
          if (nextCards.length === 0) {
            row.columns.splice(columnIndex, 1)
            if (row.columns.length === 0) rows.splice(rowIndex, 1)
            else if (row.columns.length === 1) delete row.widths
            else row.widths = removeShare(row.widths, columnIndex, row.columns.length + 1)
          } else if (nextCards.length === 1) {
            row.columns[columnIndex] = keepCap({ cards: nextCards })
          } else {
            row.columns[columnIndex] = keepCap({ cards: nextCards, heights: removeShare(column.heights, cardIndex, column.cards.length) })
          }
          return { layout: rows, rowIndex, columnIndex, cardIndex, wasStack }
        }
      }
      return { layout: rows, rowIndex: -1, columnIndex: -1, cardIndex: -1, wasStack: false }
    }

    /** Reorder: drop a card as a whole-width row before/after the target row. */
    function moveCard(layout, id, target) {
      const base = normalizeLayoutKeep(layout)
      if (!target || typeof target !== 'object' || !Number.isInteger(target.rowIndex)) return base
      const position = target.position === 'before' ? 'before' : target.position === 'after' ? 'after' : ''
      if (!position || !base[target.rowIndex]) return base
      if (!locateCard(base, id)) return base
      const targetId = typeof target.targetId === 'string' && locateCard(base, target.targetId) ? target.targetId : ''
      const detached = detachCard(base, id)
      if (detached.rowIndex < 0) return base
      let rowIndex = target.rowIndex
      if (targetId) {
        const found = locateCard(detached.layout, targetId)
        if (!found) return base
        rowIndex = found.rowIndex
      } else {
        const removedRow = base[detached.rowIndex] && base[detached.rowIndex].columns.length === 1 && !detached.wasStack
        if (removedRow && detached.rowIndex < rowIndex) rowIndex -= 1
      }
      const rows = detached.layout
      const insertAt = Math.min(rows.length, Math.max(0, rowIndex + (position === 'after' ? 1 : 0)))
      rows.splice(insertAt, 0, { columns: [{ cards: [id] }] })
      return normalizeLayoutKeep(rows)
    }

    /**
     * Dock `draggedId` on one side of `targetId`:
     *   left/right — insert it as a new column before/after the target's column;
     *   top/bottom — insert it as a new stacked card before/after the target card.
     * Any number of columns/cards is allowed, so nothing is displaced.
     */
    function dockCard(layout, draggedId, targetId, side) {
      const base = normalizeLayoutKeep(layout)
      if (!draggedId || !targetId || draggedId === targetId) return base
      const direction = side === 'left' ? 'left' : side === 'right' ? 'right' : side === 'top' ? 'top' : side === 'bottom' ? 'bottom' : ''
      if (!direction) return base
      if (!locateCard(base, targetId) || !locateCard(base, draggedId)) return base
      const vertical = direction === 'top' || direction === 'bottom'
      const detached = detachCard(base, draggedId)
      if (detached.rowIndex < 0) return base
      const rows = detached.layout
      const after = locateCard(rows, targetId)
      if (!after) return base

      if (vertical) {
        const column = rows[after.rowIndex].columns[after.columnIndex]
        const insertAt = direction === 'top' ? after.cardIndex : after.cardIndex + 1
        const cards = column.cards.slice()
        cards.splice(insertAt, 0, draggedId)
        const dockedColumn = cards.length > 1
          ? { cards, heights: insertShare(column.heights, insertAt, column.cards.length) }
          : { cards }
        const dockedCap = normalizeColumnMaxHeight(column.maxHeight)
        if (dockedCap !== undefined) dockedColumn.maxHeight = dockedCap
        rows[after.rowIndex].columns[after.columnIndex] = dockedColumn
        return normalizeLayoutKeep(rows)
      }

      const row = rows[after.rowIndex]
      const insertAt = direction === 'left' ? after.columnIndex : after.columnIndex + 1
      const columns = row.columns.map(copyColumn)
      columns.splice(insertAt, 0, { cards: [draggedId] })
      rows[after.rowIndex] = columns.length > 1
        ? { columns, widths: insertShare(row.widths, insertAt, row.columns.length) }
        : { columns }
      return normalizeLayoutKeep(rows)
    }

    /** Pull a stacked card out into its own full-width row right below the stack. */
    function undockCard(layout, id) {
      const base = normalizeLayoutKeep(layout)
      const found = locateCard(base, id)
      if (!found || base[found.rowIndex].columns[found.columnIndex].cards.length < 2) return base
      const detached = detachCard(base, id)
      if (detached.rowIndex < 0) return base
      const rows = detached.layout
      rows.splice(found.rowIndex + 1, 0, { columns: [{ cards: [id] }] })
      return normalizeLayoutKeep(rows)
    }

    /** Horizontal shares of a row (any number of columns). */
    function setRowWidths(layout, rowIndex, widths) {
      const base = normalizeLayoutKeep(layout)
      const row = base[rowIndex]
      if (!Number.isInteger(rowIndex) || !row || row.columns.length < 2) return base
      return base.map((current, index) => (
        index === rowIndex ? { columns: current.columns.map(copyColumn), widths: normalizeShares(widths, current.columns.length) } : copyRow(current)
      ))
    }

    /** Vertical shares of a stacked column (any number of cards). */
    function setColumnShares(layout, rowIndex, columnIndex, heights) {
      const base = normalizeLayoutKeep(layout)
      const row = base[rowIndex]
      if (!Number.isInteger(rowIndex) || !row || !row.columns[columnIndex] || row.columns[columnIndex].cards.length < 2) return base
      return base.map((current, index) => {
        if (index !== rowIndex) return copyRow(current)
        return {
          ...copyRow(current),
          columns: current.columns.map((column, cIndex) => (
            cIndex === columnIndex
              ? { cards: column.cards.slice(), heights: normalizeShares(heights, column.cards.length), ...(column.maxHeight !== undefined ? { maxHeight: column.maxHeight } : {}) }
              : copyColumn(column)
          )),
        }
      })
    }

    /** 0.10.0: set or clear (`undefined`/null) a stacked column's overall height cap. */
    function setColumnMaxHeight(layout, rowIndex, columnIndex, maxHeight) {
      const base = normalizeLayoutKeep(layout)
      const row = base[rowIndex]
      if (!Number.isInteger(rowIndex) || !row || !row.columns[columnIndex]) return base
      const cap = normalizeColumnMaxHeight(maxHeight)
      return base.map((current, index) => {
        if (index !== rowIndex) return copyRow(current)
        return {
          ...copyRow(current),
          columns: current.columns.map((column, cIndex) => {
            if (cIndex !== columnIndex) return copyColumn(column)
            const copy = copyColumn(column)
            if (cap === undefined) delete copy.maxHeight
            else copy.maxHeight = cap
            return copy
          }),
        }
      })
    }

    /** 0.11.0: repair the per-card collapsed map (only known ids stored as `true`). */
    function normalizeCollapsed(raw, knownIds) {
      const collapsed = {}
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return collapsed
      const known = Array.isArray(knownIds) && knownIds.length > 0 ? knownIds : currentCardIds()
      for (const id of known) {
        if (raw[id] === true) collapsed[id] = true
      }
      return collapsed
    }

    function defaultLayoutDoc() {
      return { layout: defaultLayout(), heights: defaultHeights(), collapsed: {} }
    }

    /** The stored document shape: `{ version:5, rows, heights, collapsed }`. */
    function serializeLayout(layout, heights, collapsed, knownIds) {
      const known = Array.isArray(knownIds) && knownIds.length > 0 ? knownIds : currentCardIds()
      return JSON.stringify({
        version: STATUS_LAYOUT_VERSION,
        rows: normalizeLayout(layout, known),
        heights: normalizeHeights(heights, known),
        collapsed: normalizeCollapsed(collapsed, known),
      })
    }

    /**
     * Parse the stored document. Accepts the 0.10.0 v4 / 0.9.0 v3 object, the 0.8.0 v2
     * object, the 0.7.0 `{rows, heights}` object and the legacy bare rows array; older
     * rows migrate to share arrays and a missing collapsed map means "all expanded".
     * Anything invalid falls back to defaults.
     */
    function parseLayout(raw) {
      if (typeof raw !== 'string' || raw.trim() === '') return defaultLayoutDoc()
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return { layout: normalizeLayout(parsed), heights: defaultHeights(), collapsed: {} }
        if (parsed && typeof parsed === 'object') {
          return {
            layout: normalizeLayout(parsed.rows),
            heights: normalizeHeights(parsed.heights),
            collapsed: normalizeCollapsed(parsed.collapsed),
          }
        }
        return defaultLayoutDoc()
      } catch { return defaultLayoutDoc() }
    }

    function readLayout() {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return defaultLayoutDoc()
        return parseLayout(localStorage.getItem(STATUS_LAYOUT_KEY))
      } catch { return defaultLayoutDoc() }
    }

    function writeLayout(doc) {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return false
        const layout = doc && Array.isArray(doc.layout) ? doc.layout : doc
        const heights = doc && doc.heights
        const collapsed = doc && doc.collapsed
        const knownIds = doc && Array.isArray(doc.knownIds) ? doc.knownIds : undefined
        localStorage.setItem(STATUS_LAYOUT_KEY, serializeLayout(layout, heights, collapsed, knownIds))
        return true
      } catch { return false }
    }

    /** Raw stored document (normalized later, once the live card catalog is known). */
    function readStoredDocument() {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return null
        const raw = localStorage.getItem(STATUS_LAYOUT_KEY)
        if (typeof raw !== 'string' || raw.trim() === '') return null
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return { rows: parsed, heights: {}, collapsed: {} }
        if (parsed && typeof parsed === 'object') return { rows: parsed.rows, heights: parsed.heights, collapsed: parsed.collapsed }
      } catch {}
      return null
    }

    /**
     * 0.14.0 generic `legacyIds` migration: rewrite pre-namespacing card ids in the
     * stored document to `moduleId/cardId`, using only the declarations of the
     * currently registered cards (the root has no table of module ids). Returns the
     * rewritten document, or null when nothing needed rewriting.
     */
    function migrateLegacyIds(definitions) {
      const doc = readStoredDocument()
      if (!doc || !Array.isArray(doc.rows)) return null
      const map = {}
      for (const entry of Array.isArray(definitions) ? definitions : []) {
        const def = entry && entry.definition
        const legacyIds = def && Array.isArray(def.legacyIds) ? def.legacyIds : []
        for (const legacyId of legacyIds) {
          if (typeof legacyId === 'string' && legacyId.length > 0 && legacyId !== entry.id) map[legacyId] = entry.id
        }
      }
      if (Object.keys(map).length === 0) return null
      let changed = false
      const rewriteId = (id) => {
        if (typeof id !== 'string' || !map[id]) return id
        changed = true
        return map[id]
      }
      const rewriteRow = (row) => {
        if (!row || typeof row !== 'object') return row
        if (Array.isArray(row.cards)) return { ...row, cards: row.cards.map(rewriteId) }
        if (Array.isArray(row.columns)) {
          return {
            ...row,
            columns: row.columns.map((column) => {
              if (!column || typeof column !== 'object' || !Array.isArray(column.cards)) return column
              return { ...column, cards: column.cards.map(rewriteId) }
            }),
          }
        }
        return row
      }
      const rows = doc.rows.map(rewriteRow)
      const rewriteMap = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value
        const next = {}
        for (const key of Object.keys(value)) {
          const mapped = map[key]
          if (mapped) { next[mapped] = value[key]; changed = true }
          else next[key] = value[key]
        }
        return next
      }
      const heights = rewriteMap(doc.heights)
      const collapsed = rewriteMap(doc.collapsed)
      if (!changed) return null
      return { rows, heights, collapsed }
    }

    /** Normalize a working layout while preserving any ids it already contains. */
    function normalizeLayoutKeep(rows) {
      const known = Array.from(new Set([...currentCardIds(), ...cardIdsOfRows(rows)]))
      return normalizeLayout(rows, known)
    }

    /** Every card id a stored document mentions (for retained module slots). */
    function cardIdsOfRows(rows) {
      const ids = new Set()
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row || typeof row !== 'object') continue
        const columns = Array.isArray(row.columns)
          ? row.columns
          : (Array.isArray(row.cards) ? [{ cards: row.cards }] : [])
        for (const column of columns) {
          for (const id of (column && Array.isArray(column.cards) ? column.cards : [])) ids.add(id)
        }
      }
      return ids
    }

    /**
     * Resolve a pointer position into a drop intent over the measured card frames.
     * Top/bottom 10% insert the card as a row before/after; the next band docks it
     * above/below inside the target's column; the middle band docks left/right.
     */
    function hitTestDrop(targets, x, y) {
      if (!Array.isArray(targets) || !Number.isFinite(x) || !Number.isFinite(y)) return null
      for (const target of targets) {
        const rect = target && target.rect
        if (!rect) continue
        const width = Number(rect.width)
        const height = Number(rect.height)
        if (!(width > 0) || !(height > 0)) continue
        const left = Number(rect.left)
        const top = Number(rect.top)
        if (!(x >= left && x <= left + width && y >= top && y <= top + height)) continue
        const relY = (y - top) / height
        const relX = (x - left) / width
        const rowIndex = target.rowIndex
        const columnIndex = Number.isInteger(target.columnIndex) ? target.columnIndex : 0
        const cardIndex = Number.isInteger(target.cardIndex) ? target.cardIndex : 0
        if (relY < 0.1) return { kind: 'insert-before', rowIndex, columnIndex, cardIndex, targetId: target.id }
        if (relY > 0.9) return { kind: 'insert-after', rowIndex, columnIndex, cardIndex, targetId: target.id }
        if (relY < 0.35) return { kind: 'dock-top', rowIndex, columnIndex, cardIndex, targetId: target.id }
        if (relY > 0.65) return { kind: 'dock-bottom', rowIndex, columnIndex, cardIndex, targetId: target.id }
        return { kind: relX < 0.5 ? 'dock-left' : 'dock-right', rowIndex, columnIndex, cardIndex, targetId: target.id }
      }
      return null
    }

    /** Global notes: the human's own list, invisible to every model request. */
    function NotesPanel() {
      const t = rootT
      const settings = useRootSettings()
      const [items, setItems] = React.useState([])
      const [draft, setDraft] = React.useState('')
      const [edits, setEdits] = React.useState({})
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [loading, setLoading] = React.useState(true)
      const [dragId, setDragId] = React.useState(null)
      const [overId, setOverId] = React.useState(null)

      React.useEffect(() => {
        post({ action: 'human', op: 'list' }).then((value) => {
          if (value && Array.isArray(value.humanTodos)) setItems(value.humanTodos)
          setLoading(false)
        }).catch(() => setLoading(false))
      }, [])

      const mutate = (op, extra) => {
        setBusy(true)
        post({ action: 'human', op, ...(extra || {}) })
          .then((value) => {
            if (value && value.ok === false) setError(String(value.error || t('error')))
            else { setError(''); if (value && Array.isArray(value.humanTodos)) setItems(value.humanTodos) }
          })
          .catch((reason) => setError(String(reason && reason.message ? reason.message : reason)))
          .finally(() => setBusy(false))
      }
      const add = () => {
        const text = draft.trim()
        if (!text) return
        setDraft('')
        mutate('add', { text })
      }
      /** Drop `fromId` at `toId`'s position: optimistic local move, then persist. */
      const moveBefore = (fromId, toId) => {
        if (!fromId || !toId || fromId === toId) return
        const ids = items.map((item) => item.id)
        const from = ids.indexOf(fromId)
        const to = ids.indexOf(toId)
        if (from < 0 || to < 0) return
        const nextIds = ids.slice()
        nextIds.splice(from, 1)
        nextIds.splice(to, 0, fromId)
        const byId = new Map(items.map((item) => [item.id, item]))
        const optimistic = nextIds.map((id) => byId.get(id)).filter(Boolean)
        setItems(optimistic)
        setBusy(true)
        post({ action: 'human', op: 'reorder', ids: nextIds })
          .then((value) => {
            if (value && value.ok === false) setError(String(value.error || t('error')))
            else { setError(''); if (value && Array.isArray(value.humanTodos)) setItems(value.humanTodos) }
          })
          .catch((reason) => setError(String(reason && reason.message ? reason.message : reason)))
          .finally(() => setBusy(false))
      }

      return h('div', { className: 'gb-root' },
        h('style', null, CSS),
        h('div', { className: 'gb-head' },
          h('div', null,
            h('h2', { className: 'gb-title' }, t('notesTitle')),
            h('p', { className: 'gb-sub' }, t('notesSub'))),
          h('div', { className: 'gb-row' },
            h('button', { className: 'gb-btn', disabled: busy, onClick: () => mutate('clearDone') }, t('clearDone')),
            h('button', { className: 'gb-btn', 'data-danger': 'true', disabled: busy, onClick: () => mutate('clearAll') }, t('clearAll')))),
        h('div', { className: 'gb-body' },
          error ? h('div', { className: 'gb-err' }, t('error') + ': ' + error) : null,
          h('div', { className: 'gb-card' },
            h('div', { className: 'gb-card-body' },
              h('div', { className: 'gb-add' },
                h('input', {
                  value: draft, placeholder: t('addPlaceholder'),
                  onChange: (event) => setDraft(event.target.value),
                  onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); add() } },
                }),
                h('button', { className: 'gb-btn', 'data-primary': 'true', disabled: busy || !draft.trim(), onClick: add }, '+')),
              h('div', { className: 'gb-hint', 'data-notes-limits': 'true' }, ['noteMaxLength', 'notesMaxItems'].map((key) => key + ': ' + (settings && settings.settings[key] !== undefined ? settings.settings[key] : '—') + ' · default: ' + (settings && settings.defaults[key] !== undefined ? settings.defaults[key] : '—')).join(' · ')),
              items.length === 0
                ? h('div', { className: 'gb-empty' }, loading ? t('loading') : t('notesEmpty'))
                : h('div', { className: 'gb-list' }, items.map((item) => h('div', {
                  key: item.id, className: 'gb-item', 'data-status': item.done ? 'completed' : 'pending',
                  'data-dragging': String(dragId === item.id),
                  'data-over': String(!!dragId && overId === item.id && dragId !== item.id),
                  onDragOver: (event) => {
                    if (!dragId) return
                    event.preventDefault()
                    try { event.dataTransfer.dropEffect = 'move' } catch {}
                    if (overId !== item.id) setOverId(item.id)
                  },
                  onDrop: (event) => {
                    event.preventDefault()
                    const from = dragId
                    setDragId(null)
                    setOverId(null)
                    if (from) moveBefore(from, item.id)
                  },
                },
                  h('span', {
                    className: 'gb-handle', draggable: true, title: t('dragHint'),
                    onDragStart: (event) => {
                      setDragId(item.id)
                      try {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', item.id)
                      } catch {}
                    },
                    onDragEnd: () => { setDragId(null); setOverId(null) },
                  }, '⋮⋮'),
                  h('span', { className: 'gb-dot', onClick: () => mutate('toggle', { id: item.id, done: !item.done }) }, item.done ? '✓' : ''),
                  h('input', {
                    className: 'gb-text',
                    value: edits[item.id] !== undefined ? edits[item.id] : item.text,
                    style: { background: 'transparent', border: '0', color: 'inherit', font: 'inherit', padding: 0, width: '100%' },
                    onChange: (event) => setEdits({ ...edits, [item.id]: event.target.value }),
                    onBlur: () => {
                      const next = edits[item.id]
                      if (next === undefined) return
                      const text = String(next).trim()
                      setEdits((state) => { const copy = { ...state }; delete copy[item.id]; return copy })
                      if (text && text !== item.text) mutate('update', { id: item.id, text })
                    },
                    onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur() },
                  }),
                  h('button', { className: 'gb-del', onClick: () => mutate('remove', { id: item.id }) }, '✕'))))))))
    }

    /**
     * Global BBFF settings seat: a core modules diagnostics block driven by the
     * family registry (never naming a module) plus every registered settings
     * section. Module-owned settings live in their own sections now — the root
     * hardcodes no module UI.
     */
    /** Settings-only chrome: natural height and an independent, durable fold per section. */
    function SettingsSection(props) {
      const sectionId = String(props.sectionId)
      const qualified = (props.moduleId || '@unattributed') + '/' + sectionId
      const storageKey = 'bbff:settings:collapsed:' + (props.moduleId ? qualified : sectionId)
      const [collapsed, setCollapsed] = React.useState(() => {
        try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
      })
      const bodyId = 'bbff-settings-body-' + encodeURIComponent(qualified)
      const sectionRef = React.useRef(null)
      React.useEffect(() => {
        if (!props.focus || props.focus.key !== qualified) return
        setCollapsed(false)
        try { localStorage.setItem(storageKey, 'false') } catch {}
        try { sectionRef.current && sectionRef.current.scrollIntoView({ block: 'nearest' }); sectionRef.current && sectionRef.current.focus() } catch {}
      }, [props.focus, qualified])
      const toggle = () => setCollapsed((current) => {
        const next = !current
        try { localStorage.setItem(storageKey, String(next)) } catch {}
        return next
      })
      const t = rootT
      return h('div', {
        className: 'gb-card gb-settings-card',
        'data-settings-section': props.diagnostics ? undefined : sectionId,
        'data-settings-module': props.moduleId,
        'data-settings-focused': String(!!props.focus && props.focus.key === qualified),
        ref: sectionRef, tabIndex: -1,
        'data-family-modules': props.diagnostics ? 'true' : undefined,
        'data-settings-collapsed': String(collapsed),
      },
        h('button', {
          type: 'button', className: 'gb-card-head gb-settings-section-head',
          'data-settings-toggle': sectionId,
          'aria-expanded': String(!collapsed), 'aria-controls': bodyId,
          title: collapsed ? t('expand') : t('collapse'),
          onClick: toggle,
          onKeyDown: (event) => {
            if (event.repeat || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar')) return
            event.preventDefault()
            toggle()
          },
        },
          h('span', { className: 'gb-card-title' },
            h('span', { className: 'gb-chevron', 'aria-hidden': 'true' }, collapsed ? '▸' : '▾'), props.title),
          props.badge === undefined ? null : h('span', { className: 'gb-badge', 'data-family-count': String(props.badge) }, String(props.badge))),
        // Keep module controls mounted so folding cannot discard an unsaved inline edit.
        h('div', { className: 'gb-card-body', id: bodyId, hidden: collapsed }, props.children))
    }

    function sectionKey(section) { return (section.moduleId || '@unattributed') + '/' + section.id }
    function openSettingsSection(moduleId, sectionId) {
      const root = ROOT_SETTINGS && ROOT_SETTINGS.root || UI_REGISTRY.root
      const found = moduleId && (UI_REGISTRY.sections.some((section) => section.moduleId === moduleId && section.id === sectionId)
        || root && moduleId === root.id && sectionId === 'general')
      if (!found) return navigationFailure('Settings section unavailable: ' + moduleId + '/' + sectionId)
      SETTINGS_FOCUS = { key: moduleId + '/' + sectionId, token: {} }
      // Public ILayout.selectPanel(MainPanelId); share classified resolution with all other navigation.
      const opened = invokeClientService(ctxRef.current, 'layout', 'selectPanel', [SETTINGS_ID])
      if (opened) uiNotify()
      return opened
    }
    function resetBrowserLayout() {
      const stored = readStoredDocument() || {}
      const catalog = buildCardCatalog()
      setActiveCardCatalog(catalog)
      const known = Array.from(new Set([...currentCardIds(), ...cardIdsOfRows(stored.rows), ...Object.keys(stored.heights || {}), ...Object.keys(stored.collapsed || {})]))
      const layout = known.map((id) => ({ columns: [{ cards: [id] }] }))
      const heights = Object.fromEntries(known.map((id) => [id, defaultCardHeight(id)]))
      if (!writeLayout({ layout, heights, collapsed: {}, knownIds: known })) return navigationFailure('Browser layout could not be saved')
      LAYOUT_RESET_REVISION += 1; uiNotify(); return true
    }
    const SETTINGS_PRESENTATION_CSS = `
.gb-settings-v2 { min-width:0; }
.gb-basic-grid,.gb-advanced-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; min-width:0; }
.gb-basic-card { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:12px; min-width:0; }
.gb-basic-card > h3 { margin:0 0 8px; font-size:14px; }
.gb-basic-effect { font-size:12px; line-height:1.45; opacity:.8; overflow-wrap:anywhere; margin:4px 0 8px; }
.gb-settings-v2 .gb-setting { padding:4px 0; gap:0; min-width:0; }
.gb-settings-v2 .gb-setting label { justify-content:flex-start; align-items:center; gap:8px; min-height:30px; }
.gb-settings-v2 .gb-setting .gb-setting-name { flex:0 1 auto; min-width:0; max-width:calc(100% - 150px); font-size:13px; line-height:16px; overflow-wrap:anywhere; word-break:break-all; }
.gb-settings-v2 .gb-setting .gb-input { flex:0 1 104px; width:104px; }
.gb-settings-v2 .gb-setting input[type="text"] { flex-basis:220px; width:220px; }
.gb-settings-v2 .gb-setting-default { font-size:11px; line-height:14px; opacity:.65; overflow-wrap:anywhere; }
.gb-settings-v2 h4 { margin:14px 0 4px; font-size:13px; }
.gb-settings-v2 .gb-advanced-grid > [data-setting-path="displayLabels"],.gb-settings-v2 .gb-advanced-grid > [data-setting-path="settingsSectionOrder"] { grid-column:1/-1; min-width:0; }
.gb-settings-v2 textarea { width:100%; box-sizing:border-box; }
.gb-card-layout-controls > summary,.gb-advanced-settings > summary { cursor:pointer; padding:8px 0; }
.gb-advanced-settings > summary { border-top:1px solid var(--dsw-alias-border-l1); display:flex; align-items:center; gap:10px; }
.gb-advanced-changed { margin:10px 0 2px; font-size:12px; }
.gb-advanced-settings > summary::before { content:'▸'; }
.gb-advanced-settings[open] > summary::before { content:'▾'; }
.gb-setting-help { display:inline-flex; position:relative; flex:0 0 auto; }
.gb-help-button { appearance:none; display:inline-flex; align-items:center; justify-content:center; padding:0; width:30px; height:30px; border:1px solid var(--dsw-alias-border-l1); border-radius:50%; background:transparent; color:inherit; font:inherit; cursor:pointer; }
.gb-help-button:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.gb-help-popover { position:absolute; z-index:20; top:34px; right:0; width:min(260px,calc(100vw - 110px)); max-width:calc(100vw - 110px); box-sizing:border-box; padding:10px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-container-bg-l1,#242424); color:var(--dsw-alias-text-primary,#eee); box-shadow:0 4px 16px #0005; white-space:normal; line-height:1.5; font-size:12px; overflow-wrap:anywhere; }
@media (min-width:1080px) { .gb-basic-grid { grid-template-columns:repeat(3,minmax(0,1fr)); align-items:start; } }
@media (min-width:960px) { .gb-advanced-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:959px) { .gb-help-popover { position:fixed; top:50%; left:50%; right:auto; transform:translate(-50%,-50%); width:min(320px,calc(100vw - 32px)); max-width:calc(100vw - 32px); } }
@media (max-width:719px) { .gb-settings-v2 .gb-setting label { flex-wrap:wrap; } }
`

    /**
     * Layout chrome text (advanced counts, help label, ...). The slot text is module
     * presentation data, but the layout itself is Widgets-owned: a missing or
     * unresolvable slot falls back to the Widgets dictionary instead of a key.
     */
    function settingsText(labels, key, moduleId, values) {
      let text = resolvedHostText(labels?.[key], moduleId)
      if (!text) text = rootT('settings.presentation.' + key)
      for (const [name, value] of Object.entries(values || {})) text = text.replaceAll('{' + name + '}', String(value))
      return text
    }
    function settingsEqual(a, b) {
      if (Object.is(a, b)) return true
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
      const ak = Object.keys(a).sort(), bk = Object.keys(b).sort()
      return ak.length === bk.length && ak.every((key, i) => key === bk[i] && settingsEqual(a[key], b[key]))
    }
    function settingsEffect(field, labels, moduleId = ROOT_MODULE_ID) {
      const effect = hostText(field?.effect, moduleId).trim(), key = moduleId + '/' + (field?.path || '')
      const description = hostText(field?.descriptionLocales || field?.description, moduleId).trim()
      if (effect) SETTINGS_PRESENTATION_ISSUES.delete(key)
      else SETTINGS_PRESENTATION_ISSUES.set(key, { code: 'settings-effect-missing', inference: 'settings-presentation', field: field?.path, moduleId, fallback: description ? 'description' : 'none', reason: settingsText(labels, 'missingEffectNotice', moduleId) })
      return { text: effect || description, fallback: !effect, missing: !effect && !description }
    }
    /**
     * Settings card-list row identity. A module card's title belongs to the module
     * that registered it (the root section is only the renderer); a failed lookup is
     * unreadable, never the reference key.
     */
    function settingsCardEntry(entry, descriptors, moduleId, cards, fallbackLabel) {
      const groupDescriptor = ((descriptors && descriptors.cardGroups) || []).find(group => group.id === entry.id)
      const cardModuleId = entry.kind === 'core' ? moduleId : entry.moduleId || uiModuleIdOf(entry.definition || {})
      const declared = resolvedHostText(entry.kind === 'core' ? groupDescriptor && groupDescriptor.title : entry.definition && entry.definition.title, cardModuleId).trim()
      const rawIds = (cards || []).flatMap(card => [card.id, card.cardId, card.moduleId]).filter(Boolean).map(String)
      const readable = !!declared && !rawIds.includes(declared)
      const fallback = descriptors && descriptors.cardGroupFallback
      const title = readable ? declared : resolvedHostText(fallback && fallback.title, moduleId) || fallbackLabel || ''
      const source = readable ? entry.kind === 'core' ? groupDescriptor && groupDescriptor.source : { contract: 'bbffUi.registerCard', moduleId: entry.moduleId, cardId: entry.cardId, field: 'title' } : (fallback && fallback.source) || undefined
      return { readable, groupDescriptor, cardModuleId, title, source }
    }
    function settingsLayoutModel(descriptors, values = {}, moduleId = ROOT_MODULE_ID) {
      const fields = descriptors?.settings || [], p = descriptors?.presentation, invalid = () => ({ valid: false, fields, basicGroups: [], advancedGroups: [], changedAdvanced: 0 })
      if (p?.version !== 2 || !Array.isArray(p.basicGroups) || p.basicGroups.length !== 3) return invalid()
      const used = new Set(), orders = new Set()
      const basicGroups = p.basicGroups.map(group => {
        const selected = fields.filter(field => field.importance === 'basic' && field.basicGroup === group.id), order = selected[0]?.basicOrder
        if (!group.id || !resolvedHostText(group.title, moduleId) || !selected.length || !Number.isInteger(order) || orders.has(order) || selected.some(field => field.basicOrder !== order || used.has(field.path))) return null
        orders.add(order); selected.forEach(field => used.add(field.path))
        return { ...group, order, fields: selected }
      }).sort((a, b) => (a?.order || 0) - (b?.order || 0))
      if (!basicGroups.every(Boolean) || fields.some(field => field.importance === 'basic' && !used.has(field.path))) return invalid()
      const advanced = fields.filter(field => !used.has(field.path))
      const declared = Array.isArray(p.advancedGroups) ? p.advancedGroups : []
      const advancedGroups = declared.map(group => ({ ...group, fields: advanced.filter(field => field.advancedGroup === group.id) })).filter(group => group.fields.length)
      const assigned = new Set(advancedGroups.flatMap(group => group.fields.map(field => field.path)))
      if (advanced.some(field => !assigned.has(field.path))) advancedGroups.push({ id: '@remaining', title: p.labels?.advancedTitle, fields: advanced.filter(field => !assigned.has(field.path)) })
      return { valid: true, fields, presentation: p, basicGroups, advancedGroups, advanced, changedAdvanced: advanced.filter(field => !settingsEqual(values[field.path], field.default)).length }
    }
    function renderSettingsLayout(props) {
      const moduleId = props.moduleId || ROOT_MODULE_ID, model = settingsLayoutModel(props.descriptors, props.values, moduleId), labels = props.descriptors?.presentation?.labels
      if (!model.valid) return h('div', { 'data-settings-legacy': true }, props.legacyChildren || model.fields.map(field => props.renderField(field, { basic: false, legacy: true })), props.advancedFooter)
      return h('div', { className: 'gb-settings-v2', 'data-settings-layout': 2 }, h('style', null, SETTINGS_PRESENTATION_CSS),
        h('div', { className: 'gb-basic-grid', 'data-settings-basics': true }, model.basicGroups.map(group => h('section', { className: 'gb-basic-card', key: group.id, 'data-basic-group': group.id },
          h('h3', null, resolvedHostText(group.title, moduleId)), group.fields.map(field => props.renderField(field, { basic: true, group }))))),
        h('button', { type: 'button', className: 'gb-btn gb-advanced-changed', 'data-advanced-changed': model.changedAdvanced, onClick: () => props.onOpenChange(true) }, settingsText(labels, 'advancedChanged', moduleId, { count: model.changedAdvanced })),
        h('details', { className: 'gb-advanced-settings', 'data-settings-advanced': true, open: !!props.open },
          h('summary', { onClick: event => { event.preventDefault(); props.onOpenChange(!props.open) } }, settingsText(labels, 'advancedTitle', moduleId), h('span', { className: 'gb-hint' }, settingsText(labels, 'advancedCount', moduleId, { count: model.advanced.length }))),
          model.advancedGroups.map(group => h('section', { key: group.id, 'data-advanced-group': group.id }, h('h4', null, resolvedHostText(group.title, moduleId) || settingsText(labels, 'advancedTitle', moduleId)),
            h('div', { className: 'gb-advanced-grid' }, group.fields.map(field => props.renderField(field, { basic: false, group }))))), props.advancedFooter))
    }
    function SettingsLayout(props) {
      const [open, setOpen] = React.useState(false)
      return renderSettingsLayout({ ...props, open, onOpenChange: setOpen })
    }
    function SettingHelp(props) {
      const [open, setOpen] = React.useState(false), ref = React.useRef(null), id = React.useRef('gb-setting-help-' + (++SETTING_HELP_SEQUENCE))
      const moduleId = props.moduleId || ROOT_MODULE_ID, labels = props.labels || props.descriptors?.presentation?.labels
      const explanation = settingsEffect(props.field, labels, moduleId), label = settingsText(labels, 'helpLabel', moduleId)
      React.useEffect(() => {
        if (!open || typeof document === 'undefined') return
        const close = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
        document.addEventListener('pointerdown', close)
        return () => document.removeEventListener('pointerdown', close)
      }, [open])
      if (!explanation.text) return null
      return h('span', { className: 'gb-setting-help', ref, onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } } },
        h('button', { type: 'button', className: 'gb-help-button', 'aria-label': label + ' · ' + hostText(props.field?.displayLabel, moduleId), 'aria-expanded': !!open, 'aria-controls': id.current, onClick: event => { event.preventDefault(); event.stopPropagation(); setOpen(value => !value) } }, '?'),
        open ? h('span', { className: 'gb-help-popover', role: 'tooltip', id: id.current, 'data-setting-effect': props.field?.path }, explanation.text) : null)
    }

    /** Host display notes are message references: render text, never a reference object. */
    function mcpCompletenessRow(value) {
      return value ? h('div', { className: 'gb-hint', 'data-mcp-completeness-note': 'true' }, hostText(value)) : null
    }

    /** "Language files" block: the user folder, template export and live reload. */
    function LanguageFilesBlock() {
      const t = rootT
      const value = LOCALE_VALUE || {}
      const [busy, setBusy] = React.useState('')
      const [message, setMessage] = React.useState('')
      useUiVersion()
      const run = (task) => {
        setBusy('1'); setMessage('')
        Promise.resolve().then(task).then(
          (text) => { setMessage(String(text || '')); setBusy('') },
          (error) => { setMessage(t('settings.language.failed', { detail: errorMessage(error) })); setBusy('') })
      }
      return h('div', { className: 'gb-setting', 'data-language-files': 'true' },
        h('h3', null, t('settings.language.title')),
        h('p', { className: 'gb-hint', 'data-language-folder': true }, t('settings.language.folder', { path: String(value.userDir || '') })),
        h('p', { className: 'gb-hint', 'data-language-hint': true }, t('settings.language.hint')),
        h('p', { className: 'gb-hint', 'data-language-active': true }, t('settings.language.active', { language: activeLocaleId() })),
        h('div', { className: 'gb-row' },
          h('button', { type: 'button', className: 'gb-btn', disabled: !!busy, 'data-language-export': 'true', onClick: () => run(async () => {
            const result = await post({ action: 'locales-template' })
            if (!result || result.ok === false) throw new Error(errorMessage(result) || 'template')
            return t('settings.language.exported', { path: String(result.path || ''), bytes: Number(result.bytes) || 0 })
          }) }, t('settings.language.export')),
          h('button', { type: 'button', className: 'gb-btn', disabled: !!busy, 'data-language-reload': 'true', onClick: () => run(async () => { await loadLocales(); return t('settings.language.reloaded') }) }, t('settings.language.reload'))),
        message ? h('p', { className: 'gb-hint', 'data-language-message': true, role: 'status' }, message) : null)
    }

    function RootGeneralSettings() {
      const payload = useRootSettings()
      const moduleId = ROOT_MODULE_ID
      const settingsSessionId = useUiSession()
      const settingsState = useSessionState(settingsSessionId)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [edits, setEdits] = React.useState({})
      const [advancedOpen, setAdvancedOpen] = React.useState(false)
      if (!payload) return spinner('settings')
      const descriptors = payload.descriptors || { settings: [], cardFields: [], displayLabels: [] }
      const fields = descriptors.settings || []
      const presentationLabels = descriptors.presentation?.labels
      const modern = settingsLayoutModel(descriptors, payload.settings, moduleId).valid
      for (const field of fields) settingsEffect(field, presentationLabels, moduleId)
      if (descriptors.presentation && !modern) SETTINGS_PRESENTATION_ISSUES.set('@groups', { code: 'settings-groups-invalid', inference: 'settings-presentation', reason: settingsText(presentationLabels, 'invalidGroupsNotice', moduleId) })
      else SETTINGS_PRESENTATION_ISSUES.delete('@groups')
      const descriptor = path => fields.find(field => field.path === path)
      const label = field => hostText(field?.displayLabel, moduleId) || rootT('settings.missingDisplayName')
      const mutate = async (patch, reset) => {
        setBusy(true); setError('')
        try {
          const result = await post(reset ? { action: 'settings-reset', revision: payload.revision } : { action: 'settings-update', revision: payload.revision, patch })
          acceptSettings(result, { preserveLayout: !!reset && !!result && result.ok !== false })
          if (!result || result.ok === false) setError([result && result.code, errorMessage(result)].filter(Boolean).join(' · '))
          else setEdits({})
        } catch (reason) { setError(errorMessage(reason)) }
        finally { setBusy(false) }
      }
      // One visible default line. Paths/ranges/descriptions retain their Host source in the tooltip.
      const tooltip = (field, extra) => JSON.stringify({ ...field?.source, limits: field?.limits, description: field?.description, ...extra })
      const defaultText = value => typeof value === 'boolean' ? (value ? rootT('settings.presentation.valueOn') : rootT('settings.presentation.valueOff')) : Array.isArray(value) && !value.length ? rootT('settings.presentation.automatic') : value && typeof value === 'object' ? rootT('settings.presentation.contractDefault') : String(value ?? rootT('settings.presentation.missingValue'))
      const modernDefaultText = value => typeof value === 'boolean' ? settingsText(presentationLabels, value ? 'valueOn' : 'valueOff', moduleId) : Array.isArray(value) && !value.length ? settingsText(presentationLabels, 'automatic', moduleId) : value && typeof value === 'object' ? settingsText(presentationLabels, 'contractDefault', moduleId) : String(value ?? settingsText(presentationLabels, 'missingValue', moduleId))
      const info = (field, value = field?.default, extra) => h(modern ? 'span' : 'div', { className: modern ? 'gb-setting-default' : 'gb-hint', 'data-setting-default': 'true', title: modern ? undefined : tooltip(field, extra) }, (modern ? settingsText(presentationLabels, 'defaultPrefix', moduleId) : rootT('settings.presentation.defaultPrefix')) + (modern ? modernDefaultText(value) : defaultText(value)))
      const input = (field, value, key, attributes, save) => field.control === 'checkbox'
        ? h('input', { type: 'checkbox', checked: value, disabled: busy, ...attributes, onChange: event => save(!!event.target.checked) })
        : h('input', { className: 'gb-input', type: field.control === 'text' ? 'text' : 'number', value: edits[key] ?? value ?? '', min: field.limits?.min, max: field.limits?.max, maxLength: field.limits?.maxLength, disabled: busy, ...attributes,
            onChange: event => setEdits(current => ({ ...current, [key]: event.target.value })),
            onBlur: event => { const next = field.control === 'text' ? event.target.value : Number(event.target.value); if (event.target.value !== '' && next !== value) save(next) } })
      const ordinary = fields.filter(field => field.control === 'number' || field.control === 'checkbox').map(field => h('div', { className: 'gb-setting', key: field.path, 'data-setting-path': field.path, title: tooltip(field) },
        h('label', null, label(field), input(field, payload.settings[field.path], field.path, { 'data-setting-control': field.path }, value => mutate({ [field.path]: value }))), info(field)))
      const cards = buildCardCatalog()
      const updateCard = (id, key, value) => mutate({ cardPreferences: { ...payload.settings.cardPreferences, [id]: { ...(payload.settings.cardPreferences[id] || {}), [key]: value } } })
      const prefs = cards.map(entry => {
        const base = entry.kind === 'core' ? payload.cardDefaults[entry.id] : { ...payload.cardPreferenceDefaults, ...entry.definition }
        const cardEntry = settingsCardEntry(entry, descriptors, moduleId, cards, label(descriptor('cardPreferences')))
        const groupDescriptor = cardEntry.groupDescriptor, groupTitle = cardEntry.title, groupSource = cardEntry.source || descriptor('cardPreferences')?.source
        return h('div', { className: 'gb-setting', key: entry.id, 'data-card-preference': entry.id }, h('strong', { title: modern ? undefined : JSON.stringify(groupSource) }, groupTitle),
          (descriptors.cardFields || []).map(field => h('div', { key: field.path, 'data-card-field': entry.id + '/' + field.path, title: modern ? undefined : tooltip(field, { settingPath: 'cardPreferences.' + entry.id + '.' + field.path, defaultSource: entry.kind === 'module' ? entry.moduleId + ' / descriptor / cardPreferenceDefaults' : 'cardDefaults' }) },
            h('label', null, label(field), input(field, entry[field.path], entry.id + '/' + field.path,
              field.path === 'visible' ? { 'data-card-visible': entry.id } : { 'data-card-setting': entry.id + '/' + field.path }, value => updateCard(entry.id, field.path, value)), modern ? h(SettingHelp, { field, moduleId, labels: presentationLabels }) : null), info(field, base[field.path]))))
      })
      const displayLabels = (descriptors.displayLabels || []).map(field => h('div', { className: 'gb-setting', key: field.path, 'data-label-path': field.path, title: modern ? undefined : tooltip(field) },
        h('label', null, label(field), input({ ...field, control: 'text', limits: descriptors.labelLimits }, payload.settings.displayLabels?.[field.path], 'label/' + field.path, { 'data-label-control': field.path }, value => mutate({ displayLabels: { [field.path]: value } })), modern ? h(SettingHelp, { field, moduleId, labels: presentationLabels }) : null), info(field)))
      if (settingsSessionId && !displayReady(settingsState.data, 'settings')) return h('div', null,
        ordinary.find(row => row.props['data-setting-path'] === 'showDiagnostics'), spinner('settings'),
        h(EngineeringDiagnostics, { data: settingsState.data, payload, sessionId: settingsSessionId, error }))
      const renderField = (field, context = {}) => {
        const explanation = settingsEffect(field, presentationLabels, moduleId), rowHelp = () => h(SettingHelp, { field, moduleId, labels: presentationLabels })
        const effectLine = context.basic && explanation.text ? h('p', { className: 'gb-basic-effect', 'data-basic-effect': field.path }, explanation.text) : null
        if (field.control === 'cards') return h('div', { 'data-setting-path': field.path, 'data-setting-composite': true },
          effectLine, h('p', { className: 'gb-hint', 'data-card-summary': true }, settingsText(presentationLabels, 'cardSummary', moduleId, { visible: cards.filter(card => card.visible !== false).length, total: cards.length })),
          h('details', { className: 'gb-card-layout-controls', 'data-card-layout-controls': true }, h('summary', null, settingsText(presentationLabels, 'cardLayoutLabel', moduleId)), prefs,
            h('button', { type: 'button', className: 'gb-btn', disabled: busy, 'data-layout-reset': 'true', title: settingsText(presentationLabels, 'resetLayoutEffect', moduleId), onClick: resetBrowserLayout }, settingsText(presentationLabels, 'resetLayoutLabel', moduleId))))
        if (field.control === 'section-order') return h('div', { className: 'gb-setting', 'data-setting-path': field.path },
          h('label', null, label(field), rowHelp()), h('textarea', { className: 'gb-textarea', 'data-settings-order': 'true', value: edits.settingsSectionOrder ?? payload.settings.settingsSectionOrder.join('\n'), disabled: busy,
            onChange: event => setEdits(current => ({ ...current, settingsSectionOrder: event.target.value })) }),
          h('button', { type: 'button', className: 'gb-btn', disabled: busy || edits.settingsSectionOrder === undefined, onClick: () => mutate({ settingsSectionOrder: String(edits.settingsSectionOrder).split('\n').map(value => value.trim()).filter(Boolean) }) }, settingsText(presentationLabels, 'saveOrderLabel', moduleId)), info(field))
        if (field.control === 'display-labels') return h('details', { className: 'gb-setting', 'data-setting-path': field.path },
          h('summary', null, label(field)), rowHelp(), info(field), displayLabels)
        return h('div', { className: 'gb-setting', 'data-setting-path': field.path },
          h('label', null, h('span', { className: 'gb-setting-name' }, label(field)), input(field, payload.settings[field.path], field.path, { 'data-setting-control': field.path }, value => mutate({ [field.path]: value })), rowHelp()), info(field), effectLine)
      }
      if (modern) return h('div', { 'data-root-settings-presentation': 2 },
        h(LanguageFilesBlock),
        renderSettingsLayout({ descriptors, values: payload.settings, moduleId, open: advancedOpen, onOpenChange: setAdvancedOpen, renderField,
          advancedFooter: h('button', { type: 'button', className: 'gb-btn', disabled: busy, 'data-settings-reset': 'true', title: settingsText(presentationLabels, 'resetSettingsEffect', moduleId), onClick: () => mutate(null, true) }, settingsText(presentationLabels, 'resetSettingsLabel', moduleId)) }),
        error ? h('p', { role: 'alert' }, rootT('settings.saveFailed')) : null,
        h(EngineeringDiagnostics, { data: settingsState.data, payload, sessionId: settingsSessionId, error }))
      return h('div', null, ordinary,
        !fields.length ? h('p', { role: 'alert' }, rootT('settings.descriptorsUnavailable')) : null,
        error ? h('p', { role: 'alert' }, rootT('settings.saveFailed')) : null,
        h('div', { className: 'gb-setting', 'data-setting-path': 'cardPreferences', title: tooltip(descriptor('cardPreferences')) }, h('h3', null, label(descriptor('cardPreferences'))), info(descriptor('cardPreferences')), prefs,
          h('button', { className: 'gb-btn', disabled: busy, 'data-layout-reset': 'true', title: rootT('settings.resetLayoutTitle'), onClick: resetBrowserLayout }, settingsText(presentationLabels, 'resetLayoutLabel', moduleId))),
        h('div', { className: 'gb-setting', 'data-setting-path': 'settingsSectionOrder', title: tooltip(descriptor('settingsSectionOrder'), payload.settingsSectionRule) }, h('label', null, label(descriptor('settingsSectionOrder')),
          h('textarea', { className: 'gb-textarea', 'data-settings-order': 'true', value: edits.settingsSectionOrder ?? payload.settings.settingsSectionOrder.join('\n'), disabled: busy,
            onChange: event => setEdits(current => ({ ...current, settingsSectionOrder: event.target.value })) })),
          h('button', { className: 'gb-btn', disabled: busy || edits.settingsSectionOrder === undefined, onClick: () => mutate({ settingsSectionOrder: String(edits.settingsSectionOrder).split('\n').map(value => value.trim()).filter(Boolean) }) }, settingsText(presentationLabels, 'saveOrderLabel', moduleId)), info(descriptor('settingsSectionOrder'))),
        h('details', { 'data-setting-path': 'displayLabels', title: tooltip(descriptor('displayLabels')) }, h('summary', null, label(descriptor('displayLabels'))), info(descriptor('displayLabels')), displayLabels),
        h(EngineeringDiagnostics, { data: settingsState.data, payload, sessionId: settingsSessionId, error }),
        h(LanguageFilesBlock),
        h('button', { className: 'gb-btn', disabled: busy, 'data-settings-reset': 'true', title: rootT('settings.resetTitle'), onClick: () => mutate(null, true) }, settingsText(presentationLabels, 'resetSettingsLabel', moduleId)))
    }

    function SettingsPanel() {
      const t = rootT
      const payload = useRootSettings()
      const [error, setError] = React.useState('')
      const [loaded, setLoaded] = React.useState(false)
      const [reload, setReload] = React.useState(0)
      React.useEffect(() => { captureClientError('family', error) }, [error])
      React.useEffect(() => {
        let cancelled = false
        post({ action: 'family' }).then((value) => {
          if (cancelled) return
          if (!value || value.ok === false) { setError(errorMessage(value)); return }
          UI_REGISTRY.familyModules = (value.modules || []).filter((module) => module && typeof module.id === 'string')
          UI_REGISTRY.root = value.root || null; UI_REGISTRY.diagnostics = value.diagnostics || []
          syncModuleNamespaces({ root: value.root, modules: UI_REGISTRY.familyModules })
          setLoaded(true); setError(''); uiNotify()
        }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)) })
        return () => { cancelled = true }
      }, [reload])
      const root = payload && payload.root || UI_REGISTRY.root
      const modules = UI_REGISTRY.familyModules.filter((module) => !root || module.id !== root.id)
      const sections = UI_REGISTRY.sections.slice()
      if (root && root.id) sections.push({ id: 'general', moduleId: root.id, title: messageRef('settings.generalTitle'), component: RootGeneralSettings, rootGeneral: true })
      const order = payload && payload.settings.settingsSectionOrder || []
      sections.sort((a, b) => {
        const ai = order.indexOf(sectionKey(a)), bi = order.indexOf(sectionKey(b))
        if (ai >= 0 || bi >= 0) return (ai >= 0 ? ai : order.length) - (bi >= 0 ? bi : order.length)
        if (a.rootGeneral !== b.rootGeneral) return a.rootGeneral ? -1 : 1
        const fallback = payload && payload.cardPreferenceDefaults && payload.cardPreferenceDefaults.order
        return (a.order ?? fallback ?? 0) - (b.order ?? fallback ?? 0) || sectionKey(a).localeCompare(sectionKey(b))
      })
      return h('div', { className: 'gb-root gb-settings-root' }, h('style', null, CSS),
        h('div', { className: 'gb-head' }, h('div', null, h('h2', { className: 'gb-title' }, t('settingsTitle')), h('p', { className: 'gb-sub' }, t('settingsSub'))),
          h('button', { className: 'gb-btn', 'data-family-retry': 'true', onClick: () => { setReload((value) => value + 1); ensureRootSettings().catch((reason) => setError(errorMessage(reason))) } }, t('modulesRetry'))),
        h('div', { className: 'gb-body' },
          null,
          ...sections.map((section) => h(SettingsSection, { key: sectionKey(section), sectionId: section.id, moduleId: section.moduleId, focus: SETTINGS_FOCUS, title: localizedTitle(section.title, section.moduleId) },
            null,
            h(section.component, { moduleId: section.moduleId, kit: kitFor(section.moduleId), t: kitFor(section.moduleId).t }))),
          null))
    }

    /** Session goal: the right-sidebar tab body, resident while the session is open. */
    function GoalTabPanel(props) {
      const t = rootT
      const orderingText = key => localizedTitle(ROOT_SETTINGS?.descriptors?.listOrdering?.[key])
      const goalOrderingBasis = entry => entry.orderBasis || (Number.isSafeInteger(entry.completedAt) && entry.phase === 'complete' ? 'completedAt' : Number.isSafeInteger(entry.updatedAt) ? 'updated-fallback' : Number.isSafeInteger(entry.createdAt) ? 'created-fallback' : 'unknown-time')
      const goalOrderingText = entry => orderingText(goalOrderingBasis(entry) === 'unknown-time' ? 'goal-unknown-time' : goalOrderingBasis(entry))
      // 0.14.0 family root: push the live catalog (core + registered cards) into the
      // layout helpers before any state is read, then render from the same catalog.
      useUiVersion()
      const catalog = buildCardCatalog()
      setActiveCardCatalog(catalog)
      const sessionId = String((props && props.sessionId) || '')
      const sharedState = useSessionState(sessionId)
      const data = sharedState.data
      const [draft, setDraft] = React.useState({ objective: '', maxGoalRounds: '' })
      const [busy, setBusy] = React.useState('')
      const [expandedTasks, setExpandedTasks] = React.useState({})
      const [error, setError] = React.useState('')
      const tick = sharedState.sequence
      // Layout is pure front-end state: card contents refresh, the arrangement does not.
      const [layout, setLayout] = React.useState(() => readLayout().layout)
      // 0.7.0: per-card max height, stored beside the rows in the same layout document.
      const [heights, setHeights] = React.useState(() => readLayout().heights)
      // 0.11.0: per-card collapsed state, stored beside the rows/heights in the same document.
      const [collapsed, setCollapsed] = React.useState(() => readLayout().collapsed)
      const [drag, setDrag] = React.useState(null)
      const cardRefs = React.useRef({})
      const dividerDrag = React.useRef(null)
      const rootRef = React.useRef(null)
      const heightDrag = React.useRef(null)
      const stackDrag = React.useRef(null)
      const columnRefs = React.useRef({})
      const heightsRef = React.useRef(heights)
      heightsRef.current = heights
      const collapsedRef = React.useRef(collapsed)
      collapsedRef.current = collapsed
      // 0.14.0: registered cards join the layout. On first registration (or unload) the
      // stored document is read raw once so `legacyIds` can be rewritten generically;
      // afterwards the state is simply re-normalized against the new catalog.
      const catalogKey = catalog.map((entry) => entry.id).join('|')
      const preferenceKey = JSON.stringify(catalog.map(({ id, order, defaultHeight }) => ({ id, order, defaultHeight })))
      const preferenceRef = React.useRef(null)
      React.useEffect(() => {
        const previous = preferenceRef.current
        preferenceRef.current = catalog.map(({ id, order, defaultHeight }) => ({ id, order, defaultHeight }))
        if (!previous || ROOT_SETTINGS && ROOT_SETTINGS.revision === PRESERVE_LAYOUT_SETTINGS_REVISION) return
        const stored = readStoredDocument()
        const hydrating = previous.some((entry) => entry.defaultHeight === undefined) && !!ROOT_SETTINGS
        // A newly registered/reloaded card is not a user request to sort old rows.
        const orderChanged = catalog.some((entry) => { const old = previous.find((item) => item.id === entry.id); return old && old.order !== undefined && old.order !== entry.order })
        let nextLayout = hydrating && !stored ? defaultLayout() : layout
        if (orderChanged) {
          const rank = new Map(catalog.map((entry) => [entry.id, entry.order]))
          const score = (row) => Math.min(...row.columns.flatMap((column) => column.cards).map((id) => rank.get(id) ?? Number.MAX_SAFE_INTEGER))
          nextLayout = layout.slice().sort((a, b) => score(a) - score(b))
        }
        const nextHeights = { ...heightsRef.current }
        let heightChanged = false
        for (const entry of catalog) {
          const old = previous.find((item) => item.id === entry.id)
          const uncustomized = old && (nextHeights[entry.id] === old.defaultHeight || old.defaultHeight === undefined && nextHeights[entry.id] === STATUS_HEIGHT_MIN && !(stored && stored.heights && stored.heights[entry.id] !== undefined))
          if (uncustomized && Number.isFinite(entry.defaultHeight) && old.defaultHeight !== entry.defaultHeight) { nextHeights[entry.id] = entry.defaultHeight; heightChanged = true }
        }
        if (nextLayout !== layout || heightChanged) {
          setLayout(nextLayout); setHeights(nextHeights); heightsRef.current = nextHeights
          // Publish rows+heights together so a simultaneous order/height update cannot undo either.
          writeLayout({ layout: nextLayout, heights: nextHeights, collapsed: collapsedRef.current, knownIds: panelKnownIds() })
        }
      }, [preferenceKey])
      React.useEffect(() => {
        if (!LAYOUT_RESET_REVISION) return
        const stored = readStoredDocument()
        const known = Array.from(new Set([...currentCardIds(), ...cardIdsOfRows(stored.rows), ...Object.keys(stored.heights || {})]))
        setLayout(normalizeLayout(stored.rows, known)); setHeights(normalizeHeights(stored.heights, known)); setCollapsed(normalizeCollapsed(stored.collapsed, known))
      }, [LAYOUT_RESET_REVISION])
      const previousCatalogRef = React.useRef('')
      /** Ids that must survive normalization: the live catalog plus retained slots. */
      const panelKnownIds = () => {
        const ids = new Set(currentCardIds())
        for (const row of Array.isArray(layout) ? layout : []) {
          for (const column of (row && Array.isArray(row.columns) ? row.columns : [])) {
            for (const id of (column && Array.isArray(column.cards) ? column.cards : [])) ids.add(id)
          }
        }
        for (const id of Object.keys(heights || {})) ids.add(id)
        for (const id of Object.keys(collapsed || {})) ids.add(id)
        return Array.from(ids)
      }
      React.useEffect(() => {
        const liveIds = new Set(currentCardIds())
        const previousIds = new Set(previousCatalogRef.current.split('|').filter(Boolean))
        previousCatalogRef.current = catalogKey
        const added = Array.from(liveIds).some((id) => !previousIds.has(id))
        const migrated = migrateLegacyIds(catalog)
        if (migrated) {
          const known = Array.from(new Set([
            ...currentCardIds(),
            ...cardIdsOfRows(migrated.rows),
            ...Object.keys(migrated.heights || {}),
            ...Object.keys(migrated.collapsed || {}),
          ]))
          const nextLayout = normalizeLayout(migrated.rows, known)
          const nextHeights = normalizeHeights(migrated.heights, known)
          const nextCollapsed = normalizeCollapsed(migrated.collapsed, known)
          setLayout(nextLayout)
          setHeights(nextHeights)
          heightsRef.current = nextHeights
          setCollapsed(nextCollapsed)
          writeLayout({ layout: nextLayout, heights: nextHeights, collapsed: nextCollapsed, knownIds: known })
          return
        }
        if (!added) return
        const known = panelKnownIds()
        setLayout((current) => normalizeLayout(current, known))
        setHeights((current) => normalizeHeights(current, known))
        setCollapsed((current) => normalizeCollapsed(current, known))
      }, [catalogKey])
      React.useEffect(() => { setUiSessionId(sessionId) }, [sessionId])
      // 0.13.0: skills/tools/MCP exposure      // 0.13.0: skills/tools/MCP exposure for this session (host engine owns enforcement).
      const [exposure, setExposure] = React.useState({ status: sessionId ? 'loading' : 'idle', data: null, error: '', toggling: '' })
      const [expandedMcp, setExpandedMcp] = React.useState({})

      React.useEffect(() => { setError(sharedState.error || '') }, [sharedState.error])
      React.useEffect(() => { captureClientError('state-or-goal', error) }, [error])
      React.useEffect(() => { captureClientError('exposure', exposure.error) }, [exposure.error])

      // Exposure: one read per session      // Exposure: one read per session; a toggle response carries a refreshed report.
      React.useEffect(() => {
        if (!sessionId) { setExposure({ status: 'idle', data: null, error: '', toggling: '' }); return }
        let cancelled = false
        if (exposure.toggling) return
        setExposure((state) => ({ ...state, status: state.data && state.data.sessionId === sessionId ? 'ready' : 'loading', error: '' }))
        fetchExposure(sessionId).then((value) => {
          if (cancelled) return
          const payload = normalizeExposure(value)
          if (!payload) {
            setExposure({ status: 'unavailable', data: null, error: errorMessage(value), toggling: '' })
            return
          }
          rememberExposure(sessionId, payload); setExposure({ status: 'ready', data: payload, error: '', toggling: '' })
        }).catch((reason) => {
          if (cancelled) return
          setExposure({ status: 'unavailable', data: null, error: errorMessage(reason), toggling: '' })
        })
        return () => { cancelled = true }
      }, [sessionId, tick])

      const rawGoal = (data && data.goal) || null
      // A completed goal is terminal: it belongs to history, not to the editor.
      const goal = rawGoal && rawGoal.phase !== 'complete' ? rawGoal : null
      const completedGoal = rawGoal && rawGoal.phase === 'complete' ? rawGoal : null
      const stamp = goal ? goal.id + ':' + goal.revision + ':' + goal.objective : ''
      React.useEffect(() => {
        if (!goal) { setDraft({ objective: '', maxGoalRounds: '' }); return }
        setDraft({ objective: goal.objective || '', maxGoalRounds: goal.maxGoalRounds ? String(goal.maxGoalRounds) : '' })
      }, [stamp])

      const act = (op, extra) => {
        if (!sessionId) return
        setBusy(op)
        post({ action: 'goal', sessionId, op, ...(extra || {}) })
          .then((value) => {
            if (value && value.ok === false) { setError(String(value.error || t('error'))); return }
            setError('')
            publishSessionState(sessionId, value, '')
          })
          .catch((reason) => setError(String(reason && reason.message ? reason.message : reason)))
          .finally(() => setBusy(''))
      }

      const todos = (data && data.todos) || []
      const collab = (data && data.collab) || { team: null, subagents: [] }
      const teamPending = !displayReady(data, 'team')
      const placeholderCard = (id, title, keys) => h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' }, h('div', { className: 'gb-card-title' }, titleToggle(id, title))),
        h('div', { className: 'gb-card-body' }, spinner(id)))
      const historyBase = ((data && data.goalHistory) || []).slice()
      if (completedGoal && !historyBase.some((entry) => entry.id === completedGoal.id)) historyBase.unshift(completedGoal)
      // Host sorts the complete collection using persisted completion evidence before any filtering.
      const history = historyBase.filter((entry) => !goal || entry.id !== goal.id)
      const live = !!(data && data.session && data.session.live)
      const buttons = []
      if (!goal) {
        buttons.push(h('button', {
          key: 'create', className: 'gb-btn', 'data-primary': 'true', disabled: !!busy || !draft.objective.trim(),
          onClick: () => act('create', { objective: draft.objective, maxGoalRounds: Number(draft.maxGoalRounds) || undefined }),
        }, busy === 'create' ? '…' : t('create')))
      } else {
        buttons.push(h('button', {
          key: 'save', className: 'gb-btn', disabled: !!busy || !draft.objective.trim(),
          onClick: () => {
            const changed = {}
            if (draft.objective !== goal.objective) changed.objective = draft.objective
            if (draft.maxGoalRounds !== String(goal.maxGoalRounds ?? '') && draft.maxGoalRounds !== '') changed.maxGoalRounds = Number(draft.maxGoalRounds)
            if (Object.keys(changed).length) act('edit', changed)
          },
        }, busy === 'edit' ? '…' : t('save')))
        if (goal.phase === 'active' && goal.activation === 'armed') {
          buttons.push(h('button', { key: 'pause', className: 'gb-btn', disabled: !!busy, onClick: () => act('pause') }, t('pause')))
        } else {
          buttons.push(h('button', { key: 'resume', className: 'gb-btn', 'data-primary': 'true', disabled: !!busy, onClick: () => act('resume') }, t('resume')))
        }
        if (goal.phase !== 'complete') {
          buttons.push(h('button', { key: 'complete', className: 'gb-btn', disabled: !!busy, onClick: () => act('complete') }, t('complete')))
        }
        buttons.push(h('button', { key: 'clear', className: 'gb-btn', 'data-danger': 'true', disabled: !!busy, onClick: () => act('clear') }, t('clear')))
      }

      /**
       * Optimistic exposure toggle (0.13.0): flip the checkbox immediately, POST the
       * change, replace the report on success and revert + show the error on failure.
       * The widget never disables anything itself — the host engine enforces it.
       */
      const toggleExposure = (kind, name, enabled) => {
        if (!sessionId || !name || exposure.toggling) return
        const previous = exposure.data
        if (!previous) return
        const key = kind + ':' + name
        const patch = (data, nextEnabled) => {
          if (!data) return data
          if (kind === 'skill' || kind === 'tool') {
            const field = kind === 'skill' ? 'skills' : 'tools'
            return { ...data, [field]: data[field].map((entry) => (entry.name === name ? { ...entry, enabled: nextEnabled } : entry)) }
          }
          return { ...data, mcp: data.mcp.map((entry) => (entry.server === name ? { ...entry, enabled: nextEnabled } : entry)) }
        }
        setExposure((state) => ({ ...state, data: patch(state.data, enabled), toggling: key, error: '' }))
        postExposureToggle({ sessionId, kind, name, enabled }).then((value) => {
          if (!value || value.ok === false) {
            setExposure({ status: 'ready', data: previous, error: errorMessage(value) || t('exposureToggleFailed'), toggling: '' })
            return
          }
          const payload = normalizeExposure(value)
          if (payload) {
            rememberExposure(sessionId, payload); setExposure({ status: 'ready', data: payload, error: '', toggling: '' })
            return
          }
          setExposure((state) => ({ ...state, toggling: '', error: '' }))
        }).catch((reason) => {
          setExposure({ status: 'ready', data: previous, error: errorMessage(reason) || t('exposureToggleFailed'), toggling: '' })
        })
      }

      /** Persist a layout change; a broken localStorage must never break the panel. */
      const commitLayout = (next) => {
        const known = panelKnownIds()
        const normalized = normalizeLayout(next, known)
        setLayout(normalized)
        writeLayout({ layout: normalized, heights: heightsRef.current, collapsed: collapsedRef.current, knownIds: known })
      }

      /** Persist a height change (the card heights live beside the rows in one document). */
      const commitHeights = (next) => {
        const known = panelKnownIds()
        const normalized = normalizeHeights(next, known)
        setHeights(normalized)
        heightsRef.current = normalized
        writeLayout({ layout, heights: normalized, collapsed: collapsedRef.current, knownIds: known })
      }

      const isCollapsed = (id) => collapsed[id] === true

      /** Toggle one card's collapsed state; the docking structure and shares are untouched. */
      const toggleCollapse = (id) => {
        if (!currentCardIds().includes(id)) return
        const next = { ...collapsedRef.current }
        if (next[id] === true) delete next[id]
        else next[id] = true
        setCollapsed(next)
        collapsedRef.current = next
        writeLayout({ layout, heights: heightsRef.current, collapsed: next, knownIds: panelKnownIds() })
      }

      /** The clickable card title: a real button-like control toggling this card's body. */
      const titleToggle = (id, label) => {
        const isCollapsedCard = isCollapsed(id)
        return h('button', {
          type: 'button',
          className: 'gb-title-toggle',
          role: 'button',
          tabIndex: 0,
          'aria-expanded': String(!isCollapsedCard),
          'aria-label': label + ' · ' + (isCollapsedCard ? t('expandCard') : t('collapseCard')),
          title: isCollapsedCard ? t('expandCard') : t('collapseCard'),
          'data-card-toggle': id,
          'data-collapsed': String(isCollapsedCard),
          onClick: (event) => {
            try { event.stopPropagation(); event.preventDefault() } catch {}
            toggleCollapse(id)
          },
          onKeyDown: (event) => {
            if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
            try { event.preventDefault(); event.stopPropagation() } catch {}
            toggleCollapse(id)
          },
        }, h('span', { className: 'gb-chevron', 'aria-hidden': 'true' }, isCollapsedCard ? '▸' : '▾'), label)
      }

      const heightOf = (id) => clampCardHeight(heights[id], defaultCardHeight(id))
      /** 0.11.0: a collapsed card occupies only its head height in the layout math. */
      const cardRenderedHeight = (id) => (isCollapsed(id) ? STATUS_HEAD_HEIGHT : heightOf(id))

      /** The tallest a card may become inside this panel viewport (never above 900px). */
      const panelHeightLimit = () => {
        try {
          const node = rootRef.current
          const rect = node && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null
          const height = rect ? Number(rect.height) : NaN
          if (Number.isFinite(height) && height > STATUS_HEIGHT_MIN) {
            return Math.max(STATUS_HEIGHT_MIN, Math.min(STATUS_HEIGHT_MAX, Math.floor(height - 24)))
          }
        } catch {}
        return STATUS_HEIGHT_MAX
      }

      /** Visible natural (content) height of a stacked column. */
      const columnNaturalOf = (column) => column.cards.reduce((sum, cardId) => (cardElements[cardId] ? sum + cardRenderedHeight(cardId) : sum), 0)

      /**
       * Bottom-edge resize. Three modes:
       *   column — bottom-most stacked card: the whole stack's overall max height;
       *   stack  — other stacked cards: that card's share (the adjacent boundary);
       *   height — single card: that card's px max height.
       */
      const startHeightDrag = (event, id) => {
        if (!event) return
        if (event.button !== undefined && event.button !== 0) return
        try { event.preventDefault() } catch {}
        try { event.stopPropagation() } catch {}
        const handle = event.currentTarget
        try {
          if (handle && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) handle.setPointerCapture(event.pointerId)
        } catch {}
        const found = locateCard(layout, id)
        const column = found ? layout[found.rowIndex].columns[found.columnIndex] : null
        if (found && column && column.cards.length > 1) {
          const last = found.cardIndex === column.cards.length - 1
          if (last) {
            const natural = columnNaturalOf(column)
            const startHeight = column.maxHeight !== undefined ? column.maxHeight : natural
            heightDrag.current = {
              id,
              mode: 'column',
              rowIndex: found.rowIndex,
              columnIndex: found.columnIndex,
              startY: Number(event.clientY),
              startHeight,
              height: startHeight,
              limit: panelHeightLimit(),
              layout,
            }
            return
          }
          const columnNode = columnRefs.current[found.rowIndex + ':' + found.columnIndex]
          let rect = null
          try { rect = columnNode && typeof columnNode.getBoundingClientRect === 'function' ? columnNode.getBoundingClientRect() : null } catch { rect = null }
          const columnHeight = rect ? Number(rect.height) : 0
          if (columnHeight > 0) {
            heightDrag.current = {
              id,
              mode: 'stack',
              rowIndex: found.rowIndex,
              columnIndex: found.columnIndex,
              cardIndex: found.cardIndex,
              startY: Number(event.clientY),
              columnHeight,
              startShares: column.heights.slice(),
              layout,
            }
            return
          }
        }
        const startHeight = clampCardHeight(heightsRef.current[id], defaultCardHeight(id))
        heightDrag.current = { id, mode: 'height', startY: Number(event.clientY), startHeight, height: startHeight, limit: panelHeightLimit() }
      }

      const moveHeightDrag = (event) => {
        const state = heightDrag.current
        if (!state || !event) return
        const y = Number(event.clientY)
        if (!Number.isFinite(y)) return
        try { event.preventDefault() } catch {}
        if (state.mode === 'column') {
          const limit = Math.max(STATUS_COLUMN_HEIGHT_MIN, Math.min(STATUS_HEIGHT_MAX, state.limit))
          const next = Math.max(STATUS_COLUMN_HEIGHT_MIN, Math.min(limit, Math.round(state.startHeight + (y - state.startY))))
          if (next === state.height) return
          state.height = next
          const nextLayout = setColumnMaxHeight(state.layout, state.rowIndex, state.columnIndex, next)
          state.layout = nextLayout
          setLayout(nextLayout)
          return
        }
        if (state.mode === 'stack') {
          const count = state.startShares.length
          const last = state.cardIndex === count - 1
          // The bottom card grows by moving the boundary above it (inverted delta).
          const boundary = last ? count - 2 : state.cardIndex
          const direction = last ? -1 : 1
          const delta = ((y - state.startY) / state.columnHeight) * direction
          const nextShares = resizeSharePair(state.startShares, boundary, delta)
          const nextLayout = setColumnShares(state.layout, state.rowIndex, state.columnIndex, nextShares)
          state.layout = nextLayout
          setLayout(nextLayout)
          return
        }
        const next = Math.max(STATUS_HEIGHT_MIN, Math.min(state.limit, clampCardHeight(state.startHeight + (y - state.startY), state.startHeight)))
        if (next === state.height) return
        state.height = next
        setHeights((current) => (current[state.id] === next ? current : { ...current, [state.id]: next }))
      }

      const endHeightDrag = (event) => {
        const state = heightDrag.current
        if (!state) return
        heightDrag.current = null
        if (event) { try { event.preventDefault() } catch {} }
        if (state.mode === 'column' || state.mode === 'stack') {
          writeLayout({ layout: normalizeLayout(state.layout, panelKnownIds()), heights: heightsRef.current, collapsed: collapsedRef.current, knownIds: panelKnownIds() })
          return
        }
        commitHeights({ ...heightsRef.current, [state.id]: state.height })
      }

      const cancelHeightDrag = () => {
        if (heightDrag.current) endHeightDrag(null)
      }

      /**
       * Double-click: single card resets its px height; the bottom-most stacked card
       * resets the column's overall max height to auto; other stacked cards equalize shares.
       */
      const resetCardHeight = (id) => {
        const found = locateCard(layout, id)
        const column = found ? layout[found.rowIndex].columns[found.columnIndex] : null
        if (found && column && column.cards.length > 1) {
          if (found.cardIndex === column.cards.length - 1) {
            commitLayout(setColumnMaxHeight(layout, found.rowIndex, found.columnIndex, undefined))
            return
          }
          commitLayout(setColumnShares(layout, found.rowIndex, found.columnIndex, equalShares(column.cards.length)))
          return
        }
        commitHeights({ ...heightsRef.current, [id]: defaultCardHeight(id) })
      }

      const resizeCardByKey = (id, event) => {
        if (!event) return
        const up = event.key === 'ArrowUp'
        const down = event.key === 'ArrowDown'
        if (!up && !down) return
        try { event.preventDefault() } catch {}
        const found = locateCard(layout, id)
        const column = found ? layout[found.rowIndex].columns[found.columnIndex] : null
        if (found && column && column.cards.length > 1) {
          const count = column.cards.length
          const last = found.cardIndex === count - 1
          if (last) {
            const current = column.maxHeight !== undefined ? column.maxHeight : columnNaturalOf(column)
            const limit = Math.max(STATUS_COLUMN_HEIGHT_MIN, Math.min(STATUS_HEIGHT_MAX, panelHeightLimit()))
            const next = Math.max(STATUS_COLUMN_HEIGHT_MIN, Math.min(limit, current + (up ? STATUS_HEIGHT_STEP : -STATUS_HEIGHT_STEP)))
            commitLayout(setColumnMaxHeight(layout, found.rowIndex, found.columnIndex, next))
            return
          }
          const boundary = last ? count - 2 : found.cardIndex
          const delta = last ? (down ? -0.05 : 0.05) : (down ? 0.05 : -0.05)
          commitLayout(setColumnShares(layout, found.rowIndex, found.columnIndex, resizeSharePair(column.heights, boundary, delta)))
          return
        }
        const step = up ? STATUS_HEIGHT_STEP : -STATUS_HEIGHT_STEP
        const current = clampCardHeight(heightsRef.current[id], defaultCardHeight(id))
        const next = Math.max(STATUS_HEIGHT_MIN, Math.min(panelHeightLimit(), current + step))
        commitHeights({ ...heightsRef.current, [id]: next })
      }

      const sameDrop = (left, right) => {
        if (left === right) return true
        if (!left || !right) return false
        return left.kind === right.kind && left.rowIndex === right.rowIndex
          && left.columnIndex === right.columnIndex && left.targetId === right.targetId
      }

      /** Measured visible card frames (row/column aware), in render order, for hit testing. */
      const collectDropTargets = () => {
        const targets = []
        for (let rowIndex = 0; rowIndex < layout.length; rowIndex++) {
          const row = layout[rowIndex]
          for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex++) {
            const column = row.columns[columnIndex]
            for (let cardIndex = 0; cardIndex < column.cards.length; cardIndex++) {
              const id = column.cards[cardIndex]
              if (!cardElements[id]) continue
              const node = cardRefs.current[id]
              if (!node || typeof node.getBoundingClientRect !== 'function') continue
              let rect = null
              try { rect = node.getBoundingClientRect() } catch { rect = null }
              if (!rect) continue
              targets.push({
                id,
                rowIndex,
                columnIndex,
                cardIndex,
                rowKind: row.columns.length > 1 ? 'split' : 'single',
                slot: row.columns.length > 1 ? (columnIndex === 0 ? 'left' : 'right') : null,
                columnLength: column.cards.length,
                rect,
              })
            }
          }
        }
        return targets
      }

      const startCardDrag = (event, id) => {
        if (!event) return
        if (event.button !== undefined && event.button !== 0) return
        try { event.preventDefault() } catch {}
        try { event.stopPropagation() } catch {}
        const handle = event.currentTarget
        try {
          if (handle && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) handle.setPointerCapture(event.pointerId)
        } catch {}
        setDrag({ id, drop: null })
      }

      const moveCardDrag = (event) => {
        if (!drag || !event) return
        try { event.preventDefault() } catch {}
        const drop = hitTestDrop(collectDropTargets(), Number(event.clientX), Number(event.clientY))
        const next = drop && drop.targetId === drag.id ? null : drop
        setDrag((state) => {
          if (!state || sameDrop(state.drop, next)) return state
          return { ...state, drop: next }
        })
      }

      const endCardDrag = (event) => {
        if (!drag) return
        if (event) { try { event.preventDefault() } catch {} }
        const dragged = drag.id
        const drop = drag.drop
        setDrag(null)
        if (!drop) return
        if (drop.kind === 'dock-left' || drop.kind === 'dock-right') {
          commitLayout(dockCard(layout, dragged, drop.targetId, drop.kind === 'dock-left' ? 'left' : 'right'))
        } else if (drop.kind === 'dock-top' || drop.kind === 'dock-bottom') {
          commitLayout(dockCard(layout, dragged, drop.targetId, drop.kind === 'dock-top' ? 'top' : 'bottom'))
        } else {
          commitLayout(moveCard(layout, dragged, { rowIndex: drop.rowIndex, position: drop.kind === 'insert-before' ? 'before' : 'after', targetId: drop.targetId }))
        }
      }

      const cancelCardDrag = () => setDrag(null)

      const moveCardByStep = (id, direction) => {
        const found = locateCard(layout, id)
        if (!found) return
        const targetIndex = found.rowIndex + direction
        if (targetIndex < 0 || targetIndex >= layout.length) return
        commitLayout(moveCard(layout, id, { rowIndex: targetIndex, position: direction < 0 ? 'before' : 'after' }))
      }

      /** Horizontal divider between columns `boundary` and `boundary + 1`. */
      const startDividerDrag = (event, rowIndex, boundaryIndex) => {
        if (!event) return
        if (event.button !== undefined && event.button !== 0) return
        try { event.preventDefault() } catch {}
        const handle = event.currentTarget
        const rowNode = handle && handle.parentElement
        let rect = null
        try { rect = rowNode && typeof rowNode.getBoundingClientRect === 'function' ? rowNode.getBoundingClientRect() : null } catch { rect = null }
        if (!rect || !(Number(rect.width) > 0)) return
        try {
          if (handle && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) handle.setPointerCapture(event.pointerId)
        } catch {}
        dividerDrag.current = { rowIndex, boundaryIndex, rect, layout, startWidths: layout[rowIndex].widths.slice() }
      }

      const moveDividerDrag = (event) => {
        const state = dividerDrag.current
        if (!state || !event) return
        try { event.preventDefault() } catch {}
        const x = Number(event.clientX)
        if (!Number.isFinite(x)) return
        const target = (x - Number(state.rect.left)) / Number(state.rect.width)
        const before = state.startWidths.slice(0, state.boundaryIndex + 1).reduce((sum, value) => sum + value, 0)
        const next = setRowWidths(state.layout, state.rowIndex, resizeSharePair(state.startWidths, state.boundaryIndex, target - before))
        state.layout = next
        setLayout(next)
      }

      const endDividerDrag = () => {
        const state = dividerDrag.current
        dividerDrag.current = null
        if (!state) return
        writeLayout({ layout: normalizeLayout(state.layout, panelKnownIds()), heights: heightsRef.current, collapsed: collapsedRef.current, knownIds: panelKnownIds() })
      }

      const nudgeDivider = (event, rowIndex, boundaryIndex) => {
        if (!event || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
        try { event.preventDefault() } catch {}
        const row = layout[rowIndex]
        if (!row || row.columns.length < 2) return
        const delta = event.key === 'ArrowLeft' ? -0.05 : 0.05
        commitLayout(setRowWidths(layout, rowIndex, resizeSharePair(row.widths, boundaryIndex, delta)))
      }

      /** Vertical divider between stacked cards `boundary` and `boundary + 1`. */
      const startStackDrag = (event, rowIndex, columnIndex, boundaryIndex) => {
        if (!event) return
        if (event.button !== undefined && event.button !== 0) return
        try { event.preventDefault() } catch {}
        try { event.stopPropagation() } catch {}
        const handle = event.currentTarget
        const columnNode = handle && handle.parentElement
        let rect = null
        try { rect = columnNode && typeof columnNode.getBoundingClientRect === 'function' ? columnNode.getBoundingClientRect() : null } catch { rect = null }
        if (!rect || !(Number(rect.height) > 0)) return
        try {
          if (handle && typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) handle.setPointerCapture(event.pointerId)
        } catch {}
        stackDrag.current = {
          rowIndex,
          columnIndex,
          boundaryIndex,
          rect,
          layout,
          startShares: layout[rowIndex].columns[columnIndex].heights.slice(),
        }
      }

      const moveStackDrag = (event) => {
        const state = stackDrag.current
        if (!state || !event) return
        try { event.preventDefault() } catch {}
        const y = Number(event.clientY)
        if (!Number.isFinite(y)) return
        const target = (y - Number(state.rect.top)) / Number(state.rect.height)
        const before = state.startShares.slice(0, state.boundaryIndex + 1).reduce((sum, value) => sum + value, 0)
        const next = setColumnShares(state.layout, state.rowIndex, state.columnIndex, resizeSharePair(state.startShares, state.boundaryIndex, target - before))
        state.layout = next
        setLayout(next)
      }

      const endStackDrag = () => {
        const state = stackDrag.current
        stackDrag.current = null
        if (!state) return
        writeLayout({ layout: normalizeLayout(state.layout, panelKnownIds()), heights: heightsRef.current, collapsed: collapsedRef.current, knownIds: panelKnownIds() })
      }

      const nudgeStack = (event, rowIndex, columnIndex, boundaryIndex) => {
        if (!event || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        try { event.preventDefault() } catch {}
        const row = layout[rowIndex]
        const column = row && row.columns[columnIndex]
        if (!column || column.cards.length < 2) return
        const delta = event.key === 'ArrowUp' ? -0.05 : 0.05
        commitLayout(setColumnShares(layout, rowIndex, columnIndex, resizeSharePair(column.heights, boundaryIndex, delta)))
      }

      if (!data) return h('div', { className: 'gb-root', ref: rootRef },
        h('style', null, CSS), h('div', { className: 'gb-head' }, h('h2', { className: 'gb-title' }, t('statusTitle'))),
        h('div', { className: 'gb-body' }, spinner('state')))

      const goalCard = h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' }, h('div', { className: 'gb-card-title' }, titleToggle('goal', t('goalTitle')))),
        h('div', { className: 'gb-card-body' },
          null,
          goal ? h('div', null,
            h('div', { className: 'gb-row', style: { marginBottom: '6px' } },
              h('span', { className: 'gb-badge', 'data-phase': goal.phase }, phaseLabel(t, goal.phase)),
              h('span', { className: 'gb-badge' }, goal.activation === 'armed' ? t('armed') : t('disarmed'))),
            h('div', { className: 'gb-meter' },
              h('div', { className: 'gb-meter-fill', style: { width: Math.min(100, goal.maxGoalRounds > 0 ? (goal.roundsStarted / goal.maxGoalRounds) * 100 : 0) + '%' } })))
            : null,
          completedGoal ? h('div', { className: 'gb-meta', style: { marginBottom: '6px' } }, t('recentComplete')) : null,
          h('textarea', {
            className: 'gb-textarea', value: draft.objective, placeholder: t('objective'),
             'data-goal-objective': 'true',
            style: { marginTop: '8px' },
            onChange: (event) => setDraft({ ...draft, objective: event.target.value }),
          }),
          h('div', { className: 'gb-row' },
             h('span', { className: 'gb-label' }, t('rounds')),
            h('input', {
              className: 'gb-input', inputMode: 'numeric', value: draft.maxGoalRounds,
              placeholder: goal ? String(goal.maxGoalRounds ?? '') : data && data.goalDefaults && data.goalDefaults.value && data.goalDefaults.value.maxGoalRounds !== undefined ? String(data.goalDefaults.value.maxGoalRounds) : '—',
              onChange: (event) => setDraft({ ...draft, maxGoalRounds: event.target.value.replace(/[^0-9]/g, '') }),
            }),
            h('div', { style: { flex: 1 } }),
            buttons)))

      const historyCard = h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' }, h('div', { className: 'gb-card-title', title: orderingText('goal-history') }, titleToggle('history', t('history')))),
        h('div', { className: 'gb-card-body' },
          null,
          history.length === 0
            ? (!displayReady(data, 'history') ? spinner('history') : h('div', { className: 'gb-empty' }, t('historyEmpty')))
            : h('div', { className: 'gb-list' }, history.map((entry) => h('div', {
              key: entry.id,
              className: 'gb-item',
              'data-status': entry.phase === 'complete' ? 'completed' : entry.phase === 'active' ? 'in_progress' : entry.phase === 'blocked' ? 'error' : 'pending',
              'data-order-basis': goalOrderingBasis(entry),
              title: entry.objective + ' · ' + goalOrderingText(entry),
            },
              h('span', { className: 'gb-dot' }, entry.phase === 'complete' ? '✓' : entry.phase === 'active' ? '•' : ''),
              h('span', { className: 'gb-text' }, entry.objective, goalOrderingBasis(entry) !== 'completedAt' ? h('span', { className: 'gb-meta', style: { display: 'block' }, 'data-order-fallback': true }, goalOrderingText(entry)) : null),
              h('span', { className: 'gb-meta', style: { flex: '0 0 auto' } },
                phaseLabel(t, entry.phase) + ' · ' + (entry.roundsStarted !== undefined ? entry.roundsStarted + '/' : t('rounds') + ' ') + (entry.maxGoalRounds ?? '—')))))))

      // 0.2.2 has no separate teammate set: the team is the Lead's native tree.
      // Widgets adds the owner's distinction: core seats keep a long-lived
      // responsibility; outsourced rows are dispatches Lead/core members reuse.
      // The single Team card shows Lead+Core on the left and Outsourced right;
      // narrow dock widths wrap the second column below the first.
      const teamMembers = collab.team ? collab.team.members : []
      const teamCounts = collab.team && collab.team.counts ? collab.team.counts : null
      const leadMember = teamMembers.find((member) => member.kind === 'lead') || teamMembers[0]
      const restMembers = leadMember ? teamMembers.filter((member) => member !== leadMember) : teamMembers
      const coreMembers = restMembers.filter((member) => member.tier === 'core')
      const outsourcedMembers = restMembers.filter((member) => member.tier !== 'core')
      const dispatcherLabel = (value) => {
        if (!value) return ''
        const found = teamMembers.find((member) => member.id === value || member.name === value || member.alias === value)
        return found ? (found.alias || found.name) : String(value)
      }
      const outsourcedFor = (member) => outsourcedMembers.filter((row) => row.dispatchedBy === member.id || row.dispatchedBy === member.name || (member.alias && row.dispatchedBy === member.alias)).length
      // The badge answers "how many outsourced agents did THIS member dispatch":
      // prefer Team's direct `outsourcedCount`; `outsourcedDescendants` is only a
      // fallback (e.g. for the Lead it equals the whole outsourced total and would
      // duplicate the header). Last resort: count the rows currently shown.
      const declaredOutsourced = (member) => {
        const value = member.outsourcedCount !== undefined ? member.outsourcedCount : member.outsourcedDescendants
        return Number.isFinite(value) ? value : null
      }
      const teamMemberRow = (member, options = {}) => {
        const outCount = options.core ? (declaredOutsourced(member) ?? outsourcedFor(member)) : 0
        return h('div', {
          key: member.id,
          className: 'gb-member',
          role: 'button',
          tabIndex: 0,
          'data-status': member.status,
          'data-running': String(!!member.running),
          'data-tier': member.kind === 'lead' ? 'core' : (member.tier || 'outsourced'),
          'data-current': String(member.current),
          title: member.description || member.name,
          'aria-disabled': String(!(member.resource && member.resource.openable && member.resource.navigationTarget)),
          onClick: () => openSessionTarget(ctxRef.current, member, collab.team),
          onKeyDown: (event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openSessionTarget(ctxRef.current, member, collab.team)
            }
          },
        },
          h('span', { className: member.running ? 'gb-dot gb-dot-running' : 'gb-dot', title: member.running ? t('status_running') : undefined }),
          h('span', { className: 'gb-member-body' },
            h('span', { className: 'gb-member-name' }, member.alias || member.name, outCount > 0 ? h('span', { className: 'gb-badge', 'data-outsourced-count': String(outCount) }, outCount + ' ' + t('outsourcedGroup')) : null, annotationBadges(member.display?.annotations)),
            h('span', { className: 'gb-member-meta' },
              [member.role || (member.kind === 'lead' ? t('roleLead') : (member.kind === 'oneshot' || member.kind === 'one-shot') ? t('oneshot') : t('unbound')), (t['status_' + member.status] || member.status), member.current ? t('current') : null].filter(Boolean).join(' · ')),
            (member.routeLabel || member.route) ? h('span', { className: 'gb-member-meta', 'data-route-line': 'true' }, member.routeLabel || routeLine(member.route, t)) : null,
            (member.tier !== 'core' && member.kind !== 'lead' && member.dispatchedBy) ? h('span', { className: 'gb-member-meta' }, t('via') + ' ' + dispatcherLabel(member.dispatchedBy)) : null),
          canOpenMemberAside(collab.team, member) ? h('button', {
            key: 'aside',
            type: 'button',
            className: 'gb-member-open',
            title: 'Open in sidebar',
            'aria-label': 'Open in sidebar',
            onClick: (event) => {
              event.preventDefault()
              event.stopPropagation()
              openMemberAside(ctxRef.current, collab.team, member)
            },
            onKeyDown: (event) => { event.stopPropagation() },
          }, h(ChevronRightIcon, null)) : null)
      }
      const coreTotal = teamCounts ? teamCounts.core : (leadMember ? 1 : 0) + coreMembers.length
      const outsourcedTotal = teamCounts ? teamCounts.outsourced + teamCounts.outsourcedOmitted : outsourcedMembers.length
      const teamDataCard = collab.team ? h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' },
          h('div', { className: 'gb-card-title' }, titleToggle('team', t('team'))),
          h('span', { className: 'gb-badge', 'data-team-counts': 'core:' + coreTotal + ',outsourced:' + outsourcedTotal }, t('coreGroup') + ' ' + coreTotal + ' · ' + t('outsourcedGroup') + ' ' + outsourcedTotal)),
        h('div', { className: 'gb-card-body' },
          null,
          h('div', { className: 'gb-team-columns', 'data-team-columns': 'two' },
            h('div', { className: 'gb-team-column', 'data-team-group': 'core' },
              h('div', { className: 'gb-team-column-title' }, t('coreGroup')),
              leadMember ? teamMemberRow(leadMember, { core: true }) : null,
              coreMembers.length === 0 ? null : h('div', { className: 'gb-members' }, coreMembers.map((member) => teamMemberRow(member, { core: true }))),
              coreMembers.length === 0 ? h('div', { className: 'gb-empty', style: { padding: '4px 0' } }, '—') : null),
            h('div', { className: 'gb-team-column', 'data-team-group': 'outsourced' },
              h('div', { className: 'gb-team-column-title' }, t('outsourcedGroup') + ' · ' + outsourcedTotal),
              outsourcedMembers.length === 0 ? h('div', { className: 'gb-empty', style: { padding: '4px 0' } }, '—') : h('div', { className: 'gb-members' }, outsourcedMembers.map((member) => teamMemberRow(member))),
              teamCounts && teamCounts.outsourcedOmitted > 0 ? h('div', { className: 'gb-meta', 'data-outsourced-omitted': String(teamCounts.outsourcedOmitted), style: { padding: '4px 2px 0' } }, '+' + teamCounts.outsourcedOmitted + ' ' + t('outsourcedGroup')) : null))))
        : null

      const teamTasksDataCard = collab.team ? h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' },
          h('div', { className: 'gb-card-title' }, titleToggle('teamTasks', t('teamTasks'))),
          h('span', { className: 'gb-badge' }, String(collab.team.tasks.length))),
        h('div', { className: 'gb-card-body' },
          null,
          collab.team.tasks.length === 0
            ? (teamPending ? null : h('div', { className: 'gb-empty', style: { padding: '12px 0' } }, t('noTasks')))
            : h('div', { className: 'gb-list', title: orderingText('creation-order'), 'data-order-basis': 'creation-order' }, collab.team.tasks.map((task) => h('div', {
              key: task.id, className: 'gb-task', 'data-status': task.status,
            },
              h('div', { className: 'gb-task-head' },
                h('span', {
                  className: 'gb-dot',
                  style: task.status === 'completed' ? { background: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-primary)' } : task.status === 'in_progress' ? { borderColor: 'var(--dsw-alias-state-warn-primary)' } : null,
                }),
                h('span', { className: 'gb-task-subject' }, task.subject),
                h('span', { className: 'gb-member-meta' },
                  (task.ownerName || '—') + ' · ' + (t['task_' + task.status] || task.status)),
                task.description
                  ? h('button', {
                    className: 'gb-del',
                    style: { marginLeft: 'auto' },
                    onClick: () => setExpandedTasks((state) => ({ ...state, [task.id]: !state[task.id] })),
                  }, expandedTasks[task.id] ? t('collapse') : t('expand'))
                  : null),
              expandedTasks[task.id] ? h('div', { className: 'gb-task-desc' }, task.description) : null)))))
        : null

      const teamCard = teamPending ? placeholderCard('team', t('team')) : teamDataCard
      const teamTasksCard = teamPending ? placeholderCard('teamTasks', t('teamTasks')) : teamTasksDataCard
      const todosCard = h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' }, h('div', { className: 'gb-card-title' }, titleToggle('todos', t('agentTodos')))),
        h('div', { className: 'gb-card-body' },
          null,
          todos.length === 0
            ? (!displayReady(data, 'todos') ? spinner('todos') : h('div', { className: 'gb-empty' }, t('agentTodosEmpty')))
            : h('div', { className: 'gb-list' }, todos.map((item, index) => h('div', {
              key: index, className: 'gb-item', 'data-status': item.status,
            },
              h('span', { className: 'gb-dot' }, item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '•' : ''),
              h('span', { className: 'gb-text' }, item.content))))))

      // 0.13.0: skills / tools / MCP exposure cards. The widget renders the host report
      // and posts toggles; the host engine owns the actual per-session disable.
      const exposureData = exposure.data
      const exposureReady = exposure.status === 'ready' && !!exposureData && (!exposureData.display || exposureData.display.ready === true)
      const skillList = exposureData && Array.isArray(exposureData.skills) ? exposureData.skills : []
      const toolList = exposureData && Array.isArray(exposureData.tools) ? exposureData.tools : []
      const mcpList = exposureData && Array.isArray(exposureData.mcp) ? exposureData.mcp : []
      const countLabel = list => String(list.filter(entry => entry.enabled && entry.available !== false).length) + '/' + String(list.length)
      const stopToggleClick = (event) => { try { event.stopPropagation() } catch {} }
      /** One checkbox row for a skill or a tool. */
      const exposureRow = (kind, entry, sourceLabel) => h('div', {
        key: kind + ':' + String(entry.name || ''),
        className: 'gb-file-row',
        title: entry.description ? String(entry.description) : String(entry.name || ''),
        'data-exposure-row': kind + ':' + String(entry.name || ''),
        'data-exposure-available': String(entry.available !== false),
        'data-exposure-by': entry.by || undefined,
      },
        h('input', {
          type: 'checkbox',
          className: 'gb-check',
          checked: !!entry.enabled && entry.available !== false,
          disabled: !!exposure.toggling || entry.available === false || entry.toggleable === false,
          'data-exposure-toggle': kind + ':' + String(entry.name || ''),
          'aria-label': String(entry.name || '') + ' · ' + (entry.enabled ? t('exposureOn') : t('exposureOff')),
          onChange: () => { if (entry.available !== false && entry.toggleable !== false) toggleExposure(kind, entry.name, !entry.enabled) },
          onClick: stopToggleClick,
        }),
        h('div', { className: 'gb-exposure-main' },
          h('span', { className: 'gb-file-name' }, String(entry.name || '')),
          null,
          entry.description ? h('span', { className: 'gb-exposure-desc' }, String(entry.description)) : null,
          availabilityText(entry) ? h('span', { className: 'gb-hint', 'data-exposure-reason': kind, title: availabilityText(entry) }, availabilityText(entry)) : null),
        sourceBadge(entry, kind),
        null)
      /** Body states shared by the three exposure cards. */
      const exposureBody = (rows, emptyText) => !exposureReady ? [spinner('exposure')]
        : [rows.length ? h('div', { className: 'gb-list' }, rows) : h('div', { className: 'gb-empty' }, emptyText)]
      const skillsCard = h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' },
          h('div', { className: 'gb-card-title' }, titleToggle('skills', t('skillsTitle'))),
          exposureReady ? h('span', { className: 'gb-badge', 'data-exposure-count': 'skills' }, countLabel(skillList)) : null),
        h('div', { className: 'gb-card-body' },
          exposureBody(skillList.map((entry) => exposureRow('skill', entry, entry.source ? String(entry.source) : '')), t('skillsEmpty'))))
      const toolsCard = h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' },
          h('div', { className: 'gb-card-title' }, titleToggle('tools', t('toolsTitle'))),
          null,
          exposureReady ? h('span', { className: 'gb-badge', 'data-exposure-count': 'tools' }, countLabel(toolList)) : null),
        h('div', { className: 'gb-card-body' },
          exposureBody(toolList.map((entry) => exposureRow('tool', entry)), t('toolsEmpty'))))
      /** One MCP server row (checkbox disables all its tools for this session). */
      const mcpRow = (entry) => {
        const server = String(entry.server || '')
        const tools = Array.isArray(entry.tools) ? entry.tools : []
        const expanded = !!expandedMcp[server]
        const toolCount = Number(entry.toolCount) || tools.length
        return h('div', { key: 'mcp:' + server, className: 'gb-exposure-block', 'data-exposure-server': server },
          h('div', {
            className: 'gb-file-row',
            title: tools.length > 0 ? tools.join(', ') : server,
            'data-exposure-row': 'mcp:' + server,
            'data-exposure-available': String(entry.available !== false),
            'data-exposure-by': entry.by || undefined,
          },
            h('input', {
              type: 'checkbox',
              className: 'gb-check',
              checked: !!entry.enabled && entry.available !== false,
              disabled: !!exposure.toggling || entry.available === false || entry.toggleable === false,
              'data-exposure-toggle': 'mcp:' + server,
              'aria-label': server + ' · ' + (entry.connected ? t('mcpConnected') : t('mcpDisconnected')),
              onChange: () => { if (entry.available !== false && entry.toggleable !== false) toggleExposure('mcp', server, !entry.enabled) },
              onClick: stopToggleClick,
            }),
            h('div', { className: 'gb-exposure-main' },
              h('span', { className: 'gb-file-name' }, server),
              availabilityText(entry) ? h('span', { className: 'gb-hint', 'data-exposure-reason': 'mcp', title: availabilityText(entry) }, availabilityText(entry)) : null),
            sourceBadge(entry, 'mcp'),
            h('span', { className: 'gb-badge', 'data-mcp-count': server }, String(toolCount) + ' ' + t('mcpTools')),
            tools.length > 0
              ? h('button', {
                type: 'button',
                className: 'gb-btn',
                'data-mcp-expand': server,
                'aria-expanded': String(expanded),
                onClick: (event) => {
                  stopToggleClick(event)
                  setExpandedMcp((state) => ({ ...state, [server]: !state[server] }))
                },
              }, expanded ? t('mcpCollapse') : t('mcpExpand'))
              : null),
          expanded && tools.length > 0
            ? h('div', { className: 'gb-mcp-tools' }, tools.map((name) => h('span', { key: String(name), className: 'gb-mcp-tool' }, String(name))))
            : null)
      }
      const mcpCard = h('div', { className: 'gb-card' },
        h('div', { className: 'gb-card-head' },
          h('div', { className: 'gb-card-title' }, titleToggle('mcp', t('mcpTitle'))),
          exposureReady ? h('span', { className: 'gb-badge', 'data-exposure-count': 'mcp' }, countLabel(mcpList)) : null),
        h('div', { className: 'gb-card-body' },
          exposureBody(mcpList.map((entry) => mcpRow(entry)), t('mcpEmpty')),
          mcpCompletenessRow(exposureData?.display?.mcpCompletenessNote)))

      // A card with no data keeps its layout slot without rendering anything.
      const cardElements = {
        skills: skillsCard, tools: toolsCard, mcp: mcpCard,
        goal: displayReady(data, 'goal') ? goalCard : placeholderCard('goal', t('goalTitle')), history: displayReady(data, 'history') ? historyCard : placeholderCard('history', t('history')),
        team: teamCard, teamTasks: teamTasksCard, todos: displayReady(data, 'todos') ? todosCard : placeholderCard('todos', t('agentTodos')),
      }
      // 0.14.0: every registered card renders with root-owned chrome (head with the
      // collapse title) and the module component as its body; layout/drag/resize are
      // the same code paths as the core cards.
      for (const entry of catalog) {
        if (entry.kind !== 'module' || !entry.definition) continue
        cardElements[entry.id] = h('div', { className: 'gb-card' },
          h('div', { className: 'gb-card-head' },
            h('div', { className: 'gb-card-title' }, titleToggle(entry.id, entry.title || entry.definition.id))),
          h('div', { className: 'gb-card-body' },
            h(entry.definition.component, { moduleId: entry.moduleId || uiModuleIdOf(entry.definition), sessionId, kit: kitFor(entry.moduleId || uiModuleIdOf(entry.definition)), t: kitFor(entry.moduleId || uiModuleIdOf(entry.definition)).t })))
      }

      for (const entry of catalog) if (entry.visible === false) delete cardElements[entry.id]

      /**
       * One card plus its drag handle, bottom resize strip and live drop overlay.
       * `resizeMode` is 'height' (single card px), 'share' (stack share) or 'column'
       * (bottom-most stacked card: the stack's overall max height).
       */
      const wrapCard = (id, card, fill, stacked, share, resizeMode, resizeValue, collapsedCard) => {
        const cardHeight = heightOf(id)
        const stackShare = Number.isFinite(Number(share)) ? Number(share) : 1
        const mode = resizeMode === 'column' ? 'column' : resizeMode === 'share' ? 'share' : 'height'
        const columnHeightValue = Number.isFinite(Number(resizeValue)) ? Number(resizeValue) : cardHeight
        const resizeTitle = mode === 'column' ? t('resizeColumnHint') : mode === 'share' ? t('resizeStackHint') : t('resizeCardHint')
        const resizeMin = mode === 'column' ? STATUS_COLUMN_HEIGHT_MIN : mode === 'share' ? Math.round(STATUS_SHARE_MIN * 100) : STATUS_HEIGHT_MIN
        const resizeMax = mode === 'share' ? Math.round((1 - STATUS_SHARE_MIN) * 100) : STATUS_HEIGHT_MAX
        const resizeNow = mode === 'column' ? Math.round(columnHeightValue) : mode === 'share' ? Math.round(stackShare * 100) : cardHeight
        const drop = drag && drag.drop && drag.drop.targetId === id ? drag.drop : null
        const dropLabel = drop
          ? (drop.kind === 'dock-left' ? t('dockLeft')
            : drop.kind === 'dock-right' ? t('dockRight')
              : drop.kind === 'dock-top' ? t('dockTop')
                : drop.kind === 'dock-bottom' ? t('dockBottom')
                  : '')
          : ''
        return h('div', {
          key: id,
          className: 'gb-card-wrap',
          'data-card-id': id,
          'data-card-height': String(cardHeight),
          'data-stacked': String(!!stacked),
          'data-card-share': String(Math.round(stackShare * 1000) / 1000),
          'data-dragging': String(!!drag && drag.id === id),
          'data-collapsed': String(!!collapsedCard),
          ref: (node) => { cardRefs.current[id] = node },
          style: { minWidth: 0, '--gb-card-max': cardHeight + 'px' },
        },
          h('span', {
            className: 'gb-drag-handle',
            role: 'button',
            tabIndex: 0,
            title: t('dragCard'),
            'aria-label': t('dragCard'),
            'data-card-handle': id,
            onPointerDown: (event) => startCardDrag(event, id),
            onPointerMove: moveCardDrag,
            onPointerUp: endCardDrag,
            onPointerCancel: cancelCardDrag,
            onLostPointerCapture: cancelCardDrag,
            onClick: (event) => { try { event.stopPropagation() } catch {} },
            onKeyDown: (event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault()
                moveCardByStep(id, event.key === 'ArrowUp' ? -1 : 1)
              }
            },
          }, '⋮⋮'),
          card,
          collapsedCard ? null : h('div', {
            className: 'gb-card-resize',
            role: 'separator',
            tabIndex: 0,
            title: resizeTitle,
            'aria-label': t('resizeCard'),
            'aria-orientation': 'horizontal',
            'aria-valuemin': resizeMin,
            'aria-valuemax': resizeMax,
            'aria-valuenow': resizeNow,
            'data-card-resize': id,
            'data-card-resize-mode': mode,
            onPointerDown: (event) => startHeightDrag(event, id),
            onPointerMove: moveHeightDrag,
            onPointerUp: endHeightDrag,
            onPointerCancel: cancelHeightDrag,
            onLostPointerCapture: cancelHeightDrag,
            onDoubleClick: (event) => {
              try { event.preventDefault(); event.stopPropagation() } catch {}
              resetCardHeight(id)
            },
            onKeyDown: (event) => resizeCardByKey(id, event),
            onClick: (event) => { try { event.stopPropagation() } catch {} },
          }),
          drop && dropLabel
            ? h('div', { className: 'gb-drop', 'data-kind': drop.kind, 'data-fill': String(!!fill), 'aria-hidden': 'true' },
              h('span', { className: 'gb-drop-label' }, dropLabel))
            : null)
      }

      /** Natural (content) height of a column's visible cards; a stack sums its cards. */
      const columnNaturalHeight = (column) => column.cards.reduce((sum, id) => (cardElements[id] ? sum + cardRenderedHeight(id) : sum), 0)

      /**
       * Rendered height of one column: a single card's own (or head) height, or the
       * stack's cap / natural sum. All-collapsed stacks shrink to their heads total.
       */
      const columnRenderedHeight = (column) => {
        const visible = column.cards.filter((id) => !!cardElements[id])
        if (visible.length === 0) return 0
        if (visible.length === 1) return cardRenderedHeight(visible[0])
        const cap = normalizeColumnMaxHeight(column.maxHeight)
        const natural = columnNaturalHeight(column)
        const allCollapsed = visible.every((id) => isCollapsed(id))
        return allCollapsed || cap === undefined ? natural : cap
      }

      /** One column: a single card, or N stacked cards with N-1 draggable horizontal dividers. */
      const renderColumn = (column, rowIndex, columnIndex, columnCount) => {
        const visible = column.cards
          .map((id, cardIndex) => ({ id, cardIndex }))
          .filter((entry) => !!cardElements[entry.id])
        if (visible.length === 0) return null
        const fill = columnCount > 1
        const columnKey = rowIndex + ':' + columnIndex
        if (visible.length === 1) {
          const singleId = visible[0].id
          return h('div', {
            key: 'col-' + columnKey,
            className: 'gb-layout-column',
            'data-layout': 'single',
            'data-row': String(rowIndex),
            'data-column': String(columnIndex),
            ref: (node) => { columnRefs.current[columnKey] = node },
          }, wrapCard(singleId, cardElements[singleId], fill, false, 1, 'height', heightOf(singleId), isCollapsed(singleId)))
        }
        const expanded = visible.filter((entry) => !isCollapsed(entry.id))
        const expandedShares = normalizeShares(expanded.map((entry) => column.heights[entry.cardIndex]), expanded.length)
        const shares = normalizeShares(visible.map((entry) => column.heights[entry.cardIndex]), visible.length)
        const cap = normalizeColumnMaxHeight(column.maxHeight)
        const renderedHeight = columnRenderedHeight(column)
        const children = []
        let expandedIndex = 0
        for (let index = 0; index < visible.length; index++) {
          const entry = visible[index]
          const last = index === visible.length - 1
          const collapsedCard = isCollapsed(entry.id)
          const grow = collapsedCard ? null : expandedShares[expandedIndex++]
          children.push(h('div', {
            key: 'slot-' + columnKey + '-' + index,
            className: 'gb-stack-slot',
            'data-slot': String(index),
            'data-card-count': String(visible.length),
            'data-collapsed': String(collapsedCard),
            style: { flex: collapsedCard ? '0 0 ' + STATUS_HEAD_HEIGHT + 'px' : grow + ' 1 0' },
          }, wrapCard(entry.id, cardElements[entry.id], fill, true, collapsedCard ? 1 : grow, last && !collapsedCard ? 'column' : 'share', renderedHeight, collapsedCard)))
          if (!last) {
            children.push(h('div', {
              key: 'stack-divider-' + columnKey + '-' + index,
              className: 'gb-stack-divider',
              role: 'separator',
              'aria-orientation': 'horizontal',
              'aria-label': t('resizeStack'),
              'aria-valuemin': Math.round(STATUS_SHARE_MIN * 100),
              'aria-valuemax': Math.round((1 - STATUS_SHARE_MIN) * 100),
              'aria-valuenow': Math.round(shares[index] * 100),
              tabIndex: 0,
              'data-row': String(rowIndex),
              'data-column': String(columnIndex),
              'data-boundary': String(index),
              onPointerDown: (event) => startStackDrag(event, rowIndex, columnIndex, index),
              onPointerMove: moveStackDrag,
              onPointerUp: endStackDrag,
              onPointerCancel: endStackDrag,
              onKeyDown: (event) => nudgeStack(event, rowIndex, columnIndex, index),
            }))
          }
        }
        return h('div', {
          key: 'col-' + columnKey,
          className: 'gb-layout-column gb-stack',
          'data-layout': 'stack',
          'data-row': String(rowIndex),
          'data-column': String(columnIndex),
          'data-card-count': String(visible.length),
          'data-column-height': String(Math.round(renderedHeight)),
          'data-max-height': cap !== undefined ? String(cap) : '',
          ref: (node) => { columnRefs.current[columnKey] = node },
          style: { height: Math.round(renderedHeight) + 'px', ...(cap !== undefined ? { maxHeight: cap + 'px' } : {}) },
        }, children)
      }

      const rows = layout.map((row, rowIndex) => {
        const visibleColumns = row.columns
          .map((column, columnIndex) => ({ column, columnIndex }))
          .filter((entry) => entry.column.cards.some((id) => !!cardElements[id]))
        if (visibleColumns.length === 0) return null
        const insertDrop = drag && drag.drop && drag.drop.rowIndex === rowIndex
          && (drag.drop.kind === 'insert-before' || drag.drop.kind === 'insert-after')
          ? h('div', {
            className: 'gb-row-drop',
            'data-pos': drag.drop.kind === 'insert-before' ? 'before' : 'after',
            'aria-hidden': 'true',
          }, h('span', { className: 'gb-drop-label' }, t('dropHere')))
          : null
        const rowHeight = visibleColumns.reduce((height, entry) => Math.max(height, columnRenderedHeight(entry.column)), 0) || defaultCardHeight(STATUS_CARD_IDS[0])
        if (visibleColumns.length === 1) {
          return h('div', { key: 'row-' + rowIndex, className: 'gb-layout-row', 'data-layout': 'single', 'data-row': String(rowIndex) },
            insertDrop, renderColumn(visibleColumns[0].column, rowIndex, visibleColumns[0].columnIndex, 1))
        }
        const widths = normalizeShares(visibleColumns.map((entry) => row.widths[entry.columnIndex]), visibleColumns.length)
        const children = []
        for (let index = 0; index < visibleColumns.length; index++) {
          const entry = visibleColumns[index]
          children.push(h('div', {
            key: 'slot-' + rowIndex + '-' + entry.columnIndex,
            className: 'gb-split-slot',
            'data-slot': String(entry.columnIndex),
            'data-column-count': String(visibleColumns.length),
            style: { flex: '0 1 ' + (widths[index] * 100) + '%' },
          }, renderColumn(entry.column, rowIndex, entry.columnIndex, visibleColumns.length)))
          if (index < visibleColumns.length - 1) {
            children.push(h('div', {
              key: 'split-divider-' + rowIndex + '-' + index,
              className: 'gb-split-divider',
              role: 'separator',
              'aria-orientation': 'vertical',
              'aria-label': t('resizeSplit'),
              'aria-valuemin': Math.round(STATUS_SHARE_MIN * 100),
              'aria-valuemax': Math.round((1 - STATUS_SHARE_MIN) * 100),
              'aria-valuenow': Math.round(widths[index] * 100),
              tabIndex: 0,
              'data-row': String(rowIndex),
              'data-boundary': String(index),
              onPointerDown: (event) => startDividerDrag(event, rowIndex, index),
              onPointerMove: moveDividerDrag,
              onPointerUp: endDividerDrag,
              onPointerCancel: endDividerDrag,
              onKeyDown: (event) => nudgeDivider(event, rowIndex, index),
            }))
          }
        }
        return h('div', {
          key: 'row-' + rowIndex,
          className: 'gb-layout-row gb-split',
          'data-layout': 'split',
          'data-row': String(rowIndex),
          'data-column-count': String(visibleColumns.length),
        }, insertDrop, children)
      })

      return h('div', { className: 'gb-root', ref: rootRef },
        h('style', null, CSS),
        h('div', { className: 'gb-head' },
          h('h2', { className: 'gb-title' }, t('statusTitle'))),
        h('div', { className: 'gb-body' },
          null,
          rows))
    }

    const ctxRef = { current: null }
    const ROOT_MODULE_ID = 'widgets'

    /** Collaboration rows carry opaque Host-computed resource facts. */
    function openSessionTarget(ctx, member, team, child) {
      const row = child || member
      return openResourceValue(ctx, row && row.resource, false)
    }
    function canOpenAside(row) {
      return !!(row && row.resource && row.resource.openable === true && row.resource.address && row.resource.resourceKind)
    }
    function canOpenMemberAside(team, member) { return canOpenAside(member) }
    function openMemberAside(ctx, team, member) { return openResourceValue(ctx, member && member.resource, true) }

    /** The shipped catalog's right-chevron glyph (`IconChevronRightOutlineRegular`), inlined. */
    function ChevronRightIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, strokeWidth: 1,
      }, h('path', {
        d: 'M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4',
        stroke: 'currentColor',
      }))
    }

    /** Open the resident goal tab in the session's right sidebar. */
    function openGoalTab(ctx) {
      return invokeClientService(ctx, 'sidebarRight', 'openTab', [GOAL_KIND, {}])
    }

    function NotesIcon(props) {
      const size = (props && props.size) || 18
      const active = !!(props && props.active)
      return h('svg', {
        width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': true,
        style: { display: 'block', color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor', opacity: active ? 1 : 0.72 },
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('path', { d: 'M6 2.5h6.5L16 6v11.5H6z' }),
        h('path', { d: 'M12 2.5V6h3.5' }),
        h('path', { d: 'M8.5 10h5M8.5 13h3.5' }),
      )
    }

    /** The BBFF settings seat icon: a gear, so it reads as settings next to the notes sheet. */
    function SettingsIcon(props) {
      const size = (props && props.size) || 18
      const active = !!(props && props.active)
      return h('svg', {
        width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': true,
        style: { display: 'block', color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor', opacity: active ? 1 : 0.72 },
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('circle', { cx: 10, cy: 10, r: 2.6 }),
        h('path', { d: 'M10 2.6v2.1M10 15.3v2.1M2.6 10h2.1M15.3 10h2.1M4.8 4.8l1.5 1.5M13.7 13.7l1.5 1.5M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5' }),
      )
    }

    /** Session header chip: always visible for the on-screen session, opens the tab. */
    function HeaderGoalChip(props) {
      const ctx = ctxRef.current
      const t = rootT
      const sessionId = String((props && props.sessionId) || '')
      useUiVersion()
      const state = useSessionState(sessionId)
      React.useEffect(() => { setUiSessionId(sessionId) }, [sessionId])
      const goal = state.data && state.data.goal
      React.useEffect(() => {
        if (!goal || goal.phase === 'complete' || settingsValues().autoOpenOnGoal !== true) return
        try {
          const key = 'oh-my-bbff:goal-tab-auto:' + sessionId
          if (!localStorage.getItem(key) && openGoalTab(ctx)) localStorage.setItem(key, '1')
        } catch {}
      }, [sessionId, goal && goal.id, settingsValues().autoOpenOnGoal])

      return h('button', { className: 'gb-chip', title: t('toggle'), onClick: () => openGoalTab(ctx),
        style: { maxWidth: '100%', minWidth: 0, whiteSpace: 'nowrap', boxSizing: 'border-box' } }, rootT('headerChip'))
    }

    function GoalTabTitle(props) {
      const t = rootT
      return h('span', null, t('statusTab'))
    }

    return {
      inject: ['slots', 'uiWorkspace', 'sidebarRight', 'layout', 'locale'],
      async apply(ctx) {
        ctxRef.current = ctx
        ROOT_DISPOSED = false
        // 0.14.0 family root: modules inject `bbffUi` to register cards and settings
        // sections. The service is provided before any slot registration so a module
        // client half that loads around the same time always finds it.
        try {
          if (ctx && typeof ctx.provide === 'function') ctx.provide(UI_SERVICE, createUiService())
          UI_TOKENS = readThemeTokens(ctx)
          ensureRootSettings().catch(() => {})
        } catch (error) {
          try { console.error('oh-my-bbff bbffUi:', error) } catch {}
        }
        if (ctx && typeof ctx.effect === 'function') ctx.effect(() => () => {
          if (ROOT_TIMER !== null) clearInterval(ROOT_TIMER)
          ROOT_DISPOSED = true; ROOT_SETTINGS_USERS = 0
          ROOT_TIMER = null; ROOT_TIMER_MS = null; SESSION_STATES.clear()
          for (const dispose of LOCALE_DISPOSERS.splice(0)) { try { dispose() } catch {} }
          LOCALE_READY = false; LOCALE_TRANSLATOR = null; LOCALE_VALUE = null; LOCALE_SUBSCRIBED = false
          KIT_CACHE.clear(); MODULE_NAMESPACES.clear()
        }, 'oh-my-bbff: shared poll cleanup')
        const safe = (label, run) => {
          try { run() } catch (error) { try { console.error('oh-my-bbff ' + label + ':', error) } catch {} }
        }

        // 0.20.0: dictionaries are registered before the first slot exists, so no
        // card ever renders a raw key. A failure here leaves the panel absent
        // instead of showing untranslated chrome.
        try {
          await refreshFamilyModules()
          await loadLocales()
        } catch (error) {
          recordServiceFailure('client-call-threw', { service: 'locale', method: 'register', phase: 'registration', error: errorMessage(error) })
          return
        }

        // Global notes live in the left sidebar's global panel seat.
        safe('notes', () => {
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: NOTES_ID,
            order: 30,
            label: () => rootT('notesTitle'),
          }, NotesIcon))
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: NOTES_ID,
          }, NotesPanel))
        })

        // 0.12.0: global BBFF settings sit right next to the notes panel, in the same left-sidebar
        // seat — same slot, same register shape, one entry after the notes one.
        safe('settings', () => {
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: SETTINGS_ID,
            order: 31,
            label: () => rootT('settingsTitle'),
          }, SettingsIcon))
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: SETTINGS_ID,
          }, SettingsPanel))
        })

        // Per-session status panel: registered as soon as the right-sidebar service
        // appears, so it also opens for a session that never had a goal.
        try {
          ctx.inject(['sidebarRightTabs'], (scope) => {
            try {
              const tabs = scope && scope.sidebarRightTabs
              if (!tabs) return recordServiceFailure('client-service-missing', { service: 'sidebarRightTabs', method: 'register', phase: 'registration' })
              if (typeof tabs.register !== 'function') return recordServiceFailure('client-method-missing', { service: 'sidebarRightTabs', method: 'register', phase: 'registration' })
              const type = {
                id: GOAL_TYPE_ID,
                kind: GOAL_KIND,
                title: () => rootT('statusTab'),
                keepMounted: true,
              }
              ctx.effect(() => tabs.register(type), 'oh-my-bbff: status tab type')
              ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
                name: 'sidebar.right.pane.tab',
                key: GOAL_TYPE_ID,
              }, GoalTabPanel))
              ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
                name: 'sidebar.right.pane.tab.title',
                key: GOAL_TYPE_ID,
              }, GoalTabTitle))
            } catch (error) { recordServiceFailure('client-call-threw', { service: 'sidebarRightTabs', method: 'register', phase: 'registration', error: errorMessage(error) }) }
          })
        } catch (error) { recordServiceFailure('client-service-access-threw', { service: 'sidebarRightTabs', method: 'register', phase: 'inject', error: errorMessage(error) }) }

        // The chip in the session header: visible without opening anything.
        safe('header', () => {
          ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
            name: 'conversation.session.header.actions',
            id: 'bbff-goal',
            order: 10,
          }, HeaderGoalChip))
        })
      },
    }

  },
})
