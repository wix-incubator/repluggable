import React from 'react'
import { connect } from 'react-redux'
import { AppHost, ExtensionItem, ExtensionSlot, ReactComponentContributor, PrivateFeatureHost } from './api'
import { ErrorBoundary } from './errorBoundary'
import { FeatureContext } from './featureContext';

export function renderFeatureComponent(feature: PrivateFeatureHost, component: React.ReactNode, key: any, name?: string): React.ReactNode {
    return (
        <ErrorBoundary key={key} feature={feature} componentName={name}>
            <FeatureContext.Provider value={feature}>
                {component} 
            </FeatureContext.Provider>
        </ErrorBoundary>
    )
}

export function renderSlotComponents(slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot
        .getItems()
        .map((item, index) => renderFeatureComponent(
            item.feature, 
            item.contribution(), 
            index, // index is the key prop
            item.name)); 
}

export function renderSlotComponentsConnected(slot: ExtensionSlot<ReactComponentContributor>): React.ReactNode[] {
    return slot
        .getItems(true)
        .map((item, index) => renderFeatureComponent(
            item.feature, 
            <ConnectedPredicateHoc index={0} item={item} />, 
            index, // index is the key prop
            item.name)); 
}

interface PredicateHocProps {
    index: number
    render: ReactComponentContributor
    predicateResult: boolean
}

const PredicateHoc: React.FunctionComponent<PredicateHocProps> = (props) => (
    <>
        {(props.predicateResult ? props.render() : null)}
    </>
);

interface ConnectedPredicateHocProps {
    index: number
    item: ExtensionItem<ReactComponentContributor>
}

const mapPredicateHocStateToProps = (state: any, ownProps: ConnectedPredicateHocProps): PredicateHocProps => ({
    index: ownProps.index,
    render: ownProps.item.contribution,
    predicateResult: ownProps.item.condition()
})

const ConnectedPredicateHoc = connect(mapPredicateHocStateToProps)(PredicateHoc)
