export type AppRoute =
  | { kind: 'library' }
  | { kind: 'settings' | 'cloud' | 'storage' }
  | { kind: 'series'; name: string }
  | { kind: 'reader'; bookId: string }

const routeKey = '__kanshuRoute'
const depthKey = '__kanshuDepth'
const layersKey = '__kanshuLayers'

export function appDepth(state: unknown = window.history.state): number {
  if (!state || typeof state !== 'object' || !(depthKey in state)) return 0
  const depth = state[depthKey]
  return typeof depth === 'number' && Number.isInteger(depth) && depth >= 0 ? depth : 0
}

export function appLayers(state: unknown = window.history.state): string[] {
  if (!state || typeof state !== 'object' || !(layersKey in state)) return []
  const layers = state[layersKey]
  return Array.isArray(layers) && layers.every((layer) => typeof layer === 'string') ? layers : []
}

export function appRoute(state: unknown = window.history.state): AppRoute | null {
  if (!state || typeof state !== 'object' || !(routeKey in state)) return null
  const route = state[routeKey]
  if (!route || typeof route !== 'object' || !('kind' in route)) return null
  if (route.kind === 'library') return { kind: 'library' }
  if (route.kind === 'settings' || route.kind === 'cloud' || route.kind === 'storage')
    return { kind: route.kind }
  if (route.kind === 'series' && 'name' in route && typeof route.name === 'string')
    return { kind: 'series', name: route.name }
  if (route.kind === 'reader' && 'bookId' in route && typeof route.bookId === 'string')
    return { kind: 'reader', bookId: route.bookId }
  return null
}

export function writeAppRoute(route: AppRoute, replace = false) {
  const previous = window.history.state
  const state = previous && typeof previous === 'object' ? { ...previous } : {}
  const depth = appDepth() + (replace ? appLayers().length : 1)
  delete state[layersKey]
  window.history[replace ? 'replaceState' : 'pushState'](
    { ...state, [routeKey]: route, [depthKey]: route.kind === 'library' ? 0 : depth },
    '',
  )
}

export function pushAppLayer(token: string) {
  const previous = window.history.state
  const state = previous && typeof previous === 'object' ? previous : {}
  window.history.pushState({ ...state, [layersKey]: [...appLayers(), token] }, '')
}

let pendingDepth: number | null = null
let pendingTraversal: Promise<void> | null = null
let resolveTraversal: (() => void) | null = null

export function appHistorySettled(): Promise<void> {
  return pendingTraversal ?? Promise.resolve()
}

function finishTraversal() {
  resolveTraversal?.()
  resolveTraversal = null
  pendingTraversal = null
}

export function leaveAppLayer(token: string) {
  const depth = appLayers().indexOf(token)
  if (depth < 0) return
  pendingDepth = pendingDepth === null ? depth : Math.min(pendingDepth, depth)
  if (!pendingTraversal)
    pendingTraversal = new Promise<void>((resolve) => {
      resolveTraversal = resolve
    })
  queueMicrotask(() => {
    if (pendingDepth === null) return
    const target = pendingDepth
    pendingDepth = null
    const remaining = appLayers().length - target
    if (remaining <= 0) {
      finishTraversal()
      return
    }
    window.addEventListener('popstate', finishTraversal, { once: true })
    window.history.go(-remaining)
  })
}
