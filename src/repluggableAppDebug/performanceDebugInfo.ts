import _ from 'lodash'
import { AppHostOptions, Trace, StatisticsMemoization } from '../API'

export function getPerformanceDebug(options: AppHostOptions, trace: Trace[], memoized: StatisticsMemoization[]) {
    const getMemoizedTable = () => {
        return _.map(memoized, memoize => {
            const { calls, hit, miss } = memoize.func
            const hitRate = `${((hit / calls) * 100).toFixed(2)}%`
            const { name } = memoize
            return { name, hitRate, calls, hit, miss }
        })
    }

    const getGroups = (apiName: string) => {
        const api = _.groupBy(trace, 'name')[apiName]
        try {
            const groupedArgs = _.groupBy(api, a => JSON.stringify(a.args))
            const groupedRes = _.groupBy(api, a => JSON.stringify(a.res))
            const groupedArgsAndRes = _.groupBy(api, a => JSON.stringify(a.args) + JSON.stringify(a.res))
            return { groupedArgs, groupedRes, groupedArgsAndRes }
        } catch (err) {
            return { groupedArgs: [], groupedRes: [], groupedArgsAndRes: [] }
        }
    }
    const printMemoizeTable = () => {
        console.table(getMemoizedTable())
    }
    return {
        getSortedMeasurments: () => {
            return _(trace)
                .map(measurement => _.pick(measurement, ['name', 'duration']))
                .sortBy('duration')
                .reverse()
                .value()
        },
        start: () => {
            if (!options.monitoring.disableMonitoring) {
                options.monitoring.enablePerformance = true
            } else {
                console.log('Remove "disableMonitoring" in order to use trace')
            }
        },
        stop: () => {
            options.monitoring.enablePerformance = false
        },
        clean: () => {
            trace.length = 0
        },
        getTrace: () => {
            return trace
        },
        getGroupedTrace: () => {
            return _.groupBy(trace, 'name')
        },
        getGroupedSumTrace: () => {
            const traceData = _(trace)
                .groupBy('name')
                .mapValues((arr, name) => {
                    const totalDuration = Number(_.sumBy(arr, 'duration').toFixed(2))
                    const times = arr.length
                    const avgDuration = Number((totalDuration / times).toFixed(2))
                    const groups = _(getGroups(name))
                        .mapValues((obj, group) => {
                            const keys = Object.keys(obj)
                            length = keys.length
                            if (group !== 'groupedRes' || length === 0) {
                                return length
                            }
                            const joined = keys.join(' ')
                            return joined.length < 15 ? `${length}: ${joined}` : length
                        })
                        .value()

                    return { name, times, totalDuration, avgDuration, ...groups }
                })
                .orderBy(x => x.totalDuration, 'desc')
                .value()

            _.forEach(getMemoizedTable(), memoizeData => {
                _.assign(_.find(traceData, { name: memoizeData.name }), memoizeData)
            })
            console.table(traceData)
        },
        analyseAPI: (apiName: string) => {
            const groups = getGroups(apiName)
            if (groups) {
                const { groupedArgs, groupedRes, groupedArgsAndRes } = groups
                console.log(`groupedArgs: ${Object.keys(groupedArgs).length}`, groupedArgs)
                console.log(`groupedRes: ${Object.keys(groupedRes).length}`, groupedRes)
                console.log(`groupedArgsAndRes: ${Object.keys(groupedArgsAndRes).length}`, groupedArgsAndRes)
            }
        },
        getMemoized: () => memoized,
        printMemoizeTable
    }
}
