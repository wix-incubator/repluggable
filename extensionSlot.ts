import { ExtensionSlot, ExtensionItem, SlotKey, EditorHost, ContributionPredicate, EditorFeature } from './api';

export interface AnyExtensionSlot {
    readonly name: string
};

const alwaysTrue = () => true;

export function createExtensionSlot<T>(
    key: SlotKey<T>, 
    host: EditorHost,
    getCurrentLifecycleFeature: () => EditorFeature): ExtensionSlot<T> & AnyExtensionSlot {

    let items: ExtensionItem<T>[] = [];

    return {
        host,
        name: key.name,
        contribute,
        getItems,
        getSingleItem,
        getItemByName
    };

    function contribute(item: T, condition?: ContributionPredicate): void {
        items.push({
            feature: getCurrentLifecycleFeature(),
            contribution: item,
            condition: condition || alwaysTrue
        });
    }    
    
    function getItems(forceAll: boolean = false): ExtensionItem<T>[] {
        return items.filter(item => forceAll || item.condition());
    }
    
    function getSingleItem(): ExtensionItem<T> {
        return getItems()[0];
    }

    function getItemByName(name: string): ExtensionItem<T> {
        return items.filter(
            item => item['name'] === name && item.condition()
        )[0];
    }

}
