import _ from 'lodash'
import React, { ReactNode } from 'react'
import { connect } from 'react-redux'
import { AppHost, ExtensionItem, ExtensionSlot, PrivateShell, ReactComponentContributor, Shell } from './API'
import { ErrorBoundary } from './errorBoundary'
import { ShellContext } from './shellContext'

export function renderShellComponent(shell: Shell, component: React.ReactNode, key: any, name?: string): React.ReactNode {
    return (
        <ErrorBoundary key={key} shell={shell} componentName={name}>
            <ShellContext.Provider value={shell}>{component}</ShellContext.Provider>
        </ErrorBoundary>
    )
}

export function renderSlotComponents(slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot.getItems().map((item, index) =>
        renderShellComponent(
            item.shell,
            item.contribution(),
            index, // index is the key prop
            item.name
        )
    )
}

interface SlotRendererPureProps<T> {
    items: ExtensionItem<T>[]
    mapFunc: (item: T) => ReactComponentContributor
    filterFunc?: (item: T) => boolean
}
const SlotRendererPure: React.FunctionComponent<SlotRendererPureProps<any>> = ({ items, mapFunc, filterFunc }) => (
    <>
        {items.filter(item => (!filterFunc || filterFunc(item.contribution))).map((item, index) => {
          return (
                 renderShellComponent(
                  item.shell,
                  <ConnectedPredicateHoc index={index} item={item} mapFunc={mapFunc}>
                    {/*{children}*/}
                  </ConnectedPredicateHoc>,
                  index, // index is the key prop
                  item.name
                )
            )
        })}
    </>
)

interface SlotRendererConnectedProps<T> {
    slot: ExtensionSlot<T>
    mapFunc: (item: T) => ReactComponentContributor
    filterFunc?: (item: T) => boolean
}
export const SlotRenderer = connect((state, { slot }: SlotRendererConnectedProps<any>) => ({ items: slot.getItems() }))(SlotRendererPure)

interface PredicateHocProps {
    index: number
    render: ReactComponentContributor
    children?: ReactNode
    predicateResult: boolean
}

const PredicateHoc: React.FunctionComponent<PredicateHocProps> = props => (
    <>{props.predicateResult ? props.children || props.render() : null}</>
)

interface ConnectedPredicateHocProps<T> {
    index: number
    item: ExtensionItem<T>
    children?: ReactNode
    mapFunc: (item: T) => ReactComponentContributor
}

const mapPredicateHocStateToProps = (state: any, ownProps: ConnectedPredicateHocProps<any>): PredicateHocProps => ({
    index: ownProps.index,
    render: ownProps.mapFunc(ownProps.item.contribution),
    children: ownProps.children,
    predicateResult: ownProps.item.condition()
})

const ConnectedPredicateHoc = connect(mapPredicateHocStateToProps)(PredicateHoc)
