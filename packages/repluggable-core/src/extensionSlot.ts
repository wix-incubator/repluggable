import {
    AppHost,
    ContributionPredicate,
    ExtensionItem,
    ExtensionItemFilter,
    PrivateExtensionSlot,
    Shell,
    SlotKey,
    CustomExtensionSlot,
    CustomExtensionSlotHandler,
    PrivateAppHost
} from './API'
import _ from 'lodash'

export interface AnyExtensionSlot {
    readonly name: string
    readonly declaringShell?: Shell
}

const alwaysTrue = () => true

type Unsubscribe = () => void

interface ItemsDataStructure<T> {
    get(): ExtensionItem<T>[]
    add(item: ExtensionItem<T>): void
    discardBy(predicate: (item: ExtensionItem<T>) => boolean): void
}

const itemsDataStructure = <T>(): ItemsDataStructure<T> => {
    let items: ExtensionItem<T>[] = []
    return {
        get: () => items,
        add: (item: ExtensionItem<T>) => {
            items.push(item)
        },
        discardBy: (predicate: (item: ExtensionItem<T>) => boolean) => {
            items = items.filter(predicate)
        }
    }
}

export type CustomCreateExtensionSlot = <T>() => ItemsDataStructure<T>

export interface CreateExtensionSlotOptions {
    declaringShell?: Shell
    customCreateExtensionSlot?: CustomCreateExtensionSlot
}

export function createExtensionSlot<T>(
    key: SlotKey<T>,
    host: PrivateAppHost,
    options?: CreateExtensionSlotOptions
): PrivateExtensionSlot<T> & AnyExtensionSlot {
    const items = options?.customCreateExtensionSlot ? options.customCreateExtensionSlot<T>() : itemsDataStructure<T>()
    let subscribers: (() => void)[] = []
    const slotUniqueId = _.uniqueId()

    return {
        host,
        declaringShell: options?.declaringShell,
        name: key.name,
        contribute,
        getItems,
        getSingleItem,
        getItemByName,
        discardBy,
        subscribe
    }

    function contribute(fromShell: Shell, item: T, condition?: ContributionPredicate): void {
        items.add({
            shell: fromShell,
            contribution: item,
            condition: condition || alwaysTrue,
            uniqueId: _.uniqueId(`${fromShell.name}_extItem_`)
        })
        host.executeWhenFree(slotUniqueId, () => subscribers.forEach(func => func()))
    }

    function getItems(forceAll: boolean = false): ExtensionItem<T>[] {
        return forceAll ? items.get() : items.get().filter(item => item.condition())
    }

    function getSingleItem(): ExtensionItem<T> | undefined {
        return items.get().find(item => item.condition())
    }

    function getItemByName(name: string): ExtensionItem<T> | undefined {
        return items.get().find(item => item.name === name && item.condition())
    }

    function discardBy(predicate: ExtensionItemFilter<T>) {
        const originalContributionCount = items.get().length
        items.discardBy(v => !predicate(v))
        if (items.get().length !== originalContributionCount) {
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
