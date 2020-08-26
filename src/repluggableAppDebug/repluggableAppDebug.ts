import _ from 'lodash'
import { AnySlotKey, AppHost, EntryPoint, LazyEntryPointFactory, PrivateShell, SlotKey, StatisticsMemoization, Trace } from '../API'
import { AppHostServicesProvider } from '../appHostServices'
import { AnyExtensionSlot } from '../extensionSlot'
import { hot } from '../hot'
import { getDuplicates } from '../utils/getDuplicates'
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
    getAPI: AppHost['getAPI']

    getReadyAPIsVersion(): number

    getUnreadyEntryPoints(): EntryPoint[]

    getOwnSlotKey(key: SlotKey<any>): SlotKey<any>
}

export function setupDebugInfo({
    host,
    uniqueShellNames,
    getReadyAPIsVersion,
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
    let apisAccessObjectVersion: number | undefined

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
            const version = getReadyAPIsVersion()
            if (!apisAccessObject || apisAccessObjectVersion !== version) {
                apisAccessObjectVersion = version
                apisAccessObject = getApisAccessObject(readyAPIs, getAPI)
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

function getApisAccessObject(readyAPIs: Set<SlotKey<unknown>>, getAPI: AppHost['getAPI']): Record<string, unknown> {
    const slugApis = Array.from(readyAPIs).map((key: SlotKey<unknown>) => ({
        slug: _.camelCase(key.name).replace('Api', 'API'),
        layer: key.layer,
        version: key.version,
        get: () => getAPI(key)
    }))

    const duplicateNames = getDuplicates(slugApis.map(api => api.slug))

    return slugApis.reduce((res, { slug, layer, version, get }) => {
        const suffix = duplicateNames.has(slug) ? _([layer, version]).filter().camelCase() : ''
        const propertyKey = slug + (suffix ? `_${suffix}` : '')

        if (res.hasOwnProperty(propertyKey)) {
            console.log(`Duplicate service name after slugify: ${propertyKey}`)
            return res
        }
        return Object.defineProperty(res, propertyKey, {
            get,
            enumerable: true
        })
    }, {})
}
