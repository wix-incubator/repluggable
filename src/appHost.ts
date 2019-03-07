import { combineReducers, createStore, ReducersMapObject, Store } from 'redux'

import {
    AnyFeature,
    AnySlotKey,
    AppHost,
    ExtensionItem,
    ExtensionSlot,
    FeatureInfo,
    FeatureLifecycle,
    LazyFeatureDescriptor,
    LazyFeatureFactory,
    PrivateFeatureHost,
    ReactComponentContributor,
    ReducersMapObjectContributor,
    ScopedStore,
    SlotKey,
    AnyLifecycle
} from './api'

import _ from 'lodash'
import { InstalledFeaturesActions, InstalledFeaturesSelectors, contributeInstalledFeaturesState, FeatureToggleSet } from './installedFeaturesState'
import { AnyExtensionSlot, createExtensionSlot } from './extensionSlot'

interface FeaturesReducersMap {
    [featureName: string]: ReducersMapObject
}

export const makeLazyFeature = (name: string, factory: LazyFeatureFactory): LazyFeatureDescriptor => {
    return {
        name,
        factory
    }
}

export function createAppHost(
    features: AnyFeature[]
    /*, log?: HostLogger */ // TODO: define logging abstraction
): AppHost {
    const host = createAppHostImpl()
    host.installFeatures(features)
    return host
}

export const mainViewSlotKey: SlotKey<ReactComponentContributor> = { name: 'mainView' }
export const stateSlotKey: SlotKey<ReducersMapObjectContributor> = { name: 'state' }

const toFeatureToggleSet = (names: string[], active: boolean): FeatureToggleSet => {
    return names.reduce<FeatureToggleSet>((result: FeatureToggleSet, name: string) => {
        result[name] = active
        return result
    }, {})
}

