import React, { SFC } from 'react';
import { connect } from 'react-redux';
import { EditorHost, SlotKey, ExtensionSlot } from './api';
import { HostContext } from './hostContext';
import { renderSlotComponents } from './renderSlotComponents';
import { mainViewSlotKey, stateSlotKey } from './editorHost';
import { ActiveFeaturesSelectors, FeatureToggleSet } from './activeFeaturesState';

export type EditorMainViewProps = {
    host: EditorHost
};

type SfcProps = {
    host: EditorHost,
    activeFeatures: FeatureToggleSet
};

const sfc: SFC<SfcProps> = (props) => {
    const contextValue = { host: props.host };
    const contextProviderChildren = renderSlotComponents(props.host, props.host.getSlot(mainViewSlotKey));
    const contextProviderElement = React.createElement(HostContext.Provider, { value: contextValue }, contextProviderChildren);

    return contextProviderElement;
};

const mapStateToProps = (state: any, ownProps: EditorMainViewProps): SfcProps => ({
    activeFeatures: ActiveFeaturesSelectors.getActiveFeatureSet(state),
    host: ownProps.host
});

export const EditorMainView = connect(mapStateToProps)(sfc);
