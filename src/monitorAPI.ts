import { AppHostOptions, Shell, Trace, StatisticsMemoization, enrichedMemoizationFunction, ContributeAPIOptions } from './API'
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
    if (options.monitoring.enablePerformance) {
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

function isMemberNamesArray<TAPI>(value: boolean | (keyof TAPI)[] | undefined): value is (keyof TAPI)[] {
    return Array.isArray(value)
}

export function monitorAPI<TAPI>(
    shell: Shell,
    hostOptions: AppHostOptions,
    apiName: string,
    api: TAPI,
    //trace: Trace[],
    //memoized: StatisticsMemoization[]
    apiOptions?: ContributeAPIOptions<TAPI>
): TAPI {
    if (hostOptions.monitoring.disableMonitoring || (apiOptions && apiOptions.disableMonitoring === true)) {
        return api
    }

    const shouldMonitor =
        apiOptions && isMemberNamesArray(apiOptions.disableMonitoring)
            ? (funcName: string) => {
                  const { disableMonitoring } = apiOptions
                  if (isMemberNamesArray(disableMonitoring)) {
                      return !disableMonitoring.find(memberName => {
                          const memberNameString = memberName as string
                          return (
                              funcName.indexOf(memberNameString) === 0 &&
                              (funcName.length === memberNameString.length || funcName.charAt(memberNameString.length) === '.')
                          )
                      })
                  }
              }
            : () => true

    return interceptAnyObject(
        api,
        (funcName, originalFunc) => {
            if (!shouldMonitor(funcName)) {
                console.log('DISABLED MONITORING>', funcName)
                return originalFunc
            }
            //let funcId = `${apiName}::${funcName}`
            let isMemoized = false
            if (isEnrichedMemoizationFunction(originalFunc)) {
                isMemoized = true
                //funcId += '(Memoized)'
                //memoized.push({ name: funcId, func: originalFunc })
            }
            return (...args: any[]) => {
                const tags = {
                    $api: apiName,
                    $apiFunc: funcName,
                    $args: args,
                    $memoized: isMemoized || undefined
                }
                return shell.log.monitor(`${apiName}.${funcName}`, tags, () => {
                    return originalFunc.apply(api, args)
                    //wrapWithMeasure(options, originalFunc, api, args, funcId, trace)
                })
            }
        },
        undefined,
        apiOptions && apiOptions.includesNamespaces ? 4 : 0
    )
}
