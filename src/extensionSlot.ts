import { AppHost, ContributionPredicate, ExtensionItem, ExtensionItemFilter, ExtensionSlot, Shell, SlotKey } from './API'
import _ from 'lodash'

export interface AnyExtensionSlot {
    readonly name: string
}

const alwaysTrue = () => true

export function createExtensionSlot<T>(key: SlotKey<T>, host: AppHost): ExtensionSlot<T> & AnyExtensionSlot {
    let items: ExtensionItem<T>[] = []

    return {
        host,
        name: key.name,
        contribute,
        getItems,
        getSingleItem,
        getItemByName,
        discardBy
    }

    function contribute(fromShell: Shell, item: T, condition?: ContributionPredicate): void {
        items.push({
            shell: fromShell,
            contribution: item,
            condition: condition || alwaysTrue,
            uniqueId: _.uniqueId(`${fromShell.name}_extItem_`)
        })
    }

    function getItems(forceAll: boolean = false): ExtensionItem<T>[] {
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
