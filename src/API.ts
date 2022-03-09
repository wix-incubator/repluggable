import * as React from 'react'
import * as Redux from 'redux'
import { ThrottledStore } from './throttledStore'

export { AppHostAPI } from './appHostServices'

export type ScopedStore<S> = Pick<ThrottledStore<S>, 'dispatch' | 'getState' | 'subscribe' | 'flush'>
export type ReactComponentContributor<TProps = {}> = (props?: TProps) => React.ReactNode
export type ReducersMapObjectContributor<TState = {}, TAction extends Redux.AnyAction = Redux.AnyAction> = () => Redux.ReducersMapObject<
    TState,
    TAction
>
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
    readonly public?: boolean // TODO: Move to new interface - APIKey
}

/**
 * A key that represents an {ExtensionSlot} of shape T that's held in the {AppHost}
 * Created be calling {Shell.declareSlot}
 * Retrieved by calling {Shell.getSlot} (scoped to specific {Shell})
 *
 * @export
 * @interface SlotKey
 * @extends {AnySlotKey}
 * @template T
 */
export interface SlotKey<T> extends AnySlotKey {
    /**
     * Holds no value, only triggers type-checking of T
     */
    readonly empty?: T
    /**
     * Application layer/layers that will restrict usage of APIs contributed by this entry point.
     * Layers hierarchy is defined in the host options
     * @See {AppHostOptions.layers}
     */
    readonly layer?: string | string[] // TODO: Move to new interface - APIKey
    /**
     * Version of the API that will be part of the API key unique identification
     */
    readonly version?: number // TODO: Move to new interface - APIKey
}

/**
 * Application part that will receive a {Shell} when loaded into the {AppHost}
 * @export
 * @interface EntryPoint
 */
export interface EntryPoint {
    /**
     * Unique name that will represent this entry point in the host
     */
    readonly name: string
    readonly tags?: EntryPointTags
    /**
     * Application layer / layers that will restrict usage of APIs contributed by this entry point.
     * Layers hierarchy is defined in the host options
     * See {AppHostOptions.layers}
     */
    readonly layer?: string | string[]
    /**
     * Define which API keys (a.k.a. contracts) are mandatory for this entry point to be executed
     * @return {SlotKey<any>[]} API keys to wait for implementation
     */
    getDependencyAPIs?(): SlotKey<any>[]
    /**
     * Define which API keys (a.k.a. contracts) this entry point is going to implement and contribute
     * @return {SlotKey<any>[]} API keys that will be contributed
     */
    declareAPIs?(): SlotKey<any>[]
    /**
     * Execute logic that is independent from other entry points
     * Most commonly - contribute APIs and state
     * @param {Shell} shell
     */
    attach?(shell: Shell): void
    /**
     * Execute logic that is dependent on other entry points
     * @param {Shell} shell
     */
    extend?(shell: Shell): void
    /**
     * Clean side effects
     * @param {Shell} shell
     */
    detach?(shell: Shell): void
}

export type AnyEntryPoint = EntryPoint | LazyEntryPointDescriptor
export type EntryPointOrPackage = AnyEntryPoint | AnyEntryPoint[]
export interface EntryPointOrPackagesMap {
    [name: string]: EntryPointOrPackage
}

export type ExtensionItemFilter<T> = (extensionItem: ExtensionItem<T>) => boolean
/**
 * A slot/container for holding any contribution of shape T
 * Access to the slot is scoped to the {Shell}
 *
 * @export
 * @interface ExtensionSlot
 * @template T
 */
