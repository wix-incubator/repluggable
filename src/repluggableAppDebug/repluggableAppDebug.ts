import { getPerformanceDebug } from './performanceDebugInfo'
import { AnySlotKey, AppHost, EntryPoint, LazyEntryPointFactory, PrivateShell, SlotKey, StatisticsMemoization, Trace } from '../API'
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

function mapApiToEntryPoint(allPackages: EntryPoint[]) {
    const apiToEntryPoint = new Map<string, EntryPoint | undefined>()
    _.forEach(allPackages, (entryPoint: EntryPoint) => {
        _.forEach(entryPoint.declareAPIs ? entryPoint.declareAPIs() : [], dependency => {
            apiToEntryPoint.set(dependency.name, entryPoint)
        })
    })
    return apiToEntryPoint
}

/**
 * a function that returns all the entry points in the system with their declared APIs and dependencies
 */
const getAllEntryPoints3 = () => {
    return [
        ...window.repluggableAppDebug.utils.unReadyEntryPoints(),
        ...[...window.repluggableAppDebug.addedShells].map(([_, shell]) => shell.entryPoint)
    ]
}

/**
 * this function is used to get the root unready API in case there are too many to understand.
 * for example if you have 200 unready entry points, running this function will give you the first unready API that
 * will unblock the rest of the entry point (note that there might be more than one)
 *
 * this function basically takes the first unready entry point, get its dependencies and iterates over them to find an API that is not ready
 * at this point it follows the same process recursively until it reaced the target API.
 */
const getRootUnreadyAPI = (host: AppHost) => {
    return () => {
        // get all unready entry points
        const allEntryPoints = getAllEntryPoints3()
        const unReadyAPIsArray = []
        // get the depdenencies of the first unready entry point
        let dependenciesOfUnreadyEntryPoint = allEntryPoints?.[0]?.getDependencyAPIs?.()

        while (dependenciesOfUnreadyEntryPoint?.length) {
            const currentAPI = dependenciesOfUnreadyEntryPoint.pop()

            if (!currentAPI) {
                continue
            }
            // try to get the API from this host, we are looking for an API that is not ready
            try {
                const api = host.getAPI(currentAPI as SlotKey<any>)
                if (api) {
                    continue
                }
            } catch (e) {
                // console.log('API not ready', currentAPI)
                unReadyAPIsArray.push(currentAPI)
                // we found an API that is unready, lets find which entry point declares it
                const declarer = allEntryPoints.find(entryPointData =>
                    entryPointData.declareAPIs?.().some(api => currentAPI?.name === api.name)
                )
                // console.log('API declarer', declarer)
                dependenciesOfUnreadyEntryPoint = declarer?.getDependencyAPIs?.()
            }
        }
        return unReadyAPIsArray.reverse()
    }
}

const getAPIOrEntryPointsDependencies = (
    apisOrEntryPointsNames: string[],
    entryPoints: EntryPoint[]
): { entryPoints: EntryPoint[]; apis: AnySlotKey[] } => {
    const apiToEntryPoint = mapApiToEntryPoint(entryPoints)

    const loadedEntryPoints = new Set<string>()
    const packagesList: EntryPoint[] = []
    const allDependencies = new Set<AnySlotKey>()
    const apisOrEntryPointsSet = new Set(apisOrEntryPointsNames)
    const entryPointsQueue: EntryPoint[] = entryPoints.filter(x => apisOrEntryPointsSet.has(x.name))

    apisOrEntryPointsNames.forEach(x => {
        const ep = apiToEntryPoint.get(x)
        ep && entryPointsQueue.push(ep)
    })

    while (entryPointsQueue.length) {
        const currEntryPoint = entryPointsQueue.shift()
        if (!currEntryPoint || loadedEntryPoints.has(currEntryPoint.name)) {
            continue
        }
        loadedEntryPoints.add(currEntryPoint.name)
        packagesList.push(currEntryPoint)
        const dependencies = currEntryPoint.getDependencyAPIs ? currEntryPoint.getDependencyAPIs() : []
        dependencies.forEach(x => allDependencies.add(x))
        const dependencyEntryPoints = dependencies.map((API: AnySlotKey) => apiToEntryPoint.get(API.name))
        entryPointsQueue.push(..._.compact(dependencyEntryPoints))
    }

    return {
        entryPoints: packagesList,
        apis: [...allDependencies]
    }
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
        getRootUnreadyAPI: getRootUnreadyAPI(host),
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
        getAPIOrEntryPointsDependencies: (
            apisOrEntryPointsNames: string[],
            entryPoints = [...addedShells.values()].map(x => x.entryPoint)
        ) => getAPIOrEntryPointsDependencies(apisOrEntryPointsNames, entryPoints),
        performance: getPerformanceDebug(options, trace, memoizedArr)
    }

    if (typeof window === 'undefined') {
        return
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
