import _ from 'lodash'
import { EntryPoint, EntryPointOrPackage, AnySlotKey } from './API'

export interface EntryPointInterceptor {
    interceptName?(innerName: string): string
    interceptGetDependencyAPIs?(innerGetDependencyAPIs: EntryPoint['getDependencyAPIs']): EntryPoint['getDependencyAPIs']
    interceptDeclareAPIs?(innerDeclareAPIs: EntryPoint['declareAPIs']): EntryPoint['declareAPIs']
    interceptAttach?(innerAttach: EntryPoint['attach']): EntryPoint['attach']
    interceptDetach?(innerDetach: EntryPoint['detach']): EntryPoint['detach']
    interceptExtend?(innerExtend: EntryPoint['extend']): EntryPoint['extend']
}

export function interceptEntryPoints(entryPointsOrPackages: EntryPointOrPackage[], interceptor: EntryPointInterceptor): EntryPoint[] {
    const entryPoints = _.flatten(entryPointsOrPackages) as EntryPoint[]
    return entryPoints.map(ep => applyInterceptor(ep))

    function applyInterceptor(inner: EntryPoint): EntryPoint {
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
}
