
import React, { Dispatch, ComponentType } from 'react';
import { connect as reduxConnect, ConnectedComponentClass, InferableComponentEnhancerWithProps, Matching } from 'react-redux';
import * as PropTypes from 'prop-types';
import { Action } from 'redux';
import { FeatureContext } from './featureContext'
import { SlotKey } from './api';

export const featureContextTypes = {
    getSlot: PropTypes.func.isRequired,
    getApi: PropTypes.func.isRequired,
    isFeatureActive: PropTypes.func.isRequired,
    isFeatureInstalled: PropTypes.func.isRequired,
    isLazyFeature: PropTypes.func.isRequired,
    log: PropTypes.object
};

export interface FeatureContextWithApi extends FeatureContext {
    getApi<TApi>(key: SlotKey<TApi>): TApi;
    isFeatureActive(name: string): boolean
    activateFeatures(names: string[]): Promise<any>
    deactivateFeatures(names: string[]): void
}

interface WrapperMembers<S, OP, SP, DP> {
    connectedComponent: any;
    mapStateToProps: (state: S, ownProps?: OP) => SP;
    mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP;
}

function wrapWithFeatureContext<S, OP, SP, DP>(
    component: React.ComponentType<SP & DP>,
    mapStateToProps: (context: FeatureContextWithApi, state: S, ownProps?: OP) => SP, 
    mapDispatchToProps: (context: FeatureContextWithApi, dispatch: Dispatch<Action>, ownProps?: OP) => DP)
{
    return class ConnectedComponent 
        extends React.Component<OP> 
        implements WrapperMembers<S, OP, SP, DP> 
    {
        connectedComponent: ConnectedComponentClass<ComponentType<never>, OP>;
        mapStateToProps: (state: S, ownProps?: OP) => SP;
        mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP;
    
        constructor(props: OP, context: FeatureContextWithApi) {
            super(props, context);

            this.mapStateToProps = mapStateToProps
                ? (state, ownProps) => mapStateToProps(context, state, ownProps)
                : () => ({} as SP);
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps) => mapDispatchToProps(context, dispatch, ownProps)
                : () => ({} as DP);
            this.connectedComponent = reduxConnect<SP, DP, OP, S>(
                this.mapStateToProps, 
                this.mapDispatchToProps)(component as any) as any;
    
            (this as any).shouldComponentUpdate = (this.connectedComponent as any).shouldComponentUpdate;
        }

        render() {
            const Component = this.connectedComponent;
            return <Component {...this.props} />;
        }

        static contextTypes = featureContextTypes;
    };

}

export function connectWithFeature<S, OP, SP, DP>(
    mapStateToProps: (context: FeatureContextWithApi, state: S, ownProps?: OP) => SP, 
    mapDispatchToProps: (context: FeatureContextWithApi, dispatch: Dispatch<Action>, ownProps?: OP) => DP) 
{
    return (component: React.ComponentType<SP & DP>) => {
        return wrapWithFeatureContext(
            component,
            mapStateToProps,
            mapDispatchToProps
        );
    };
}

