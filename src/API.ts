import * as React from 'react'
import * as Redux from 'redux'
import { ThrottledStore } from './throttledStore'

export type ScopedStore<S> = Pick<ThrottledStore<S>, 'dispatch' | 'getState' | 'subscribe' | 'flush'>
export type ReactComponentContributor<TProps = {}> = (props?: TProps) => React.ReactNode
export type ReducersMapObjectContributor<TState = {}> = () => Redux.ReducersMapObject<TState>
export type ContributionPredicate = () => boolean
export interface EntryPointTags {
    [name: string]: string
}
export type LazyEntryPointFactory = () => Promise<EntryPoint> //TODO: get rid of these
export type ShellsChangedCallback = (shellNames: string[]) => void
export type ShellBoundaryAspect = React.FunctionComponent

export interface LazyEntryPointDescriptor {
    readonly name: string
    readonly factory: LazyEntryPointFactory
}

export interface AnySlotKey {
    readonly name: string
    readonly public?: boolean
}

export interface SlotKey<T> extends AnySlotKey {
    readonly empty?: T // holds no value, only triggers type-checking of T
}

export interface EntryPoint {
    readonly name: string
    readonly tags?: EntryPointTags
    getDependencyAPIs?(): AnySlotKey[]
    declareAPIs?(): AnySlotKey[]
    attach?(shell: Shell): void
    extend?(shell: Shell): void
    detach?(shell: Shell): void
}

export type AnyEntryPoint = EntryPoint | LazyEntryPointDescriptor
export type EntryPointOrPackage = AnyEntryPoint | AnyEntryPoint[]
export interface EntryPointOrPackagesMap {
    [name: string]: EntryPointOrPackage
}

export type ExtensionItemFilter<T> = (extensionItem: ExtensionItem<T>) => boolean
export interface ExtensionSlot<T> {
    readonly name: string
    readonly host: AppHost
    contribute(shell: Shell, item: T, condition?: ContributionPredicate): void
    getItems(forceAll?: boolean): ExtensionItem<T>[]
    getSingleItem(): ExtensionItem<T>
    getItemByName(name: string): ExtensionItem<T>
    discardBy(predicate: ExtensionItemFilter<T>): void
}

export interface ExtensionItem<T> {
    readonly name?: string
    readonly shell: Shell
    readonly contribution: T
    readonly condition: ContributionPredicate
    readonly uniqueId: string
}

// addEntryPoints(entryPoints: EntryPoint[])
// addPackages(packages: EntryPointOrPackage[])
//

export interface AppHost {
    getStore(): ThrottledStore
    getAPI<TAPI>(key: SlotKey<TAPI>): TAPI
    getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    getAllSlotKeys(): AnySlotKey[]
    getAllEntryPoints(): EntryPointsInfo[]
    hasShell(name: string): boolean
    isLazyEntryPoint(name: string): boolean
    addShells(entryPointsOrPackages: EntryPointOrPackage[]): void
    removeShells(names: string[]): void
    onShellsChanged(callback: ShellsChangedCallback): string
    removeShellsChangedCallback(callbackId: string): void
    readonly log: HostLogger
    readonly options: AppHostOptions
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

export interface AppHostOptions {
    readonly logger?: HostLogger
    readonly monitoring: MonitoringOptions
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

export type AnyFunction = (...args: any[]) => any
export type FunctionWithSameArgs<F extends AnyFunction> = (...args: Parameters<F>) => any
export interface Shell extends Pick<AppHost, Exclude<keyof AppHost, 'getStore' | 'log' | 'options'>> {
    readonly name: string
    readonly log: ShellLogger
    getStore<TState>(): ScopedStore<TState>
    canUseAPIs(): boolean
    canUseStore(): boolean
    wasInitializationCompleted(): boolean
    declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    contributeAPI<TAPI>(key: SlotKey<TAPI>, factory: () => TAPI): TAPI
    contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void
    contributeMainView(fromShell: Shell, contributor: ReactComponentContributor): void
    contributeBoundaryAspect(component: ShellBoundaryAspect): void
    memoizeForState<T extends AnyFunction>(
        func: T,
        resolver: FunctionWithSameArgs<T>,
        shouldClear?: () => boolean
    ): T & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>
    memoize<T extends AnyFunction>(func: T, resolver: FunctionWithSameArgs<T>): T & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>
}

export interface PrivateShell extends Shell {
    readonly entryPoint: EntryPoint
    setDependencyAPIs(APIs: AnySlotKey[]): void
    setLifecycleState(enableStore: boolean, enableAPIs: boolean, initCompleted: boolean): void
    getBoundaryAspects(): ShellBoundaryAspect[]
}

export interface EntryPointsInfo {
    readonly name: string
    readonly lazy: boolean
    readonly attached: boolean
}

export interface EntryPointInterceptor {
    interceptName?(innerName: string): string
    interceptTags?(innerTags?: EntryPointTags): EntryPointTags
    interceptGetDependencyAPIs?(innerGetDependencyAPIs?: EntryPoint['getDependencyAPIs']): EntryPoint['getDependencyAPIs']
    interceptDeclareAPIs?(innerDeclareAPIs?: EntryPoint['declareAPIs']): EntryPoint['declareAPIs']
    interceptAttach?(innerAttach?: EntryPoint['attach']): EntryPoint['attach']
    interceptDetach?(innerDetach?: EntryPoint['detach']): EntryPoint['detach']
    interceptExtend?(innerExtend?: EntryPoint['extend']): EntryPoint['extend']
}

export type LogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'span'
export type LogSpanFlag = 'begin' | 'end'

export interface HostLogger {
    event(severity: LogSeverity, id: string, keyValuePairs?: Object, spanFlag?: LogSpanFlag): void
}

export interface ShellLogger extends HostLogger {
    debug(messageId: string, keyValuePairs?: Object): void
    info(messageId: string, keyValuePairs?: Object): void
    warning(messageId: string, keyValuePairs?: Object): void
    error(messageId: string, keyValuePairs?: Object): void
    begin(messageId: string, keyValuePairs?: Object): ShellLoggerSpan
    end(messageId: string, success: boolean, error?: Error, keyValuePairs?: Object): void
    monitor<T>(messageId: string, keyValuePairs: Object, monitoredCode: () => T): T
}

export interface ShellLoggerSpan {
    end(success: boolean, error?: Error, keyValuePairs?: Object): void
    success(): void
    failure(error: Error): void
}
