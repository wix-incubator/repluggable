import { create, act, ReactTestRenderer, ReactTestInstance, TestRendererOptions } from 'react-test-renderer'
import _ from 'lodash'
import React, { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'


import { EntryPoint,  PrivateShell, ShellBoundaryAspect } from '../src/API'
import { AnySlotKey,  AppMainView, createAppHost as _createAppHost, Shell, SlotKey } from '../src/index'
import { ShellRenderer } from '../src/renderSlotComponents'



import { INTERNAL_DONT_USE_SHELL_GET_APP_HOST } from 'repluggable-core'


export { AppHost } from '../src/index'
export { connectWithShell, connectWithShellAndObserve } from '../src/connectWithShell'
export { SlotRenderer } from '../src/renderSlotComponents'

import { createAppHost, mockObservable, AppHost, createShellLogger } from 'repluggable-core/testKit'

export * from 'repluggable-core/testKit'

interface PactAPIBase {
    getAPIKey(): AnySlotKey
}

export interface PactAPI<T> extends PactAPIBase {
    getAPIKey(): SlotKey<T>
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
        lazyEvaluator: func => ({ get: func }),
        [INTERNAL_DONT_USE_SHELL_GET_APP_HOST]: () => {
            return host
        }
    }
}


export function collectAllTexts(instance: ReactTestInstance | undefined) {
    return (instance
        ?.findAll(x => x.children?.some(child => typeof child === 'string'))
        .flatMap(x => x.children.filter(child => typeof child === 'string')) || []) as string[]
}
