import React, { SFC } from 'react'
import { connect, Provider } from 'react-redux'
import { AppHost } from './API'
import { mainViewSlotKey } from './appHost'
import { InstalledShellsSelectors, ShellToggleSet } from './installedShellsState'
import { renderSlotComponents } from './renderSlotComponents'
import { ShellContext } from './shellContext'
import { AppHostServicesProvider } from './appHostServices'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    installedShells: ShellToggleSet
}

const sfc: SFC<SfcProps> = props => {
    const appHostServicesShell = (props.host as unknown as AppHostServicesProvider).getAppHostServicesShell()
    const contextProviderChildren = renderSlotComponents(props.host.getSlot(mainViewSlotKey))
    
    return (
        <ShellContext.Provider value={appHostServicesShell}>
            {contextProviderChildren}
        </ShellContext.Provider>
    )
}

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    installedShells: InstalledShellsSelectors.getInstalledShellsSet(state),
    host: ownProps.host
})

const ConnectedSfc = connect(mapStateToProps)(sfc)

export const AppMainView = (props: AppMainViewProps) => (
    <Provider store={props.host.getStore()}>
        <ConnectedSfc host={props.host} />
    </Provider>
)
