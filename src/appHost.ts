import { combineReducers, createStore, ReducersMapObject, Store } from 'redux'

import {
    AnyEntryPoint,
    AnyPackage,
    AnySlotKey,
    AppHost,
    EntryPoint,
    EntryPointsInfo,
    ExtensionItem,
    ExtensionSlot,
    InstalledShellsChangedCallback,
    LazyEntryPointDescriptor,
    LazyEntryPointFactory,
    PrivateShell,
    ReactComponentContributor,
    ReducersMapObjectContributor,
    ScopedStore,
    SlotKey
} from './api'

import _ from 'lodash'
import { AnyExtensionSlot, createExtensionSlot } from './extensionSlot'
import { contributeInstalledShellsState, InstalledShellsActions, InstalledShellsSelectors, ShellToggleSet } from './installedShellsState'

interface ShellsReducersMap {
    [shellName: string]: ReducersMapObject
}

export const makeLazyEntryPoint = (name: string, factory: LazyEntryPointFactory): LazyEntryPointDescriptor => {
    return {
        name,
        factory
    }
}

export function createAppHost(
    packages: AnyPackage[]
    /*, log?: HostLogger */ // TODO: define logging abstraction
): AppHost {
    const host = createAppHostImpl()
    host.installPackages(packages)
    return host
}

export const mainViewSlotKey: SlotKey<ReactComponentContributor> = { name: 'mainView' }
export const stateSlotKey: SlotKey<ReducersMapObjectContributor> = { name: 'state' }

const toShellToggleSet = (names: string[], isInstalled: boolean): ShellToggleSet => {
    return names.reduce<ShellToggleSet>((result: ShellToggleSet, name: string) => {
        result[name] = isInstalled
        return result
    }, {})
}

