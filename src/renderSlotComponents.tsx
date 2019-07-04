import _ from 'lodash'
import React, { ReactNode, FunctionComponent } from 'react'
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

interface SlotRendererIterators<T> {
    mapFunc?(item: T): ReactComponentContributor
    filterFunc?(item: T): boolean
    sortFunc?(itemA: ExtensionItem<T>, itemB: ExtensionItem<T>): number
}

interface SlotRendererPureProps<T> extends SlotRendererIterators<T> {
    items: ExtensionItem<T>[]
}

function createSlotItemToShellRendererMap<T = any>(mapFunc?: SlotRendererIterators<T>['mapFunc']) {
    return (item: ExtensionItem<T>, index: number) => (
        <ShellRenderer
            shell={item.shell}
            component={<ConnectedPredicateHoc index={index} item={item} mapFunc={mapFunc} />}
            key={item.uniqueId}
            name={item.name}
        />
    )
}

type SlotRendererPure<T = any> = React.FunctionComponent<SlotRendererPureProps<T>>
const SlotRendererPure: SlotRendererPure = ({ items, mapFunc, filterFunc, sortFunc }) => (
    <>
        {_.flow(
            _.compact([
                filterFunc && ((slotItems: typeof items) => slotItems.filter(item => filterFunc(item.contribution))),
                sortFunc && ((slotItems: typeof items) => slotItems.sort(sortFunc)),
                (slotItems: typeof items) => slotItems.map(createSlotItemToShellRendererMap(mapFunc))
            ])
        )(items)}
    </>
)

interface SlotRendererConnectedProps<T> extends SlotRendererIterators<T> {
    slot: ExtensionSlot<T>
}

const ConnectedSlot = connect((state, { slot }: SlotRendererConnectedProps<any>) => ({
    items: slot.getItems()
}))(SlotRendererPure)

export function SlotRenderer<T>(props: SlotRendererConnectedProps<T>): React.ReactElement<SlotRendererConnectedProps<T>> {
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
    mapFunc?(item: T): ReactComponentContributor
}

const mapPredicateHocStateToProps = (state: any, ownProps: ConnectedPredicateHocProps<any>): PredicateHocProps => ({
    index: ownProps.index,
    render: ownProps.mapFunc ? ownProps.mapFunc(ownProps.item.contribution) : ownProps.item.contribution,
    children: ownProps.children,
    predicateResult: ownProps.item.condition()
})

const ConnectedPredicateHoc = connect(mapPredicateHocStateToProps)(PredicateHoc)
