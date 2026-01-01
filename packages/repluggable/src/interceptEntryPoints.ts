import _ from 'lodash'
import { EntryPoint, EntryPointOrPackage, EntryPointInterceptor, EntryPointOrPackagesMap } from './API'

export function interceptEntryPoints(entryPoints: EntryPointOrPackage, interceptor: EntryPointInterceptor): EntryPoint[] {
    return (_.flatten([entryPoints]) as EntryPoint[]).map(ep => applyInterceptor(ep, interceptor))
}

export function interceptEntryPointsMap(entryPointsMap: EntryPointOrPackagesMap, interceptor: EntryPointInterceptor) {
    return _.mapValues(entryPointsMap, ep => interceptEntryPoints(ep, interceptor))
}

function applyInterceptor(inner: EntryPoint, interceptor: EntryPointInterceptor): EntryPoint {
    return {
        name: interceptor.interceptName ? interceptor.interceptName(inner.name) : inner.name,
        layer: inner.layer,
        tags: interceptor.interceptTags ? interceptor.interceptTags(inner.tags) : inner.tags,
        getDependencyAPIs: interceptor.interceptGetDependencyAPIs
            ? interceptor.interceptGetDependencyAPIs(inner.getDependencyAPIs)
            : inner.getDependencyAPIs,
        getColdDependencyAPIs: interceptor.interceptGetColdDependencyAPIs
            ? interceptor.interceptGetColdDependencyAPIs(inner.getColdDependencyAPIs)
            : inner.getColdDependencyAPIs,
        declareAPIs: interceptor.interceptDeclareAPIs ? interceptor.interceptDeclareAPIs(inner.declareAPIs) : inner.declareAPIs,
        attach: interceptor.interceptAttach ? interceptor.interceptAttach(inner.attach) : inner.attach,
        detach: interceptor.interceptDetach ? interceptor.interceptDetach(inner.detach) : inner.detach,
        extend: interceptor.interceptExtend ? interceptor.interceptExtend(inner.extend) : inner.extend
    }
}
