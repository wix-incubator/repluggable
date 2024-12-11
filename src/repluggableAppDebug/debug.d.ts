import { EntryPoint, AppHost, AnySlotKey, LazyEntryPointFactory, PrivateShell, SlotKey } from '../API'
import { AnyExtensionSlot } from '../extensionSlot'
import { Hot } from '../hot'

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
}

export interface RepluggableDebugUtils {
    apis(): APIDebugInfo[]
    unReadyEntryPoints(): EntryPoint[]
    getRootUnreadyAPI: () => SlotKey<any>[]
    whyEntryPointUnready(name: string): void
    findAPI(name: string): APIDebugInfo[]
}

export interface RepluggableHMR {
    hot: Hot
}

export interface APIDebugInfo {
    key: AnySlotKey
    impl(): any
}
