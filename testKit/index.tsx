import { mount, ReactWrapper } from 'enzyme'
import _ from 'lodash'
import React, { ReactElement } from 'react'
import { EntryPoint, ObservableState, PrivateShell, ShellBoundaryAspect } from '../src/API'
import { AnySlotKey, AppHost, AppMainView, createAppHost as _createAppHost, EntryPointOrPackage, Shell, SlotKey } from '../src/index'
import { ShellRenderer } from '../src/renderSlotComponents'
import { createShellLogger } from '../src/loggers'
import { emptyLoggerOptions } from './emptyLoggerOptions'

export { AppHost } from '../src/index'
export { connectWithShell, connectWithShellAndObserve } from '../src/connectWithShell'
export { SlotRenderer } from '../src/renderSlotComponents'
export { withConsoleErrors } from './withConsoleErrors'
export { withThrowOnError } from './withThrowOnError'
export * from './mockPackage'

export const createAppHost: typeof _createAppHost = (packages, options = emptyLoggerOptions) => {
    return _createAppHost(packages, options)
}

interface PactAPIBase {
    getAPIKey(): AnySlotKey
}

export interface PactAPI<T> extends PactAPIBase {
    getAPIKey(): SlotKey<T>
}

function forEachDeclaredAPI(allPackages: EntryPointOrPackage[], iteration: (dependency: AnySlotKey, entryPoint: EntryPoint) => void) {
    _.forEach(_.flatten(allPackages), (entryPoint: EntryPoint) => {
        _.forEach(entryPoint.declareAPIs ? entryPoint.declareAPIs() : [], dependency => {
            iteration(dependency, entryPoint)
        })
    })
}

export const getPackagesDependencies = (
    allPackages: EntryPointOrPackage[],
    requiredPackages: EntryPointOrPackage[]
): EntryPointOrPackage[] => {
    const apiToEntryPoint = new Map<string, EntryPoint | undefined>()
    const loadedEntryPoints = new Set<string>()

    forEachDeclaredAPI(allPackages, (dependency, entryPoint) => {
        apiToEntryPoint.set(dependency.name, entryPoint)
    })

    const packagesList: EntryPointOrPackage[] = []
    const entryPointsQueue: EntryPoint[] = _.flatten(requiredPackages)

    while (entryPointsQueue.length) {
        const currEntryPoint = entryPointsQueue.shift()
        if (!currEntryPoint || loadedEntryPoints.has(currEntryPoint.name)) {
            continue
        }
        loadedEntryPoints.add(currEntryPoint.name)
        packagesList.push(currEntryPoint)
        const dependencies = currEntryPoint.getDependencyAPIs ? currEntryPoint.getDependencyAPIs() : []
        const dependencyEntryPoints = dependencies.map(API => apiToEntryPoint.get(API.name))
        entryPointsQueue.push(..._.compact(dependencyEntryPoints))
    }

    return _.uniq(packagesList)
}

export function createAppHostWithPacts(packages: EntryPointOrPackage[], pacts: PactAPIBase[]) {
    const pactsEntryPoint: EntryPoint = {
        name: 'PACTS_ENTRY_POINT',
        declareAPIs() {
            return pacts.map(pact => pact.getAPIKey())
        },
        attach(shell: Shell): void {
            _.each(pacts, pact => {
                shell.contributeAPI(pact.getAPIKey(), () => pact)
            })
        }
    }

    return createAppHost([...packages, pactsEntryPoint], { ...emptyLoggerOptions, disableLayersValidation: true })
}

export type RenderHostType = (host: AppHost) => { root: ReactWrapper | null; DOMNode: HTMLElement | null }
export const renderHost: RenderHostType = (host: AppHost) => {
    const root = mount(<AppMainView host={host} />) as ReactWrapper
    return { root, DOMNode: root && (root.getDOMNode() as HTMLElement) }
}

export interface WrappedComponent {
    root: ReactWrapper | null
    parentWrapper: ReactWrapper | null
    DOMNode: HTMLElement | null
    host: AppHost
}

export const renderInHost = (reactElement: ReactElement<any>, host: AppHost = createAppHost([]), customShell?: Shell): WrappedComponent => {
    const shell = customShell || createShell(host)

    const root = mount(
        <ShellRenderer host={host} shell={shell as PrivateShell} component={<div data-shell-in-host="true">{reactElement}</div>} key="" />
    )

    const parentWrapper = root.find('[data-shell-in-host="true"]')

    return {
        root,
        DOMNode: parentWrapper.children().first().getDOMNode() as HTMLElement,
        parentWrapper,
        host
    }
}

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
interface EntryPointOverrides extends Omit<EntryPoint, 'name'> {
    name?: EntryPoint['name']
}

// this function assumes that addShells completes synchronously
export const addMockShell = (host: AppHost, entryPointOverrides: EntryPointOverrides = {}): Shell => {
    let shell = null
    host.addShells([
        {
            name: _.uniqueId('__MOCK_SHELL_'),
            ...entryPointOverrides,
            attach(_shell) {
                shell = _shell
                if (entryPointOverrides.attach) {
                    entryPointOverrides.attach(_shell)
                }
            }
        }
    ])
    if (!shell) {
        const dependencies = entryPointOverrides.getDependencyAPIs ? entryPointOverrides.getDependencyAPIs() : []
        const canGetAPI = (key: AnySlotKey) => {
            try {
                host.getAPI(key)
                return true
            } catch (e) {
                return false
            }
        }
        const missing = dependencies.filter(key => !canGetAPI(key))
        throw new Error(
            `addMockShell: overridden entry point is not ready (missing dependency APIs?) host could not find: ${missing.map(
                v => `"${v.name}"`
            )}`
        )
    }
    return shell
}

function createShell(host: AppHost): PrivateShell {
    const entryPoint: EntryPoint = {
        name: 'test'
    }

    return {
        name: entryPoint.name,
        entryPoint,
        ...host,
        declareSlot() {
            const slot: any = {}
            return slot
        },
        declareCustomSlot() {
            const slot: any = {}
            return slot
        },
        setLifecycleState: _.noop,
        setDependencyAPIs: _.noop,
        canUseAPIs(): boolean {
            return true
        },
        canUseStore(): boolean {
            return true
        },
        wasInitializationCompleted(): boolean {
            return true
        },
        runLateInitializer<T>(initializer: () => T) {
            return initializer()
        },
        contributeAPI<TAPI>(): TAPI {
            const API: any = {}
            return API
        },
        contributeBoundaryAspect(aspect: ShellBoundaryAspect): void {},
        getBoundaryAspects(): ShellBoundaryAspect[] {
            return []
        },
        contributeState: _.noop,
        contributeObservableState: <TState, TSelectors, TAction>() => mockObservable<TSelectors>(undefined as any),
        contributeMainView: _.noop,
        contributeSubLayersDimension: _.noop,
        flushMemoizedForState: _.noop,
        memoizeForState: _.identity,
        memoize: _.identity,
        clearCache: _.noop,
        getHostOptions: () => host.options,
        log: createShellLogger(host, entryPoint)
    }
}

export function mockObservable<T>(value: T): ObservableState<T> {
    return {
        subscribe: () => {
            return () => {}
        },
        current() {
            return value
        }
    }
}
