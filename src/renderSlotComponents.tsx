import _ from 'lodash'
import React, { ReactNode } from 'react'
import { connect } from 'react-redux'
import { ExtensionItem, ExtensionSlot, PrivateShell, ReactComponentContributor, Shell } from './API'
import { ErrorBoundary } from './errorBoundary'
import { ShellContext } from './shellContext'

interface ShellRendererProps {
    shell: Shell
    component: React.ReactNode
    name?: string
}

function renderWithAspects(shell: PrivateShell, component: ReactNode, aspectIndex: number): ReactNode {
    const aspects = shell.getBoundaryAspects()

    if (aspects && aspects.length > aspectIndex) {
        const Aspect = aspects[aspectIndex]
        return <Aspect>{renderWithAspects(shell, component, aspectIndex + 1)}</Aspect>
    }

    return component
}

export const ShellRenderer: React.FunctionComponent<ShellRendererProps> = ({ shell, component, name }) => (
    <ErrorBoundary shell={shell} componentName={name}>
        <ShellContext.Provider value={shell}>{renderWithAspects(shell as PrivateShell, component, 0)}</ShellContext.Provider>
    </ErrorBoundary>
)

interface SlotRendererPureProps<T> {
    items: ExtensionItem<T>[]
    mapFunc(item: T): ReactComponentContributor
    filterFunc?(item: T): boolean
}

type SlotRendererPure<T = any> = React.FunctionComponent<SlotRendererPureProps<T>>
const SlotRendererPure: SlotRendererPure = ({ items, mapFunc, filterFunc }) => (
    <>
        {items
            .filter(item => !filterFunc || filterFunc(item.contribution))
            .map((item, index) => {
                return (
                    <ShellRenderer
                        shell={item.shell}
                        component={<ConnectedPredicateHoc index={index} item={item} mapFunc={mapFunc} />}
                        key={index}
                        name={item.name}
                    />
                )
            })}
    </>
)

interface SlotRendererConnectedProps<T> {
    slot: ExtensionSlot<T>
    mapFunc(item: T): ReactComponentContributor
    filterFunc?(item: T): boolean
}

export function SlotRenderer<T>(props: SlotRendererConnectedProps<T>): React.ReactElement<SlotRendererConnectedProps<T>> {
    const ConnectedSlot = connect((state, { slot }: SlotRendererConnectedProps<T>) => ({
        items: slot.getItems()
    }))(SlotRendererPure)
    return <ConnectedSlot {...props} />
}

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
    mapFunc(item: T): ReactComponentContributor
}

const mapPredicateHocStateToProps = (state: any, ownProps: ConnectedPredicateHocProps<any>): PredicateHocProps => ({
    index: ownProps.index,
    render: ownProps.mapFunc(ownProps.item.contribution),
    children: ownProps.children,
    predicateResult: ownProps.item.condition()
})

const ConnectedPredicateHoc = connect(mapPredicateHocStateToProps)(PredicateHoc)
