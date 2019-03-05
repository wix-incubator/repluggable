import * as React from 'react'
import * as Redux from 'redux'

export type ScopedStore<S> = Pick<Redux.Store<S>, 'dispatch' | 'getState' | 'subscribe'>
export type ReactComponentContributor = () => React.ReactNode
export type SoloReactComponentContributor = () => JsxWithContainerCss
export type ReducersMapObjectContributor<TState = {}> = () => Redux.ReducersMapObject<TState>
export type ContributionPredicate = () => boolean
export type LazyFeatureFactory = () => Promise<FeatureLifecycle>
export interface LazyFeatureDescriptor {
    readonly name: string
    readonly factory: LazyFeatureFactory
}

export interface AnySlotKey {
    readonly name: string
}

export interface SlotKey<T> extends AnySlotKey {
    readonly empty?: T // holds no value, only triggers type-checking of T
}

export interface FeatureLifecycle {
    readonly name: string
    getDependencyApis?(): AnySlotKey[]
    install?(host: FeatureHost): void
    extend?(host: FeatureHost): void
    uninstall?(host: FeatureHost): void
}

export type AnyFeature = FeatureLifecycle | LazyFeatureDescriptor | Array<FeatureLifecycle | LazyFeatureDescriptor>

export type ExtensionItemFilter<T> = (extensionItem: ExtensionItem<T>) => boolean
export interface ExtensionSlot<T> {
    readonly name: string
    readonly host: AppHost
    contribute(item: T, condition?: ContributionPredicate, feature?: PrivateFeatureHost): void
    getItems(forceAll?: boolean): Array<ExtensionItem<T>>
    getSingleItem(): ExtensionItem<T>
    getItemByName(name: string): ExtensionItem<T>
    discardBy(predicate: ExtensionItemFilter<T>): void
}

export interface ExtensionItem<T> {
    readonly name?: string
    readonly feature: PrivateFeatureHost
    readonly contribution: T
    readonly condition: ContributionPredicate
}

export interface JsxWithContainerCss {
    jsx: React.ReactNode
    containerCss: string | Object
}

export interface AppHost {
    getStore(): Redux.Store
    getApi<TApi>(key: SlotKey<TApi>): TApi
    getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    getAllSlotKeys(): AnySlotKey[]
    getAllFeatures(): FeatureInfo[]
    isFeatureActive(name: string): boolean
    isFeatureInstalled(name: string): boolean
    isLazyFeature(name: string): boolean
    installFeatures(features: AnyFeature[]): void
    uninstallFeatures(names: string[]): void
    // readonly log: HostLogger; //TODO: define logging abstraction
}

export interface FeatureHost extends Pick<AppHost, Exclude<keyof AppHost, 'getStore'>> {
    readonly name: string
    getStore<TState>(): ScopedStore<TState>
    canUseApis(): boolean
    canUseStore(): boolean
    declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    contributeApi<TApi>(key: SlotKey<TApi>, factory: () => TApi): TApi
    contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void
    contributeMainView(contributor: ReactComponentContributor): void
    // readonly log: FeatureLogger; //TODO: define logging abstraction
}

export interface PrivateFeatureHost extends FeatureHost {
    readonly lifecycle: FeatureLifecycle
    setDependencyApis(apis: AnySlotKey[]): void
    setLifecycleState(enableStore: boolean, enableApis: boolean): void
}

export interface FeatureInfo {
    readonly name: string
    readonly lazy: boolean
    readonly installed: boolean
    readonly active: boolean
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

export interface FeatureLogger {
    debug(messageId: string, keyValuePairs?: Object): void;
    info(messageId: string, keyValuePairs?: Object): void;
    warning(messageId: string, keyValuePairs?: Object): void;
    error(messageId: string, keyValuePairs?: Object): void;
    span(messageId: string, keyValuePairs: Object, action: () => void): void;
    asyncSpan(messageId: string, keyValuePairs: Object, action: () => Promise<any>): void;
}
*/
