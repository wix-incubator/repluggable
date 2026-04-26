import { EntryPoint, AppHost, AnySlotKey, PrivateShell, SlotKey } from '../API'
import { AnyExtensionSlot } from '../extensionSlot'
import { Hot } from '../hot'

declare global {
    // Have to use var is this variable reassigned in the global scope
    var repluggableAppDebug: RepluggableAppDebugInfo
}

export interface RepluggableAppDebugInfo {
    host: AppHost
    uniqueShellNames: Set<string>
    extensionSlots: Map<AnySlotKey, AnyExtensionSlot>
    addedShells: Map<string, PrivateShell>
    readyAPIs: Set<AnySlotKey>
    shellInstallers: WeakMap<PrivateShell, string[]>
    utils: RepluggableDebugUtils
    hmr: RepluggableHMR
}

export interface DependencyTree {
    entryPoint: string
    deps: { api: string; subtree: DependencyTree | null }[]
}

export interface RepluggableDebugUtils {
    apis(): APIDebugInfo[]
    unReadyEntryPoints(): EntryPoint[]
    getRootUnreadyAPI(): SlotKey<any>
    whyEntryPointUnready(name: string): void
    findAPI(name: string): APIDebugInfo[]
    getAPIOrEntryPointsDependencies(
        apisOrEntryPointsNames: string[],
        entryPoints?: EntryPoint[]
    ): { entryPoints: EntryPoint[]; apis: AnySlotKey[] }
    traceAPIDependency(entryPointName: string, apiName: string): DependencyTree | null
    visualizeDependencyTree(tree: DependencyTree | null): string
}

export interface RepluggableHMR {
    hot: Hot
}

export interface APIDebugInfo {
    key: AnySlotKey
    impl(): any
}