export interface ExtensionSlot<T> {
    /**
     * a unique identifier for the slot
     */
    readonly name: string
    readonly host: AppHost
    /**
     * Which {Shell} owns this slot
     */
    readonly declaringShell?: Shell
    /**
     * Add an item to the slot
     *
     * @param {Shell} shell Who owns the contributed item
     * @param {T} item Extension item to be added to the slot
     * @param {ContributionPredicate} [condition] A predicate to condition the retrieval of the item when slot items are requested with {ExtensionSlot<T>.getItems}
     */
    contribute(shell: Shell, item: T, condition?: ContributionPredicate): void
    /**
     * Get all items contributed to the slot
     *
     * @param {boolean} [forceAll] Ignore items' contribution predicates and get all anyway
     * @return {ExtensionItem<T>[]} All items contributed to the slot
     */
    getItems(forceAll?: boolean): ExtensionItem<T>[]
    /**
     * Get the first item in the slot
     *
     * @return {ExtensionItem<T>} The first item in the slot
     */
    getSingleItem(): ExtensionItem<T> | undefined
    /**
     * Get a specific item in the slot
     *
     * @param {string} name Extension item name
     * @return {ExtensionItem<T> | undefined} Extension item
     */
    getItemByName(name: string): ExtensionItem<T> | undefined
    /**
     * Remove items from the slot by predicate
     *
     * @param {ExtensionItemFilter<T> | undefined} predicate Remove all items matching this predicate
     */
    discardBy(predicate: ExtensionItemFilter<T>): void
}

export interface CustomExtensionSlotHandler<T> {
    contribute(fromShell: Shell, item: T, condition?: ContributionPredicate): void
    discardBy(predicate: ExtensionItemFilter<T>): void
}

export interface CustomExtensionSlot<T> extends CustomExtensionSlotHandler<T> {
    readonly name: string
    readonly host: AppHost
    readonly declaringShell?: Shell
}

/**
 * Item of shape T that is contributed to a slot of shape T
 *
 * @export
 * @interface ExtensionItem
 * @template T
 */
export interface ExtensionItem<T> {
    readonly name?: string
    /**
     * Which {Shell} owns this item
     */
    readonly shell: Shell
    /**
     * Contribution content
     */
    readonly contribution: T
    /**
     * Condition for the retrieval of this item by {ExtensionSlot<T>.getItems}
     */
    readonly condition: ContributionPredicate
    readonly uniqueId: string
}

// addEntryPoints(entryPoints: EntryPoint[])
// addPackages(packages: EntryPointOrPackage[])
//

/**
 * An application content container that will accept {EntryPoint} and provide registry for contracts
 *
 * @export
 * @interface AppHost
 */
