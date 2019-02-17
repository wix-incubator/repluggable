import React from 'react'
import { connect } from 'react-redux'
import { AppHost, ExtensionItem, ExtensionSlot, ReactComponentContributor } from './api'
import { ErrorBoundary } from './errorBoundary'
import { FeatureContext } from './featureContext';
import { HostContext } from './hostContext'

export function renderSlotComponents(host: AppHost, slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot
        .getItems()
        .map((item, index) => (
            <ErrorBoundary key={index} feature={item.feature} componentName={item.name}>
                <FeatureContext.Provider value={item.feature}>
                    {item.contribution()} 
                </FeatureContext.Provider>
            </ErrorBoundary>
        )); // index is the key prop
}

export function renderSlotComponentsConnected(host: AppHost, slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot
        .getItems(true)
        .map((item, index) => (
            <ErrorBoundary key={index.toString()} feature={item.feature} componentName={item.name}>
                <FeatureContext.Provider value={item.feature}>
                    <ConnectedPredicateHoc 
                        index={0} 
                        item={item} 
                        host={host} />            
                </FeatureContext.Provider>
            </ErrorBoundary>
        )); 
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

interface ConnectedPredicateHocProps {
    index: number
    item: ExtensionItem<ReactComponentContributor>
    host: AppHost
}

const mapPredicateHocStateToProps = (state: any, ownProps: ConnectedPredicateHocProps): PredicateHocProps => ({
    index: ownProps.index,
    render: ownProps.item.contribution,
    predicateResult: ownProps.item.condition()
})

const ConnectedPredicateHoc = connect(mapPredicateHocStateToProps)(PredicateHoc)
