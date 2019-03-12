import _ from 'lodash'
import React, { Component, ReactElement } from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { AppHost, AppMainView, createAppHost } from '../index'
import { FeatureLifecycle, PrivateFeatureHost } from '../src/api'
import { renderFeatureComponent } from '../src/renderSlotComponents'

export { AppHost, createAppHost } from '../index'
export * from './mockFeature'

export const renderHost = async (host: AppHost): Promise<{ root: Component | null; DOMNode: HTMLElement | null }> => {
    const div = document.createElement('div')
    let root = null
    await new Promise(resolve => {
        root = ReactDOM.render(
            <Provider store={host.getStore()}>
                <AppMainView host={host} />
            </Provider>,
            div,
            resolve
        ) as Component
    })
    return { root, DOMNode: root && (ReactDOM.findDOMNode(root) as HTMLElement) }
}

export const renderInHost = async (
    reactElement: ReactElement<any>,
    host: AppHost = createAppHost([])
): Promise<{
    root: Component | null
    parentRef: Component | null
    DOMNode: HTMLElement | null
    host: AppHost
}> => {
    const div = document.createElement('div')
    const feature = createFeatureHost(host)
    let root = null
    const { ref } = await new Promise(resolve => {
        root = ReactDOM.render(
            <Provider store={host.getStore()}>
                {renderFeatureComponent(feature, <div ref={ref => resolve({ ref })}>{reactElement}</div>, '')}
            </Provider>,
            div
        )
    })

    const parentNode: HTMLElement = ReactDOM.findDOMNode(ref) as HTMLElement

    return {
        root,
        DOMNode: ref && (_.head(parentNode.children) as HTMLElement),
        parentRef: ref,
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
