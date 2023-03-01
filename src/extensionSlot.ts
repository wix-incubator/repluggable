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

type Unsubscribe = () => void

export function createExtensionSlot<T>(key: SlotKey<T>, host: AppHost, declaringShell?: Shell): ExtensionSlot<T> & AnyExtensionSlot {
    let items: ExtensionItem<T>[] = []
    let subscribers: (() => void)[] = []

    return {
        host,
        declaringShell,
        name: key.name,
        contribute,
        getItems,
        getSingleItem,
        getItemByName,
        discardBy,
        subscribe
    }

    function contribute(fromShell: Shell, item: T, condition?: ContributionPredicate): void {
        const originalContributionCount = items.length
        items.push({
            shell: fromShell,
            contribution: item,
            condition: condition || alwaysTrue,
            uniqueId: _.uniqueId(`${fromShell.name}_extItem_`)
        })
        if (items.length !== originalContributionCount) {
            subscribers.forEach(func => func())
        }
    }

    function getItems(forceAll: boolean = false): ExtensionItem<T>[] {
        return forceAll ? items : items.filter(item => item.condition())
    }

    function getSingleItem(): ExtensionItem<T> | undefined {
        return items.find(item => item.condition())
    }

    function getItemByName(name: string): ExtensionItem<T> | undefined {
        return items.find(item => item.name === name && item.condition())
    }

    function discardBy(predicate: ExtensionItemFilter<T>) {
        const originalContributionCount = items.length
        items = items.filter(v => !predicate(v))
        if (items.length !== originalContributionCount) {
            subscribers.forEach(func => func())
        }
    }

    function subscribe(callback: () => void): Unsubscribe {
        subscribers.push(callback)
        return () => {
            subscribers = subscribers.filter(func => func !== callback)
        }
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