export interface AppHost {
    /**
     * Get the root store of the application
     *
     * @return {ThrottledStore}
     */
    getStore(): ThrottledStore
    /**
     * Get an implementation of API previously contributed to the {AppHost}
     *
     * @template TAPI
     * @param {SlotKey<TAPI>} key API Key
     * @return {*}  {TAPI}
     */
    getAPI<TAPI>(key: SlotKey<TAPI>): TAPI
    /**
     * Get an extension slot defined on the host
     *
     * @template TItem
     * @param {SlotKey<TItem>} key
     * @return {ExtensionSlot<TItem>}
     */
    getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    /**
     * Get all the extension slots defined on the host
     *
     * @return {*}  {AnySlotKey[]}
     */
    getAllSlotKeys(): AnySlotKey[]
    /**
     * Get all {EntryPoint}s addded to the {AppHost}
     *
     * @return {EntryPointsInfo[]}
     */
    getAllEntryPoints(): EntryPointsInfo[]
    /**
     * Does the {AppHost} contain a specific {Shell}
     *
     * @param {string} name
     * @return {boolean}
     */
    hasShell(name: string): boolean
    // TODO: Deprecate
    isLazyEntryPoint(name: string): boolean
    /**
     * Dynamically add {Shell}s after the host is created
     *
     * @param {EntryPointOrPackage[]} entryPointsOrPackages New packages or entry points to be added to the {AppHost}
     * @return {Promise<void>}
     */
    addShells(entryPointsOrPackages: EntryPointOrPackage[]): Promise<void>
    /**
     * Dynamically remove {Shell}s after the host is created
     *
     * @param {string[]} names {Shell} names to be removed
     * @return {Promise<void>}
     */
    removeShells(names: string[]): Promise<void>
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

export interface APILayer {
    level: number
    name: string
}

export interface AppHostOptions {
    readonly logger?: HostLogger
    readonly monitoring: MonitoringOptions
    readonly layers?: APILayer[] | APILayer[][]
    readonly disableLayersValidation?: boolean
    readonly disableCheckCircularDependencies?: boolean
    readonly enableStickyErrorBoundaries?: boolean
    readonly enableReduxDevtoolsExtension?: boolean
    readonly experimentalCyclicMode?: boolean
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
    functionInterceptors?: { 
        [K in keyof TAPI]: (func: TAPI[K]) => TAPI[K]
    }
}

export type StateObserverUnsubscribe = () => void
export type StateObserver<TSelectorAPI> = (next: TSelectorAPI) => void
export interface ObservableState<TSelectorAPI> {
    subscribe(fromShell: Shell, callback: StateObserver<TSelectorAPI>): StateObserverUnsubscribe
    current(): TSelectorAPI
}

export type AnyFunction = (...args: any[]) => any
export type FunctionWithSameArgs<F extends AnyFunction> = (...args: Parameters<F>) => any

/**
 * An scoped communication terminal provided for an {EntryPoint}
 * in order to contribute its application content to the {AppHost}
 *
 * @export
 * @interface Shell
 * @extends {(Pick<AppHost, Exclude<keyof AppHost, 'getStore' | 'log' | 'options'>>)}
 */
export interface Shell extends Pick<AppHost, Exclude<keyof AppHost, 'getStore' | 'log' | 'options'>> {
    /**
     * Unique name of the matching {EntryPoint}
     */
    readonly name: string
    readonly log: ShellLogger
    /**
     * Get store that is scoped for this {Shell}
     *
     * @template TState
     * @return {ScopedStore<TState>} Scoped store for this {Shell}
     */
    getStore<TState>(): ScopedStore<TState>
    /**
     * Are APIs ready to be requested
     *
     * @return {*}  {boolean}
     */
    canUseAPIs(): boolean
    /**
     * Is store ready to be requested
     *
     * @return {*}  {boolean}
     */
    canUseStore(): boolean
    /**
     * Did the execution of {EntryPoint}s' lifecycle phases (attach, detach) are done
     *
     * @return {*}  {boolean}
     */
    wasInitializationCompleted(): boolean
    runLateInitializer<T>(initializer: () => T): T
    /**
     * Create an {ExtensionSlot}
     *
     * @template TItem
     * @param {SlotKey<TItem>} key Key that will represent the slot (an will be used for retrieval)
     * @return {ExtensionSlot<TItem>} Actual slot
     */
    declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>
    declareCustomSlot<TItem>(key: SlotKey<TItem>, handler: CustomExtensionSlotHandler<TItem>): CustomExtensionSlot<TItem>

    // TODO: Fix contributeAPI factory type not to resort to lowest common
    /**
     * Contribute an implementation of an API (a.k.a contract)
     *
     * @template TAPI
     * @param {SlotKey<TAPI>} key API Key that represents an interface TAPI
     * @param {() => TAPI} factory Create an implementation of TAPI
     * @param {ContributeAPIOptions<TAPI>} [options] Contribution options {ContributeAPIOptions}
     * @return {TAPI} Result of the factory execution
     */
    contributeAPI<TAPI>(key: SlotKey<TAPI>, factory: () => TAPI, options?: ContributeAPIOptions<TAPI>): TAPI
    /**
     * Contribute a Redux reducer that will be added to the host store.
     * Use it for slowly changing state (e.g. not changing because of mouse movement)
     *
     * @template TState
     * @param {ReducersMapObjectContributor<TState>} contributor
     */
    contributeState<TState, TAction extends Redux.AnyAction = Redux.AnyAction>(
        contributor: ReducersMapObjectContributor<TState, TAction>
    ): void

