// Memory-owned UI. Defaults, limits, effective policies and paths come ONLY from the host.
window.__ModuleLoader__.load({ id: 'oh-my-bbff-memory', factory(require) {
  const React = require('react'), h = React.createElement, MODULE_ID = 'memory', API = '/oh-my-bbff-memory/api'
  const bytes = (kit, value) => Number.isFinite(value) ? kit.t('byteCount', { bytes: value.toLocaleString() }) : kit.t('unavailable')
  const tokens = (kit, value) => Number.isFinite(value) ? kit.t('tokenCount', { count: value.toLocaleString() }) : kit.t('unavailable')
  function byteBudgetText(kit, maxBytes, estimate) {
    if (!Number.isFinite(maxBytes)) return kit.t('budgetUnavailable')
    return estimate?.available
      ? kit.t('budgetWithEstimate', { bytes: bytes(kit, maxBytes), tokens: tokens(kit, estimate.tokens) })
      : kit.t('budgetWithoutEstimate', { bytes: bytes(kit, maxBytes) })
  }
  function receiptView(kit, receipt, kind) {
    if (!receipt?.available) return null
    const when = Number.isFinite(receipt.time) && receipt.time > 0 ? new Date(receipt.time).toISOString() : kit.t('receiptTimeMissing')
    const basis = kit.t('receiptBasis', { when, seq: receipt.seq })
    return h('div', { style: thin, title: basis, 'data-committed-receipt': kind }, kit.t('receiptCommitted', { tokens: tokens(kit, receipt.tokens), seq: receipt.seq }), h('div', { style: thin }, basis))
  }
  const date = value => Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : '?'
  const reason = (item, kit) => { const value = typeof item === 'string' ? item : item?.reason || item?.message; return value ? kit.resolveText(value) : item?.code || JSON.stringify(item) }
  const column = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }, row = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, preStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, margin: 0 }, thin = { fontSize: 11, opacity: 0.8, overflowWrap: 'anywhere' }
  const errorOf = (kit, error) => { const value = error?.error ?? error?.message ?? error; if (value === undefined || value === null || value === '') return ''; return typeof value === 'string' ? value : kit.resolveText(value) }
  function button(kit, label, onClick, disabled, title) { return h(kit.Button || 'button', { type: 'button', variant: 'ghost', disabled: !!disabled, onClick, title }, label) }
  function badge(kit, label, tone, source, settingPath, defaultValue) {
    const explain = { source, ...(settingPath ? { settingPath } : {}), ...(defaultValue !== undefined ? { default: String(defaultValue) } : {}) }, title = [source, settingPath, defaultValue !== undefined ? kit.t('shippedDefaultValue', { value: String(defaultValue) }) : ''].filter(Boolean).join(' · ')
    return h(kit.Badge || 'span', { tone }, label)
  }
  function details(title, body) { return h('details', null, h('summary', { style: { cursor: 'pointer' } }, title), body) }
  function diagnostics() { return null }
  function loading(kit) { return kit.Spinner ? h(kit.Spinner, { size: 12 }) : h('span', { role: 'progressbar', 'aria-label': kit.t('loading'), 'data-memory-loading': true, style: { display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', opacity: 0.55 } }) }
  function diagnosticPanel(kit, value, content) { return h('details', { 'data-memory-diagnostics': true }, h('summary', null, kit.t('diagnostics')), content, h('pre', { style: preStyle }, JSON.stringify(value, null, 2))) }
  function readHint(kit, data) {
    if (!data?.read || data.read.status === 'ready') return null
    return null
  }
  function json() { return null }
  function useRemote(kit, url, pollField) {
    const [state, setState] = React.useState({ data: null, url: null, error: '', loading: true }), [revision, setRevision] = React.useState(0), serial = React.useRef(0)
    React.useEffect(() => {
      const ticket = ++serial.current;let cancelled = false
      if (!url) { setState({ data: null, url, error: '', loading: false });return }
      setState(old => old.url === url ? { ...old, loading: !old.data } : { data: null, url, loading: true, error: '' })
      Promise.resolve().then(() => kit.getJson(url)).then(data => { if (cancelled || ticket !== serial.current) return;if (!data || data.ok === false) throw Error(errorOf(kit, data));setState({ data, url, error: '', loading: false }) }).catch(error => { if (!cancelled && ticket === serial.current) setState(old => ({ ...old, loading: false, error: errorOf(kit, error) })) })
      return () => { cancelled = true }
    }, [url, revision])
    const delay = state.data?.pending ? state.data.readPolicy?.pendingPollMs : state.data && pollField ? pollField(state.data) : null
    React.useEffect(() => { if (!Number.isFinite(delay) || delay <= 0 || !url) return;const timer = setTimeout(() => setRevision(value => value + 1), delay);return () => clearTimeout(timer) }, [delay, url, state.data])
    return { ...state, data: state.url === url ? state.data : null, reload: () => setRevision(value => value + 1) }
  }
  function sessionOf(props) { const selected = props.kit.useSession?.();return Object.hasOwn(props, 'sessionId') ? props.sessionId : selected || null }
  function openSettings(kit) { kit.openSettingsSection?.(MODULE_ID, MODULE_ID + '-settings') }
  function permissionHint() { return null }

  function NativeInstructions({ kit, data, sessionId, refresh, onDiagnostic }) {
    const [draft, setDraft] = React.useState({}), [preview, setPreview] = React.useState(null), [freeze, setFreeze] = React.useState(false), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
    React.useEffect(() => onDiagnostic?.({ error, preview }), [error, preview])
    const facts = data.nativeInstructions, sources = facts?.value?.sources || []
    const run = async body => { setBusy(true);setError('');try { const result = await kit.postJson(API, { sessionId, ...body });if (result.ok === false) throw Error(errorOf(kit, result));return result } catch (error) { setError(errorOf(kit, error));return null } finally { setBusy(false) } }
    return h('div', { style: column, 'data-native-instructions': true }, h('strong', null, kit.t('nativeInstructions')),
      h(PresetBudget, { kit, value: data.nativePresetBudget, sessionId, refresh }),
      receiptView(kit, facts?.value?.receipt, 'native'),
      !sources.length ? data.pending ? loading(kit) : h('div', { style: thin }, kit.t('nativeNoSource')) : sources.map(source => h('div', { key: source.id, style: { ...column, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 4 } },
        h('div', { 'data-native-budget': source.id }, kit.t('nativePerChainBudget', { budget: byteBudgetText(kit, source.maxBytes, source.budgetTokenEstimate) })),
        source.files.map(file => h('div', { key: file.path, 'data-native-file': file.path, style: { ...column, gap: 3 } },
          button(kit, file.path, () => kit.openFile(file.path), !kit.openFile),
          h('div', { 'data-native-text-measurement': true }, file.textMeasurement?.readable ? kit.t('nativeTextRead', { tokens: tokens(kit, file.textMeasurement.tokens), bytes: bytes(kit, file.textMeasurement.bytes) }) : kit.t('nativeTextNotRead', { reason: file.textMeasurement?.reason || kit.t('nativeTextReadUnknown') })),
          h('div', { style: thin, 'data-native-file-admission': true }, Number.isFinite(file.loadedBytes) && ['loaded','truncated','over-budget'].includes(file.status) ? kit.t('nativeAdmissionConfirmed', { bytes: bytes(kit, file.loadedBytes) }) + (Number.isFinite(file.loadedTokens) ? kit.t('nativeAdmissionTokens', { tokens: tokens(kit, file.loadedTokens) }) : kit.t('nativeAdmissionNoTokenCount')) : kit.t('nativeAdmissionUnavailable')))),
        source.writable ? h('div', { style: row }, h('input', { type: 'number', min: 0, step: 1, value: Object.hasOwn(draft, source.id) ? draft[source.id] : source.maxBytes ?? '', 'aria-label': source.id + ' maxBytes', onChange: event => setDraft(old => ({ ...old, [source.id]: event.target.value })) }), button(kit, kit.t('nativePreviewChange'), async () => { const value = Object.hasOwn(draft, source.id) ? draft[source.id] : source.maxBytes;if (value === '') { setError(kit.t('nativeEnterBytes'));return }const result = await run({ action: 'native-budget-preview', sourceId: source.id, maxBytes: Number(value) });if (result) { setPreview(result);setFreeze(false) } }, busy)) : null,
        diagnostics(kit, source.diagnostics))),
      preview ? details(kit.t('nativePreviewTitle'), h('div', { style: column }, h('div', null, bytes(kit, preview.before), ' → ', bytes(kit, preview.maxBytes)), preview.copyingInherited ? h('label', null, h('input', { type: 'checkbox', checked: freeze, onChange: event => setFreeze(event.target.checked) }), kit.t('nativeFreezeConfirm')) : null, button(kit, kit.t('nativeConfirmApply'), async () => { if (typeof window.confirm !== 'function' || !window.confirm(kit.t('nativeApplyDialog'))) return;const result = await run({ action: 'native-budget-apply', sourceId: preview.sourceId, maxBytes: preview.maxBytes, previewToken: preview.previewToken, confirmInheritedFreeze: freeze, confirm: true });if (result) { setPreview(null);refresh() } }, busy || data.pending || !data.capabilities.rootWrite || (preview.copyingInherited && !freeze)))) : null,
      null)
  }

  function PresetBudget({ kit, value, sessionId, refresh }) {
    const [preview, setPreview] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [cap, setCap] = React.useState('')
    // A fresh profile has no managed block yet: that is "not configured", not an error.
    const configuring = value?.state === 'not-configured', capValue = cap === '' ? (value?.suggestedMaxBytes ?? '') : cap
    const run = async apply => { setBusy(true);setError('');try {
      const maxBytes = configuring ? Number(capValue) : value.maxBytes
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) { setError(kit.t('preset.capRequired'));return }
      if (apply && (!window.confirm || !window.confirm(kit.t('presetRegenerateDialog')))) return
      const result = await kit.postJson(API, { sessionId, sourceId: value.sourceId, maxBytes, action: apply ? 'native-budget-apply' : 'native-budget-preview', ...(apply ? { previewToken: preview.previewToken, confirm: true } : {}) })
      if (result.ok === false) throw Error(errorOf(kit, result));if (apply) { setPreview(null);refresh?.() } else setPreview(result)
    } catch (failure) { setError(errorOf(kit, failure)) } finally { setBusy(false) } }
    if (!value) return null
    return h('div', { style: column, 'data-native-preset-budget': value.state || (value.drift ? 'drift' : 'matched') },
      h('div', { role: value.drift ? 'alert' : undefined, ...(value.state ? { 'data-preset-state': value.state } : {}) }, value.drift ? kit.t('presetDriftNotice') : kit.resolveText(value.reason)),
      configuring ? h('div', { style: thin, 'data-preset-action': true }, kit.resolveText(value.action)) : null,
      value.available ? h('div', { style: thin }, kit.t('presetPerChain', { bytes: bytes(kit, value.perChainMaxBytes) }) + kit.t('presetCombinedCeiling', { bytes: bytes(kit, value.combinedChainCeilingBytes) })) : null,
      configuring ? h('div', { style: row }, h('input', { type: 'number', min: 0, step: 1, value: capValue, 'aria-label': kit.t('preset.capLabel'), onChange: event => setCap(event.target.value) }), button(kit, kit.t('preset.previewConfigure'), () => run(false), busy)) : null,
      value.available ? button(kit, kit.t('presetPreviewRegenerate'), () => run(false), busy) : null,
      preview ? details(kit.t('presetRegenerationPreview'), h('div', { style: column }, h('pre', { style: preStyle }, preview.content), button(kit, kit.t('presetConfirmRegenerate'), () => run(true), busy))) : null,
      error ? h('div', { role: 'alert' }, error) : null)
  }

  function NativeSummary({ kit, data }) {
    const facts = data.nativeInstructions?.value, files = (facts?.sources || []).flatMap(source => source.files || [])
    return h('section', { style: { ...column, gap: 3 }, 'data-native-region': true }, h('strong', null, kit.t('nativeInstructions')),
      h('div', { style: thin }, kit.t('nativeSummaryNote')),
      h('div', { style: thin }, facts?.receipt?.available ? kit.t('nativeReceiptFound') : kit.t('nativeReceiptMissing')),
      h('div', { style: row }, ...files.map(file => button(kit, file.path.split(/[\\/]/).pop(), () => kit.openFile(file.path), !kit.openFile, file.path))))
  }

  function MemoryCard(props) {
    const kit = props.kit, sessionId = sessionOf(props), remote = useRemote(kit, sessionId ? API + '?inventory=1&sessionId=' + encodeURIComponent(sessionId) : null, data => data.settings?.memoryPollMs), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [nativeDiagnostic, setNativeDiagnostic] = React.useState(null)
    const data = remote.data
    if (!sessionId || !data || !data.capabilities || !data.settings || !data.budget || !Array.isArray(data.memory) || !data.nativeInstructions) return h('div', { style: column }, loading(kit), diagnosticPanel(kit, { data, error: remote.error, sessionId }))
    const mutate = async body => { setBusy(true);setError('');try { const result = await kit.postJson(API, { sessionId, ...body });if (result.ok === false) throw Error(errorOf(kit, result));remote.reload() } catch (error) { setError(errorOf(kit, error)) } finally { setBusy(false) } }
    return h('div', { style: column, 'data-memory-card': true }, budgetSummary(kit, data.budget),
      h('div', { style: row }, h('label', { style: row }, h('input', { type: 'checkbox', checked: data.enabled === true, disabled: busy || data.pending || !data.capabilities.settingsWrite, 'data-memory-inject-toggle': true, onChange: event => mutate({ action: 'memory-settings', settings: { injectEnabled: event.target.checked } }) }), kit.t('memoryInjectionGlobal')),
        h('select', { value: data.modeSource === 'root-session' ? data.mode : 'default', disabled: busy || data.pending || !data.capabilities.modeWrite, 'aria-label': kit.t('memoryModeLabel'), onChange: event => mutate({ action: 'memory-mode', mode: event.target.value }) }, h('option', { value: 'default' }, kit.t('followGlobalDefaultWithMode', { mode: data.settings.defaultMode })), (data.fields?.defaultMode?.options || []).map(mode => h('option', { key: mode, value: mode }, mode === 'full' ? kit.t('modeFull') : mode === 'routed' ? kit.t('modeRouted') : mode)))),
      h('strong', null, kit.t('memoryFiles')),
      h('div', { style: { ...column, gap: 2, maxHeight: 140, overflowY: 'auto' }, 'data-memory-file-list': true }, ...data.memory.map(file => { const label = file.scope + ':' + (file.directory ? file.directory + '/' : '') + file.file, disabled = busy || data.pending || !data.enabled || !file.toggleable;return h('div', { key: file.key, style: { ...row, flexWrap: 'nowrap', minWidth: 0 }, 'data-memory-file': file.key, title: label },
        file.archived || file.shadowedBy ? h('span', { style: thin, 'data-memory-source-status': file.archived ? 'archived' : 'shadowed' }, file.archived ? kit.t('fileArchived') : kit.t('fileShadowed')) : h(kit.Checkbox || 'input', kit.Checkbox ? { checked: file.enabled === true, disabled, label: file.scope, 'aria-label': label, onChange: enabled => mutate({ action: 'memory-toggle', key: file.key, enabled }) } : { type: 'checkbox', checked: file.enabled === true, disabled, 'aria-label': label, onChange: event => mutate({ action: 'memory-toggle', key: file.key, enabled: event.target.checked }) }), button(kit, file.file, () => kit.openFile(file.path), !kit.openFile, label)) })),
      h(NativeSummary, { kit, data }),
      data.nativePresetBudget?.drift ? h('div', { role: 'alert', 'data-preset-drift': true }, kit.t('presetDriftCard')) : null,
      diagnosticPanel(kit, { data, error: error || remote.error, nativeAction: nativeDiagnostic }, h(NativeInstructions, { kit, data, sessionId, refresh: remote.reload, onDiagnostic: setNativeDiagnostic })))
  }

  function Explorer({ kit, sessionId, kind, canWrite, refresh, onDiagnostic }) {
    const [cursor, setCursor] = React.useState(0), [prior, setPrior] = React.useState([]), [detail, setDetail] = React.useState(null), [reasonText, setReasonText] = React.useState(''), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
    const remote = useRemote(kit, API + '?' + kind + '=1&sessionId=' + encodeURIComponent(sessionId || '') + '&cursor=' + cursor), page = remote.data?.[kind]
    React.useEffect(() => onDiagnostic?.({ data: remote.data, detail, error: error || remote.error }), [remote.data, detail, error, remote.error])
    const run = async body => { setBusy(true);setError('');try { const value = await kit.postJson(API, { sessionId, ...body });if (value.ok === false) throw Error(errorOf(kit, value));return value } catch (error) { setError(errorOf(kit, error));return null } finally { setBusy(false) } }
    return h('div', { style: column }, !page ? loading(kit) : h(React.Fragment, null,
      h('div', { style: thin }, kind === 'candidates' ? kit.t('visibleRecordsPending', { total: page.total + (page.totalIsLowerBound ? '+' : ''), pending: page.pending }) : kit.t('visibleRecords', { total: page.total + (page.totalIsLowerBound ? '+' : '') })),
      page.items.map(item => h('div', { key: item.id, style: { ...column, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 4 } }, h('div', { style: row }, h('strong', null, item.file || item.kind || item.id), h('span', { style: thin }, date(item.at || item.updatedAt))), item.reason ? h('div', null, kit.resolveText(item.reason)) : null,
        button(kit, kind === 'history' ? kit.t('previewBeforeChange') : kit.t('readUntrustedProposal'), async () => { const value = kind === 'history' ? await run({ action: 'dream-revert-preview', id: item.id }) : await kit.getJson(API + '?candidateId=' + encodeURIComponent(item.id));if (value?.ok !== false) setDetail(kind === 'history' ? { type: 'history', ...value.preview } : { type: 'candidate', ...value.candidate }) }, busy || (kind === 'history' && !item.revertible)), null, json(kit.t('entryProvenance'), item))),
      h('div', { style: row }, button(kit, kit.t('previous'), () => { const next = [...prior];setCursor(next.pop() || 0);setPrior(next) }, !prior.length || busy), button(kit, kit.t('next'), () => { setPrior(old => [...old, cursor]);setCursor(page.nextCursor) }, page.nextCursor === null || page.nextCursor === undefined || busy)), diagnostics(kit, page.diagnostics)),
      detail ? h('div', { style: column }, h('strong', null, detail.type === 'candidate' ? kit.t('candidateNotAccepted') : kit.t('readOnlyDiffPreview')), h('pre', { style: preStyle }, detail.type === 'candidate' ? detail.content : detail.diff),
        detail.type === 'candidate' ? h(React.Fragment, null, h('div', { style: thin }, bytes(kit, detail.includedBytes) + ' / ' + bytes(kit, detail.bytes) + (detail.truncated ? kit.t('truncatedSuffix') : '')), h('input', { value: reasonText, placeholder: kit.t('reviewReason'), onChange: event => setReasonText(event.target.value) }), h('div', { style: row }, ...['reviewed', 'rejected'].map(status => button(kit, kit.t(status), async () => { const value = await run({ action: 'candidate-review', ids: [detail.id], status, reason: reasonText });if (value) { setDetail(null);remote.reload();refresh() } }, busy || !canWrite || !reasonText.trim())))) : button(kit, kit.t('confirmRestoration'), async () => { if (typeof window.confirm !== 'function' || !window.confirm(kit.t('restoreDialog'))) return;const value = await run({ action: 'dream-revert-apply', id: detail.id, expectedCurrentSha: detail.expectedCurrentSha, expectedRestoreSha: detail.expectedRestoreSha, confirm: true });if (value) { setDetail(null);remote.reload();refresh() } }, busy || !canWrite || !detail.changed), json(kit.t('fullPreviewProvenance'), detail)) : null,
      null)
  }

  function DreamingCard(props) {
    const kit = props.kit, sessionId = sessionOf(props), remote = useRemote(kit, API + '?dream=state&sessionId=' + encodeURIComponent(sessionId || ''), value => value.dreaming?.settings?.memoryPollMs), [now, setNow] = React.useState(Date.now()), [panel, setPanel] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [explorerDiagnostic, setExplorerDiagnostic] = React.useState(null), data = remote.data?.dreaming
    React.useEffect(() => { const delay = data?.settings?.clockTickMs;if (!Number.isFinite(delay) || delay <= 0) return;const timer = setInterval(() => setNow(Date.now()), delay);return () => clearInterval(timer) }, [data?.settings?.clockTickMs])
    if (!data || !data.capabilities || !data.model || !data.settings) return h('div', { style: column }, loading(kit), diagnosticPanel(kit, { response: remote.data, error: remote.error }))
    const nextDueAt = data.schedule?.nextDueAt, remaining = Number.isFinite(nextDueAt) ? Math.max(0, Math.ceil((nextDueAt - now) / 1000)) : null, status = data.residentStatus
    const routeText = route => [route?.provider, route?.model, route?.effort].filter(Boolean).join(' / ') || '?', routeBasis = { 'memory-fixed': kit.t('routeFixedSetting'), 'resident-session-selection': kit.t('routeResidentSelection'), 'owner-route-unavailable': kit.t('routeOwnerUnavailable') }
    const actions = h('div', { style: row, 'data-dreaming-actions': true }, button(kit, kit.t('wakeNow'), async () => { if (typeof window.confirm !== 'function' || !window.confirm(kit.t('wakeNowDialog'))) return;setBusy(true);try { const value = await kit.postJson(API, { action: 'dream-wake', sessionId, confirm: true });if (value.ok === false) throw Error(errorOf(kit, value));remote.reload() } catch (error) { setError(errorOf(kit, error)) } finally { setBusy(false) } }, busy || remote.data.pending || !data.capabilities.wake), button(kit, kit.t('rotateSession'), async () => { if (typeof window.confirm !== 'function' || !window.confirm(kit.t('rotateSessionDialog'))) return;setBusy(true);try { const value = await kit.postJson(API, { action: 'dream-rotate', sessionId, confirm: true });if (value.ok === false) throw Error(errorOf(kit, value));remote.reload() } catch (error) { setError(errorOf(kit, error)) } finally { setBusy(false) } }, busy || remote.data.pending || !data.capabilities.rotate), button(kit, kit.t('historyRestore'), () => setPanel(panel === 'history' ? null : 'history')), button(kit, kit.t('candidatesCount', { count: data.candidates?.pending ?? '?' }), () => setPanel(panel === 'candidates' ? null : 'candidates')), button(kit, kit.t('scheduleModelSettings'), () => openSettings(kit), !kit.openSettingsSection))
    const diagnosticContent = h('div', { style: column },
      h('div', null, kit.t('nextScheduled', { when: date(nextDueAt) })),
      data.schedule?.reason ? h('div', { style: thin, 'data-schedule-reason': data.schedule.error || 'pending' }, kit.resolveText(data.schedule.reason)) : null,
      h('div', { style: thin }, kit.t('intervalHours', { hours: data.wakeIntervalHours }) + ' · ' + kit.t('lastWake', { when: data.stateUnavailable ? '?' : date(data.lastWakeAt) }) + ' · ' + kit.t('wakeCount', { count: data.stateUnavailable ? '?' : data.wakeCount })),
      data.budget ? h('div', { 'data-review-budget': true, style: thin }, kit.t('reviewByteBudget', { budget: byteBudgetText(kit, data.budget.budgetBytes, data.budget.tokenEstimate) })) : null,
      data.rotation ? h('div', { 'data-dreaming-rotation': true, style: thin }, data.rotation.pressure?.available ? kit.t('diag.rotation.summary', { used: data.rotation.pressure.usedTokens, window: data.rotation.pressure.windowTokens, percent: data.rotation.pressure.percent, threshold: data.rotation.budget?.thresholdTokens ?? '?', reserved: data.rotation.budget?.reservedCompletionTokens ?? '?' }) : kit.t('diag.rotation.unavailable', { reason: data.rotation.pressure?.reason || (data.rotation.enabled ? 'unknown' : 'rotation-disabled') })) : null,
      data.rotation?.carriedRoute ? h('div', { 'data-dreaming-rotation-route': true, style: thin }, kit.t(data.rotation.carriedRoute.source === 'carried-from-retired-session' ? 'diag.rotation.carriedRoute' : 'diag.rotation.routeFallback', { route: [data.rotation.carriedRoute.provider, data.rotation.carriedRoute.model, data.rotation.carriedRoute.reasoningEffort].filter(Boolean).join(' / '), reason: data.rotation.routeUnavailable || 'unknown' })) : null,
      data.rotation?.escalation ? h('div', { 'data-dreaming-rotation-escalation': true, style: thin }, kit.t('diag.rotation.escalated', { count: data.rotation.failures?.count ?? '?', reason: data.rotation.failures?.reason || '?' })) : null,
      data.residentSessionId ? button(kit, data.residentSessionId, () => kit.openSession(data.residentSessionId), !kit.openSession) : null,
      details(kit.t('modelPresetDirectories'), h('div', { style: column },
        h('div', { 'data-model-route': true }, kit.t('effectiveRoute', { route: routeText(data.model.selectedForReview), basis: routeBasis[data.model.routeSource] || data.model.routeSource || '?' })),
        h('div', { style: thin }, kit.t('modelMode', { mode: data.model.mode }) + ' · ' + kit.t('dshGlobalDefaultNotFollowed', { route: routeText(data.model.currentDefault) })),
        data.model.lastFailure?.route ? h('div', { style: thin, 'data-model-last-failure': true }, kit.t('lastFailedRoute', { route: routeText(data.model.lastFailure.route) }) + (Number.isFinite(data.model.lastFailure.at) ? ' · ' + date(data.model.lastFailure.at) : '')) : null,
        h('div', null, kit.t('presetAndDefault', { preset: data.model.preset || '?', default: data.model.defaultPreset || '?' })))))
    return h('div', { style: column, 'data-dreaming-card': true }, h('div', { style: row, 'data-dreaming-status': status }, badge(kit, status, status === 'failed' ? 'danger' : status === 'running' ? 'success' : 'info'), badge(kit, data.enabled ? kit.t('badgeEnabled') : kit.t('badgeDisabled'), 'info'), badge(kit, data.schedule?.status === 'active' ? kit.t('nativeScheduleOn') : kit.t('nativeSchedulePaused'), 'info')),
      h('div', { 'data-single-readout': 'dreaming' }, !data.enabled || data.schedule?.status === 'paused' ? kit.t('autoWakeOff') : remaining === null ? kit.t('nextWakeUnavailable') : kit.t('nextWakeInMinutes', { minutes: Math.ceil(remaining / 60).toLocaleString() })),
      actions,
      panel ? h(Explorer, { key: sessionId + ':' + panel, kit, sessionId, kind: panel, canWrite: data.capabilities.historyRevert && !remote.data.pending, refresh: remote.reload, onDiagnostic: setExplorerDiagnostic }) : null,
      diagnosticPanel(kit, { response: remote.data, error: error || remote.error, explorer: explorerDiagnostic }, diagnosticContent))
  }

  function defaultDisplay(kit, entry, value) {
    if (value === null || value === undefined) return kit.t('valueNotSet')
    if (entry.control === 'checkbox') return value ? kit.t('valueOn') : kit.t('valueOff')
    if (entry.control === 'select') { const option = (entry.options || []).find(item => item.value === value); return option ? kit.resolveText(option.displayLabel) : String(value) }
    if (Array.isArray(value)) return kit.t('itemCount', { count: value.length })
    if (value === '') return kit.t('valueEmpty')
    const unit = entry.unit ? kit.resolveText(entry.unit.displayLabel) : ''
    if (entry.unit?.code === 'percent') return Math.round(Number(value) * 10000) / 100 + '%'
    return String(value) + (unit ? ' ' + unit : '')
  }

  function settingControl(kit, entry, value, locked, onChange) {
    const shared = { 'aria-label': kit.resolveText(entry.displayLabel), 'data-memory-control': entry.path, className: entry.control === 'checkbox' ? undefined : entry.control === 'list' ? 'gb-textarea' : 'gb-input', disabled: locked, style: { maxWidth: '100%', boxSizing: 'border-box' } }
    if (entry.control === 'checkbox') return h('input', { ...shared, type: 'checkbox', checked: value === true, onChange: event => onChange(!!event.target.checked) })
    if (entry.control === 'select') return h('select', { ...shared, value: value === null || value === undefined ? '' : String(value), onChange: event => onChange(event.target.value) }, (entry.options || []).map(option => h('option', { key: option.value, value: option.value }, kit.resolveText(option.displayLabel))))
    if (entry.control === 'list') return h('textarea', { ...shared, rows: 3, style: { ...shared.style, width: '100%' }, value: typeof value === 'string' ? value : Array.isArray(value) ? value.join('\n') : '', onChange: event => onChange(event.target.value) })
    if (entry.control === 'text') return h('input', { ...shared, type: 'text', maxLength: entry.limits?.maxLength, value: value === null || value === undefined ? '' : String(value), onChange: event => onChange(event.target.value) })
    return h('input', { ...shared, type: 'number', step: entry.step, min: entry.limits?.min, max: entry.limits?.max, value: value === null || value === undefined ? '' : value, onChange: event => onChange(event.target.value) })
  }

  function settingsFieldRow({ kit, entry, view, shown, locked, change, update, context = {} }) {
    const effect = kit.resolveText(entry.effect || entry.description), tip = [effect, kit.resolveText(entry.tooltip)].filter(Boolean).join(' · '), modern = Object.hasOwn(context, 'basic') && !context.legacy && typeof kit.SettingHelp === 'function'
    const restoreValue = Object.hasOwn(entry, 'default') ? entry.default : view.defaults[entry.path], restore = () => update(entry.path, restoreValue, true)
    return h('div', { key: entry.path, className: 'gb-setting', 'data-settings-field': MODULE_ID + '.' + entry.path, 'data-memory-setting': entry.path, style: { ...column, minWidth: 0, gap: 3, padding: '4px 0' } },
      h('div', { style: row }, h('strong', { title: modern ? undefined : tip, style: { minWidth: 0, overflowWrap: 'anywhere' } }, kit.resolveText(entry.displayLabel)), entry.control === 'list' ? h('details', { 'data-memory-directory-editor': entry.path, style: { width: '100%', minWidth: 0 } }, h('summary', { style: { cursor: 'pointer' } }, kit.t('viewOrEditDirectories')), settingControl(kit, entry, shown, locked, next => change(entry, next))) : settingControl(kit, entry, shown, locked, next => change(entry, next)), modern ? h(kit.SettingHelp, { field: entry, moduleId: MODULE_ID }) : null),
      h('div', { style: { ...thin, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('span', { 'data-memory-default': entry.path, title: modern ? undefined : tip }, kit.t('defaultValue', { value: defaultDisplay(kit, entry, Object.hasOwn(entry, 'default') ? entry.default : view.defaults[entry.path]) })),
        h('button', { type: 'button', disabled: locked, onClick: restore }, kit.t('restoreShippedDefault'))),
      context.basic && effect ? h('p', { className: 'gb-basic-effect', 'data-basic-effect': entry.path }, effect) : null)
  }

  function settingsGroup({ kit, group, entries, view, draft, raw, locked, change, update }) {
    const label = kit.resolveText(group.displayLabel)
    return h('section', { key: group.id, 'data-memory-group': group.id, style: { ...column, minWidth: 0 } },
      h('h3', { title: label, style: { fontSize: 13, margin: '10px 0 2px', overflowWrap: 'anywhere' } }, label + ' · ' + group.fieldCount),
      ...entries.map(entry => settingsFieldRow({ kit, entry, view, shown: Object.hasOwn(raw, entry.path) ? raw[entry.path] : draft[entry.path], locked, change, update })))
  }

  function promptRow({ kit, entry, view, draft, locked, updatePrompt }) {
    const shipped = String(view.defaults.prompts[entry.path] ?? ''), label = kit.resolveText(entry.displayLabel), tip = 'key: ' + MODULE_ID + '.prompts.' + entry.path + ' · source: ' + kit.resolveText(entry.source.contract)
    return h('div', { key: entry.path, 'data-settings-field': MODULE_ID + '.prompts.' + entry.path, style: { ...column, gap: 3, padding: '6px 0', borderTop: '1px solid var(--dsw-alias-border-l1)' } },
      h('strong', { title: tip, style: { minWidth: 0, overflowWrap: 'anywhere' } }, label),
      h('textarea', { rows: 4, value: draft.prompts[entry.path], disabled: locked, 'aria-label': label, style: { width: '100%', maxWidth: '100%', boxSizing: 'border-box' }, onChange: event => updatePrompt(entry.path, event.target.value) }),
      h('div', { style: { ...thin, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('span', { 'data-memory-default': 'prompts.' + entry.path, title: tip }, kit.t('shippedTextDefault', { count: shipped.length })),
        h('details', null, h('summary', { style: { cursor: 'pointer' } }, kit.t('viewShippedText')), h('pre', { style: preStyle }, shipped)),
        h('button', { type: 'button', disabled: locked, onClick: () => updatePrompt(entry.path, shipped) }, kit.t('restoreThisDefault'))))
  }

  function budgetSummary(kit, budget) {
    if (!budget) return null
    if (budget.status === 'pending') return h('div', { 'data-memory-budget': 'pending', style: thin }, kit.t('loadingRead'))
    if (budget.error) return null
    const summary = budget.summary
    return h('div', { 'data-memory-budget': 'ready', 'data-single-readout': 'memory', style: thin }, summary && Number.isFinite(summary.tokens) ? kit.t(summary.mode === 'full' ? 'fullMemoryTokens' : 'injectedTokens', { tokens: tokens(kit, summary.tokens) }) : kit.t('memoryUsageUnavailable'))
  }

  function MemorySettingsDataDriven(props) {
    const kit = props.kit, sessionId = sessionOf(props), remote = useRemote(kit, API + '?settings=1&sessionId=' + encodeURIComponent(sessionId || '')), view = remote.data, [draft, setDraft] = React.useState(null), [raw, setRaw] = React.useState({}), [saving, setSaving] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [previews, setPreviews] = React.useState(null), draftRef = React.useRef(null), authority = React.useRef(null)
    const clone = value => JSON.parse(JSON.stringify(value)), same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    React.useEffect(() => { if (!view?.fields || !view?.settings || !view?.defaults) return;const dirty = draftRef.current && authority.current && !same(draftRef.current, authority.current);authority.current = clone(view.settings);if (!dirty) { const next = clone(view.settings);draftRef.current = next;setDraft(next);setRaw({}) } }, [view])
    React.useEffect(() => { if (!view || view.settingDescriptors || !view.settings) return;const delay = view.readPolicy?.pendingPollMs;if (!Number.isFinite(delay) || delay <= 0) return;const timer = setTimeout(() => remote.reload(), delay);return () => clearTimeout(timer) }, [view])
    React.useEffect(() => props.onDiagnostic?.('settings', { view, error: error || remote.error, notice, previews }), [view, error, remote.error, notice, previews])
    if (!view || !draft) return h('div', { 'data-memory-loading': true, style: thin }, kit.t('loadingSettings'))
    const descriptors = view.settingDescriptors
    if (!descriptors || descriptors.status !== 'ready') return h('div', { 'data-memory-loading': true, 'data-memory-descriptor': descriptors?.status || 'missing', style: thin }, kit.t('loadingSettings'))
    const locked = saving || view.pending === true || view.capabilities?.settingsWrite !== true, patch = {}, promptPatch = {}
    for (const entry of descriptors.settings) if (!same(draft[entry.path], view.settings[entry.path])) patch[entry.path] = draft[entry.path]
    for (const entry of descriptors.prompts) { if (entry.readonly) continue;if (draft.prompts[entry.path] !== view.settings.prompts[entry.path]) promptPatch[entry.path] = draft.prompts[entry.path] }
    if (Object.keys(promptPatch).length) patch.prompts = promptPatch
    const update = (key, value, clear = false) => { setDraft(previous => { const next = { ...previous, [key]: value };draftRef.current = next;return next });if (clear) setRaw(old => { const next = { ...old };delete next[key];return next });setPreviews(null);setNotice('') }
    const updatePrompt = (key, value) => update('prompts', { ...draft.prompts, [key]: value })
    const replace = value => { const next = clone(value);draftRef.current = next;setDraft(next);setRaw({});setPreviews(null);setNotice('') }
    const change = (entry, value) => {
      if (entry.control === 'list') { setRaw(old => ({ ...old, [entry.path]: value }));update(entry.path, value.split('\n').map(item => item.trim()).filter(Boolean));return }
      if (entry.control === 'number') { setRaw(old => ({ ...old, [entry.path]: value }));if (value === '') { if (entry.nullable) update(entry.path, null);return } if (Number.isFinite(Number(value))) update(entry.path, Number(value));return }
      update(entry.path, value)
    }
    const save = async () => { setSaving(true);setError('');try { const result = await kit.postJson(API, { action: 'memory-settings', sessionId, settings: patch });if (result.ok === false) throw Error(errorOf(kit, result));authority.current = clone(result.settings);replace(result.settings);setNotice(kit.t('saved'));remote.reload() } catch (error) { setError(errorOf(kit, error)) } finally { setSaving(false) } }
    const preview = async () => { setSaving(true);setError('');try { const result = await kit.postJson(API, { action: 'memory-prompts-preview', sessionId, settings: patch, prompts: Object.fromEntries(Object.entries(draft.prompts).filter(([key]) => !descriptors.prompts.find(entry => entry.path === key && entry.readonly))) });if (result.ok === false) throw Error(errorOf(kit, result));setPreviews(result) } catch (error) { setError(errorOf(kit, error)) } finally { setSaving(false) } }
    const invalidRaw = Object.entries(raw).some(([key, value]) => { const entry = descriptors.settings.find(item => item.path === key);return entry && entry.control === 'number' && !entry.nullable && (!String(value).trim() || !Number.isFinite(Number(value))) })
    const editablePrompts = descriptors.prompts.filter(entry => !entry.readonly), readonlyPrompts = descriptors.prompts.filter(entry => entry.readonly)
    return h('div', { style: { ...column, minWidth: 0 }, 'data-memory-settings': 'true' },
      h('div', { style: row },
        h('button', { type: 'button', disabled: locked || !Object.keys(patch).length || invalidRaw, onClick: save }, saving ? kit.t('saving') : kit.t('saveExplicitChanges')),
        h('button', { type: 'button', disabled: locked, onClick: () => replace(view.settings) }, kit.t('revertToSaved')),
        h('button', { type: 'button', disabled: locked, onClick: () => replace(view.defaults) }, kit.t('restoreAllDefaults')),
        h('button', { type: 'button', disabled: saving, onClick: remote.reload }, kit.t('refreshSources'))),
      h('div', { style: thin, 'data-memory-counts': 'true' }, kit.t('settingsCounts', { settings: descriptors.counts.settings, groups: descriptors.counts.groups, prompts: descriptors.counts.editablePrompts, readonly: descriptors.counts.readonlyItems })),
      budgetSummary(kit, view.budget),
      h(PresetBudget, { kit, value: view.nativePresetBudget, sessionId, refresh: remote.reload }),
      typeof kit.SettingsLayout === 'function' ? h(kit.SettingsLayout, { descriptors, values: draft,
        renderField: (entry, context) => settingsFieldRow({ kit, entry, view, shown: Object.hasOwn(raw, entry.path) ? raw[entry.path] : draft[entry.path], locked, change, update, context }),
        legacyChildren: descriptors.groups.map(group => settingsGroup({ kit, group, entries: descriptors.settings.filter(entry => entry.group === group.id), view, draft, raw, locked, change, update }))
      }) : descriptors.groups.map(group => settingsGroup({ kit, group, entries: descriptors.settings.filter(entry => entry.group === group.id), view, draft, raw, locked, change, update })),
      h('details', { 'data-memory-prompts': 'true' }, h('summary', { style: { cursor: 'pointer', fontSize: 12 } }, kit.t('editPrompts') + ' · ' + kit.t('promptsCounts', { editable: editablePrompts.length, readonly: readonlyPrompts.length })),
        h('div', { style: column }, editablePrompts.map(entry => promptRow({ kit, entry, view, draft, locked, updatePrompt }))),
        h('button', { type: 'button', disabled: saving, onClick: preview }, kit.t('readOnlyPlaceholderPreview')),
        previews ? h('details', null, h('summary', { style: { cursor: 'pointer' } }, kit.t('promptPreview')), h('div', { style: column }, Object.entries(previews.previews || {}).map(([key, value]) => h('div', { key }, h('strong', null, kit.resolveText(descriptors.prompts.find(entry => entry.path === key)?.displayLabel || key)), h('pre', { style: preStyle }, value))))) : null),
      notice ? h('div', { role: 'status', 'data-memory-notice': 'true', style: thin }, notice) : null)
  }

  function settingsDiagnostics(kit, view, report) {
    const descriptors = view?.settingDescriptors, readonlyItems = descriptors?.readonlyItems || (view?.readonlyPrompts || []).map(path => ({ path: 'prompts.' + path, displayLabel: path, note: '' }))
    const descriptorLine = !descriptors ? kit.t('descriptorsMissing') : descriptors.status === 'error' ? kit.t('descriptorsFailed', { reason: descriptors.reason || '' }) : kit.resolveText(descriptors.source) + ' · ' + JSON.stringify(descriptors.counts)
    const promptLines = (descriptors?.prompts || []).map(entry => entry.path + (entry.readonly ? ' [readonly]' : '') + ': ' + (entry.placeholders.length ? entry.placeholders.map(name => '{{' + name + '}}').join(', ') : '—')).join('\n')
    return h('details', { 'data-memory-diagnostics': true }, h('summary', null, kit.t('diagnostics')),
      h('div', { style: column },
        h('div', { 'data-memory-descriptor-state': 'true', style: thin }, descriptorLine),
        view?.budget?.tokenizer?.basisLine ? h('div', { 'data-memory-tokenizer-basis': 'true', style: thin }, kit.resolveText(view.budget.tokenizer.basisLine)) : null,
        view?.budget ? h('div', { 'data-memory-budget-basis': 'true', style: thin }, view.budget.mode === 'fixed' ? byteBudgetText(kit, view.budget.budgetBytes, view.budget.byteCapEstimate) : kit.t('windowBudget', { tokens: tokens(kit, view.budget.windowTokens), percent: Math.round(Number(view.budget.ratio) * 10000) / 100, cap: tokens(kit, view.budget.capTokens) })) : null,
        h('div', { style: thin }, kit.t('readonlyExplained')),
        readonlyItems.map(item => h('div', { key: item.path, 'data-memory-readonly': item.path, style: thin }, kit.t('readonlyItem', { label: kit.resolveText(item.displayLabel), path: item.path, note: kit.resolveText(item.note) || kit.t('notEditableAtRuntime') }))),
        (view?.diagnostics || []).map((item, index) => h('div', { key: 'diagnostic-' + index, style: thin }, typeof item === 'string' ? item : (kit.resolveText(item?.reason || item?.message) || JSON.stringify(item)))),
        (view?.budget?.diagnostics || []).map((item, index) => h('div', { key: 'budget-diagnostic-' + index, 'data-memory-budget-diagnostic': item.code || 'budget', style: thin }, kit.resolveText(item.reason))),
        h('details', null, h('summary', { style: { cursor: 'pointer' } }, kit.t('promptPlaceholderInventory')), h('pre', { style: preStyle }, promptLines)),
        h('details', null, h('summary', { style: { cursor: 'pointer' } }, kit.t('realPathsPoliciesLimits')), h('pre', { style: preStyle }, JSON.stringify({ paths: view?.paths, storage: view?.storage, policies: view?.policies, limits: view?.limits, managedSkill: view?.managedSkill, budget: view?.budget, read: view?.read }, null, 2))),
        report?.previews ? h('pre', { style: preStyle }, JSON.stringify(report.previews, null, 2)) : null,
        h('pre', { 'data-memory-diagnostic-raw': 'true', style: preStyle }, JSON.stringify({ descriptors: descriptors ? { status: descriptors.status, source: descriptors.source, counts: descriptors.counts } : null, view, report }, null, 2))))
  }

  function MemorySettings(props) {
    const kit = props.kit, [reports, setReports] = React.useState({}), update = React.useRef(null)
    if (!update.current) update.current = (name, value) => setReports(old => old[name] === value ? old : { ...old, [name]: value })
    return h('div', { style: column }, h(MemorySettingsDataDriven, { ...props, onDiagnostic: update.current }), settingsDiagnostics(kit, reports.settings?.view, reports.settings))
  }
  const withKit = (component, kit) => props => h(component, { ...(props || {}), kit: props?.kit || kit })
  return { inject: [], apply(ctx) { if (!ctx?.inject) return;ctx.inject(['bbffUi'], scope => { const ui = scope.get?.('bbffUi');if (ui?.contract !== 1 || !ui.kit) return;const effect = (factory, label) => scope.effect ? scope.effect(factory, label) : factory();effect(() => ui.registerCard({ id: 'memory', title: ui.kit.msg('card.memory.title'), order: 10, defaultHeight: 360, legacyIds: ['memory'], component: withKit(MemoryCard, ui.kit) }), 'memory:card');effect(() => ui.registerCard({ id: 'dreaming', title: ui.kit.msg('card.dreaming.title'), order: 11, defaultHeight: 280, legacyIds: ['dreaming'], component: withKit(DreamingCard, ui.kit) }), 'memory:dreaming-card');effect(() => ui.registerSettingsSection({ moduleId: MODULE_ID, id: MODULE_ID + '-settings', title: ui.kit.msg('settings.title'), order: 10, component: withKit(MemorySettings, ui.kit) }), 'memory:settings') }) } }
} })
