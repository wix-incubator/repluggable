import { mount, ReactWrapper } from 'enzyme'
import _ from 'lodash'
import React, { Component, ReactElement } from 'react'
import { Provider } from 'react-redux'
import { AnyPackage, AnySlotKey, AppHost, AppMainView, createAppHost, Shell, SlotKey } from '../index'
import { EntryPoint, PrivateShell } from '../src/api'
import { renderFeatureComponent } from '../src/renderSlotComponents'

export { AppHost, createAppHost } from '../index'
export * from './mockFeature'

interface PactApiBase {
    getApiKey(): AnySlotKey
}

export interface PactApi<T> extends PactApiBase {
    getApiKey(): SlotKey<T>
}

function forEachDeclaredApi(allFeatures: AnyPackage[], iteration: (dependency: AnySlotKey, feature: EntryPoint) => void) {
    _.forEach(_.flatten(allFeatures), (feature: EntryPoint) => {
        _.forEach(feature.declareApis ? feature.declareApis() : [], dependency => {
            iteration(dependency, feature)
        })
    })
}

export const getFeaturesDependencies = (allFeatures: AnyPackage[], requiredFeatures: AnyPackage[]): AnyPackage[] => {
    const tree = new Map<AnySlotKey, EntryPoint | undefined>()

    forEachDeclaredApi(allFeatures, (dependency, feature) => {
        tree.set(dependency, feature)
    })

    const featuresList: AnyPackage[] = []
    const featuresQueue: EntryPoint[] = _.flatten(requiredFeatures)

    while (featuresQueue.length) {
        const currFeature = featuresQueue.shift() as EntryPoint
        featuresList.push(currFeature)
        const dependencies = currFeature.getDependencyApis ? currFeature.getDependencyApis() : []
        const dependecyFeatures = dependencies.map(api => tree.get(api))
        featuresQueue.push(..._.compact(dependecyFeatures))
    }

    return _.uniq(featuresList)
}

export function createAppHostWithPacts(packages: AnyPackage[], pacts: PactApiBase[]) {
    const pactsFeature: EntryPoint = {
        name: 'PACTS_FEATURE',
        declareApis() {
            return pacts.map(pact => pact.getApiKey())
        },
        install(shell: Shell): void {
            _.each(pacts, pact => {
                shell.contributeApi(pact.getApiKey(), () => pact)
            })
        }
    }

    return createAppHost([...packages, pactsFeature])
}

export const renderHost = (host: AppHost): { root: ReactWrapper | null; DOMNode: HTMLElement | null } => {
    const root = mount(
        <Provider store={host.getStore()}>
            <AppMainView host={host} />
        </Provider>
    ) as ReactWrapper
    return { root, DOMNode: root && (root.getDOMNode() as HTMLElement) }
}

export const renderInHost = (
    reactElement: ReactElement<any>,
    host: AppHost = createAppHost([])
): {
    root: ReactWrapper | null
    parentWrapper: ReactWrapper | null
    DOMNode: HTMLElement | null
    host: AppHost
} => {
    const shell = createShell(host)

    const root = mount(
        <Provider store={host.getStore()}>
            {renderFeatureComponent(shell, <div data-feature-in-host="true">{reactElement}</div>, '')}
        </Provider>
    )

    const parentWrapper = root.find('[data-feature-in-host="true"]')

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

function createShell(host: AppHost): PrivateShell {
    const lifecycle: EntryPoint = {
        name: 'test'
    }

    return {
        name: lifecycle.name,
        entryPoint: lifecycle,
        ...host,
        declareSlot() {
            const slot: any = {}
            return slot
        },
        setLifecycleState: _.noop,
        setDependencyApis: _.noop,
        canUseApis(): boolean {
            return true
        },
        canUseStore(): boolean {
            return true
        },
        contributeApi<TApi>(): TApi {
            const api: any = {}
            return api
        },
        contributeState: _.noop,
        contributeMainView: _.noop
    }
}
