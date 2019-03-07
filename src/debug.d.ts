import { AppHost, AnySlotKey } from './api'
import { AnyExtensionSlot } from './extensionSlot'
import { PrivateFeatureHost, LazyFeatureFactory } from './api'

declare global {
    interface Window {
        reactAppLegoDebug: ReactAppLegoDebugInfo
    }
}

export interface ReactAppLegoDebugInfo {
    host: AppHost
    uniqueFeatureNames: Set<string>
    extensionSlots: Map<AnySlotKey, AnyExtensionSlot>
    installedFeatures: Map<string, PrivateFeatureHost>
    lazyFeatures: Map<string, LazyFeatureFactory>
    readyAPIs: Set<AnySlotKey>
    featureInstallers: WeakMap<PrivateFeatureHost, string[]>
}
