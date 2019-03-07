import React, { SFC } from 'react'
import { connect } from 'react-redux'
import { renderSlotComponents } from './renderSlotComponents'
import { InstalledFeaturesSelectors, FeatureToggleSet } from './installedFeaturesState'
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
    const rootFeatureContext = { 
        name: '$root', 
        ...props.host 
    }
    const contextProviderElement = React.createElement(FeatureContext.Provider, { value: rootFeatureContext }, contextProviderChildren)

    return contextProviderElement
}

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    activeFeatures: InstalledFeaturesSelectors.getInstalledFeatureSet(state),
    host: ownProps.host
})

export const AppMainView = connect(mapStateToProps)(sfc)
