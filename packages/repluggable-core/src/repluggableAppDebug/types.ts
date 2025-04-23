import { AppHost, AnySlotKey, PrivateShell, LazyEntryPointFactory } from "../API"
import { AnyExtensionSlot } from "../extensionSlot"
import { RepluggableDebugUtils, RepluggableHMR } from "./debug"

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
