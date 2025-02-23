export {
    createShellLogger,
    createAppHost,
    makeLazyEntryPoint,
    mainViewSlotKey,
    stateSlotKey,
    monitorAPI, 
    interceptAnyObject, 
    invokeSlotCallbacks,
    hot
} from 'repluggable-core'

export {
    EntryPointOrPackage,
    EntryPointOrPackagesMap,
    EntryPoint,
    AppHost,
    AppHostAPI,
    AppHostOptions,
    Shell,
    ExtensionSlot,
    ExtensionItem,
    CustomExtensionSlot,
    CustomExtensionSlotHandler,
    AnySlotKey,
    SlotKey,
    ReactComponentContributor,
    ReducersMapObjectContributor,
    EntryPointInterceptor,
    ShellLogger,
    ShellLoggerSpan,
    HostLogger,
    LogSeverity,
    APILayer,
    StateObserverUnsubscribe,
    StateObserver,
    ObservableState,
    ScopedStore
} from './API'

export { AppMainView } from './appMainView'





export { SlotRenderer, ShellRenderer } from './renderSlotComponents'

export * from './connectWithShell'
export { ErrorBoundary } from './errorBoundary'
export { interceptEntryPoints, interceptEntryPointsMap } from './interceptEntryPoints'


