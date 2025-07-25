import _ from 'lodash'
import { AnyAction, Store } from 'redux'
import {
    AnyEntryPoint,
    AnyFunction,
    AnySlotKey,
    APILayer,
    AppHost,
    AppHostOptions,
    ContributeAPIOptions,
    CustomExtensionSlot,
    CustomExtensionSlotHandler,
    DeclarationsChangedCallback,
    EntryPoint,
    EntryPointOrPackage,
    EntryPointsInfo,
    ExtensionItem,
    ExtensionSlot,
    FunctionWithSameArgs,
    Lazy,
    LazyEntryPointDescriptor,
    LazyEntryPointFactory,
    MemoizeMissHit,
    ObservableState,
    PrivateAppHost,
    PrivateShell,
    ReactComponentContributor,
    ReducersMapObjectContributor,
    ScopedStore,
    Shell,
    ShellBoundaryAspect,
    ShellsChangedCallback,
    SlotKey,
    StatisticsMemoization,
    Trace,
    UnsubscribeFromDeclarationsChanged
} from './API'
import { AppHostAPI, AppHostServicesProvider, createAppHostServicesEntryPoint } from './appHostServices'
import { declaredAPIs, dependentAPIs } from './appHostUtils'
import { AnyExtensionSlot, createCustomExtensionSlot, createExtensionSlot } from './extensionSlot'
import { InstalledShellsActions, InstalledShellsSelectors, ShellToggleSet } from './installedShellsState'
import { IterableWeakMap } from './IterableWeakMap'
import { ConsoleHostLogger, createShellLogger } from './loggers'
import { monitorAPI } from './monitorAPI'
import { setupDebugInfo } from './repluggableAppDebug'
import { getCycle, Graph, Tarjan } from './tarjanGraph'
import {
    createObservable,
    createThrottledStore,
    PrivateObservableState,
    PrivateThrottledStore,
    StateContribution,
    ThrottledStore,
    updateThrottledStore
} from './throttledStore'
import { INTERNAL_DONT_USE_SHELL_GET_APP_HOST } from './__internal'

function isMultiArray<T>(v: T[] | T[][]): v is T[][] {
    return _.every(v, _.isArray)
}
function castMultiArray<T>(v: T[] | T[][]): T[][] {
    return isMultiArray(v) ? v : [v]
}

export const makeLazyEntryPoint = (name: string, factory: LazyEntryPointFactory): LazyEntryPointDescriptor => {
    return {
        name,
        factory
    }
}

export const mainViewSlotKey: SlotKey<ReactComponentContributor> = {
    name: 'mainView'
}
export const stateSlotKey: SlotKey<StateContribution> = {
    name: 'state'
}

interface MemoizedFunctionData {
    f: Partial<_.MemoizedFunction>
    shouldClear?(): boolean
}

const toShellToggleSet = (names: string[], isInstalled: boolean): ShellToggleSet => {
    return names.reduce<ShellToggleSet>((result: ShellToggleSet, name: string) => {
        result[name] = isInstalled
        return result
    }, {})
}

interface UnreadyEntryPointsStore {
    get(): EntryPoint[]
    set(entryPoints: EntryPoint[]): void
}

const createUnreadyEntryPointsStore = (): UnreadyEntryPointsStore => {
    let entryPoints: EntryPoint[] = []

    return {
        get() {
            return entryPoints
        },
        set(newEntryPoints: EntryPoint[]) {
            entryPoints = newEntryPoints
        }
    }
}

interface InternalAPILayer extends APILayer {
    dimension: number
}

const verifyLayersUniqueness = (layers?: APILayer[] | APILayer[][]) => {
    if (!layers) {
        return
    }
    const flatLayers = _.flatten(layers)
    const nonUnique = _(flatLayers)
        .countBy(({ name }) => name)
        .pickBy(v => v > 1)
        .keys()
        .value()
    if (nonUnique.length > 0) {
        throw new Error(`Cannot initialize host with non unique layers: ${nonUnique}`)
    }
}

