import { mount, ReactWrapper } from 'enzyme'
import _ from 'lodash'
import React, { Component, ReactElement } from 'react'
import { Provider } from 'react-redux'
import { AnyFeature, AnySlotKey, AppHost, AppMainView, createAppHost, FeatureHost, SlotKey } from '../index'
import { FeatureLifecycle, PrivateFeatureHost } from '../src/api'
import { renderFeatureComponent } from '../src/renderSlotComponents'

export { AppHost, createAppHost } from '../index'
export * from './mockFeature'

interface PactApiBase {
    getApiKey(): AnySlotKey
}

export interface PactApi<T> extends PactApiBase {
    getApiKey(): SlotKey<T>
}

function forEachDeclaredApi(allFeatures: AnyFeature[], iteration: (dependency: AnySlotKey, feature: FeatureLifecycle) => void) {
    _.forEach(_.flatten(allFeatures), (feature: FeatureLifecycle) => {
        _.forEach(feature.declareApis ? feature.declareApis() : [], dependency => {
            iteration(dependency, feature)
        })
    })
}

export const getFeaturesDependencies = (allFeatures: AnyFeature[], requiredFeatures: AnyFeature[]): AnyFeature[] => {
    const tree = new Map<AnySlotKey, FeatureLifecycle | undefined>()

    forEachDeclaredApi(allFeatures, (dependency, feature) => {
        tree.set(dependency, feature)
    })

    const featuresList: AnyFeature[] = []
    const featuresQueue: FeatureLifecycle[] = _.flatten(requiredFeatures)

    while (featuresQueue.length) {
        const currFeature = featuresQueue.shift() as FeatureLifecycle
        featuresList.push(currFeature)
        const dependencies = currFeature.getDependencyApis ? currFeature.getDependencyApis() : []
        const dependecyFeatures = dependencies.map(api => tree.get(api))
        featuresQueue.push(..._.compact(dependecyFeatures))
    }

    return _.uniq(featuresList)
}

export function createAppHostWithPacts(features: AnyFeature[], pacts: PactApiBase[]) {
    const pactsFeature: FeatureLifecycle = {
        name: 'PACTS_FEATURE',
        declareApis() {
            return pacts.map(pact => pact.getApiKey())
        },
        install(host: FeatureHost): void {
            _.each(pacts, pact => {
                host.contributeApi(pact.getApiKey(), () => pact)
            })
        }
    }

    return createAppHost([...features, pactsFeature])
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
    const feature = createFeatureHost(host)

    const root = mount(
        <Provider store={host.getStore()}>
            {renderFeatureComponent(feature, <div data-feature-in-host="true">{reactElement}</div>, '')}
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

function createFeatureHost(host: AppHost): PrivateFeatureHost {
    const lifecycle: FeatureLifecycle = {
        name: 'test'
    }

    return {
        name: lifecycle.name,
        lifecycle,
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
