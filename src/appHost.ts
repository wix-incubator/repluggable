import { combineReducers, ReducersMapObject, Store } from 'redux'
import {
    AnyEntryPoint,
    AnySlotKey,
    AppHost,
    EntryPoint,
    EntryPointOrPackage,
    EntryPointsInfo,
    ExtensionItem,
    ExtensionSlot,
    LazyEntryPointDescriptor,
    LazyEntryPointFactory,
    PrivateShell,
    ReactComponentContributor,
    ReducersMapObjectContributor,
    ScopedStore,
    Shell,
    ShellsChangedCallback,
    SlotKey,
    ShellBoundaryAspect,
    MemoizeMissHit,
    AppHostOptions,
    StatisticsMemoization,
    Trace,
    AnyFunction,
    FunctionWithSameArgs,
    ContributeAPIOptions,
    APILayer,
    CustomExtensionSlotHandler,
    CustomExtensionSlot
} from './API'
import _ from 'lodash'
import { AppHostAPI, AppHostServicesProvider, createAppHostServicesEntryPoint } from './appHostServices'
import { AnyExtensionSlot, createExtensionSlot, createCustomExtensionSlot } from './extensionSlot'
import { contributeInstalledShellsState, InstalledShellsActions, InstalledShellsSelectors, ShellToggleSet } from './installedShellsState'
import { dependentAPIs, declaredAPIs } from './appHostUtils'
import { createThrottledStore, ThrottledStore } from './throttledStore'
import { ConsoleHostLogger, createShellLogger } from './loggers'
import { monitorAPI } from './monitorAPI'
import { Graph, Tarjan } from './tarjanGraph'
import { setupDebugInfo } from './repluggableAppDebug'

