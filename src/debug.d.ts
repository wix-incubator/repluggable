import { AnySlotKey, AppHost } from '.'
import { LazyEntryPointFactory, PrivateShell } from './API'
import { AnyExtensionSlot } from './extensionSlot'

declare global {
    interface Window {
        reactAppLegoDebug: ReactAppLegoDebugInfo
    }
}

export interface ReactAppLegoDebugInfo {
    host: AppHost
    uniqueShellNames: Set<string>
    extensionSlots: Map<AnySlotKey, AnyExtensionSlot>
    addedShells: Map<string, PrivateShell>
    lazyShells: Map<string, LazyEntryPointFactory>
    readyAPIs: Set<AnySlotKey>
    shellInstallers: WeakMap<PrivateShell, string[]>
}
