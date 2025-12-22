import { AnyEntryPoint, AnySlotKey, SlotKey } from './API'

import _ from 'lodash'

const getInterfaceDependencies = (entryPoint: AnyEntryPoint): SlotKey<any>[] => {
    const ep: any = entryPoint as any
    // New explicit interface dependencies take precedence.
    if (typeof ep.getInterfaceDependencies === 'function') {
        return ep.getInterfaceDependencies() || []
    }
    // Fallback to legacy getDependencyAPIs for backwards compatibility.
    if (typeof ep.getDependencyAPIs === 'function') {
        return ep.getDependencyAPIs() || []
    }
    return []
}

export const dependentAPIs = (entryPoint: AnyEntryPoint): AnySlotKey[] => {
    return getInterfaceDependencies(entryPoint)
}

export const declaredAPIs = (entryPoint: AnyEntryPoint): AnySlotKey[] => {
    return _.chain(entryPoint).invoke('declareAPIs').defaultTo([]).value()
}
