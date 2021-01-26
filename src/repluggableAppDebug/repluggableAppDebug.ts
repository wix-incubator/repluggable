import { getPerformanceDebug } from './performanceDebugInfo'
import { AnySlotKey, AppHost, EntryPoint, LazyEntryPointFactory, PrivateShell, SlotKey, StatisticsMemoization, Trace } from '../API'
import _ from 'lodash'
import { hot } from '../hot'
import { AppHostServicesProvider } from '../appHostServices'
import { AnyExtensionSlot } from '../extensionSlot'
import { StoreDebugUtility } from './debug'
import { PrivateThrottledStore } from '../throttledStore'

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
    const utils = {
        apis: () => {
            return Array.from(readyAPIs).map((apiKey: AnySlotKey) => {
                return {
                    key: apiKey,
                    impl: () => getAPI(apiKey)
                }
            })
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
            return _.filter(utils.apis(), (api: any) => api.key.name.toLowerCase().indexOf(name.toLowerCase()) !== -1)
        },
        performance: getPerformanceDebug(options, trace, memoizedArr)
    }

    const actionCountByType = new Map<string, number>()
    const getPrivateStore = () => host.getStore() as PrivateThrottledStore

    const store: StoreDebugUtility = {
        startActionStats() {
            getPrivateStore().setActionMonitor(action => {
                const currentCount = actionCountByType.get(action.type)
                actionCountByType.set(action.type, (currentCount || 0) + 1)
            })
        },
        stopActionStats() {
            getPrivateStore().setActionMonitor(null)
        },
        getActionStats() {
            return (
                [...actionCountByType.entries()]
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count)
            )
        },
        resetActionStats() {
            actionCountByType.clear()
        }
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
        },
        store
    }
}
