import _ from 'lodash'
import { EntryPoint, EntryPointOrPackage, EntryPointInterceptor, EntryPointOrPackagesMap } from './API'

// function isArray(entryPoints: EntryPointOrPackage[] | Object): entryPoints is EntryPointOrPackage[] {
//     return (typeof (entryPoints as EntryPointOrPackage[]).length === 'number')
// }

export function interceptEntryPoints(entryPoints: EntryPointOrPackage, interceptor: EntryPointInterceptor): EntryPoint[] {
    return (_.flatten([entryPoints]) as EntryPoint[]).map(ep => applyInterceptor(ep, interceptor))
}

export function interceptEntryPointsMap(entryPointsMap: EntryPointOrPackagesMap, interceptor: EntryPointInterceptor) {
    const result: EntryPointOrPackagesMap = {}

    for (const key in entryPointsMap) {
        if (entryPointsMap.hasOwnProperty(key)) {
            result[key] = interceptEntryPoints(entryPointsMap[key], interceptor)
        }
    }

    return result
}

function applyInterceptor(inner: EntryPoint, interceptor: EntryPointInterceptor): EntryPoint {
    return {
        name: interceptor.interceptName ? interceptor.interceptName(inner.name) : inner.name,
        getDependencyAPIs: interceptor.interceptGetDependencyAPIs
            ? interceptor.interceptGetDependencyAPIs(inner.getDependencyAPIs)
            : inner.getDependencyAPIs,
        declareAPIs: interceptor.interceptDeclareAPIs ? interceptor.interceptDeclareAPIs(inner.declareAPIs) : inner.declareAPIs,
        attach: interceptor.interceptAttach ? interceptor.interceptAttach(inner.attach) : inner.attach,
        detach: interceptor.interceptDetach ? interceptor.interceptDetach(inner.detach) : inner.detach,
        extend: interceptor.interceptExtend ? interceptor.interceptExtend(inner.extend) : inner.extend
    }
}
