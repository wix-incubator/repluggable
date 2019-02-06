import React, { SFC } from 'react'
import { connect } from 'react-redux'
import { ActiveFeaturesSelectors, FeatureToggleSet } from './activeFeaturesState'
import { AppHost, ExtensionSlot, SlotKey } from './api'
import { mainViewSlotKey, stateSlotKey } from './appHost'
import { HostContext } from './hostContext'
import { renderSlotComponents } from './renderSlotComponents'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    activeFeatures: FeatureToggleSet
}

const sfc: SFC<SfcProps> = props => {
    const contextValue = { host: props.host }
    const contextProviderChildren = renderSlotComponents(props.host, props.host.getSlot(mainViewSlotKey))
    const contextProviderElement = React.createElement(HostContext.Provider, { value: contextValue }, contextProviderChildren)

    return contextProviderElement
}

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    activeFeatures: ActiveFeaturesSelectors.getActiveFeatureSet(state),
    host: ownProps.host
})

export const AppMainView = connect(mapStateToProps)(sfc)