    /**
     * Contribute a Redux reducer that will be added to the host store
     * Use it for rapidly changing state (e.g. changing on every mouse movement event)
     * Changes to this state won't trigger the usual subscribers.
     * In order to subscribe to changes in this state, use the observer object returned by this function.
     *
     * @template TState
     * @param {ReducersMapObjectContributor<TState>} contributor
     * @return {TAPI} Observer object for subscribing to state changes. The observer can also be passed to {connectWithShell}.
     */
    contributeObservableState<TState, TSelector, TAction extends Redux.AnyAction = Redux.AnyAction>(
        contributor: ReducersMapObjectContributor<TState, TAction>,
        selectorFactory: (state: TState) => TSelector
    ): ObservableState<TSelector>

    /**
     * Contribute the main view (root) of the application
     * Intended to be used by a single {Shell} in an application
     *
     * @param {Shell} fromShell Who owns the main view
     * @param {ReactComponentContributor} contributor Create the main view component
     */
    contributeMainView(fromShell: Shell, contributor: ReactComponentContributor): void
    contributeBoundaryAspect(component: ShellBoundaryAspect): void
    /**
     * Create a function with internal cache until any state change in the {AppHost} store
     *
     * @template T
     * @param {T} func Function to build cache for
     * @param {FunctionWithSameArgs<T>} resolver Key creator to index results by
     * @param {() => boolean} [shouldClear] Custom clear condition (if not provided, behaves like () => true)
     * @return {*}  {(((...args: Parameters<T>) => ReturnType<T>) & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>)}
     */
    memoizeForState<T extends AnyFunction>(
        func: T,
        resolver: FunctionWithSameArgs<T>,
        shouldClear?: () => boolean
    ): ((...args: Parameters<T>) => ReturnType<T>) & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>
    /**
     * Manually trigger clear condition for function memoized with {Shell.memoizeForState}
     */
    flushMemoizedForState(): void
    /**
     * Create a function with internal cache
     *
     * @template T
     * @param {T} func Function to build cache for
     * @param {FunctionWithSameArgs<T>} resolver Key creator to index results by
     * @return {*}  {(((...args: Parameters<T>) => ReturnType<T>) & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>)}
     */
    memoize<T extends AnyFunction>(
        func: T,
        resolver: FunctionWithSameArgs<T>
    ): ((...args: Parameters<T>) => ReturnType<T>) & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>
    /**
     * Clear cache of a memoized function
     *
     * @param {(Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>)} memoizedFunction
     */
    clearCache(memoizedFunction: Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>): void
}

export interface PrivateShell extends Shell {
    readonly entryPoint: EntryPoint
    setDependencyAPIs(APIs: AnySlotKey[]): void
    setLifecycleState(enableStore: boolean, enableAPIs: boolean, initCompleted: boolean): void
    getBoundaryAspects(): ShellBoundaryAspect[]
    getHostOptions(): AppHostOptions
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

export type LogSeverity = 'debug' | 'info' | 'event' | 'warning' | 'error' | 'critical'
export type LogSpanFlag = 'begin' | 'end' //TODO:deprecated-kept-for-backward-compat

export interface HostLogger {
    log(severity: LogSeverity, id: string, error?: Error, keyValuePairs?: Object): void
    spanChild(messageId: string, keyValuePairs?: Object): ShellLoggerSpan
    spanRoot(messageId: string, keyValuePairs?: Object): ShellLoggerSpan
}

export interface ShellLogger extends HostLogger {
    debug(messageId: string, keyValuePairs?: Object): void
    info(messageId: string, keyValuePairs?: Object): void
    warning(messageId: string, keyValuePairs?: Object): void
    error(messageId: string, error?: Error, keyValuePairs?: Object): void
    critical(messageId: string, error?: Error, keyValuePairs?: Object): void
    spanChild(messageId: string, keyValuePairs?: Object): ShellLoggerSpan
    spanRoot(messageId: string, keyValuePairs?: Object): ShellLoggerSpan
    monitor<T>(messageId: string, keyValuePairs: Object, monitoredCode: () => T): T
}

export interface ShellLoggerSpan {
    end(success: boolean, error?: Error, keyValuePairs?: Object): void
}
