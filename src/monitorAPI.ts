import { AppHostOptions, Shell } from './API'
import { interceptAnyObject } from './interceptAnyObject'

function mark(name: string) {
    performance && performance.mark(name)
}

function markAndMeasure(name: string, markStart: string, markEnd: string) {
    mark(markEnd)
    performance && performance.measure(name, markStart, markEnd)
}

function wrapWithMeasure<TAPI>(options: AppHostOptions, func: Function, api: TAPI, args: any[], measureName: string): TAPI {
    if (options.monitoring && options.monitoring.enablePerformance) {
        const startMarkName = `${measureName} - start`
        const endMarkName = `${measureName} - end`
        mark(startMarkName)
        const res = func.apply(api, args)
        if (res && res.then) {
            return res.then((apiResult: any) => {
                markAndMeasure(measureName, startMarkName, endMarkName)
                return apiResult
            })
        }
        markAndMeasure(measureName, startMarkName, endMarkName)
        return res
    }
    return func.apply(api, args)
}

export function monitorAPI<TAPI>(shell: Shell, options: AppHostOptions, apiName: string, api: TAPI): TAPI {
    if (options.monitoring && options.monitoring.disableMonitoring) {
        return api
    }
    return interceptAnyObject(api, (funcName, originalFunc) => {
        // @ts-ignore
        const funcId = `${apiName}::${funcName}${originalFunc.hasOwnProperty('cache') ? '(Memoized)' : ''}`
        return (...args: any[]) => {
            return shell.log.monitor(funcId, { $api: apiName, $apiFunc: funcName, $args: args }, () =>
                wrapWithMeasure(options, originalFunc, api, args, funcId)
            )
        }
    })
}
