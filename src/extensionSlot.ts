import {
    AppHost,
    ContributionPredicate,
    ExtensionItem,
    ExtensionItemFilter,
    ExtensionSlot,
    Shell,
    SlotKey,
    CustomExtensionSlot,
    CustomExtensionSlotHandler,
    Contribution
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
        discardBy
    }

    function contribute(fromShell: Shell, item: T, condition?: ContributionPredicate): Contribution {
        const contribution = {
            shell: fromShell,
            contribution: item,
            condition: condition || alwaysTrue,
            uniqueId: _.uniqueId(`${fromShell.name}_extItem_`)
        }

        items.push(contribution)

        return {
            unsubscribe: () => {
                items = items.filter(i => i !== contribution)
            }
        }
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
