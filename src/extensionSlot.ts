import {
    AppHost,
    ContributionPredicate,
    ExtensionItem,
    ExtensionItemFilter,
    ExtensionSlot,
    FeatureLifecycle,
    PrivateFeatureHost,
    SlotKey
} from './api'

export interface AnyExtensionSlot {
    readonly name: string
}

const alwaysTrue = () => true

export function createExtensionSlot<T>(
    key: SlotKey<T>,
    host: AppHost,
    getCurrentLifecycleFeature: () => PrivateFeatureHost
): ExtensionSlot<T> & AnyExtensionSlot {
    let items: Array<ExtensionItem<T>> = []

    return {
        host,
        name: key.name,
        contribute,
        getItems,
        getSingleItem,
        getItemByName,
        discardBy
    }

    function contribute(item: T, condition?: ContributionPredicate, feature?: PrivateFeatureHost): void {
        items.push({
            feature: feature || getCurrentLifecycleFeature(),
            contribution: item,
            condition: condition || alwaysTrue
        })
    }

    function getItems(forceAll: boolean = false): Array<ExtensionItem<T>> {
        return items.filter(item => forceAll || item.condition())
    }

    function getSingleItem(): ExtensionItem<T> {
        return getItems()[0]
    }

    function getItemByName(name: string): ExtensionItem<T> {
        return items.filter(item => item.name === name && item.condition())[0]
    }

    function discardBy(predicate: ExtensionItemFilter<T>) {
        items = items.filter(v => !predicate(v))
    }
}
