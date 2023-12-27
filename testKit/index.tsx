import { create, act, ReactTestRenderer, ReactTestInstance, TestRendererOptions } from 'react-test-renderer'
import _ from 'lodash'
import React, { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { EntryPoint, ObservableState, PrivateShell, ShellBoundaryAspect } from '../src/API'
import { AnySlotKey, AppHost, AppMainView, createAppHost as _createAppHost, EntryPointOrPackage, Shell, SlotKey } from '../src/index'
import { ShellRenderer } from '../src/renderSlotComponents'
import { createShellLogger } from '../src/loggers'
import { emptyLoggerOptions } from './emptyLoggerOptions'

export { emptyLoggerOptions }
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
        const dependencyEntryPoints = dependencies.map((API: AnySlotKey) => apiToEntryPoint.get(API.name))
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

export async function createAppHostAndWaitForLoading(packages: EntryPointOrPackage[], pacts: PactAPIBase[]): Promise<AppHost> {
    const appHost = createAppHostWithPacts(packages, pacts)
    const declaredAPIs = _(packages)
        .flatten()
        .value()
        .flatMap((entryPoint: EntryPoint) => (entryPoint.declareAPIs ? entryPoint.declareAPIs() : []))

    const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            const readyAPIs = Array.from(window.repluggableAppDebug.readyAPIs)
            const unreadyAPIs = declaredAPIs.filter(api => !readyAPIs.some(readyAPI => readyAPI.name === api.name))
            reject(
                new Error(
                    'createAppHostAndWaitForLoading - waiting for loading timed out - the following declaredAPIs were not contributed ' +
                        JSON.stringify(unreadyAPIs)
                )
            )
        }, 3000)
    })

    const loadingPromise = new Promise<void>(async resolve => {
        await appHost.addShells([
            {
                name: 'Depends on all declared APIs',
                getDependencyAPIs() {
                    return declaredAPIs
                },
                extend() {
                    resolve()
                }
            }
        ])
    })

    return Promise.race([timeoutPromise, loadingPromise]).then(() => appHost)
}

export const renderHost = (host: AppHost): ReactTestRenderer => {
    let renderer: ReactTestRenderer | undefined
    act(() => {
        renderer = create(<AppMainView host={host} />)
    })

    return renderer as unknown as ReactTestRenderer
}

export interface WrappedComponent {
    testKit: ReturnType<typeof create>
    host: AppHost
    parentWrapper: ReactTestInstance | undefined
}

export const renderDOMInHost = (reactElement: ReactElement<any>, host: AppHost = createAppHost([]), customShell?: Shell) => {
    const shell = customShell || createShell(host)

    const Component = (
        <ShellRenderer host={host} shell={shell as PrivateShell} component={<div data-shell-in-host="true">{reactElement}</div>} key="" />
    )

    const container = document.body.querySelector('div')
    const root = container && createRoot(container)
    root?.render(Component)
}

export const renderInHost = (
    reactElement: ReactElement<any>,
    host: AppHost = createAppHost([]),
    customShell?: Shell,
    options?: TestRendererOptions
): WrappedComponent => {
    const shell = customShell || createShell(host)

    const Component = (
        <ShellRenderer host={host} shell={shell as PrivateShell} component={<div data-shell-in-host="true">{reactElement}</div>} key="" />
    )
    let root: ReactTestRenderer | undefined
    act(() => {
        root = create(Component, options)
    })

    const parentWrapper = root?.root.find(x => x.props['data-shell-in-host'])

    return {
        testKit: root as unknown as ReactTestRenderer,
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
            attach(_shell: Shell) {
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
        const missing = dependencies.filter((key: AnySlotKey) => !canGetAPI(key))
        throw new Error(
            `addMockShell: overridden entry point is not ready (missing dependency APIs?) host could not find: ${missing.map(
                (v: AnySlotKey) => `"${v.name}"`
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
        flushMemoizedForState: _.noop,
        memoizeForState: _.identity,
        memoize: _.identity,
        clearCache: _.noop,
        getHostOptions: () => host.options,
        log: createShellLogger(host, entryPoint),
        wrapWithShellRenderer: (component: JSX.Element) => component,
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

export function collectAllTexts(instance: ReactTestInstance | undefined) {
    return (instance
        ?.findAll(x => x.children?.some(child => typeof child === 'string'))
        .flatMap(x => x.children.filter(child => typeof child === 'string')) || []) as string[]
}