export function createAppHost(initialEntryPointsOrPackages: EntryPointOrPackage[], options: AppHostOptions = { monitoring: {} }): AppHost {
    let store: PrivateThrottledStore | null = null
    let isInstallingEntryPoints: boolean = false
    let isStoreSubscribersNotifyInProgress = false
    let isObserversNotifyInProgress = false
    let shouldFlushMemoizationSync = false
    let isBatchingDeclarationsChangedCallbacks = false
    const entryPointsInstallationEndCallbacks: Map<string, () => void> = new Map()

    verifyLayersUniqueness(options.layers)

    const unReadyEntryPointsStore = createUnreadyEntryPointsStore()

    const layers: InternalAPILayer[][] = _.map(options.layers ? castMultiArray(options.layers) : [], (singleDimension, i) =>
        _.map(singleDimension, layer => ({ ...layer, dimension: i }))
    )

    const trace: Trace[] = []
    const memoizedArr: StatisticsMemoization[] = []

    const readyAPIs = new Set<AnySlotKey>()

    const createExtensionSlotsMap = (): Map<AnySlotKey, AnyExtensionSlot> => {
        const originalMap = new Map<AnySlotKey, AnyExtensionSlot>()

        const proxyHandler = {
            get(target: Map<AnySlotKey, AnyExtensionSlot>, propertyName: string | symbol) {
                if (propertyName === 'set') {
                    return function (key: AnySlotKey, value: AnyExtensionSlot) {
                        return batchDeclarationsChangedCallbacks(() => target.set(key, value))
                    }
                }

                if (propertyName === 'delete') {
                    return function (key: AnySlotKey) {
                        return batchDeclarationsChangedCallbacks(() => target.delete(key))
                    }
                }

                const originalProperty = target[propertyName as keyof Map<AnySlotKey, AnyExtensionSlot>]

                if (typeof originalProperty === 'function') {
                    return originalProperty.bind(target)
                }

                return originalProperty
            }
        }

        return new Proxy(originalMap, proxyHandler)
    }

    const uniqueShellNames = new Set<string>()
    const extensionSlots = createExtensionSlotsMap()
    const slotKeysByName = new Map<string, AnySlotKey>()
    const addedShells = new Map<string, PrivateShell>()
    const shellInstallers = new WeakMap<PrivateShell, string[]>()
    const lazyShells = new Map<string, LazyEntryPointFactory>()
    const shellsChangedCallbacks = new Map<string, ShellsChangedCallback>()
    const declarationsChangedCallbacks = new Map<string, DeclarationsChangedCallback>()
    const APILayers = new WeakMap<AnySlotKey, APILayer[] | undefined>()

    const memoizedFunctions: IterableWeakMap<AnyFunction, MemoizedFunctionData> = new IterableWeakMap()
    let shouldFlushMemoization = false

    const hostAPI: AppHostAPI = {
        getAllEntryPoints: () => [...addedShells.entries()].map(([, { entryPoint }]) => entryPoint),
        getAppHostOptions: () => options
    }
    const appHostServicesEntryPoint = createAppHostServicesEntryPoint(() => hostAPI)
    const host: PrivateAppHost & AppHostServicesProvider = {
        getStore,
        getAPI,
        hasAPI,
        getSlot,
        hasSlot,
        getAllSlotKeys,
        getAllEntryPoints,
        hasShell,
        isLazyEntryPoint,
        addShells,
        removeShells,
        onShellsChanged,
        onDeclarationsChanged,
        removeShellsChangedCallback,
        verifyPendingEntryPointsAPIsMismatch,
        getAppHostServicesShell: appHostServicesEntryPoint.getAppHostServicesShell,
        log: options.logger ? options.logger : ConsoleHostLogger,
        options,
        executeWhenFree
    }

    setupDebugInfo({
        host,
        readyAPIs,
        uniqueShellNames,
        extensionSlots,
        addedShells,
        shellInstallers,
        lazyShells,

        performance: {
            options,
            trace,
            memoizedArr
        },

        getUnreadyEntryPoints: unReadyEntryPointsStore.get,
        getOwnSlotKey,
        getAPI
    })

    declareSlot<ReactComponentContributor>(mainViewSlotKey)
    declareSlot<StateContribution>(stateSlotKey)
    addShells([appHostServicesEntryPoint])

    const memoize = <T extends AnyFunction>(
        func: T,
        resolver: FunctionWithSameArgs<T>
    ): ((...args: Parameters<T>) => ReturnType<T>) & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit> => {
        if (options.monitoring.disableMemoization) {
            return func
        }
        const memoized = _.memoize(func, resolver)

        if (options.monitoring.debugMemoization) {
            Object.defineProperty(memoized, 'name', { value: `${func.name}_memoized`, writable: false })
        }

        if (options.monitoring.disableMonitoring) {
            return memoized
        }

        const enrichedMemoization = enrichMemoization(memoized)

        if (options.monitoring.debugMemoization) {
            return (...args: any[]) => {
                const memRes = enrichedMemoization(...args)
                const res = func(...args)
                if (!_.isEqual(memRes, res)) {
                    console.log(`Memoization Error`)
                    console.log(`Memoization returns:`, memRes)
                    console.log(`Original Func returns:`, res)
                    console.log(`Original Func:`, func)
                }
                return memRes
            }
        }
        return enrichedMemoization
    }

    function lazyEvaluator<F extends AnyFunction, T extends ReturnType<F>>(fn: F): Lazy<T> {
        let _value: T
        let _resolved: boolean = false

        return {
            get: () => {
                if (!_resolved) {
                    _value = fn()
                    _resolved = true
                }

                return _value
            }
        }
    }

    // we know that addShells completes synchronously
    addShells(initialEntryPointsOrPackages)

    return host

    //TODO: get rid of LazyEntryPointDescriptor
    function isLazyEntryPointDescriptor(value: AnyEntryPoint): value is LazyEntryPointDescriptor {
        return typeof (value as LazyEntryPointDescriptor).factory === 'function'
    }

    function enrichMemoization<T extends _.MemoizedFunction & Partial<MemoizeMissHit>>(memoized: T): T & MemoizeMissHit {
        const memoizedWithMissHit = _.assign(memoized, {
            miss: 0,
            calls: 0,
            hit: 0,
            printHitMiss: () =>
                console.log(
                    `calls: ${memoizedWithMissHit.calls}
hit: ${memoizedWithMissHit.hit}
miss: ${memoizedWithMissHit.miss}
`
                )
        })

        const getter = memoizedWithMissHit.cache.get.bind(memoized.cache)

        memoizedWithMissHit.cache.get = (key: any) => {
            memoizedWithMissHit.calls++
            memoizedWithMissHit.hit++
            return getter(key)
        }

        const setter = memoizedWithMissHit.cache.set.bind(memoizedWithMissHit.cache)

        memoizedWithMissHit.cache.set = (key: any, value: any) => {
            memoizedWithMissHit.calls++
            memoizedWithMissHit.miss++
            return setter(key, value)
        }
        return memoizedWithMissHit
    }

    function getLayerByName(layerName: string): InternalAPILayer {
        const layer = _(layers).flatten().find({ name: layerName })
        if (!layer) {
            throw new Error(`Cannot find layer ${layerName}`)
        }
        return layer
    }

    type Dependency = { layer?: InternalAPILayer; apiKey: SlotKey<any> } | undefined
    function validateEntryPointLayer(entryPoint: EntryPoint) {
        if (!entryPoint.getDependencyAPIs || !entryPoint.layer || _.isEmpty(layers)) {
            return
        }
        const highestLevelDependencies: Dependency[] = _.chain(entryPoint.getDependencyAPIs())
            .flatMap<Dependency>(apiKey =>
                apiKey.layer
                    ? _(apiKey.layer)
                          .castArray()
                          .map(l => ({
                              layer: getLayerByName(l),
                              apiKey
                          }))
                          .value()
                    : { apiKey }
            )
            .groupBy(dependency => dependency?.layer?.dimension)
            .map(dimension => _.maxBy(dimension, dependency => (dependency?.layer ? dependency.layer.level : -Infinity)))
            .value()

        const currentLayers = _(entryPoint.layer)
            .castArray()
            .map(l => getLayerByName(l))
            .value()

        const getCurrentLayerOfSameDimension = (layer: InternalAPILayer): InternalAPILayer | undefined => {
            return currentLayers.find(entryPointLayer => entryPointLayer.dimension === layer.dimension)
        }

        highestLevelDependencies.forEach(highestLevelDependency => {
            const currentLayer = highestLevelDependency?.layer && getCurrentLayerOfSameDimension(highestLevelDependency.layer)
            if (highestLevelDependency?.layer && currentLayer && currentLayer.level < highestLevelDependency.layer.level) {
                throw new Error(
                    `Entry point ${entryPoint.name} of layer ${currentLayer.name} cannot depend on API ${slotKeyToName(
                        highestLevelDependency.apiKey
                    )} of layer ${highestLevelDependency.layer.name}`
                )
            }
        })
    }

    function validateLayers(entryPoints: AnyEntryPoint[]) {
        _.forEach(entryPoints, ep => validateEntryPointLayer(ep))
    }

    function addShells(entryPointsOrPackages: EntryPointOrPackage[]): Promise<void> {
        host.log.log('verbose', `Adding ${entryPointsOrPackages.length} packages.`)

        const entryPoints = _.flatten(entryPointsOrPackages)
        const existingEntryPoints = Object.values(addedShells).map(shell => shell.entryPoint)
        const allEntryPoints = existingEntryPoints.concat(unReadyEntryPointsStore.get(), entryPoints)

        if (!options.disableLayersValidation) {
            validateLayers(entryPoints)
        }
        validateUniqueShellNames(entryPoints)
        !options.disableCheckCircularDependencies && !options.experimentalCyclicMode && validateCircularDependency(allEntryPoints)

        const [lazyEntryPointsList, readyEntryPointsList] = _.partition(entryPoints, isLazyEntryPointDescriptor) as [
            LazyEntryPointDescriptor[],
            EntryPoint[]
        ]

        executeInstallShell(readyEntryPointsList)
        lazyEntryPointsList.forEach(registerLazyEntryPoint)

        setInstalledShellNames(getInstalledShellNames().concat(_.map(lazyEntryPointsList, 'name')))
        return Promise.resolve()
    }

    function isAllAPIDependenciesAreReadyOrPending(
        checkedKey: SlotKey<any>,
        pendingEntryPoints: EntryPoint[],
        passed: SlotKey<any>[] = []
    ): boolean {
        // TODO: Avoid iterating N (cycle length) times for the same cycle
        const declarers = pendingEntryPoints.flatMap(ep => (ep.declareAPIs?.() || []).map(k => [k, ep] as const))
        const [, keyDeclarerEntryPoint] = declarers.find(([k, ep]) => _.isEqual(k, checkedKey)) || []
        if (!keyDeclarerEntryPoint) {
            return false
        }

        const dependencies = keyDeclarerEntryPoint.getDependencyAPIs && keyDeclarerEntryPoint.getDependencyAPIs()
        const uncheckDependencies = _.differenceWith(dependencies, passed, _.isEqual)

        const everyDependenciesReadyOrPending = _.every(
            uncheckDependencies,
            k => readyAPIs.has(getOwnSlotKey(k)) || isAllAPIDependenciesAreReadyOrPending(k, pendingEntryPoints, passed.concat(checkedKey))
        )

        return everyDependenciesReadyOrPending
    }

    function onInstallShellsEnd() {
        const callbacks = entryPointsInstallationEndCallbacks.values()
        try {
            for (const callback of callbacks) {
                callback()
            }
        } finally {
            entryPointsInstallationEndCallbacks.clear()
        }
    }

    function executeInstallShell(entryPoints: EntryPoint[]): void {
        const [readyEntryPoints, currentUnReadyEntryPoints] = _.partition(entryPoints, entryPoint => {
            const dependencies = entryPoint.getDependencyAPIs && entryPoint.getDependencyAPIs()
            return _.every(
                dependencies,
                k =>
                    readyAPIs.has(getOwnSlotKey(k)) ||
                    (options.experimentalCyclicMode && isAllAPIDependenciesAreReadyOrPending(k, entryPoints))
            )
        })

        unReadyEntryPointsStore.set(_.union(_.difference(unReadyEntryPointsStore.get(), readyEntryPoints), currentUnReadyEntryPoints))
        if (store && _.isEmpty(readyEntryPoints)) {
            onInstallShellsEnd()
            return
        }

        const shells = readyEntryPoints.map(createShell)
        executeReadyEntryPoints(shells)
    }

    function executeReadyEntryPoints(shells: PrivateShell[]): void {
        batchDeclarationsChangedCallbacks(() => {
            isInstallingEntryPoints = true
            try {
                invokeEntryPointPhase(
                    'getDependencyAPIs',
                    shells,
                    f => f.entryPoint.getDependencyAPIs && f.setDependencyAPIs(f.entryPoint.getDependencyAPIs()),
                    f => !!f.entryPoint.getDependencyAPIs
                )

                invokeEntryPointPhase(
                    'attach',
                    shells,
                    f => f.entryPoint.attach && f.entryPoint.attach(f),
                    f => !!f.entryPoint.attach
                )

                buildStore()
                shells.forEach(f => f.setLifecycleState(true, true, false))

                invokeEntryPointPhase(
                    'extend',
                    shells,
                    f => f.entryPoint.extend && f.entryPoint.extend(f),
                    f => !!f.entryPoint.extend
                )

                shells.forEach(f => {
                    addedShells.set(f.entryPoint.name, f)
                    f.setLifecycleState(true, true, true)
                })
            } finally {
                isInstallingEntryPoints = false
            }
            executeInstallShell(unReadyEntryPointsStore.get())
        })
    }

    function executeShellsChangedCallbacks() {
        shellsChangedCallbacks.forEach(f => f(_.keys(InstalledShellsSelectors.getInstalledShellsSet(getStore().getState()))))
    }

    function executeDeclarationsChangedCallbacks() {
        declarationsChangedCallbacks.forEach(f => f())
    }

    function batchDeclarationsChangedCallbacks<T>(action: () => T): T {
        if (isBatchingDeclarationsChangedCallbacks) {
            return action()
        }
        try {
            isBatchingDeclarationsChangedCallbacks = true
            const result = action()
            executeDeclarationsChangedCallbacks()
            return result
        } finally {
            isBatchingDeclarationsChangedCallbacks = false
        }
    }

    function setInstalledShellNames(names: string[]) {
        const updates = toShellToggleSet(names, true)
        getStore().dispatch(InstalledShellsActions.updateInstalledShells(updates))
        executeShellsChangedCallbacks()
    }

    function setUninstalledShellNames(names: string[]) {
        const updates = toShellToggleSet(names, false)
        getStore().dispatch(InstalledShellsActions.updateInstalledShells(updates))
        executeShellsChangedCallbacks()
    }

    function onDeclarationsChanged(callback: DeclarationsChangedCallback): UnsubscribeFromDeclarationsChanged {
        const callbackId = _.uniqueId('declarations-changed-callback-')
        declarationsChangedCallbacks.set(callbackId, callback)
        return () => {
            declarationsChangedCallbacks.delete(callbackId)
        }
    }

    function onShellsChanged(callback: ShellsChangedCallback) {
        const callbackId = _.uniqueId('shells-changed-callback-')
        shellsChangedCallbacks.set(callbackId, callback)
        return callbackId
    }

    function removeShellsChangedCallback(callbackId: string) {
        shellsChangedCallbacks.delete(callbackId)
    }

    function declareSlot<TItem>(key: SlotKey<TItem>, declaringShell?: Shell): ExtensionSlot<TItem> {
        const newSlot = registerSlotOrThrow(key, () => createExtensionSlot(key, host, declaringShell))
        return newSlot
    }

    function declareCustomSlot<TItem>(
        key: SlotKey<TItem>,
        handler: CustomExtensionSlotHandler<TItem>,
        declaringShell?: Shell
    ): CustomExtensionSlot<TItem> {
        const newSlot = registerSlotOrThrow(key, () => createCustomExtensionSlot(key, handler, host, declaringShell))
        return newSlot
    }

    function slotKeyToName<T>(key: SlotKey<T>): string {
        return key.version === undefined ? key.name : `${key.name}(v${key.version})`
    }

    function registerSlotOrThrow<TItem, TSlot extends AnyExtensionSlot>(key: SlotKey<TItem>, factory: () => TSlot): TSlot {
        const slotName = slotKeyToName(key)
        if (!extensionSlots.has(key) && !slotKeysByName.has(slotName)) {
            const newSlot = factory()

            extensionSlots.set(key, newSlot)
            slotKeysByName.set(slotName, key)

            return newSlot
        }
        throw new Error(`Extension slot with key '${slotName}' already exists.`)
    }

    function getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        const ownKey = getOwnSlotKey(key)
        const anySlot = extensionSlots.get(ownKey)

        if (anySlot) {
            return anySlot as ExtensionSlot<TItem>
        }
        throw new Error(`Extension slot with key '${slotKeyToName(key)}' doesn't exist.`)
    }

    function hasSlot<TItem>(key: SlotKey<TItem>): boolean {
        const ownKey = getOwnSlotKey(key)
        return extensionSlots.has(ownKey)
    }

    function tryGetAPI<TAPI>(key: SlotKey<TAPI>): TAPI | undefined {
        if (!hasSlot(key)) {
            return
        }
        const APISlot = getSlot<TAPI>(key)
        const item = APISlot.getSingleItem()
        return item?.contribution
    }

    function getAPI<TAPI>(key: SlotKey<TAPI>): TAPI {
        const api = tryGetAPI(key)
        if (!api) {
            throw new Error(`API '${slotKeyToName(key)}' doesn't exist.`)
        }
        return api
    }

    function hasAPI<TAPI>(key: SlotKey<TAPI>): boolean {
        return !!tryGetAPI(key)
    }

    function executeWhenFree(key: string, callback: () => void): void {
        if (isInstallingEntryPoints) {
            entryPointsInstallationEndCallbacks.set(key, callback)
        } else {
            callback()
        }
    }

    function getStore(): ThrottledStore {
        if (store) {
            return store
        }
        throw new Error('Store was not yet created')
    }

    function getAllSlotKeys(): AnySlotKey[] {
        return Array.from(extensionSlots.keys())
    }

    function getAllEntryPoints(): EntryPointsInfo[] {
        throw new Error('not implemented')
    }

    function hasShell(name: string): boolean {
        const installedShellsSet = InstalledShellsSelectors.getInstalledShellsSet(getStore().getState())
        return installedShellsSet[name] === true
    }

    function isLazyEntryPoint(name: string): boolean {
        return lazyShells.has(name)
    }

    function registerLazyEntryPoint(descriptor: LazyEntryPointDescriptor): void {
        lazyShells.set(descriptor.name, descriptor.factory)
    }

    function getOwnSlotKey<T>(key: SlotKey<T>): SlotKey<T> {
        if (key.public === true) {
            const ownKey = slotKeysByName.get(slotKeyToName(key))
            if (ownKey && ownKey.public) {
                return ownKey as SlotKey<T>
            }
        }
        return key
    }

    function validateUniqueShellNames(entryPoints: AnyEntryPoint[]): void {
        entryPoints.forEach(f => validateUniqueShellName(f.name))
    }

    function validateUniqueShellName(name: string): void {
        if (!uniqueShellNames.has(name)) {
            uniqueShellNames.add(name)
        } else {
            throw new Error(`Shell named '${name}' already exists`)
        }
    }

    function validateCircularDependency(entryPoints: AnyEntryPoint[]): void {
        const allDeclaredAPIs = new Map<string, AnyEntryPoint>()
        for (const ep of entryPoints) {
            const apis = declaredAPIs(ep)
            for (const api of apis) {
                const existingDeclaration = allDeclaredAPIs.get(api.name)
                if (existingDeclaration) {
                    host.log.log(
                        'warning',
                        `The API: ${api.name} is declared in multiple endpoints: ${existingDeclaration.name} and ${ep.name}`
                    )
                } else {
                    allDeclaredAPIs.set(api.name, ep)
                }
            }
        }

        const graph = new Graph()
        entryPoints.forEach(ep => {
            const declaredApis = declaredAPIs(ep).map(x => slotKeyToName(x))
            const dependencies = dependentAPIs(ep).map(x => slotKeyToName(x))
            declaredApis.forEach(d => dependencies.forEach(y => graph.addConnection(d, y)))
        })

        const tarjan = new Tarjan(graph)
        const sccs = tarjan.run()

        for (const scc of sccs) {
            if (scc.length > 1) {
                const dependentGraph: { [key: string]: string[] } = {}
                entryPoints.forEach(ep => {
                    const declaredApis = declaredAPIs(ep).map(child => child.name)
                    const dependencies = dependentAPIs(ep).map(child => child.name)
                    declaredApis.forEach(d => {
                        dependentGraph[d] = dependencies
                    })
                })

                const circle = getCycle(dependentGraph)
                if (circle) {
                    const reversedCircle = circle.reverse()
                    host.log.log('error', `Circular API dependency found: ${reversedCircle.join(' -> ')}`)
                    throw new Error(`Circular API dependency found`)
                }
            }
        }
    }

    function buildStore(): Store {
        const contributedState = getSlot(stateSlotKey)

        if (store) {
            updateThrottledStore(host, store, contributedState)
        } else {
            store = createThrottledStore(
                host,
                contributedState,
                notifySubscribersIsRunning => {
                    isStoreSubscribersNotifyInProgress = notifySubscribersIsRunning
                },
                notifyObserversIsRunning => {
                    isObserversNotifyInProgress = notifyObserversIsRunning
                },
                updateShouldFlushMemoizationSync => {
                    shouldFlushMemoizationSync = updateShouldFlushMemoizationSync
                }
            )
            store.subscribe(() => {
                if (shouldFlushMemoization) {
                    shouldFlushMemoization = false
                    flushMemoizedForState()
                }
            })
            store.syncSubscribe(() => {
                shouldFlushMemoization = true
                if (isStoreSubscribersNotifyInProgress || isObserversNotifyInProgress || shouldFlushMemoizationSync) {
                    shouldFlushMemoization = false
                    flushMemoizedForState()
                }
            })
        }

        return store
    }

    function flushMemoizedForState() {
        memoizedFunctions.forEach(({ f, shouldClear }) => {
            if ((shouldClear || _.stubTrue)()) {
                clearCache(f)
            }
        })
    }

    function clearCache(memoizedFunction: Partial<_.MemoizedFunction> & Partial<MemoizeMissHit>) {
        if (memoizedFunction.cache && memoizedFunction.cache.clear) {
            memoizedFunction.cache.clear()
        }
    }

    function invokeEntryPointPhase(
        phase: keyof EntryPoint, // TODO: Exclude 'name'
        shell: PrivateShell[],
        action: (shell: PrivateShell) => void,
        predicate?: (shell: PrivateShell) => boolean
    ): void {
        host.log.log('verbose', `--- ${phase} phase ---`)

        try {
            shell.filter(f => !predicate || predicate(f)).forEach(f => invokeShell(f, action, phase))
        } catch (err) {
            console.error(`${phase} phase FAILED`, err)
            throw err
        }

        host.log.log('verbose', `--- End of ${phase} phase ---`)
    }

    function invokeShell(shell: PrivateShell, action: (shell: PrivateShell) => void, phase: string): void {
        host.log.log('verbose', `${phase} : ${shell.entryPoint.name}`)

        try {
            action(shell)
        } catch (err) {
            host.log.log('error', 'AppHost.shellFailed', err, {
                shell: shell.name,
                phase,
                message: `Shell '${shell.name}' FAILED ${phase} phase`,
                error: err
            })
            throw err
        }
    }

    function getAPIContributor<TAPI>(key: SlotKey<TAPI>): Shell | undefined {
        const ownKey = getOwnSlotKey(key)
        return extensionSlots.has(ownKey) ? _.get(getSlot<TAPI>(ownKey).getSingleItem(), 'shell') : undefined
    }

    function doesExtensionItemBelongToShells(extensionItem: ExtensionItem<any>, shellNames: string[]) {
        return (
            _.includes(shellNames, extensionItem.shell.name) ||
            _.some(_.invoke((extensionItem.shell as PrivateShell).entryPoint, 'getDependencyAPIs'), APIKey =>
                _.includes(shellNames, _.get(getAPIContributor(APIKey), 'name'))
            )
        )
    }

    function discardSlotKey<T>(key: SlotKey<T>) {
        const ownKey = getOwnSlotKey(key)
        readyAPIs.delete(ownKey)
        extensionSlots.delete(ownKey)
        slotKeysByName.delete(slotKeyToName(ownKey))

        host.log.log('verbose', `-- Removed slot keys: ${slotKeyToName(ownKey)} --`)
    }

    function findDependantShells(entryShell: PrivateShell): PrivateShell[] {
        const cache = new Map<string, PrivateShell[]>()

        const _findDependantShells = (declaringShell: PrivateShell): PrivateShell[] =>
            _([...addedShells.entries()])
                .flatMap(([name, shell]) => {
                    const cachedValue = cache.get(name)
                    if (cachedValue) {
                        return cachedValue
                    }
                    const dependencyAPIs = shell.entryPoint?.getDependencyAPIs?.() || []
                    const isDependant = dependencyAPIs.some(key => getAPIContributor(key)?.name === declaringShell.name)
                    if (!isDependant) {
                        return []
                    }
                    const dependencies = [shell, ..._findDependantShells(shell)]
                    cache.set(name, dependencies)
                    return dependencies
                })
                .uniqBy('name')
                .value()

        return _findDependantShells(entryShell)
    }

    function isShellBeingDependantOnInGroup(declaringShell: PrivateShell, shells: PrivateShell[]): boolean {
        return !!shells.find(dependantShell => {
            const dependencyAPIs = dependantShell.entryPoint?.getDependencyAPIs?.() || []
            return dependencyAPIs.find(key => getAPIContributor(key)?.name === declaringShell.name)
        })
    }
    function executeDetachOnShellReadyForRemoval(shellsToBeDetached: PrivateShell[], originalRequestedRemovalNames: string[]) {
        invokeEntryPointPhase('detach', shellsToBeDetached, f => _.invoke(f.entryPoint, 'detach', f))

        const detachedShellsNames = shellsToBeDetached.map(({ name }) => name)

        const slotKeysToDiscard = findContributedAPIs(detachedShellsNames).concat(findDeclaredSlotKeys(detachedShellsNames))

        extensionSlots.forEach(extensionSlot =>
            (extensionSlot as ExtensionSlot<any>).discardBy(extensionItem =>
                doesExtensionItemBelongToShells(extensionItem, detachedShellsNames)
            )
        )

        detachedShellsNames.forEach(name => {
            const isResultOfMissingDependency = !originalRequestedRemovalNames.includes(name)
            if (isResultOfMissingDependency) {
                const entryPoint = addedShells.get(name)?.entryPoint
                entryPoint && unReadyEntryPointsStore.get().push(entryPoint)
            }
            addedShells.delete(name)
            uniqueShellNames.delete(name)
        })

        slotKeysToDiscard.forEach(discardSlotKey)

        host.log.log('verbose', `Done uninstalling ${detachedShellsNames}`)
    }

    function executeUninstallShells(names: string[]): void {
        batchDeclarationsChangedCallbacks(() => {
            host.log.log('verbose', `-- Uninstalling ${names} --`)

            const shellsCandidatesToBeDetached = _(names)
                .map(name => addedShells.get(name))
                .compact()
                .flatMap<PrivateShell>(shell => [shell, ...findDependantShells(shell)])
                .uniqBy('name')
                .value()

            let queue = shellsCandidatesToBeDetached
            while (!_.isEmpty(queue)) {
                const shellsToBeDetached = queue.filter(ep => !isShellBeingDependantOnInGroup(ep, queue))
                if (_.isEmpty(shellsToBeDetached)) {
                    throw new Error(`Some shells could not detach: ${queue.map(({ name }) => name).join()}`)
                }
                executeDetachOnShellReadyForRemoval(shellsToBeDetached, names)
                queue = _.differenceBy(queue, shellsToBeDetached, 'name')
            }
        })
    }

    function findContributedAPIs(shellNames: string[]) {
        return [...readyAPIs].filter(APIKey => _.includes(shellNames, _.get(getAPIContributor(APIKey), 'name')))
    }

    function findDeclaredSlotKeys(shellNames: string[]) {
        const shellNameSet = new Set<string>(shellNames)
        const result: AnySlotKey[] = []
        for (const entry of extensionSlots.entries()) {
            const { declaringShell } = entry[1]
            if (declaringShell && shellNameSet.has(declaringShell.name)) {
                result.push(entry[0])
            }
        }
        return result
    }

    function getInstalledShellNames(): string[] {
        return [...addedShells].map(([v]) => v)
    }

    function removeShells(names: string[]): Promise<void> {
        const shellNames = getInstalledShellNames()
        executeUninstallShells(names)
        setUninstalledShellNames(_.difference(shellNames, getInstalledShellNames()))

        return Promise.resolve()
    }

    function createShell(entryPoint: EntryPoint): PrivateShell {
        let storeEnabled = false
        let APIsEnabled = false
        let wasInitCompleted = false
        let dependencyAPIs: Set<AnySlotKey> = new Set()
        let nextObservableId = 1
        const boundaryAspects: ShellBoundaryAspect[] = []

        function isOwnContributedAPI<TAPI>(key: SlotKey<TAPI>): boolean {
            return getAPIContributor(key) === shell
        }

        const shell: PrivateShell = {
            name: entryPoint.name,
            entryPoint,

            getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
                const slot = host.getSlot(key)
                const { declaringShell } = slot
                if (!declaringShell || declaringShell !== shell) {
                    throw new Error(
                        `Shell '${shell.name}' is trying to get slot '${slotKeyToName(key)}' that is owned by '${
                            declaringShell ? declaringShell.name : 'Host'
                        }'`
                    )
                }
                return slot
            },

            hasSlot<TItem>(key: SlotKey<TItem>): boolean {
                if (hasSlot(key)) {
                    const slot = host.getSlot(key)
                    const { declaringShell } = slot
                    return !!declaringShell && declaringShell === shell
                }
                return false
            },

            getAllSlotKeys: host.getAllSlotKeys,
            getAllEntryPoints: host.getAllEntryPoints,
            hasShell: host.hasShell,
            isLazyEntryPoint: host.isLazyEntryPoint,
            onShellsChanged: host.onShellsChanged,
            onDeclarationsChanged: host.onDeclarationsChanged,
            removeShellsChangedCallback: host.removeShellsChangedCallback,
            verifyPendingEntryPointsAPIsMismatch: host.verifyPendingEntryPointsAPIsMismatch,

            declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
                return declareSlot<TItem>(key, shell)
            },

            declareCustomSlot<TItem>(key: SlotKey<TItem>, handler: CustomExtensionSlotHandler<TItem>): CustomExtensionSlot<TItem> {
                return declareCustomSlot<TItem>(key, handler, shell)
            },

            setLifecycleState(enableStore: boolean, enableAPIs: boolean, initCompleted: boolean) {
                storeEnabled = enableStore
                APIsEnabled = enableAPIs
                wasInitCompleted = initCompleted
            },

            setDependencyAPIs(APIs: AnySlotKey[]): void {
                dependencyAPIs = new Set(APIs)
            },

            canUseAPIs(): boolean {
                return APIsEnabled
            },

            canUseStore(): boolean {
                return storeEnabled
            },

            wasInitializationCompleted(): boolean {
                return wasInitCompleted
            },

            runLateInitializer<T>(initializer: () => T): T {
                const saveWasInitCompleted = wasInitCompleted
                try {
                    wasInitCompleted = false
                    return initializer()
                } finally {
                    wasInitCompleted = saveWasInitCompleted
                }
            },

            addShells(entryPointsOrPackages: EntryPointOrPackage[]): Promise<void> {
                const shellNamesToBeinstalled = _.flatten(entryPointsOrPackages).map(x => x.name)
                const shellNamesInstalledByCurrentEntryPoint = shellInstallers.get(shell) || []
                shellInstallers.set(shell, [...shellNamesInstalledByCurrentEntryPoint, ...shellNamesToBeinstalled])
                return host.addShells(entryPointsOrPackages)
            },

            removeShells(names: string[]): Promise<void> {
                const namesInstalledByCurrentEntryPoint = shellInstallers.get(shell) || []
                const namesNotInstalledByCurrentEntryPoint = _.difference(names, namesInstalledByCurrentEntryPoint)
                // TODO: Allow entry point to uninstall its own shell ?
                if (!_.isEmpty(namesNotInstalledByCurrentEntryPoint)) {
                    throw new Error(
                        `Shell ${entryPoint.name} is trying to uninstall shells: ${names} which is are not installed by entry point ${entryPoint.name} - This is not allowed`
                    )
                }
                shellInstallers.set(shell, _.without(namesInstalledByCurrentEntryPoint, ...names))
                return host.removeShells(names)
            },

            getAPI<TAPI>(key: SlotKey<TAPI>): TAPI {
                if (dependencyAPIs.has(key) || isOwnContributedAPI(key)) {
                    return host.getAPI(key)
                }
                throw new Error(
                    `API '${slotKeyToName(key)}' is not declared as dependency by entry point '${
                        entryPoint.name
                    }' (forgot to return it from getDependencyAPIs?)`
                )
            },

            hasAPI<TAPI>(key: SlotKey<TAPI>): boolean {
                return (dependencyAPIs.has(key) || isOwnContributedAPI(key)) && host.hasAPI(key)
            },

            contributeAPI<TAPI>(key: SlotKey<TAPI>, factory: () => TAPI, apiOptions?: ContributeAPIOptions<TAPI>): TAPI {
                host.log.log('verbose', `Contributing API ${slotKeyToName(key)}.`)

                if (!_.includes(_.invoke(entryPoint, 'declareAPIs') || [], key)) {
                    throw new Error(
                        `Entry point '${entryPoint.name}' is trying to contribute API '${slotKeyToName(key)}' which it didn't declare`
                    )
                }

                const areSameLayers = (l1: string | string[] | undefined, l2: string | string[] | undefined) =>
                    _.isEqual(_(l1).castArray().sort().value(), _(l2).castArray().sort().value())

                if (!options.disableLayersValidation && (entryPoint.layer || key.layer) && !areSameLayers(entryPoint.layer, key.layer)) {
                    throw new Error(
                        `Cannot contribute API ${slotKeyToName(key)} of layer ${key.layer || '<BLANK>'} from entry point ${
                            entryPoint.name
                        } of layer ${entryPoint.layer || '<BLANK>'}`
                    )
                }

                const api = factory()
                const monitoredAPI = monitorAPI(
                    shell,
                    options,
                    normalizeApiName(slotKeyToName(key)),
                    api /*, trace, memoizedArr*/,
                    apiOptions
                )
                const apiSlot = declareSlot<TAPI>(key)

                APILayers.set(
                    key,
                    !options.disableLayersValidation && entryPoint.layer
                        ? _(entryPoint.layer)
                              .castArray()
                              .map(l => getLayerByName(l))
                              .value()
                        : undefined
                )
                apiSlot.contribute(shell, monitoredAPI)

                readyAPIs.add(key)

                if (!isInstallingEntryPoints) {
                    const shellNames = _.map(unReadyEntryPointsStore.get(), 'name')
                    executeInstallShell(unReadyEntryPointsStore.get())
                    setInstalledShellNames(_.difference(shellNames, _.map(unReadyEntryPointsStore.get(), 'name')))
                }

                return monitoredAPI
            },

            contributeState<TState, TAction extends AnyAction = AnyAction>(
                contributor: ReducersMapObjectContributor<TState, TAction>
            ): void {
                const contribution: StateContribution = {
                    notificationScope: 'broadcasting',
                    reducerFactory: contributor
                }
                getSlot(stateSlotKey).contribute(shell, contribution)
            },

            contributeObservableState<TState, TSelectorAPI, TAction extends AnyAction = AnyAction>(
                contributor: ReducersMapObjectContributor<TState, TAction>,
                mapStateToSelectors: (state: TState) => TSelectorAPI
            ): ObservableState<TSelectorAPI> {
                const observableUniqueName = `${entryPoint.name}/observable_${nextObservableId++}`
                const observable = createObservable(shell, observableUniqueName, mapStateToSelectors)
                observable.subscribe(shell, () => {
                    flushMemoizedForState()
                })
                const protectedObservable: PrivateObservableState<TState, TSelectorAPI> = {
                    subscribe: observable.subscribe,
                    current: (allowUnsafeReading?: boolean) => {
                        if (isStoreSubscribersNotifyInProgress && !allowUnsafeReading) {
                            throw new Error(
                                `Observer created by ${shell.name} current() function: ` +
                                    'Should not read observable value during subscribers notify. ' +
                                    'If you wish to read the value, you component should be observing the value directly ' +
                                    '(using observeWithShell or connectWithShellAndObserve)'
                            )
                        }
                        return observable.current()
                    },
                    notify: observable.notify
                }
                const contribution: StateContribution = {
                    notificationScope: 'observable',
                    reducerFactory: contributor,
                    observable
                }
                getSlot(stateSlotKey).contribute(shell, contribution)
                return protectedObservable
            },

            getStore<TState>(): ScopedStore<TState> {
                return {
                    dispatch: (host.getStore() as PrivateThrottledStore).dispatchWithShell(shell),
                    subscribe: host.getStore().subscribe,
                    getState: () => {
                        const entireStoreState = host.getStore().getState()
                        return entireStoreState[shell.name]
                    },
                    flush: host.getStore().flush,
                    hasPendingSubscribers: host.getStore().hasPendingSubscribers,
                    deferSubscriberNotifications: host.getStore().deferSubscriberNotifications
                }
            },

            contributeMainView(fromShell: Shell, contributor: ReactComponentContributor): void {
                getSlot(mainViewSlotKey).contribute(fromShell, contributor)
            },

            contributeBoundaryAspect(component: ShellBoundaryAspect): void {
                boundaryAspects.push(component)
            },

            memoizeForState(func, resolver, shouldClear?) {
                const memoized = memoize(func, resolver)
                memoizedFunctions.set(memoized, shouldClear ? { f: memoized, shouldClear } : { f: memoized })
                return memoized
            },
            flushMemoizedForState,
            memoize(func, resolver) {
                return memoize(func, resolver)
            },
            clearCache,

            getBoundaryAspects(): ShellBoundaryAspect[] {
                return boundaryAspects
            },

            getHostOptions: () => host.options,

            log: createShellLogger(host, entryPoint),

            [INTERNAL_DONT_USE_SHELL_GET_APP_HOST]: () => host,

            lazyEvaluator
        }

        return shell
    }

    function normalizeApiName(name: string) {
        return name.charAt(0).toLowerCase() + name.substring(1).replace(new RegExp(' ', 'g'), '')
    }

    function verifyPendingEntryPointsAPIsMismatch(): void {
        const pendingEntryPoints = unReadyEntryPointsStore.get()

        for (const entryPoint of pendingEntryPoints) {
            verifyEntryPointAPIsMismatch(entryPoint)
        }
    }

    function verifyEntryPointAPIsMismatch(entryPoint: EntryPoint): void {
        const dependencies = entryPoint.getDependencyAPIs?.() || []

        const mismatchedAPI = dependencies.find(dependencyAPI => {
            const isPrivateAPI = !dependencyAPI.public
            const foundDeclaredAPIKeyWithSameName = slotKeysByName.get(slotKeyToName(dependencyAPI))
            const isDeclaredAPIReady = foundDeclaredAPIKeyWithSameName ? readyAPIs.has(foundDeclaredAPIKeyWithSameName) : false

            return isPrivateAPI && isDeclaredAPIReady && dependencyAPI !== foundDeclaredAPIKeyWithSameName
        })

        if (mismatchedAPI) {
            throw new Error(
                `Entry point '${entryPoint.name}' is waiting for API '${mismatchedAPI.name}' that will never be available for it to use.\n` +
                    `This usually happens when trying to consume a private API as a public API.\n` +
                    `If the API is intended to be public, it should be declared as "public: true" in the API key, and built in both bundles.`
            )
        }
    }
}
