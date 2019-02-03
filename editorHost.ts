import { 
    Store, 
    createStore, 
    combineReducers, 
    ReducersMapObject 
} from 'redux';

import { 
    EditorHost, 
    EditorFeature,
    ExtensionSlot, 
    ReactComponentContributor, 
    ReduxStateContributor,
    LazyFeatureFactory,
    SlotKey,
    AnySlotKey,
    FeatureActivationPredicate,
    FeatureInfo,
    FeatureContext,
    LazyFeatureDescriptor
} from './api';

import { AnyExtensionSlot, createExtensionSlot } from './extensionSlot';
import { ActiveFeaturesActions, ActiveFeaturesSelectors, FeatureToggleSet } from './activeFeaturesState';
import { contributeActiveFeaturesState } from './activeFeaturesState';

export const makeLazyFeature = (name: string, factory: LazyFeatureFactory): LazyFeatureDescriptor => {
    return {
        name,
        factory
    };
};

export function createEditorHost(
    features: (EditorFeature | LazyFeatureDescriptor)[],  
    activation?: FeatureActivationPredicate
    /*, log?: HostLogger */ //TODO: define logging abstraction
): EditorHost {
    const host = createEditorHostImpl();
    host.installFeatures(features, activation);
    return host;
}

export const mainViewSlotKey: SlotKey<ReactComponentContributor> = { name: "mainView" };
export const stateSlotKey: SlotKey<ReduxStateContributor> = { name: "state" };

const toFeatureToggleSet = (names: string[], active: boolean): FeatureToggleSet => {
    return names.reduce<FeatureToggleSet>((result: FeatureToggleSet, name: string) => {
        result[name] = active;
        return result;
    }, {});
}

