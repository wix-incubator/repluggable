import React, { SFC } from 'react'
import { connect, Provider } from 'react-redux'
import { AppHost } from './API'
import { mainViewSlotKey } from './appHost'
import { InstalledShellsSelectors, ShellToggleSet } from './installedShellsState'
import { renderSlotComponents } from './renderSlotComponents'
import { ShellContext } from './shellContext'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    installedShells: ShellToggleSet
}

// TODO: Either create shell for root context or render root slot without context provider
const sfc: SFC<SfcProps> = props => {
    const contextProviderChildren = renderSlotComponents(props.host.getSlot(mainViewSlotKey))
    const rootShell = {
        name: '$root',
        ...props.host
    }

    return <ShellContext.Provider value={rootShell}>{contextProviderChildren}</ShellContext.Provider>
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
