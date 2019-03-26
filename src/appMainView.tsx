import React, { SFC } from 'react'
import { connect, Provider } from 'react-redux'
import { AppHost } from './api'
import { mainViewSlotKey } from './appHost'
import { ShellContext } from './featureContext'
import { InstalledFeaturesSelectors, ShellToggleSet } from './installedFeaturesState'
import { renderSlotComponents } from './renderSlotComponents'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    installedFeatures: ShellToggleSet
}

const sfc: SFC<SfcProps> = props => {
    const contextProviderChildren = renderSlotComponents(props.host.getSlot(mainViewSlotKey))
    const rootFeatureContext = {
        name: '$root',
        ...props.host
    }

    return <ShellContext.Provider value={rootFeatureContext}>{contextProviderChildren}</ShellContext.Provider>
}

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    installedFeatures: InstalledFeaturesSelectors.getInstalledFeatureSet(state),
    host: ownProps.host
})

const ConnectedSfc = connect(mapStateToProps)(sfc)

export const AppMainView = (props: AppMainViewProps) => (
    <Provider store={props.host.getStore()}>
        <ConnectedSfc host={props.host} />
    </Provider>
)