function createAppHostImpl(): AppHost {
    let store: Store | null = null
    let currentLifecycleFeature: PrivateFeatureHost | null = null
    let lastInstallLazyFeatureNames: string[] = []
    let canInstallReadyFeatures: boolean = true
    let unReadyFeatureLifecycles: FeatureLifecycle[] = []

    const readyAPIs = new Set<AnySlotKey>()

    const uniqueFeatureNames = new Set<string>()
    const extensionSlots = new Map<AnySlotKey, AnyExtensionSlot>()
    const slotKeysByName = new Map<string, AnySlotKey>()
    const installedFeatures = new Map<string, PrivateFeatureHost>()
    const featureInstallers = new WeakMap<PrivateFeatureHost, string[]>()
    const lazyFeatures = new Map<string, LazyFeatureFactory>()

    const host: AppHost = {
        getStore,
        getApi,
        getSlot,
        getAllSlotKeys,
        getAllFeatures,
        isFeatureActive,
        isFeatureInstalled,
        isLazyFeature,
        installFeatures,
        uninstallFeatures
    }

    // TODO: Conditionally with parameter
    window.reactAppLegoDebug = {
        host,
        uniqueFeatureNames,
        extensionSlots,
        installedFeatures,
        lazyFeatures,
        readyAPIs,
        featureInstallers
    }

    declareSlot<ReactComponentContributor>(mainViewSlotKey)
    declareSlot<ReducersMapObjectContributor>(stateSlotKey)

    return host

    function isLazyFeatureDescriptor(value: AnyLifecycle): value is LazyFeatureDescriptor {
        return typeof (value as LazyFeatureDescriptor).factory === 'function'
    }

    function installFeatures(features: AnyFeature[]): void {
        console.log(`Adding ${features.length} features.`)

        const lifecycles = _.flatten(features)

        validateUniqueFeatureNames(lifecycles)

        const [lazyFeatureList, readyFeatureList] = _.partition(lifecycles, isLazyFeatureDescriptor) as [
            LazyFeatureDescriptor[],
            FeatureLifecycle[]
        ]

        executeInstallLifecycle(readyFeatureList)
        lazyFeatureList.forEach(registerLazyFeature)

        const activeFeatureNames = lifecycles
            .map(lifecycles => lifecycles.name)
            .concat(lastInstallLazyFeatureNames)
            .filter(name => installedFeatures.has(name) || lazyFeatures.has(name))

        activateFeatures(activeFeatureNames)
    }

    function executeInstallLifecycle(lifecycles: FeatureLifecycle[]): void {
        lastInstallLazyFeatureNames = []

        const [readyLifecycles, unReadyLifecycles] = _.partition(lifecycles, lifecycle =>
            _.chain(lifecycle)
                .invoke('getDependencyApis')
                .defaultTo([])
                .find(key => !readyAPIs.has(getOwnSlotKey(key)))
                .isEmpty()
                .value()
        )

        unReadyFeatureLifecycles = _(unReadyFeatureLifecycles)
            .difference(readyLifecycles)
            .union(unReadyLifecycles)
            .value()

        if (store && _.isEmpty(readyLifecycles)) {
            return
        }

        const featureHosts = readyLifecycles.map(createFeatureHost)
        executeReadyFeaturesLifecycle(featureHosts)
    }

    function executeReadyFeaturesLifecycle(featureHosts: PrivateFeatureHost[]): void {
        canInstallReadyFeatures = false
        try {
            invokeFeaturePhase(
                'getDependencyApis',
                featureHosts,
                f => f.lifecycle.getDependencyApis && f.setDependencyApis(f.lifecycle.getDependencyApis()),
                f => !!f.lifecycle.getDependencyApis
            )

            invokeFeaturePhase('install', featureHosts, f => f.lifecycle.install && f.lifecycle.install(f), f => !!f.lifecycle.install)

            buildStore()
            featureHosts.forEach(f => f.setLifecycleState(true, true))

            invokeFeaturePhase('extend', featureHosts, f => f.lifecycle.extend && f.lifecycle.extend(f), f => !!f.lifecycle.extend)

            featureHosts.forEach(f => installedFeatures.set(f.lifecycle.name, f))
        } finally {
            canInstallReadyFeatures = true
        }
        executeInstallLifecycle(unReadyFeatureLifecycles)
    }

    async function activateFeatures(names: string[]) {
        await ensureLazyFeaturesInstalled(names)
        const updates = toFeatureToggleSet(names, true)
        getStore().dispatch(InstalledFeaturesActions.updateInstalledFeatures(updates))
    }

    function deactivateFeatures(names: string[]): void {
        const updates = toFeatureToggleSet(names, false)
        getStore().dispatch(InstalledFeaturesActions.updateInstalledFeatures(updates))
    }

    function declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (!extensionSlots.has(key) && !slotKeysByName.has(key.name)) {
            const newSlot = createExtensionSlot<TItem>(key, host, getCurrentLifecycleFeature)

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

    function getAllFeatures(): FeatureInfo[] {
        throw new Error('not implemented')
    }

    function isFeatureActive(name: string): boolean {
        const activeFeatureSet = InstalledFeaturesSelectors.getInstalledFeatureSet(getStore().getState())
        return activeFeatureSet[name] === true
    }

    function isFeatureInstalled(name: string): boolean {
        return installedFeatures.has(name)
    }

    function isLazyFeature(name: string): boolean {
        return lazyFeatures.has(name)
    }

    function registerLazyFeature(descriptor: LazyFeatureDescriptor): void {
        lazyFeatures.set(descriptor.name, descriptor.factory)
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

    function validateUniqueFeatureNames(features: AnyLifecycle[]): void {
        features.forEach(f => validateUniqueFeatureName(f.name))
    }

    function validateUniqueFeatureName(name: string): void {
        if (!uniqueFeatureNames.has(name)) {
            uniqueFeatureNames.add(name)
        } else {
            throw new Error(`Feature named '${name}' already exists`)
        }
    }

    function loadLazyFeature(name: string): Promise<FeatureLifecycle> {
        const factory = lazyFeatures.get(name)

        if (factory) {
            return factory()
        }

        throw new Error(`Feature '${name}' could not be found.`)
    }

    async function ensureLazyFeaturesInstalled(names: string[]) {
        const lazyLoadPromises = names.filter(name => !installedFeatures.has(name)).map(loadLazyFeature)
        const featuresToInstall = await Promise.all(lazyLoadPromises)
        executeInstallLifecycle(featuresToInstall)
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

    function getPerFeatureReducersMapObject(): FeaturesReducersMap {
        const stateSlot = getSlot(stateSlotKey)
        return stateSlot.getItems().reduce((reducersMap: FeaturesReducersMap, item) => {
            const featureName = item.feature.name
            reducersMap[featureName] = { ...reducersMap[featureName], ...item.contribution() }
            return reducersMap
        }, {})
    }

    function getCombinedFeatureReducers(): ReducersMapObject {
        const featuresReducerMaps = getPerFeatureReducersMapObject()
        return Object.keys(featuresReducerMaps).reduce((reducersMap: ReducersMapObject, featureName: string) => {
            reducersMap[featureName] = combineReducers(featuresReducerMaps[featureName])
            return reducersMap
        }, {})
    }

    function buildReducersMapObject(): ReducersMapObject {
        // TODO: get rid of builtInReducersMaps
        const builtInReducersMaps: ReducersMapObject = { ...contributeInstalledFeaturesState() }
        return { ...builtInReducersMaps, ...getCombinedFeatureReducers() }
    }

    function invokeFeaturePhase(
        phase: string,
        features: PrivateFeatureHost[],
        action: (feature: PrivateFeatureHost) => void,
        predicate?: (feature: PrivateFeatureHost) => boolean
    ): void {
        console.log(`--- ${phase} phase ---`)

        try {
            features.filter(f => !predicate || predicate(f)).forEach(f => invokeFeature(f, action, phase))
        } catch (err) {
            console.error(`${phase} phase FAILED`, err)
            throw err
        }

        console.log(`--- End of ${phase} phase ---`)
    }

    function invokeFeature(feature: PrivateFeatureHost, action: (feature: PrivateFeatureHost) => void, phase: string): void {
        console.log(`${phase} : ${feature.lifecycle.name}`)

        try {
            currentLifecycleFeature = feature
            action(feature)
        } catch (err) {
            console.error(`Feature '${feature.name}' FAILED ${phase} phase`, err)
            throw err
        } finally {
            currentLifecycleFeature = null
        }
    }

    function getCurrentLifecycleFeature(): PrivateFeatureHost {
        if (currentLifecycleFeature) {
            return currentLifecycleFeature
        }
        throw new Error('Current lifecycle feature does not exist.')
    }

    function getApiContributor<TApi>(key: SlotKey<TApi>): PrivateFeatureHost | undefined {
        const ownKey = getOwnSlotKey(key)
        return extensionSlots.has(ownKey) ? _.get(getSlot<TApi>(ownKey).getSingleItem(), 'feature') : undefined
    }

    function doesExtensionItemBelongToFeatures(extensionItem: ExtensionItem<any>, featureNames: string[]) {
        return (
            _.includes(featureNames, extensionItem.feature.name) ||
            _.some(_.invoke(extensionItem.feature.lifecycle, 'getDependencyApis'), apiKey =>
                _.includes(featureNames, _.get(getApiContributor(apiKey), 'name'))
            )
        )
    }

    function isApiMissing(apiKey: AnySlotKey): boolean {
        const ownKey = getOwnSlotKey(apiKey)
        return !extensionSlots.has(ownKey)
    }

    function uninstallIfDependencyApisRemoved(featureHost: PrivateFeatureHost) {
        const dependencyApis = _.invoke(featureHost.lifecycle, 'getDependencyApis')

        if (_.some(dependencyApis, isApiMissing)) {
            unReadyFeatureLifecycles.push(featureHost.lifecycle)
            uninstallFeatures([featureHost.name])
        }
    }

    function discardApi<TApi>(apiKey: SlotKey<TApi>) {
        const ownKey = getOwnSlotKey(apiKey)
        
        readyAPIs.delete(ownKey)
        extensionSlots.delete(ownKey)
        slotKeysByName.delete(ownKey.name)
        
        console.log(`-- Removed API: ${ownKey.name}} --`)
    }

    function uninstallFeatures(names: string[]): void {
        console.log(`-- Uninstalling ${names} --`)

        invokeFeaturePhase('uninstall', names.map(name => installedFeatures.get(name)) as PrivateFeatureHost[], f =>
            _.invoke(f.lifecycle, 'uninstall', f)
        )

        const apisToDiscard = [...readyAPIs].filter(apiKey => _.includes(names, _.get(getApiContributor(apiKey), 'name')))
        extensionSlots.forEach(extensionSlot =>
            (extensionSlot as ExtensionSlot<any>).discardBy(extensionItem => doesExtensionItemBelongToFeatures(extensionItem, names))
        )

        names.forEach(name => {
            installedFeatures.delete(name)
            uniqueFeatureNames.delete(name)
        })
        apisToDiscard.forEach(discardApi)

        deactivateFeatures(names)

        console.log(`Done uninstalling ${names}`)

        installedFeatures.forEach(uninstallIfDependencyApisRemoved)
    }

    function createFeatureHost(lifecycle: FeatureLifecycle): PrivateFeatureHost {
        let storeEnabled = false
        let apisEnabled = false
        let dependencyApis: AnySlotKey[] = []

        const isOwnContributedApi = <TApi>(key: SlotKey<TApi>): boolean => getApiContributor(key) === featureHost

        const featureHost: PrivateFeatureHost = {
            name: lifecycle.name,
            lifecycle,

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

            installFeatures(features: AnyFeature[]): void {
                const featureNamesToBeinstalled = _.chain(features)
                    .flatten()
                    .map('name')
                    .value()
                const featureNamesInstalledByCurrentFeature = featureInstallers.get(featureHost) || []
                featureInstallers.set(featureHost, [...featureNamesInstalledByCurrentFeature, ...featureNamesToBeinstalled])
                host.installFeatures(features)
            },

            uninstallFeatures(names: string[]): void {
                const namesInstalledByCurrentFeature = featureInstallers.get(featureHost) || []
                const namesNotInstalledByCurrentFeature = _.difference(names, namesInstalledByCurrentFeature)
                // TODO: Allow feature to uninstall itself?
                if (!_.isEmpty(namesNotInstalledByCurrentFeature)) {
                    throw new Error(
                        `Feature ${lifecycle.name} is trying to uninstall features: ${names} which is are not installed by ${
                            lifecycle.name
                        } - This is not allowed`
                    )
                }
                featureInstallers.set(featureHost, _.without(namesInstalledByCurrentFeature, ...names))
                host.uninstallFeatures(names)
            },

            getApi<TApi>(key: SlotKey<TApi>): TApi {
                if (dependencyApis.indexOf(key) >= 0 || isOwnContributedApi(key)) {
                    return host.getApi(key)
                }
                throw new Error(
                    `API '${key.name}' is not declared as dependency by feature '${
                        lifecycle.name
                    }' (forgot to return it from getDependencyApis?)`
                )
            },

            contributeApi<TApi>(key: SlotKey<TApi>, factory: () => TApi): TApi {
                console.log(`Contributing API ${key.name}.`)

                const api = factory()
                const apiSlot = declareSlot<TApi>(key)
                apiSlot.contribute(api, undefined, featureHost)

                readyAPIs.add(key)

                if (canInstallReadyFeatures) {
                    const lifecycleNames = _.map(unReadyFeatureLifecycles, 'name')
                    executeInstallLifecycle(unReadyFeatureLifecycles)
                    activateFeatures(_.difference(lifecycleNames, _.map(unReadyFeatureLifecycles, 'name')))
                }

                return api
            },

            contributeState<TState>(contributor: ReducersMapObjectContributor<TState>): void {
                getSlot(stateSlotKey).contribute(contributor, undefined, featureHost)
            },

            getStore<TState>(): ScopedStore<TState> {
                return {
                    dispatch: host.getStore().dispatch,
                    subscribe: host.getStore().subscribe,
                    getState: () => host.getStore().getState()[featureHost.name]
                }
            },

            contributeMainView(contributor: ReactComponentContributor): void {
                getSlot(mainViewSlotKey).contribute(contributor)
            }
        }

        return featureHost
    }
}
