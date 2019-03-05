import React, { SFC } from 'react'
import { connect } from 'react-redux'
import { renderSlotComponents } from './renderSlotComponents'
import { ActiveFeaturesSelectors, FeatureToggleSet } from './activeFeaturesState'
import { AppHost } from './api'
import { mainViewSlotKey } from './appHost'
import { FeatureContext } from './featureContext'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    activeFeatures: FeatureToggleSet
}

const sfc: SFC<SfcProps> = props => {
    const contextProviderChildren = renderSlotComponents(props.host.getSlot(mainViewSlotKey))
    const contextProviderElement = React.createElement(FeatureContext.Provider, { value: props.host }, contextProviderChildren)

    return contextProviderElement
}

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    activeFeatures: ActiveFeaturesSelectors.getActiveFeatureSet(state),
    host: ownProps.host
})

export const AppMainView = connect(mapStateToProps)(sfc)
