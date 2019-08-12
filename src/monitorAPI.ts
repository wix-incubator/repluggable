import { AppHostOptions, Shell, Trace, StatisticsMemoization, enrichedMemoizationFunction } from './API'
import { interceptAnyObject } from './interceptAnyObject'
import _ from 'lodash'

function mark(name: string) {
    performance && performance.mark(name)
}

function markAndMeasure(trace: Trace[], args: any, res: any, name: string, markStart: string, markEnd: string) {
    if (performance) {
        mark(markEnd)
        performance.measure(name, markStart, markEnd)
        const measure = performance.getEntriesByName(name)
        trace.push({ args, res, ..._.pick(measure[0], ['name', 'duration', 'startTime']) })
        performance.clearMarks(markStart)
        performance.clearMarks(markEnd)
        performance.clearMeasures(name)
    }
}

function wrapWithMeasure<TAPI>(options: AppHostOptions, func: Function, api: TAPI, args: any[], measureName: string, trace: Trace[]): TAPI {
    if (options.monitoring && options.monitoring.enablePerformance) {
        const startMarkName = `${measureName} - start`
        const endMarkName = `${measureName} - end`
        mark(startMarkName)
        const res = func.apply(api, args)
        if (res && res.then) {
            return res.then((apiResult: any) => {
                markAndMeasure(trace, args, res, measureName, startMarkName, endMarkName)
                return apiResult
            })
        }
        markAndMeasure(trace, args, res, measureName, startMarkName, endMarkName)
        return res
    }
    return func.apply(api, args)
}

function isEnrichedMemoizationFunction(func: any): func is enrichedMemoizationFunction {
    return func.hasOwnProperty('cache') && func.hasOwnProperty('hit')
}

export function monitorAPI<TAPI>(
    shell: Shell,
    options: AppHostOptions,
    apiName: string,
    api: TAPI,
    trace: Trace[],
    memoized: StatisticsMemoization[]
): TAPI {
    if (options.monitoring && options.monitoring.disableMonitoring) {
        return api
    }
    return interceptAnyObject(api, (funcName, originalFunc) => {
        // @ts-ignore
        let funcId = `${apiName}::${funcName}`
        if (isEnrichedMemoizationFunction(originalFunc)) {
            funcId += '(Memoized)'
            memoized.push({ name: funcId, func: originalFunc })
        }
        return (...args: any[]) => {
            return shell.log.monitor(funcId, { $api: apiName, $apiFunc: funcName, $args: args }, () =>
                wrapWithMeasure(options, originalFunc, api, args, funcId, trace)
            )
        }
    })
}
