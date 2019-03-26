import * as React from 'react'
import * as Redux from 'redux'

export type ScopedStore<S> = Pick<Redux.Store<S>, 'dispatch' | 'getState' | 'subscribe'>
export type ReactComponentContributor = () => React.ReactNode
export type SoloReactComponentContributor = () => JsxWithContainerCss
export type ReducersMapObjectContributor<TState = {}> = () => Redux.ReducersMapObject<TState>
export type ContributionPredicate = () => boolean
export type LazyEntryPointFactory = () => Promise<EntryPoint>
export type InstalledShellsChangedCallback = (installedShellNames: string[]) => void
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
    getDependencyApis?(): AnySlotKey[]
    declareApis?(): AnySlotKey[]
    install?(shell: Shell): void
    extend?(shell: Shell): void
    uninstall?(shell: Shell): void
}

export type AnyEntryPoint = EntryPoint | LazyEntryPointDescriptor
export type AnyPackage = AnyEntryPoint | AnyEntryPoint[]

export type ExtensionItemFilter<T> = (extensionItem: ExtensionItem<T>) => boolean
export interface ExtensionSlot<T> {
    readonly name: string
    readonly host: AppHost
    contribute(item: T, condition?: ContributionPredicate, shell?: PrivateShell): void
    getItems(forceAll?: boolean): Array<ExtensionItem<T>>
    getSingleItem(): ExtensionItem<T>
    getItemByName(name: string): ExtensionItem<T>
    discardBy(predicate: ExtensionItemFilter<T>): void
}

export interface ExtensionItem<T> {
    readonly name?: string
    readonly shell: PrivateShell
    readonly contribution: T
    readonly condition: ContributionPredicate
}

export interface JsxWithContainerCss {
    jsx: React.ReactNode
    containerCss: string | object
}

export interface AppHost {
    getStore(): Redux.Store
    getApi<TApi>(key: SlotKey<TApi>): TApi
    getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    getAllSlotKeys(): AnySlotKey[]
    getAllEntryPoints(): EntryPointsInfo[]
    isShellInstalled(name: string): boolean
    isLazyEntryPoint(name: string): boolean
    installPackages(packages: AnyPackage[]): void
    uninstallShells(names: string[]): void
    onShellsChanged(callback: InstalledShellsChangedCallback): string
    removeShellsChangedCallback(callbackId: string): void
    // readonly log: HostLogger; //TODO: define logging abstraction
}

export interface Shell extends Pick<AppHost, Exclude<keyof AppHost, 'getStore'>> {
    readonly name: string
    getStore<TState>(): ScopedStore<TState>
    canUseApis(): boolean
    canUseStore(): boolean
    declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    contributeApi<TApi>(key: SlotKey<TApi>, factory: () => TApi): TApi
    contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void
    contributeMainView(contributor: ReactComponentContributor): void
    // readonly log: ShellLogger; //TODO: define logging abstraction
}

export interface PrivateShell extends Shell {
    readonly entryPoint: EntryPoint
    setDependencyApis(apis: AnySlotKey[]): void
    setLifecycleState(enableStore: boolean, enableApis: boolean): void
}

export interface EntryPointsInfo {
    readonly name: string
    readonly lazy: boolean
    readonly installed: boolean
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
