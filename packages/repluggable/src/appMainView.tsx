import _ from 'lodash'
import React, { FunctionComponent } from 'react'
import { connect, Provider } from 'react-redux'
import { AppHost } from './API'
import { mainViewSlotKey,AppHostServicesProvider, InstalledShellsSelectors, ShellToggleSet } from 'repluggable-core'
import { SlotRenderer } from './renderSlotComponents'
import { ShellContext } from './shellContext'
import { StoreContext } from './storeContext'

export interface AppMainViewProps {
    host: AppHost
}

interface SfcProps {
    host: AppHost
    installedShells: ShellToggleSet
}

const sfc: FunctionComponent<SfcProps> = props => {
    const appHostServicesShell = (props.host as unknown as AppHostServicesProvider).getAppHostServicesShell()

    return (
        <ShellContext.Provider value={appHostServicesShell}>
            <SlotRenderer slot={props.host.getSlot(mainViewSlotKey)} mapFunc={_.identity} />
        </ShellContext.Provider>
    )
}

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    installedShells: InstalledShellsSelectors.getInstalledShellsSet(state),
    host: ownProps.host
})

const ConnectedSfc = connect(mapStateToProps, undefined, undefined, { context: StoreContext })(sfc)

export const AppMainView = (props: AppMainViewProps) => (
    <Provider store={props.host.getStore()} context={StoreContext}>
        <ConnectedSfc host={props.host} />
    </Provider>
)
