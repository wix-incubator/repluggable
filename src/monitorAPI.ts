import { AppHostOptions, Shell, enrichedMemoizationFunction, ContributeAPIOptions } from './API'
import { AnyObject, interceptAnyObject } from './interceptAnyObject'

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
        api as any,
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
