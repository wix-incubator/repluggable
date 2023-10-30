import { getPerformanceDebug } from './performanceDebugInfo'
import {
    AnySlotKey,
    AppHost,
    EntryPoint,
    EntryPointOrPackage,
    LazyEntryPointFactory,
    PrivateShell,
    SlotKey,
    StatisticsMemoization,
    Trace
} from '../API'
import _ from 'lodash'
import { hot } from '../hot'
import { AppHostServicesProvider } from '../appHostServices'
import { AnyExtensionSlot } from '../extensionSlot'

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

const getPackageDependencyPackages = async (
    allArtifacts: Record<string, EntryPointOrPackage | Function>,
    packageName: string
): Promise<EntryPoint[]> => {
    const allPackages = await Promise.all(_.values(allArtifacts).map(x => (typeof x === 'function' ? x() : x))).then(x =>
        _.flattenDeep(x.map(y => _.values(y)))
    )

    const apiToEntryPoint = new Map<string, EntryPoint | undefined>()
    _.forEach(allPackages, (entryPoint: EntryPoint) => {
        _.forEach(entryPoint.declareAPIs ? entryPoint.declareAPIs() : [], dependency => {
            apiToEntryPoint.set(dependency.name, entryPoint)
        })
    })

    const loadedEntryPoints = new Set<string>()
    const packagesList: EntryPoint[] = []
    const entryPointsQueue: EntryPoint[] = allPackages.filter(x => x.name === packageName)

    while (entryPointsQueue.length) {
        const currEntryPoint = entryPointsQueue.shift()
        if (!currEntryPoint || loadedEntryPoints.has(currEntryPoint.name)) {
            continue
        }
        loadedEntryPoints.add(currEntryPoint.name)
        packagesList.push(currEntryPoint)
        const dependencies = currEntryPoint.getDependencyAPIs ? currEntryPoint.getDependencyAPIs() : []
        const dependencyEntryPoints = dependencies.map((API: AnySlotKey) => apiToEntryPoint.get(API.name))
        entryPointsQueue.push(..._.compact(dependencyEntryPoints))
    }

    return _.uniq(packagesList)
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
        getPackageDependencyPackages,
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