function createAppHostImpl(): AppHost {
    let store: Store | null = null
    let currentShell: PrivateShell | null = null
    let lastInstallLazyEntryPointNames: string[] = []
    let canInstallReadyEntryPoints: boolean = true
    let unReadyEntryPoints: EntryPoint[] = []

    const readyAPIs = new Set<AnySlotKey>()

    const uniqueShellNames = new Set<string>()
    const extensionSlots = new Map<AnySlotKey, AnyExtensionSlot>()
    const slotKeysByName = new Map<string, AnySlotKey>()
    const installedShells = new Map<string, PrivateShell>()
    const shellInstallers = new WeakMap<PrivateShell, string[]>()
    const lazyShells = new Map<string, LazyEntryPointFactory>()
    const installedShellsChangedCallbacks = new Map<string, InstalledShellsChangedCallback>()

    const host: AppHost = {
        getStore,
        getApi,
        getSlot,
        getAllSlotKeys,
        getAllEntryPoints,
        isShellInstalled,
        isLazyEntryPoint,
        installPackages,
        uninstallShells,
        onShellsChanged,
        removeShellsChangedCallback
    }

    // TODO: Conditionally with parameter
    window.reactAppLegoDebug = {
        host,
        uniqueShellNames,
        extensionSlots,
        installedShells,
        lazyShells,
        readyAPIs,
        shellInstallers
    }

    declareSlot<ReactComponentContributor>(mainViewSlotKey)
    declareSlot<ReducersMapObjectContributor>(stateSlotKey)

    return host

    function isLazyEntryPointDescriptor(value: AnyEntryPoint): value is LazyEntryPointDescriptor {
        return typeof (value as LazyEntryPointDescriptor).factory === 'function'
    }

    function installPackages(packages: AnyPackage[]): void {
        console.log(`Adding ${packages.length} packages.`)

        const entryPoints = _.flatten(packages)

        validateUniqueShellNames(entryPoints)

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

        const [readyEntryPoints, currentUnReadyEntryPoints] = _.partition(entryPoints, entryPoint =>
            _.chain(entryPoint)
                .invoke('getDependencyApis')
                .defaultTo([])
                .find(key => !readyAPIs.has(getOwnSlotKey(key)))
                .isEmpty()
                .value()
        )

        unReadyEntryPoints = _(unReadyEntryPoints)
            .difference(readyEntryPoints)
            .union(currentUnReadyEntryPoints)
            .value()

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
                'getDependencyApis',
                shells,
                f => f.entryPoint.getDependencyApis && f.setDependencyApis(f.entryPoint.getDependencyApis()),
                f => !!f.entryPoint.getDependencyApis
            )

            invokeEntryPointPhase('install', shells, f => f.entryPoint.install && f.entryPoint.install(f), f => !!f.entryPoint.install)

            buildStore()
            shells.forEach(f => f.setLifecycleState(true, true))

            invokeEntryPointPhase('extend', shells, f => f.entryPoint.extend && f.entryPoint.extend(f), f => !!f.entryPoint.extend)

            shells.forEach(f => installedShells.set(f.entryPoint.name, f))
        } finally {
            canInstallReadyEntryPoints = true
        }
        executeInstallShell(unReadyEntryPoints)
    }

    function executeShellsChangedCallbacks() {
        installedShellsChangedCallbacks.forEach(f => f(_.keys(InstalledShellsSelectors.getInstalledShellsSet(getStore().getState()))))
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

    function onShellsChanged(callback: InstalledShellsChangedCallback) {
        const callbackId = _.uniqueId('shells-changed-callback-')
        installedShellsChangedCallbacks.set(callbackId, callback)
        return callbackId
    }

    function removeShellsChangedCallback(callbackId: string) {
        installedShellsChangedCallbacks.delete(callbackId)
    }

    function declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (!extensionSlots.has(key) && !slotKeysByName.has(key.name)) {
            const newSlot = createExtensionSlot<TItem>(key, host, getCurrentEntryPoint)

            extensionSlots.set(key, newSlot)
            slotKeysByName.set(key.name, key)

            return newSlot
        } else {
            throw new Error(`Extension slot with key '${key.name}' already exists.`)
        }
    }

    function getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        const ownKey = getOwnSlotKey(key)
        const anySlot = extensionSlots.get(ownKey)

        if (anySlot) {
            return anySlot as ExtensionSlot<TItem>
        } else {
            throw new Error(`Extension slot with key '${key.name}' doesn't exist.`)
        }
    }

    function getApi<TApi>(key: SlotKey<TApi>): TApi {
        const apiSlot = getSlot<TApi>(key)
        return apiSlot.getSingleItem().contribution
    }

    function getStore(): Store {
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

    function isShellInstalled(name: string): boolean {
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

    function loadLazyShell(name: string): Promise<EntryPoint> {
        const factory = lazyShells.get(name)

        if (factory) {
            return factory()
        }

        throw new Error(`Shell '${name}' could not be found.`)
    }

    async function ensureLazyShellsInstalled(names: string[]) {
        const lazyLoadPromises = names.filter(name => !installedShells.has(name)).map(loadLazyShell)
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
            store = createStore(reducer)
        }

        return store
    }

    function getPerShellReducersMapObject(): ShellsReducersMap {
        const stateSlot = getSlot(stateSlotKey)
        return stateSlot.getItems().reduce((reducersMap: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            reducersMap[shellName] = { ...reducersMap[shellName], ...item.contribution() }
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
        const builtInReducersMaps: ReducersMapObject = { ...contributeInstalledShellsState() }
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

    function getCurrentEntryPoint(): PrivateShell {
        if (currentShell) {
            return currentShell
        }
        throw new Error('Current entry point does not exist.')
    }

    function getApiContributor<TApi>(key: SlotKey<TApi>): PrivateShell | undefined {
        const ownKey = getOwnSlotKey(key)
        return extensionSlots.has(ownKey) ? _.get(getSlot<TApi>(ownKey).getSingleItem(), 'shell') : undefined
    }

    function doesExtensionItemBelongToShells(extensionItem: ExtensionItem<any>, shellNames: string[]) {
        return (
            _.includes(shellNames, extensionItem.shell.name) ||
            _.some(_.invoke(extensionItem.shell.entryPoint, 'getDependencyApis'), apiKey =>
                _.includes(shellNames, _.get(getApiContributor(apiKey), 'name'))
            )
        )
    }

    function isApiMissing(apiKey: AnySlotKey): boolean {
        const ownKey = getOwnSlotKey(apiKey)
        return !extensionSlots.has(ownKey)
    }

    function uninstallIfDependencyApisRemoved(shell: PrivateShell) {
        const dependencyApis = _.invoke(shell.entryPoint, 'getDependencyApis')

        if (_.some(dependencyApis, isApiMissing)) {
            unReadyEntryPoints.push(shell.entryPoint)
            executeUninstallShells([shell.name])
        }
    }

    function discardApi<TApi>(apiKey: SlotKey<TApi>) {
        const ownKey = getOwnSlotKey(apiKey)

        readyAPIs.delete(ownKey)
        extensionSlots.delete(ownKey)
        slotKeysByName.delete(ownKey.name)

        console.log(`-- Removed API: ${ownKey.name} --`)
    }

    function executeUninstallShells(names: string[]): void {
        console.log(`-- Uninstalling ${names} --`)

        invokeEntryPointPhase('uninstall', names.map(name => installedShells.get(name)) as PrivateShell[], f =>
            _.invoke(f.entryPoint, 'uninstall', f)
        )

        const apisToDiscard = [...readyAPIs].filter(apiKey => _.includes(names, _.get(getApiContributor(apiKey), 'name')))
        extensionSlots.forEach(extensionSlot =>
            (extensionSlot as ExtensionSlot<any>).discardBy(extensionItem => doesExtensionItemBelongToShells(extensionItem, names))
        )

        names.forEach(name => {
            installedShells.delete(name)
            uniqueShellNames.delete(name)
        })
        apisToDiscard.forEach(discardApi)

        console.log(`Done uninstalling ${names}`)

        installedShells.forEach(uninstallIfDependencyApisRemoved)
    }

    function getInstalledShellNames(): string[] {
        return [...installedShells].map(([v]) => v)
    }

    function uninstallShells(names: string[]): void {
        const shellNames = getInstalledShellNames()
        executeUninstallShells(names)
        setUninstalledShellNames(_.difference(shellNames, getInstalledShellNames()))
    }

    function createShell(entryPoint: EntryPoint): PrivateShell {
        let storeEnabled = false
        let apisEnabled = false
        let dependencyApis: AnySlotKey[] = []

        const isOwnContributedApi = <TApi>(key: SlotKey<TApi>): boolean => getApiContributor(key) === shell

        const shell: PrivateShell = {
            name: entryPoint.name,
            entryPoint,

            ...host,
            declareSlot,

            setLifecycleState(enableStore: boolean, enableApis: boolean) {
                storeEnabled = enableStore
                apisEnabled = enableApis
            },

            setDependencyApis(apis: AnySlotKey[]): void {
                dependencyApis = apis
            },

            canUseApis(): boolean {
                return apisEnabled
            },

            canUseStore(): boolean {
                return storeEnabled
            },

            installPackages(packages: AnyPackage[]): void {
                const shellNamesToBeinstalled = _.chain(packages)
                    .flatten()
                    .map('name')
                    .value()
                const shellNamesInstalledByCurrentEntryPoint = shellInstallers.get(shell) || []
                shellInstallers.set(shell, [...shellNamesInstalledByCurrentEntryPoint, ...shellNamesToBeinstalled])
                host.installPackages(packages)
            },

            uninstallShells(names: string[]): void {
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
                host.uninstallShells(names)
            },

            getApi<TApi>(key: SlotKey<TApi>): TApi {
                if (dependencyApis.indexOf(key) >= 0 || isOwnContributedApi(key)) {
                    return host.getApi(key)
                }
                throw new Error(
                    `API '${key.name}' is not declared as dependency by entry point '${
                        entryPoint.name
                    }' (forgot to return it from getDependencyApis?)`
                )
            },

            contributeApi<TApi>(key: SlotKey<TApi>, factory: () => TApi): TApi {
                console.log(`Contributing API ${key.name}.`)

                if (!_.includes(_.invoke(entryPoint, 'declareApis') || [], key)) {
                    throw new Error(`Entry point '${entryPoint.name}' is trying to contribute API '${key.name}' which it didn't declare`)
                }

                const api = factory()
                const apiSlot = declareSlot<TApi>(key)
                apiSlot.contribute(api, undefined, shell)

                readyAPIs.add(key)

                if (canInstallReadyEntryPoints) {
                    const shellNames = _.map(unReadyEntryPoints, 'name')
                    executeInstallShell(unReadyEntryPoints)
                    setInstalledShellNames(_.difference(shellNames, _.map(unReadyEntryPoints, 'name')))
                }

                return api
            },

            contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void {
                getSlot(stateSlotKey).contribute(contributor, undefined, shell)
            },

            getStore<TState>(): ScopedStore<TState> {
                return {
                    dispatch: host.getStore().dispatch,
                    subscribe: host.getStore().subscribe,
                    getState: () => host.getStore().getState()[shell.name]
                }
            },

            contributeMainView(contributor: ReactComponentContributor): void {
                getSlot(mainViewSlotKey).contribute(contributor)
            }
        }

        return shell
    }
}
