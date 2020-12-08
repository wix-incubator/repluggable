import {
    AppHost,
    ContributionPredicate,
    ExtensionItem,
    ExtensionItemFilter,
    ExtensionSlot,
    Shell,
    SlotKey,
    CustomExtensionSlot,
    CustomExtensionSlotHandler
} from './API'
import _ from 'lodash'

export interface AnyExtensionSlot {
    readonly name: string
    readonly declaringShell?: Shell
}

const alwaysTrue = () => true

export function createExtensionSlot<T>(key: SlotKey<T>, host: AppHost, declaringShell?: Shell): ExtensionSlot<T> & AnyExtensionSlot {
    let items: ExtensionItem<T>[] = []

    return {
        host,
        declaringShell,
        name: key.name,
        contribute,
        getItems,
        getSingleItem,
        getItemByName,
        getItemsByNames,
        discardBy
    }

    function contribute(fromShell: Shell, item: T, condition: ContributionPredicate = alwaysTrue, name?: string): void {
        items.push({
            shell: fromShell,
            contribution: item,
            condition: condition || alwaysTrue,
            uniqueId: _.uniqueId(`${fromShell.name}_extItem_`),
            name
        })
    }

    function getItems(forceAll: boolean = false): ExtensionItem<T>[] {
        return forceAll ? items : items.filter(item => item.condition())
    }

    function getSingleItem(): ExtensionItem<T> {
        return items.find(item => item.condition()) as ExtensionItem<T>
    }

    function getItemByName(name: string): ExtensionItem<T> {
        return items.find(item => item.name === name && item.condition()) as ExtensionItem<T>
    }

    function getItemsByNames(names: string[]): ExtensionItem<T>[] {
        return names.map(name => getItemByName(name))
    }

    function discardBy(predicate: ExtensionItemFilter<T>) {
        items = items.filter(v => !predicate(v))
    }
}

export function createCustomExtensionSlot<T>(
    key: SlotKey<T>,
    handler: CustomExtensionSlotHandler<T>,
    host: AppHost,
    declaringShell?: Shell
): CustomExtensionSlot<T> & AnyExtensionSlot {
    return {
        name: key.name,
        host,
        declaringShell,
        contribute: (...args) => handler.contribute(...args),
        discardBy: (...args) => handler.discardBy(...args)
    }
}
