import React, { ComponentType, Dispatch } from 'react'
import { connect as reduxConnect, ConnectedComponentClass } from 'react-redux'
import { Action } from 'redux'
import { AnyFeature, ScopedStore, SlotKey } from './api'
import { FeatureContext } from './featureContext'

export interface FeatureContextWithApi extends FeatureContext {
    getApi<TApi>(key: SlotKey<TApi>): TApi
    getStore<TState>(): ScopedStore<TState>
    isFeatureInstalled(name: string): boolean
    installFeatures(features: AnyFeature[]): void
    uninstallFeatures(names: string[]): void
}

interface WrapperMembers<S, OP, SP, DP> {
    connectedComponent: any
    mapStateToProps: (state: S, ownProps?: OP) => SP
    mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP
}

function wrapWithFeatureContext<S, OP, SP, DP>(
    component: React.ComponentType<SP & DP>,
    mapStateToProps: (context: FeatureContextWithApi, state: S, ownProps?: OP) => SP,
    mapDispatchToProps: (context: FeatureContextWithApi, dispatch: Dispatch<Action>, ownProps?: OP) => DP
) {
    class ConnectedComponent extends React.Component<OP & { featureContext: FeatureContextWithApi }>
        implements WrapperMembers<S, OP, SP, DP> {
        public connectedComponent: ConnectedComponentClass<ComponentType<never>, OP>
        public mapStateToProps: (state: S, ownProps?: OP) => SP
        public mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP

        constructor(props: OP & { featureContext: FeatureContextWithApi }) {
            super(props)
            this.mapStateToProps = mapStateToProps
                ? (_, ownProps) => mapStateToProps(this.props.featureContext, this.props.featureContext.getStore<S>().getState(), ownProps)
                : () => ({} as SP)
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps) => mapDispatchToProps(this.props.featureContext, dispatch, ownProps)
                : () => ({} as DP)
            this.connectedComponent = reduxConnect<SP, DP, OP, S>(this.mapStateToProps, this.mapDispatchToProps)(component as any) as any
        }

        public render() {
            const Component = this.connectedComponent
            return <Component {...this.props} />
        }
    }

    return (props: OP) => (
        <FeatureContext.Consumer>
            {featureContext => <ConnectedComponent {...props} featureContext={featureContext as FeatureContextWithApi} />}
        </FeatureContext.Consumer>
    )
}

export function connectWithFeature<S, OP, SP, DP>(
    mapStateToProps: (context: FeatureContextWithApi, state: S, ownProps?: OP) => SP,
    mapDispatchToProps: (context: FeatureContextWithApi, dispatch: Dispatch<Action>, ownProps?: OP) => DP
) {
    return (component: React.ComponentType<SP & DP>) => {
        return wrapWithFeatureContext(component, mapStateToProps, mapDispatchToProps)
    }
}
