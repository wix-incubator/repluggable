import _ from 'lodash'
import { AnySlotKey, AppHost, EntryPoint, LazyEntryPointFactory, PrivateShell, SlotKey, StatisticsMemoization, Trace } from '../API'
import { AppHostServicesProvider } from '../appHostServices'
import { AnyExtensionSlot } from '../extensionSlot'
import { hot } from '../hot'
import { getPerformanceDebug } from './performanceDebugInfo'

interface PerformanceDebugParams {
    options: AppHost['options']
    trace: Trace[]
    memoizedArr: StatisticsMemoization[]
}

interface SetupDebugInfoParams {
    readyAPIs: Set<AnySlotKey>
    host: AppHost & AppHostServicesProvider
    uniqueShellNames: Set<string>
    extensionSlots: Map<AnySlotKey, AnyExtensionSlot>
    addedShells: Map<string, PrivateShell>
    shellInstallers: WeakMap<PrivateShell, string[]>
    lazyShells: Map<string, LazyEntryPointFactory>

    performance: PerformanceDebugParams

    getUnreadyEntryPoints(): EntryPoint[]
    getOwnSlotKey(key: SlotKey<any>): SlotKey<any>
    getAPI: AppHost['getAPI']
}

export function setupDebugInfo({
    host,
    uniqueShellNames,
    readyAPIs,
    getAPI,
    getOwnSlotKey,
    getUnreadyEntryPoints,
    extensionSlots,
    addedShells,
    lazyShells,
    shellInstallers,
    performance: { options, trace, memoizedArr }
}: SetupDebugInfoParams) {
    let apisAccessObject: Record<string, any> | undefined
    let apisAccessObjectSize: number

    const utils = {
        getApis: () => {
            return Array.from(readyAPIs).map((apiKey: AnySlotKey) => {
                return {
                    key: apiKey,
                    impl: () => getAPI(apiKey)
                }
            })
        },
        get apis() {
            // We need to use cache object otherwise chrome devtools doesn't enable autocomplete
            if (apisAccessObject && apisAccessObjectSize !== readyAPIs.size) {
                apisAccessObject = undefined
            }
            if (!apisAccessObject) {
                apisAccessObjectSize = readyAPIs.size
                apisAccessObject = Array.from(readyAPIs).reduce((res, key: SlotKey<unknown>) => {
                    const layer = key.layer
                    const name = _.camelCase(key.name) + (layer ? `_${_.camelCase(layer)}` : '')
                    if (res.hasOwnProperty(name)) {
                        console.log(`Duplicate service name after slugify:`, name)
                    }
                    return Object.defineProperty(res, name, {
                        get: () => getAPI(key),
                        enumerable: true
                    })
                }, {})
            }
            return apisAccessObject
        },
        unReadyEntryPoints: (): EntryPoint[] => getUnreadyEntryPoints(),
        whyEntryPointUnready: (name: string) => {
            const unreadyEntryPoint = _.find(
                utils.unReadyEntryPoints(),
                (entryPoint: EntryPoint) => entryPoint.name.toLowerCase() === name.toLowerCase()
            )

            const dependencies = _.invoke(unreadyEntryPoint, 'getDependencyAPIs')

            const unreadyDependencies = _.filter(dependencies, key => !readyAPIs.has(getOwnSlotKey(key)))
            if (!_.isEmpty(unreadyDependencies)) {
                const unreadyDependenciesNames = _(unreadyDependencies).map('name').join(',')
                console.log(`There are unready dependencies for ${name}: ${unreadyDependenciesNames}`)
            }
        },
        findAPI: (name: string) => {
            return _.filter(utils.getApis(), (api: any) => api.key.name.toLowerCase().indexOf(name.toLowerCase()) !== -1)
        },
        performance: getPerformanceDebug(options, trace, memoizedArr)
    }

    window.repluggableAppDebug = {
        host,
        uniqueShellNames,
        extensionSlots,
        addedShells,
        lazyShells,
        readyAPIs,
        shellInstallers,
        utils,
        hmr: {
            hot
        }
    }
}
