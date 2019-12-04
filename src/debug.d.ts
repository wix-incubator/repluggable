import { AnySlotKey, AppHost } from '.'
import { LazyEntryPointFactory, PrivateShell } from './API'
import { AnyExtensionSlot } from './extensionSlot'

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
    apis: () => Array[APIDebugInfo]
}

export interface RepluggableHMR {
    hot: (sourceModule: any, entryPoints: EntryPoint[]) => EntryPoint[]
}

export interface APIDebugInfo {
    key: AnySlotKey
    impl: () => any
}