interface ShellsReducersMap {
    [shellName: string]: ReducersMapObject
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
export const stateSlotKey: SlotKey<ReducersMapObjectContributor> = {
    name: 'state'
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

export function createAppHost(initialEntryPointsOrPackages: EntryPointOrPackage[], options: AppHostOptions = { monitoring: {} }): AppHost {
    let store: ThrottledStore | null = null
    let canInstallReadyEntryPoints: boolean = true
    const unReadyEntryPointsStore = createUnreadyEntryPointsStore()
    const layers: APILayer[] = options.layers || []
    const trace: Trace[] = []
    const memoizedArr: StatisticsMemoization[] = []

    let readyAPIsVersion = 0 // for tracking changes in readyAPIs to clear cache for repluggableAppDebug.utils.apis
    const readyAPIs = new Set<AnySlotKey>()

    const uniqueShellNames = new Set<string>()
    const extensionSlots = new Map<AnySlotKey, AnyExtensionSlot>()
    const slotKeysByName = new Map<string, AnySlotKey>()
    const addedShells = new Map<string, PrivateShell>()
    const shellInstallers = new WeakMap<PrivateShell, string[]>()
    const lazyShells = new Map<string, LazyEntryPointFactory>()
    const shellsChangedCallbacks = new Map<string, ShellsChangedCallback>()
    const APILayers = new WeakMap<AnySlotKey, APILayer | undefined>()

    const memoizedFunctions: { f: Partial<_.MemoizedFunction>; shouldClear?(): boolean }[] = []

    const hostAPI: AppHostAPI = {}
    const appHostServicesEntryPoint = createAppHostServicesEntryPoint(() => hostAPI)
    const host: AppHost & AppHostServicesProvider = {
        getStore,
        getAPI,
        getSlot,
        getAllSlotKeys,
        getAllEntryPoints,
        hasShell,
        isLazyEntryPoint,
        addShells,
        removeShells,
        onShellsChanged,
        removeShellsChangedCallback,
        getAppHostServicesShell: appHostServicesEntryPoint.getAppHostServicesShell,
        log: options.logger ? options.logger : ConsoleHostLogger,
        options
    }

    setupDebugInfo({
        host,
        getReadyAPIsVersion: () => readyAPIsVersion,
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
    declareSlot<ReducersMapObjectContributor>(stateSlotKey)
    addShells([appHostServicesEntryPoint])

    const memoize = <T extends AnyFunction>(
        func: T,
        resolver: FunctionWithSameArgs<T>
    ): ((...args: Parameters<T>) => ReturnType<T>) & Partial<_.MemoizedFunction> & Partial<MemoizeMissHit> => {
        if (options.monitoring.disableMemoization) {
            return func
        }
        const memoized = _.memoize(func, resolver)

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

    function getLayerByName(layerName: string): APILayer {
        const layer = _.find(layers, { name: layerName })
        if (!layer) {
            throw new Error(`Cannot find layer ${layerName}`)
        }
        return layer
    }

    type Dependency = { layer?: APILayer; apiKey: SlotKey<any> } | undefined
    function validateEntryPointLayer(entryPoint: EntryPoint) {
        if (!entryPoint.getDependencyAPIs || !entryPoint.layer || _.isEmpty(layers)) {
            return
        }
        const highestLevelDependency: Dependency = _.chain(entryPoint.getDependencyAPIs())
            .map(apiKey => ({
                layer: apiKey.layer ? getLayerByName(apiKey.layer) : undefined,
                apiKey
            }))
            .maxBy(({ layer }) => (layer ? layer.level : -Infinity))
            .value()
        const currentLayer = getLayerByName(entryPoint.layer)

        if (highestLevelDependency && highestLevelDependency.layer && currentLayer.level < highestLevelDependency.layer.level) {
            throw new Error(
                `Entry point ${entryPoint.name} of layer ${currentLayer.name} cannot depend on API ${slotKeyToName(
                    highestLevelDependency.apiKey
                )} of layer ${highestLevelDependency.layer.name}`
            )
        }
    }

    function validateLayers(entryPoints: AnyEntryPoint[]) {
        _.forEach(entryPoints, ep => validateEntryPointLayer(ep))
    }

    function addShells(entryPointsOrPackages: EntryPointOrPackage[]): Promise<void> {
        host.log.log('debug', `Adding ${entryPointsOrPackages.length} packages.`)

        const entryPoints = _.flatten(entryPointsOrPackages)
        const existingEntryPoints = Object.values(addedShells).map(shell => shell.entryPoint)
        const allEntryPoints = existingEntryPoints.concat(unReadyEntryPointsStore.get(), entryPoints)

        if (!options.disableLayersValidation) {
            validateLayers(entryPoints)
        }
        validateUniqueShellNames(entryPoints)
        !options.disableCheckCircularDependencies && validateCircularDependency(allEntryPoints)

        const [lazyEntryPointsList, readyEntryPointsList] = _.partition(entryPoints, isLazyEntryPointDescriptor) as [
            LazyEntryPointDescriptor[],
            EntryPoint[]
        ]

        executeInstallShell(readyEntryPointsList)
        lazyEntryPointsList.forEach(registerLazyEntryPoint)

        setInstalledShellNames(getInstalledShellNames().concat(_.map(lazyEntryPointsList, 'name')))
        return Promise.resolve()
    }

    function executeInstallShell(entryPoints: EntryPoint[]): void {
        const [readyEntryPoints, currentUnReadyEntryPoints] = _.partition(entryPoints, entryPoint => {
            const dependencies = entryPoint.getDependencyAPIs && entryPoint.getDependencyAPIs()
            return _.isEmpty(_.find(dependencies, key => !readyAPIs.has(getOwnSlotKey(key))))
        })

        unReadyEntryPointsStore.set(_.union(_.difference(unReadyEntryPointsStore.get(), readyEntryPoints), currentUnReadyEntryPoints))
        if (store && _.isEmpty(readyEntryPoints)) {
            return
        }

        const shells = readyEntryPoints.map(createShell)
        executeReadyEntryPoints(shells)
    }

    function executeReadyEntryPoints(shells: PrivateShell[]): void {
        canInstallReadyEntryPoints = false
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
            canInstallReadyEntryPoints = true
        }
        executeInstallShell(unReadyEntryPointsStore.get())
    }

    function executeShellsChangedCallbacks() {
        shellsChangedCallbacks.forEach(f => f(_.keys(InstalledShellsSelectors.getInstalledShellsSet(getStore().getState()))))
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
        return _.isUndefined(key.version) ? key.name : `${key.name}(v${key.version})`
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

    function getAPI<TAPI>(key: SlotKey<TAPI>): TAPI {
        const APISlot = getSlot<TAPI>(key)
        return APISlot.getSingleItem().contribution
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
        const graph = new Graph()
        entryPoints.forEach(x => {
            const declaredApis = declaredAPIs(x)
            const dependencies = dependentAPIs(x).map(child => slotKeyToName(child))
            declaredApis.forEach(d => dependencies.forEach(y => graph.addConnection(slotKeyToName(d), y)))
        })

        const tarjan = new Tarjan(graph)
        const sccs = tarjan.run()

        for (const scc of sccs) {
            if (scc.length > 1) {
                host.log.log('debug', `Circular API dependency found: ${scc.map(x => slotKeyToName(x)).join(' -> ')}`)
                throw new Error(`Circular API dependency found`)
            }
        }
    }

    function buildStore(): Store {
        // TODO:  preserve existing state
        const reducersMap = buildReducersMapObject()
        const reducer = combineReducers(reducersMap)

        if (store) {
            store.replaceReducer(reducer)
        } else {
            store = createThrottledStore(host, reducer, window.requestAnimationFrame, window.cancelAnimationFrame)
            store.subscribe(() => {
                flushMemoizedForState()
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

    function getPerShellReducersMapObject(): ShellsReducersMap {
        const stateSlot = getSlot(stateSlotKey)
        return stateSlot.getItems().reduce((reducersMap: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            reducersMap[shellName] = {
                ...reducersMap[shellName],
                ...item.contribution()
            }
            return reducersMap
        }, {})
    }

    function getCombinedShellReducers(): ReducersMapObject {
        const shellsReducerMaps = getPerShellReducersMapObject()
        return Object.keys(shellsReducerMaps).reduce((reducersMap: ReducersMapObject, shellName: string) => {
            reducersMap[shellName] = combineReducers(shellsReducerMaps[shellName])
            return reducersMap
        }, {})
    }

    function buildReducersMapObject(): ReducersMapObject {
        // TODO: get rid of builtInReducersMaps
        const builtInReducersMaps: ReducersMapObject = {
            ...contributeInstalledShellsState()
        }
        return { ...builtInReducersMaps, ...getCombinedShellReducers() }
    }

    function invokeEntryPointPhase(
        phase: keyof EntryPoint, // TODO: Exclude 'name'
        shell: PrivateShell[],
        action: (shell: PrivateShell) => void,
        predicate?: (shell: PrivateShell) => boolean
    ): void {
        host.log.log('debug', `--- ${phase} phase ---`)

        try {
            shell.filter(f => !predicate || predicate(f)).forEach(f => invokeShell(f, action, phase))
        } catch (err) {
            console.error(`${phase} phase FAILED`, err)
            throw err
        }

        host.log.log('debug', `--- End of ${phase} phase ---`)
    }

    function invokeShell(shell: PrivateShell, action: (shell: PrivateShell) => void, phase: string): void {
        host.log.log('debug', `${phase} : ${shell.entryPoint.name}`)

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

    function isAPIMissing(APIKey: AnySlotKey): boolean {
        const ownKey = getOwnSlotKey(APIKey)
        return !extensionSlots.has(ownKey)
    }

    function uninstallIfDependencyAPIsRemoved(shell: PrivateShell) {
        const dependencyAPIs = _.invoke(shell.entryPoint, 'getDependencyAPIs')

        if (_.some(dependencyAPIs, isAPIMissing)) {
            unReadyEntryPointsStore.get().push(shell.entryPoint)
            executeUninstallShells([shell.name])
        }
    }

    function discardSlotKey<T>(key: SlotKey<T>) {
        const ownKey = getOwnSlotKey(key)
        readyAPIsVersion++
        readyAPIs.delete(ownKey)
        extensionSlots.delete(ownKey)
        slotKeysByName.delete(slotKeyToName(ownKey))

        host.log.log('debug', `-- Removed slot keys: ${slotKeyToName(ownKey)} --`)
    }

    function executeUninstallShells(names: string[]): void {
        host.log.log('debug', `-- Uninstalling ${names} --`)

        invokeEntryPointPhase('detach', names.map(name => addedShells.get(name)) as PrivateShell[], f =>
            _.invoke(f.entryPoint, 'detach', f)
        )

        const slotKeysToDiscard = findContributedAPIs(names).concat(findDeclaredSlotKeys(names))

        extensionSlots.forEach(extensionSlot =>
            (extensionSlot as ExtensionSlot<any>).discardBy(extensionItem => doesExtensionItemBelongToShells(extensionItem, names))
        )

        names.forEach(name => {
            addedShells.delete(name)
            uniqueShellNames.delete(name)
        })
        slotKeysToDiscard.forEach(discardSlotKey)

        host.log.log('debug', `Done uninstalling ${names}`)

        addedShells.forEach(uninstallIfDependencyAPIsRemoved)
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
        let dependencyAPIs: AnySlotKey[] = []
        const boundaryAspects: ShellBoundaryAspect[] = []

        const isOwnContributedAPI = <TAPI>(key: SlotKey<TAPI>): boolean => getAPIContributor(key) === shell

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
            getAllSlotKeys: host.getAllSlotKeys,
            getAllEntryPoints: host.getAllEntryPoints,
            hasShell: host.hasShell,
            isLazyEntryPoint: host.isLazyEntryPoint,
            onShellsChanged: host.onShellsChanged,
            removeShellsChangedCallback: host.removeShellsChangedCallback,

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
                dependencyAPIs = APIs
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
                if (dependencyAPIs.indexOf(key) >= 0 || isOwnContributedAPI(key)) {
                    return host.getAPI(key)
                }
                throw new Error(
                    `API '${slotKeyToName(key)}' is not declared as dependency by entry point '${
                        entryPoint.name
                    }' (forgot to return it from getDependencyAPIs?)`
                )
            },

            contributeAPI<TAPI>(key: SlotKey<TAPI>, factory: () => TAPI, apiOptions?: ContributeAPIOptions<TAPI>): TAPI {
                host.log.log('debug', `Contributing API ${slotKeyToName(key)}.`)

                if (!_.includes(_.invoke(entryPoint, 'declareAPIs') || [], key)) {
                    throw new Error(
                        `Entry point '${entryPoint.name}' is trying to contribute API '${slotKeyToName(key)}' which it didn't declare`
                    )
                }

                if (!options.disableLayersValidation && (entryPoint.layer || key.layer) && entryPoint.layer !== key.layer) {
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

                APILayers.set(key, !options.disableLayersValidation && entryPoint.layer ? getLayerByName(entryPoint.layer) : undefined)
                apiSlot.contribute(shell, monitoredAPI)
                readyAPIsVersion++
                readyAPIs.add(key)

                if (canInstallReadyEntryPoints) {
                    const shellNames = _.map(unReadyEntryPointsStore.get(), 'name')
                    executeInstallShell(unReadyEntryPointsStore.get())
                    setInstalledShellNames(_.difference(shellNames, _.map(unReadyEntryPointsStore.get(), 'name')))
                }

                return monitoredAPI
            },

            contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void {
                getSlot(stateSlotKey).contribute(shell, contributor)
            },

            getStore<TState>(): ScopedStore<TState> {
                return {
                    dispatch: host.getStore().dispatch,
                    subscribe: host.getStore().subscribe,
                    getState: () => host.getStore().getState()[shell.name],
                    flush: host.getStore().flush
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
                memoizedFunctions.push(shouldClear ? { f: memoized, shouldClear } : { f: memoized })
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

            log: createShellLogger(host, entryPoint)
        }

        return shell
    }

    function normalizeApiName(name: string) {
        return name.charAt(0).toLowerCase() + name.substring(1).replace(new RegExp(' ', 'g'), '')
    }
}
