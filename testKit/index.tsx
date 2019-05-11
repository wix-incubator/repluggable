import { mount, ReactWrapper } from 'enzyme'
import _ from 'lodash'
import React, { Component, ReactElement } from 'react'
import { Provider } from 'react-redux'
import { EntryPoint, PrivateShell } from '../src/API'
import { AnySlotKey, AppHost, AppMainView, createAppHost, EntryPointOrPackage, Shell, SlotKey } from '../src/index'
import { ShellRenderer } from '../src/renderSlotComponents'

export { AppHost, createAppHost } from '../src/index'
export * from './mockPackage'

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
    const tree = new Map<AnySlotKey, EntryPoint | undefined>()

    forEachDeclaredAPI(allPackages, (dependency, entryPoint) => {
        tree.set(dependency, entryPoint)
    })

    const packagesList: EntryPointOrPackage[] = []
    const entryPointsQueue: EntryPoint[] = _.flatten(requiredPackages)

    while (entryPointsQueue.length) {
        const currEntryPoint = entryPointsQueue.shift() as EntryPoint
        packagesList.push(currEntryPoint)
        const dependencies = currEntryPoint.getDependencyAPIs ? currEntryPoint.getDependencyAPIs() : []
        const dependecyEntryPoints = dependencies.map(API => tree.get(API))
        entryPointsQueue.push(..._.compact(dependecyEntryPoints))
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

    return createAppHost([...packages, pactsEntryPoint])
}

export const renderHost = (host: AppHost): { root: ReactWrapper | null; DOMNode: HTMLElement | null } => {
    const root = mount(
        <Provider store={host.getStore()}>
            <AppMainView host={host} />
        </Provider>
    ) as ReactWrapper
    return { root, DOMNode: root && (root.getDOMNode() as HTMLElement) }
}

export interface WrappedComponent {
    root: ReactWrapper | null
    parentWrapper: ReactWrapper | null
    DOMNode: HTMLElement | null
    host: AppHost
}

export const renderInHost = (reactElement: ReactElement, host: AppHost = createAppHost([]), customShell?: Shell): WrappedComponent => {
    const shell = customShell || createShell(host)

    const root = mount(
        <Provider store={host.getStore()}>
            <ShellRenderer shell={shell as PrivateShell} component={<div data-shell-in-host="true">{reactElement}</div>} key="" />
        </Provider>
    )

    const parentWrapper = root.find('[data-shell-in-host="true"]')

    return {
        root,
        DOMNode: parentWrapper
            .children()
            .first()
            .getDOMNode() as HTMLElement,
        parentWrapper,
        host
    }
}

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
interface EntryPointOverrides extends Omit<EntryPoint, 'name'> {
    name?: EntryPoint['name']
}

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
    return (shell as unknown) as Shell
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
        setLifecycleState: _.noop,
        setDependencyAPIs: _.noop,
        canUseAPIs(): boolean {
            return true
        },
        canUseStore(): boolean {
            return true
        },
        contributeAPI<TAPI>(): TAPI {
            const API: any = {}
            return API
        },
        contributeState: _.noop,
        contributeMainView: _.noop
    }
}
