import { AppHost, AnySlotKey, PrivateShell, LazyEntryPointFactory, EntryPoint, SlotKey } from "../API"
import { AnyExtensionSlot } from "../extensionSlot"
import { Hot } from "../hot"
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
    getRootUnreadyAPI(): SlotKey<any>[]
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
