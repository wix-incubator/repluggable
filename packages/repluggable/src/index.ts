export {
    EntryPointOrPackage,
    EntryPointOrPackagesMap,
    EntryPoint,
    AppHost,
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

export { AppHostAPI,
     ConsoleHostLogger,
     createAppHost,
      makeLazyEntryPoint,
       mainViewSlotKey,
        stateSlotKey,
        invokeSlotCallbacks,
        interceptAnyObject,
        monitorAPI,
        hot,
     } from 'repluggable-core'

export { AppMainView } from './appMainView'




export { SlotRenderer, ShellRenderer } from './renderSlotComponents'


export * from './connectWithShell'
export { ErrorBoundary } from './errorBoundary'
export { interceptEntryPoints, interceptEntryPointsMap } from './interceptEntryPoints'

// export 
// { 
//     // AppHostAPI,
// //     ConsoleHostLogger,
// //     createAppHost,
// //      makeLazyEntryPoint,
// //       mainViewSlotKey,
// //        stateSlotKey,
// //        invokeSlotCallbacks,
// //        interceptAnyObject,
// //        monitorAPI,
//        hot,
//     } from 'repluggable-core'

