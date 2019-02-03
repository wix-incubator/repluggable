import React, { SFC } from 'react';
import { connect } from 'react-redux';
import { AppHost, SlotKey, ExtensionSlot } from './api';
import { HostContext } from './hostContext';
import { renderSlotComponents } from './renderSlotComponents';
import { mainViewSlotKey, stateSlotKey } from './appHost';
import { ActiveFeaturesSelectors, FeatureToggleSet } from './activeFeaturesState';

export type AppMainViewProps = {
    host: AppHost
};

type SfcProps = {
    host: AppHost,
    activeFeatures: FeatureToggleSet
};

const sfc: SFC<SfcProps> = (props) => {
    const contextValue = { host: props.host };
    const contextProviderChildren = renderSlotComponents(props.host, props.host.getSlot(mainViewSlotKey));
    const contextProviderElement = React.createElement(HostContext.Provider, { value: contextValue }, contextProviderChildren);

    return contextProviderElement;
};

const mapStateToProps = (state: any, ownProps: AppMainViewProps): SfcProps => ({
    activeFeatures: ActiveFeaturesSelectors.getActiveFeatureSet(state),
    host: ownProps.host
});

export const AppMainView = connect(mapStateToProps)(sfc);
