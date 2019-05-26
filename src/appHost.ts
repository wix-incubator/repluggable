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
    AppHostOptions
} from './API'

import _ from 'lodash'
import { AppHostAPI, AppHostServicesProvider, createAppHostServicesEntryPoint } from './appHostServices'
import { AnyExtensionSlot, createExtensionSlot } from './extensionSlot'
import { contributeInstalledShellsState, InstalledShellsActions, InstalledShellsSelectors, ShellToggleSet } from './installedShellsState'
import { dependentAPIs, declaredAPIs } from './appHostUtils'
import { createThrottledStore, ThrottledStore } from './throttledStore'
import { ConsoleHostLogger, createShellLogger } from './loggers'
import { interceptAnyObject } from './interceptAnyObject'

interface ShellsReducersMap {
    [shellName: string]: ReducersMapObject
}

export const makeLazyEntryPoint = (name: string, factory: LazyEntryPointFactory): LazyEntryPointDescriptor => {
    return {
        name,
        factory
    }
}

export function createAppHost(entryPointsOrPackages: EntryPointOrPackage[], options?: AppHostOptions): AppHost {
    const host = createAppHostImpl(options)
    host.addShells(entryPointsOrPackages)
    return host
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

function createAppHostImpl(options?: AppHostOptions): AppHost {
    let store: ThrottledStore | null = null
    let currentShell: PrivateShell | null = null
    let lastInstallLazyEntryPointNames: string[] = []
    let canInstallReadyEntryPoints: boolean = true
    let unReadyEntryPoints: EntryPoint[] = []

    const readyAPIs = new Set<AnySlotKey>()

    const uniqueShellNames = new Set<string>()
    const extensionSlots = new Map<AnySlotKey, AnyExtensionSlot>()
    const slotKeysByName = new Map<string, AnySlotKey>()
    const addedShells = new Map<string, PrivateShell>()
    const shellInstallers = new WeakMap<PrivateShell, string[]>()
    const lazyShells = new Map<string, LazyEntryPointFactory>()
    const shellsChangedCallbacks = new Map<string, ShellsChangedCallback>()

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
        log: options && options.logger ? options.logger : ConsoleHostLogger
    }

    // TODO: Conditionally with parameter
    setupDebugInfo()

    declareSlot<ReactComponentContributor>(mainViewSlotKey)
    declareSlot<ReducersMapObjectContributor>(stateSlotKey)
    addShells([appHostServicesEntryPoint])

    return host

    //TODO: get rid of LazyEntryPointDescriptor
    function isLazyEntryPointDescriptor(value: AnyEntryPoint): value is LazyEntryPointDescriptor {
        return typeof (value as LazyEntryPointDescriptor).factory === 'function'
    }

    function addShells(entryPointsOrPackages: EntryPointOrPackage[]) {
        console.log(`Adding ${entryPointsOrPackages.length} packages.`)

        const entryPoints = _.flatten(entryPointsOrPackages)
        const existingEntryPoints = Object.values(addedShells).map(shell => shell.entryPoint)
        const allEntryPoints = existingEntryPoints.concat(unReadyEntryPoints, entryPoints)

        validateUniqueShellNames(entryPoints)
        validateCircularDependency(allEntryPoints)

        const [lazyEntryPointsList, readyEntryPointsList] = _.partition(entryPoints, isLazyEntryPointDescriptor) as [
            LazyEntryPointDescriptor[],
            EntryPoint[]
        ]

        executeInstallShell(readyEntryPointsList)
        lazyEntryPointsList.forEach(registerLazyEntryPoint)

        setInstalledShellNames(getInstalledShellNames().concat(_.map(lazyEntryPointsList, 'name')))
    }

    function executeInstallShell(entryPoints: EntryPoint[]): void {
        lastInstallLazyEntryPointNames = []

        const [readyEntryPoints, currentUnReadyEntryPoints] = _.partition(entryPoints, entryPoint => {
            const dependencies = entryPoint.getDependencyAPIs && entryPoint.getDependencyAPIs()
            return _.isEmpty(_.find(dependencies, key => !readyAPIs.has(getOwnSlotKey(key))))
        })

        unReadyEntryPoints = _.union(_.difference(unReadyEntryPoints, readyEntryPoints), currentUnReadyEntryPoints)
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

            invokeEntryPointPhase('attach', shells, f => f.entryPoint.attach && f.entryPoint.attach(f), f => !!f.entryPoint.attach)

            buildStore()
            shells.forEach(f => f.setLifecycleState(true, true))

            invokeEntryPointPhase('extend', shells, f => f.entryPoint.extend && f.entryPoint.extend(f), f => !!f.entryPoint.extend)

            shells.forEach(f => addedShells.set(f.entryPoint.name, f))
        } finally {
            canInstallReadyEntryPoints = true
        }
        executeInstallShell(unReadyEntryPoints)
    }

    function executeShellsChangedCallbacks() {
        shellsChangedCallbacks.forEach(f => f(_.keys(InstalledShellsSelectors.getInstalledShellsSet(getStore().getState()))))
    }

    async function setInstalledShellNames(names: string[]) {
        await ensureLazyShellsInstalled(names)
        const updates = toShellToggleSet(names, true)
        getStore().dispatch(InstalledShellsActions.updateInstalledShells(updates))
        executeShellsChangedCallbacks()
    }

    async function setUninstalledShellNames(names: string[]) {
        await Promise.resolve()
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

    function declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (!extensionSlots.has(key) && !slotKeysByName.has(key.name)) {
            const newSlot = createExtensionSlot<TItem>(key, host)

            extensionSlots.set(key, newSlot)
            slotKeysByName.set(key.name, key)

            return newSlot
        }
        throw new Error(`Extension slot with key '${key.name}' already exists.`)
    }

    function getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        const ownKey = getOwnSlotKey(key)
        const anySlot = extensionSlots.get(ownKey)

        if (anySlot) {
            return anySlot as ExtensionSlot<TItem>
        }
        throw new Error(`Extension slot with key '${key.name}' doesn't exist.`)
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
            const ownKey = slotKeysByName.get(key.name)
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
        const apiToEP = buildApiToEntryPoint(entryPoints)

        const validateEntryPointAPIs = (entryPoint: AnyEntryPoint, visited: Set<AnyEntryPoint>) => {
            if (visited.has(entryPoint)) {
                throw new Error(`Circular API dependency found`)
            }

            visited.add(entryPoint)
            dependentAPIs(entryPoint).forEach(apiKey => {
                const apiEntryPoint = apiToEP(apiKey)
                apiEntryPoint && validateEntryPointAPIs(apiEntryPoint, new Set(visited))
            })
        }

        entryPoints.forEach(entryPoint => {
            const visited = new Set<AnyEntryPoint>()
            validateEntryPointAPIs(entryPoint, visited)
        })
    }

    function buildApiToEntryPoint(entryPoints: AnyEntryPoint[]): (apiKey: AnySlotKey) => AnyEntryPoint {
        const privateKeyToEP = new Map<AnySlotKey, AnyEntryPoint>()
        const publicKeyNameToEP = new Map<string, AnyEntryPoint>()

        entryPoints.forEach(entryPoint => {
            declaredAPIs(entryPoint).forEach((apiKey: AnySlotKey) => {
                if (apiKey.public === true) {
                    publicKeyNameToEP.set(apiKey.name, entryPoint)
                } else {
                    privateKeyToEP.set(apiKey, entryPoint)
                }
            })
        })

        return (apiKey: AnySlotKey): AnyEntryPoint => {
            if (apiKey.public === true) {
                return publicKeyNameToEP.get(apiKey.name) as AnyEntryPoint
            }
            return privateKeyToEP.get(apiKey) as AnyEntryPoint
        }
    }

    function loadLazyShell(name: string): Promise<EntryPoint> {
        const factory = lazyShells.get(name)

        if (factory) {
            return factory()
        }

        throw new Error(`Shell '${name}' could not be found.`)
    }

    async function ensureLazyShellsInstalled(names: string[]) {
        const lazyLoadPromises = names.filter(name => !addedShells.has(name)).map(loadLazyShell)
        const shellsToInstall = await Promise.all(lazyLoadPromises)
        executeInstallShell(shellsToInstall)
    }

    function buildStore(): Store {
        // TODO: preserve existing state
        const reducersMap = buildReducersMapObject()
        const reducer = combineReducers(reducersMap)

        if (store) {
            store.replaceReducer(reducer)
        } else {
            store = createThrottledStore(reducer, window.requestAnimationFrame, window.cancelAnimationFrame)
        }

        return store
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
        console.log(`--- ${phase} phase ---`)

        try {
            shell.filter(f => !predicate || predicate(f)).forEach(f => invokeShell(f, action, phase))
        } catch (err) {
            console.error(`${phase} phase FAILED`, err)
            throw err
        }

        console.log(`--- End of ${phase} phase ---`)
    }

    function invokeShell(shell: PrivateShell, action: (shell: PrivateShell) => void, phase: string): void {
        console.log(`${phase} : ${shell.entryPoint.name}`)

        try {
            currentShell = shell
            action(shell)
        } catch (err) {
            console.error(`Shell '${shell.name}' FAILED ${phase} phase`, err)
            throw err
        } finally {
            currentShell = null
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
            unReadyEntryPoints.push(shell.entryPoint)
            executeUninstallShells([shell.name])
        }
    }

    function discardAPI<TAPI>(APIKey: SlotKey<TAPI>) {
        const ownKey = getOwnSlotKey(APIKey)

        readyAPIs.delete(ownKey)
        extensionSlots.delete(ownKey)
        slotKeysByName.delete(ownKey.name)

        console.log(`-- Removed API: ${ownKey.name} --`)
    }

    function executeUninstallShells(names: string[]): void {
        console.log(`-- Uninstalling ${names} --`)

        invokeEntryPointPhase('detach', names.map(name => addedShells.get(name)) as PrivateShell[], f =>
            _.invoke(f.entryPoint, 'detach', f)
        )

        const APIsToDiscard = [...readyAPIs].filter(APIKey => _.includes(names, _.get(getAPIContributor(APIKey), 'name')))
        extensionSlots.forEach(extensionSlot =>
            (extensionSlot as ExtensionSlot<any>).discardBy(extensionItem => doesExtensionItemBelongToShells(extensionItem, names))
        )

        names.forEach(name => {
            addedShells.delete(name)
            uniqueShellNames.delete(name)
        })
        APIsToDiscard.forEach(discardAPI)

        console.log(`Done uninstalling ${names}`)

        addedShells.forEach(uninstallIfDependencyAPIsRemoved)
    }

    function getInstalledShellNames(): string[] {
        return [...addedShells].map(([v]) => v)
    }

    function removeShells(names: string[]) {
        const shellNames = getInstalledShellNames()
        executeUninstallShells(names)
        setUninstalledShellNames(_.difference(shellNames, getInstalledShellNames()))
    }

    function createShell(entryPoint: EntryPoint): PrivateShell {
        let storeEnabled = false
        let APIsEnabled = false
        let dependencyAPIs: AnySlotKey[] = []
        const boundaryAspects: ShellBoundaryAspect[] = []

        const isOwnContributedAPI = <TAPI>(key: SlotKey<TAPI>): boolean => getAPIContributor(key) === shell

        const shell: PrivateShell = {
            name: entryPoint.name,
            entryPoint,

            getSlot: host.getSlot,
            getAllSlotKeys: host.getAllSlotKeys,
            getAllEntryPoints: host.getAllEntryPoints,
            hasShell: host.hasShell,
            isLazyEntryPoint: host.isLazyEntryPoint,
            onShellsChanged: host.onShellsChanged,
            removeShellsChangedCallback: host.removeShellsChangedCallback,

            declareSlot,

            setLifecycleState(enableStore: boolean, enableAPIs: boolean) {
                storeEnabled = enableStore
                APIsEnabled = enableAPIs
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

            addShells(entryPointsOrPackages: EntryPointOrPackage[]): void {
                const shellNamesToBeinstalled = _.flatten(entryPointsOrPackages).map(x => x.name)
                const shellNamesInstalledByCurrentEntryPoint = shellInstallers.get(shell) || []
                shellInstallers.set(shell, [...shellNamesInstalledByCurrentEntryPoint, ...shellNamesToBeinstalled])
                host.addShells(entryPointsOrPackages)
            },

            removeShells(names: string[]): void {
                const namesInstalledByCurrentEntryPoint = shellInstallers.get(shell) || []
                const namesNotInstalledByCurrentEntryPoint = _.difference(names, namesInstalledByCurrentEntryPoint)
                // TODO: Allow entry point to uninstall its own shell?
                if (!_.isEmpty(namesNotInstalledByCurrentEntryPoint)) {
                    throw new Error(
                        `Shell ${entryPoint.name} is trying to uninstall shells: ${names} which is are not installed by entry point ${
                            entryPoint.name
                        } - This is not allowed`
                    )
                }
                shellInstallers.set(shell, _.without(namesInstalledByCurrentEntryPoint, ...names))
                host.removeShells(names)
            },

            getAPI<TAPI>(key: SlotKey<TAPI>): TAPI {
                if (dependencyAPIs.indexOf(key) >= 0 || isOwnContributedAPI(key)) {
                    return host.getAPI(key)
                }
                throw new Error(
                    `API '${key.name}' is not declared as dependency by entry point '${
                        entryPoint.name
                    }' (forgot to return it from getDependencyAPIs?)`
                )
            },

            contributeAPI<TAPI>(key: SlotKey<TAPI>, factory: () => TAPI): TAPI {
                console.log(`Contributing API ${key.name}.`)

                if (!_.includes(_.invoke(entryPoint, 'declareAPIs') || [], key)) {
                    throw new Error(`Entry point '${entryPoint.name}' is trying to contribute API '${key.name}' which it didn't declare`)
                }

                const api = factory()
                const monitoredAPI = monitorAPI(shell, key.name, api)
                const apiSlot = declareSlot<TAPI>(key)
                apiSlot.contribute(shell, monitoredAPI)

                readyAPIs.add(key)

                if (canInstallReadyEntryPoints) {
                    const shellNames = _.map(unReadyEntryPoints, 'name')
                    executeInstallShell(unReadyEntryPoints)
                    setInstalledShellNames(_.difference(shellNames, _.map(unReadyEntryPoints, 'name')))
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

            getBoundaryAspects(): ShellBoundaryAspect[] {
                return boundaryAspects
            },

            log: createShellLogger(host, entryPoint)
        }

        return shell
    }

    function monitorAPI<TAPI>(shell: Shell, apiName: string, api: TAPI): TAPI {
        return interceptAnyObject(api, (funcName, originalFunc) => {
            return (...args: any[]) => {
                return shell.log.monitor(`${apiName}::${funcName}`, { $api: apiName, $apiFunc: funcName, $args: args }, () =>
                    originalFunc.apply(api, args)
                )
            }
        })
    }

    function setupDebugInfo() {
        const utils = {
            apis: () => {
                return Array.from(readyAPIs).map((apiKey: AnySlotKey) => {
                    return {
                        key: apiKey,
                        impl: () => getAPI(apiKey)
                    }
                })
            },
            findAPI: (name: string) => {
                return _.filter(utils.apis(), (api: any) => api.key.name.toLowerCase().indexOf(name.toLowerCase()) !== -1)
            }
        }

        window.repluggableAppDebug = {
            host,
            uniqueShellNames,
            extensionSlots,
            addedShells,
            lazyShells,
            readyAPIs,
            shellInstallers,
            utils
        }
    }
}
