import React from 'react'
import { connect } from 'react-redux'
import { AppHost, ExtensionItem, ExtensionSlot, ReactComponentContributor } from './api'
import { ErrorBoundary } from './errorBoundary'
import { HostContext } from './hostContext'

export function renderSlotComponents(host: AppHost, slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot.getItems().map((item, index) => (
        <ErrorBoundary key={index} featureName={item.feature.name} componentName={item.name}>
            {item.contribution()}
        </ErrorBoundary>
    )) // index is the key prop
}

export function renderSlotComponentsConnected(host: AppHost, slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot.getItems(true).map((item, index) => (
        <ErrorBoundary key={index.toString()} featureName={item.feature.name} componentName={item.name}>
            <ConnectedPredicateHoc index={0} item={item} host={host} />
        </ErrorBoundary>
    ))
}

interface PredicateHocProps {
    index: number
    render: ReactComponentContributor
    predicateResult: boolean
}

const PredicateHoc: React.FunctionComponent<PredicateHocProps> = props => (
    <HostContext.Consumer>
        {ctx => {
            if (props.predicateResult) {
                return props.render()
            } else {
                return null
            }
        }}
    </HostContext.Consumer>
)

interface connectedPredicateHocProps {
    index: number
    item: ExtensionItem<ReactComponentContributor>
    host: AppHost
}

const mapPredicateHocStateToProps = (state: any, ownProps: connectedPredicateHocProps): PredicateHocProps => ({
    index: ownProps.index,
    render: ownProps.item.contribution,
    predicateResult: ownProps.item.condition()
})

const ConnectedPredicateHoc = connect(mapPredicateHocStateToProps)(PredicateHoc)
