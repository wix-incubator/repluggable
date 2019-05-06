import * as React from 'react'
import * as Redux from 'redux'

export type ScopedStore<S> = Pick<Redux.Store<S>, 'dispatch' | 'getState' | 'subscribe'>
export type ReactComponentContributor = () => React.ReactNode
export type ReducersMapObjectContributor<TState = {}> = () => Redux.ReducersMapObject<TState>
export type ContributionPredicate = () => boolean
export type LazyEntryPointFactory = () => Promise<EntryPoint> //TODO: get rid of these
export type ShellsChangedCallback = (shellNames: string[]) => void
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
}

// addEntryPoints(entryPoints: EntryPoint[])
// addPackages(packages: EntryPointOrPackage[])
//

export interface AppHost {
    getStore(): Redux.Store
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
    // readonly log: HostLogger; //TODO: define logging abstraction
}

export interface Shell extends Pick<AppHost, Exclude<keyof AppHost, 'getStore'>> {
    readonly name: string
    getStore<TState>(): ScopedStore<TState>
    canUseAPIs(): boolean
    canUseStore(): boolean
    declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    contributeAPI<TAPI>(key: SlotKey<TAPI>, factory: () => TAPI): TAPI
    contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void
    contributeMainView(fromShell: Shell, contributor: ReactComponentContributor): void
    // readonly log: ShellLogger; //TODO: define logging abstraction
}

export interface PrivateShell extends Shell {
    readonly entryPoint: EntryPoint
    setDependencyAPIs(APIs: AnySlotKey[]): void
    setLifecycleState(enableStore: boolean, enableAPIs: boolean): void
}

export interface EntryPointsInfo {
    readonly name: string
    readonly lazy: boolean
    readonly attached: boolean
}

export interface EntryPointInterceptor {
    interceptName?(innerName: string): string
    interceptGetDependencyAPIs?(innerGetDependencyAPIs?: EntryPoint['getDependencyAPIs']): EntryPoint['getDependencyAPIs']
    interceptDeclareAPIs?(innerDeclareAPIs?: EntryPoint['declareAPIs']): EntryPoint['declareAPIs']
    interceptAttach?(innerAttach?: EntryPoint['attach']): EntryPoint['attach']
    interceptDetach?(innerDetach?: EntryPoint['detach']): EntryPoint['detach']
    interceptExtend?(innerExtend?: EntryPoint['extend']): EntryPoint['extend']
}

// TODO: define logging abstraction
/*
export type LogSeverity = 'debug' | 'info' | 'warning' | 'error';
export type LogSpanFlag = 'open' | 'close';

export interface HostLogger {
    event(
        severity: LogSeverity,
        source: string,
        id: string,
        keyValuePairs?: Object,
        spanFlag?: LogSpanFlag): void;
}

export interface ShellLogger {
    debug(messageId: string, keyValuePairs?: Object): void;
    info(messageId: string, keyValuePairs?: Object): void;
    warning(messageId: string, keyValuePairs?: Object): void;
    error(messageId: string, keyValuePairs?: Object): void;
    span(messageId: string, keyValuePairs: Object, action: () => void): void;
    asyncSpan(messageId: string, keyValuePairs: Object, action: () => Promise<any>): void;
}
*/
