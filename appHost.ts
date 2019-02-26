import { combineReducers, createStore, ReducersMapObject, Store } from 'redux'

import {
    AnyFeature,
    AnySlotKey,
    AppHost,
    ExtensionSlot,
    FeatureActivationPredicate,
    FeatureInfo,
    FeatureLifecycle,
    LazyFeatureDescriptor,
    LazyFeatureFactory,
    PrivateFeatureHost,
    ReactComponentContributor,
    ReduxStateContributor,
    SlotKey
} from './api'

import _ from 'lodash'
import { ActiveFeaturesActions, ActiveFeaturesSelectors, contributeActiveFeaturesState, FeatureToggleSet } from './activeFeaturesState'
import { AnyExtensionSlot, createExtensionSlot } from './extensionSlot'

export const makeLazyFeature = (name: string, factory: LazyFeatureFactory): LazyFeatureDescriptor => {
    return {
        name,
        factory
    }
}

export function createAppHost(
    features: AnyFeature[],
    activation?: FeatureActivationPredicate
    /*, log?: HostLogger */ //TODO: define logging abstraction
): AppHost {
    const host = createAppHostImpl()
    host.installFeatures(features, activation)
    return host
}

export const mainViewSlotKey: SlotKey<ReactComponentContributor> = { name: 'mainView' }
export const stateSlotKey: SlotKey<ReduxStateContributor> = { name: 'state' }

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
    const installedFeatures = new Map<string, PrivateFeatureHost>()
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
        activateFeatures,
        deactivateFeatures
    }

    declareSlot<ReactComponentContributor>(mainViewSlotKey)
    declareSlot<ReduxStateContributor>(stateSlotKey)

    return host

    function isLazyFeatureDescriptor(value: FeatureLifecycle | LazyFeatureDescriptor): value is LazyFeatureDescriptor {
        return typeof (value as LazyFeatureDescriptor).factory === 'function'
    }

    function installFeatures(features: AnyFeature[], activation?: FeatureActivationPredicate): void {
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
            .filter(name => (!activation || activation(name)) && (installedFeatures.has(name) || lazyFeatures.has(name)))

        activateFeatures(activeFeatureNames)
    }

    function executeInstallLifecycle(lifecycles: FeatureLifecycle[]): void {
        lastInstallLazyFeatureNames = []

        const [readyLifecycles, unReadyLifecycles] = _.partition(lifecycles, lifecycle =>
            _.chain(lifecycle)
                .invoke('getDependencyApis')
                .defaultTo([])
                .find(key => !readyAPIs.has(key))
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

            invokeFeaturePhase('install', featureHosts, f => f.lifecycle.install(f))

            buildStore()
            featureHosts.forEach(f => f.setLifecycleState(true, true))

            invokeFeaturePhase('extend', featureHosts, f => f.lifecycle.extend && f.lifecycle.extend(f), f => !!f.lifecycle.extend)

            featureHosts.forEach(f => installedFeatures.set(f.lifecycle.name, f))
        } finally {
            canInstallReadyFeatures = true
            executeInstallLifecycle(unReadyFeatureLifecycles)
        }
    }

    async function activateFeatures(names: string[]) {
        await ensureLazyFeaturesInstalled(names)
        const updates = toFeatureToggleSet(names, true)
        getStore().dispatch(ActiveFeaturesActions.updateActiveFeatures(updates))
    }

    function deactivateFeatures(names: string[]): void {
        const updates = toFeatureToggleSet(names, false)
        getStore().dispatch(ActiveFeaturesActions.updateActiveFeatures(updates))
    }

    function declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (!extensionSlots.has(key)) {
            const newSlot = createExtensionSlot<TItem>(key, host, getCurrentLifecycleFeature)
            extensionSlots.set(key, newSlot)
            return newSlot
        } else {
            throw new Error(`Extension slot with key '${key.name}' already exists.`)
        }
    }

    function getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (extensionSlots.has(key)) {
            const anySlot = extensionSlots.get(key)
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
        const activeFeatureSet = ActiveFeaturesSelectors.getActiveFeatureSet(getStore().getState())
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

    function validateUniqueFeatureNames(features: AnyFeature[]): void {
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
        //TODO: preserve existing state
        const reducersMap = buildReducersMapObject()
        const reducer = combineReducers(reducersMap)

        if (store) {
            store.replaceReducer(reducer)
        } else {
            store = createStore(reducer)
        }

        return store
    }

    function buildReducersMapObject(): ReducersMapObject {
        let result: any = {}

        //TODO: get rid of builtInStateBlocks
        const builtInStateBlocks = [contributeActiveFeaturesState()]

        const stateSlot = getSlot(stateSlotKey)
        const allStateBlocks = builtInStateBlocks.concat(stateSlot.getItems().map(item => item.contribution()))

        for (let block of allStateBlocks) {
            result[block.name] = block.reducer
        }

        return result
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

    function createFeatureHost(lifecycle: FeatureLifecycle): PrivateFeatureHost {
        let storeEnabled = false
        let apisEnabled = false
        let dependencyApis: AnySlotKey[] = []

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

            getApi<TApi>(key: SlotKey<TApi>): TApi {
                if (dependencyApis.indexOf(key) >= 0) {
                    return host.getApi(key)
                }
                throw new Error(
                    `API '${key.name}' is not declared as dependency by feature '${
                        lifecycle.name
                    }' (forgot to return it from getDependencyApis?)`
                )
            },

            contributeApi<TApi>(key: SlotKey<TApi>, factory: (host: AppHost) => TApi): TApi {
                console.log(`Contributing API ${key.name}.`)

                const api = factory(host)
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

            contributeState(contributor: ReduxStateContributor): void {
                getSlot(stateSlotKey).contribute(contributor)
            },

            contributeMainView(contributor: ReactComponentContributor): void {
                getSlot(mainViewSlotKey).contribute(contributor)
            },

            contributeLazyFeature(name: string, factory: LazyFeatureFactory): void {
                validateUniqueFeatureName(name)
                registerLazyFeature({ name, factory })
                lastInstallLazyFeatureNames.push(name)
            }
        }

        return featureHost
    }
}
