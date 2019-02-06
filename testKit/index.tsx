import _ from 'lodash'
import React, { Component, ReactElement } from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { AppHost, AppMainView, createAppHost, HostContext } from '../index'

export { AppHost, createAppHost } from '../index'

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
    let root = null
    const { ref } = await new Promise(resolve => {
        root = ReactDOM.render(
            <Provider store={host.getStore()}>
                <HostContext.Provider value={{ host }}>
                    <div ref={ref => resolve({ ref })}>{reactElement}</div>
                </HostContext.Provider>
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
