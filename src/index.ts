export {
    FeatureLifecycle,
    AppHost,
    FeatureHost,
    ExtensionSlot,
    ExtensionItem,
    AnySlotKey,
    SlotKey,
    HostConnectorCallback,
    AppStateBlock,
    ReactComponentContributor,
    SoloReactComponentContributor,
    ReduxStateContributor
} from './api'

export { AppMainView } from './appMainView'

export { createAppHost, makeLazyFeature, mainViewSlotKey, stateSlotKey } from './appHost'

export { renderSlotComponents, renderSlotComponentsConnected } from './renderSlotComponents'

export { connectWithFeature } from './connectWithFeatureContext';

export { ErrorBoundary } from './errorBoundary'
