import { AppHost, ContributionPredicate, ExtensionItem, ExtensionItemFilter, ExtensionSlot, PrivateShell, SlotKey } from './api'

export interface AnyExtensionSlot {
    readonly name: string
}

const alwaysTrue = () => true

export function createExtensionSlot<T>(key: SlotKey<T>, host: AppHost, getShell: () => PrivateShell): ExtensionSlot<T> & AnyExtensionSlot {
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

    function contribute(item: T, condition?: ContributionPredicate, shell?: PrivateShell): void {
        items.push({
            shell: shell || getShell(),
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