function createEditorHostImpl(): EditorHost {
    let store: Store | null = null;
    let currentLifecycleFeature: EditorFeature | null = null;
    let lastInstallLazyFeatureNames: string[] = [];

    const uniqueFeatureNames = new Set<string>();
    const extensionSlots = new Map<AnySlotKey, AnyExtensionSlot>();
    const installedFeatures = new Map<string, EditorFeature>();
    const lazyFeatures = new Map<string, LazyFeatureFactory>();

    const host: EditorHost = {
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
    };

    declareSlot<ReactComponentContributor>(mainViewSlotKey);
    declareSlot<ReduxStateContributor>(stateSlotKey);

    return host;

    function isLazyFeatureDescriptor(value: EditorFeature | LazyFeatureDescriptor): value is LazyFeatureDescriptor {
        return (typeof (value as LazyFeatureDescriptor).factory === 'function');
    }

    function installFeatures(features: (EditorFeature | LazyFeatureDescriptor)[], activation?: FeatureActivationPredicate): void {
        console.log(`Adding ${features.length} features.`);

        validateUniqueFeatureNames(features);

        const readyFeatureList = features.filter(f => !isLazyFeatureDescriptor(f)) as EditorFeature[];
        const lazyFeatureList = features.filter(f => isLazyFeatureDescriptor(f)) as LazyFeatureDescriptor[];
        
        executeInstallLifecycle(readyFeatureList);
        lazyFeatureList.forEach(registerLazyFeature);

        const activeFeatureNames = features
            .map(feature => feature.name)
            .concat(lastInstallLazyFeatureNames)
            .filter(name => !activation || activation(name));

        activateFeatures(activeFeatureNames);
    }

    function executeInstallLifecycle(features: EditorFeature[]): void {
        lastInstallLazyFeatureNames = [];

        const contexts = new Map<EditorFeature, FeatureContext>();
        features.forEach(f => contexts.set(f, createFeatureContext(f)));

        invokeFeaturePhase(features, contexts, 'install', (f, ctx) => f.install(ctx));
        buildStore(); //TODO: preserve existing state
        invokeFeaturePhase(features, contexts, 'extend', (f, ctx) => f.extend && f.extend(ctx), f => !!f.extend);

        features.forEach(f => installedFeatures.set(f.name, f));
    }

    async function activateFeatures(names: string[]) {
        await ensureLazyFeaturesInstalled(names);
        const updates = toFeatureToggleSet(names, true);
        getStore().dispatch(ActiveFeaturesActions.updateActiveFeatures(updates));
    }

    function deactivateFeatures(names: string[]): void {
        const updates = toFeatureToggleSet(names, false);
        getStore().dispatch(ActiveFeaturesActions.updateActiveFeatures(updates));
    }

    function declareSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (!extensionSlots.has(key)) {
            const newSlot = createExtensionSlot<TItem>(key, host, getCurrentLifecycleFeature);
            extensionSlots.set(key, newSlot);
            return newSlot;
        } else {
            throw new Error(`Extension slot with key '${key.name}' already exists.`);
        }
    }

    function getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem> {
        if (extensionSlots.has(key)) {
            const anySlot = extensionSlots.get(key);
            return anySlot as ExtensionSlot<TItem>;
        } else {
            throw new Error(`Extension slot with key '${key.name}' doesn't exist.`);
        }
    }
    
    function getApi<TApi>(key: SlotKey<TApi>): TApi {
        const apiSlot = getSlot<TApi>(key);
        return apiSlot.getSingleItem().contribution;
    }

    function getStore(): Store {
        if (store) {
            return store;
        }
        throw new Error('Store was not yet created');
    }

    function getAllSlotKeys(): AnySlotKey[] { 
        return Array.from(extensionSlots.keys());
    }

    function getAllFeatures(): FeatureInfo[] { 
        throw new Error('not implemented');
    }

    function isFeatureActive(name: string): boolean { 
        const activeFeatureSet = ActiveFeaturesSelectors.getActiveFeatureSet(getStore().getState());
        return (activeFeatureSet[name] === true);
    }

    function isFeatureInstalled(name: string): boolean { 
        return installedFeatures.has(name);
    }

    function isLazyFeature(name: string): boolean { 
        return lazyFeatures.has(name);
    }

    function registerLazyFeature(descriptor: LazyFeatureDescriptor): void {
        lazyFeatures.set(descriptor.name, descriptor.factory);
    }

    function validateUniqueFeatureNames(features: (EditorFeature | LazyFeatureDescriptor)[]): void {
        features.forEach(f => validateUniqueFeatureName(f.name));
    }

    function validateUniqueFeatureName(name: string): void {
        if (!uniqueFeatureNames.has(name)) {
            uniqueFeatureNames.add(name);
        } else {
            throw new Error(`Feature named '${name}' already exists`);
        }
    }

    function loadLazyFeature(name: string): Promise<EditorFeature> {
        const factory = lazyFeatures.get(name);
        
        if (factory) {
            return factory();
        }

        throw new Error(`Feature '${name}' could not be found.`);
    }

    async function ensureLazyFeaturesInstalled(names: string[]) {
        const lazyLoadPromises = names
            .filter(name => !installedFeatures.has(name))
            .map(loadLazyFeature);
        const featuresToInstall = await Promise.all(lazyLoadPromises);
        executeInstallLifecycle(featuresToInstall);
    }

    function buildStore(): Store {
        //TODO: preserve existing state
        const reducersMap = buildReducersMapObject();
        const reducer = combineReducers(reducersMap);

        if (store) {
            store.replaceReducer(reducer);
        } else {
            store = createStore(reducer);
        }

        return store;
    }

    function buildReducersMapObject(): ReducersMapObject {
        let result: any = {};
        
        //TODO: get rid of builtInStateBlocks
        const builtInStateBlocks = [
            contributeActiveFeaturesState()
        ];

        const stateSlot = getSlot(stateSlotKey);
        const allStateBlocks = builtInStateBlocks.concat(
            stateSlot.getItems().map(item => item.contribution())
        );

        for (let block of allStateBlocks) {
            result[block.name] = block.reducer;
        }

        return result;
    }

    function invokeFeaturePhase(
        features: EditorFeature[], 
        contexts: Map<EditorFeature, FeatureContext>,
        phase: string, 
        action: (feature: EditorFeature, context: FeatureContext) => void,
        predicate?: (feature: EditorFeature) => boolean
    ): void {
        console.log(`--- ${phase} phase ---`);
        
        try {
            features
                .filter(f => !predicate || predicate(f))
                .forEach(f => {
                    const context = contexts.get(f);
                    context && invokeFeature(f, action, context, phase);
                });
        } catch (err) {
            console.error(`${phase} phase FAILED`, err);
            throw err;
        }
        
        console.log(`--- End of ${phase} phase ---`);
    }

    function invokeFeature(
        feature: EditorFeature, 
        action: (feature: EditorFeature, context: FeatureContext) => void, 
        context: FeatureContext,
        phase: string): void 
    {
        console.log(`${phase} : ${feature.name}`);
        
        try {
            currentLifecycleFeature = feature;
            action(feature, context);
        } catch (err) {
            console.error(`Feature '${feature.name}' FAILED ${phase} phase`, err);
            throw err;
        } finally {
            currentLifecycleFeature = null;
        }
    } 

    function getCurrentLifecycleFeature(): EditorFeature {
        if (currentLifecycleFeature) {
            return currentLifecycleFeature;
        }
        throw new Error('Current lifecycle feature does not exist.');
    }

    function createFeatureContext(feature: EditorFeature): FeatureContext {
        return {

            ...host,
            declareSlot,

            contributeApi<TApi>(key: SlotKey<TApi>, factory: (host: EditorHost) => TApi): TApi {
                console.log(`Contributing API ${key.name}.`);
        
                const api = factory(host);
                const apiSlot = declareSlot<TApi>(key);
                apiSlot.contribute(api);
        
                return api;
            },
        
            contributeState(contributor: ReduxStateContributor): void {
                getSlot(stateSlotKey).contribute(contributor);
            },
            
            contributeMainView(contributor: ReactComponentContributor): void {
                getSlot(mainViewSlotKey).contribute(contributor);
            },
        
            contributeLazyFeature(name: string, factory: LazyFeatureFactory): void {
                validateUniqueFeatureName(name);
                registerLazyFeature({ name, factory });
                lastInstallLazyFeatureNames.push(name);
            }
        
        };

    }
}
