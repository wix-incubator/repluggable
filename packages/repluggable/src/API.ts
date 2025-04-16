import * as React from 'react'

import {
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
    ScopedStore,
    INTERNAL_DONT_USE_SHELL_GET_APP_HOST
} from 'repluggable-core'

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
}










export type ContributionPredicate = () => boolean
export interface EntryPointTags {
    [name: string]: string
}
export type LazyEntryPointFactory = () => Promise<EntryPoint> //TODO: get rid of these
export type ShellsChangedCallback = (shellNames: string[]) => void
export type DeclarationsChangedCallback = () => void
export type UnsubscribeFromDeclarationsChanged = () => void
export type ShellBoundaryAspect = React.FunctionComponent<React.PropsWithChildren<unknown>>

export interface LazyEntryPointDescriptor {
    readonly name: string
    readonly factory: LazyEntryPointFactory
}


export type AnyEntryPoint = EntryPoint | LazyEntryPointDescriptor


export type ExtensionItemFilter<T> = (extensionItem: ExtensionItem<T>) => boolean


export interface PrivateExtensionSlot<T> extends ExtensionSlot<T> {
    subscribe(callback: () => void): () => void
}






export interface PrivateAppHost extends AppHost {
    executeWhenFree(identifier: string, callback: () => void): void
}

export interface MonitoringOptions {
    enablePerformance?: boolean
    readonly disableMonitoring?: boolean
    readonly disableMemoization?: boolean
    readonly debugMemoization?: boolean
}

export interface Trace {
    name: string
    duration: number
    startTime: number
    res: any
    args: any[]
}



export interface MemoizeMissHit {
    miss: number
    calls: number
    hit: number
    printHitMiss(): void
}

export type enrichedMemoizationFunction = MemoizeMissHit & AnyFunction & _.MemoizedFunction

export interface StatisticsMemoization {
    func: enrichedMemoizationFunction
    name: string
}

export interface ContributeAPIOptions<TAPI> {
    includesNamespaces?: boolean
    disableMonitoring?: boolean | (keyof TAPI)[]
}




export type AnyFunction = (...args: any[]) => any
export type FunctionWithSameArgs<F extends AnyFunction> = (...args: Parameters<F>) => any

export interface Lazy<T> {
    get(): T
}



export interface PrivateShell extends Shell {
    readonly entryPoint: EntryPoint
    setDependencyAPIs(APIs: AnySlotKey[]): void
    setLifecycleState(enableStore: boolean, enableAPIs: boolean, initCompleted: boolean): void
    getBoundaryAspects(): ShellBoundaryAspect[]
    getHostOptions(): AppHostOptions,
    readonly [INTERNAL_DONT_USE_SHELL_GET_APP_HOST]: () => AppHost
  
}

export interface EntryPointsInfo {
    readonly name: string
    readonly lazy: boolean
    readonly attached: boolean
}



export type LogSpanFlag = 'begin' | 'end' //TODO:deprecated-kept-for-backward-compat

