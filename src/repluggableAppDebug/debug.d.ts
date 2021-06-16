import { EntryPoint, AppHost, AnySlotKey, LazyEntryPointFactory, PrivateShell } from '../API'
import { AnyExtensionSlot } from '../extensionSlot'

declare global {
    interface Window {
        repluggableAppDebug: RepluggableAppDebugInfo
    }
}

export interface RepluggableAppDebugInfo {
    host: AppHost
    uniqueShellNames: Set<string>
    extensionSlots: Map<AnySlotKey, AnyExtensionSlot>
    addedShells: Map<string, PrivateShell>
    lazyShells: Map<string, LazyEntryPointFactory>
    readyAPIs: Set<AnySlotKey>
    shellInstallers: WeakMap<PrivateShell, string[]>
    utils: RepluggableDebugUtils
    hmr: RepluggableHMR
    profiling: RepluggableDebugProfiling
}

export interface RepluggableDebugUtils {
    apis(): APIDebugInfo[]
    unReadyEntryPoints(): EntryPoint[]
    whyEntryPointUnready(name: string): void
    findAPI(name: string): APIDebugInfo[]
}

export interface RepluggableHMR {
    hot(sourceModule: any, entryPoints: EntryPoint[]): EntryPoint[]
}

export interface RepluggableDebugProfiling {
    startProfiling(): void
    stopProfiling(): void
}

export interface APIDebugInfo {
    key: AnySlotKey
    impl(): any
}
