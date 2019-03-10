import React, { SFC } from 'react'
import { connect } from 'react-redux'
import { AppHost } from './api'
import { mainViewSlotKey } from './appHost'
import { FeatureContext } from './featureContext'
import { FeatureToggleSet, InstalledFeaturesSelectors } from './installedFeaturesState'
import { renderSlotComponents } from './renderSlotComponents'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    installedFeatures: FeatureToggleSet
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
    installedFeatures: InstalledFeaturesSelectors.getInstalledFeatureSet(state),
    host: ownProps.host
})

export const AppMainView = connect(mapStateToProps)(sfc)
