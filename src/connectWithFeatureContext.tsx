import _ from 'lodash'
import React, { ComponentType } from 'react'
import { connect as reduxConnect, ConnectedComponentClass } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { AnyPackage, ScopedStore, SlotKey } from './api'
import { ShellContext } from './featureContext'

export interface ShellContextWithApi extends ShellContext {
    getApi<TApi>(key: SlotKey<TApi>): TApi
    getStore<TState>(): ScopedStore<TState>
    isFeatureInstalled(name: string): boolean
    installPackages(packages: AnyPackage[]): void
    uninstallShells(names: string[]): void
}

interface WrapperMembers<S, OP, SP, DP> {
    connectedComponent: any
    mapStateToProps: (state: S, ownProps?: OP) => SP
    mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP
}

type Maybe<T> = T | undefined
type Returns<T> = () => T
type MapStateToProps<S, OP, SP> = Maybe<(context: ShellContextWithApi, state: S, ownProps?: OP) => SP>
type MapDispatchToProps<OP, DP> = Maybe<(context: ShellContextWithApi, dispatch: Dispatch<Action>, ownProps?: OP) => DP>
type WrappedComponentOwnProps<OP> = OP & { featureContext: ShellContextWithApi }

function wrapWithFeatureContext<S, OP, SP, DP>(
    component: React.ComponentType<OP & SP & DP>,
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>
) {
    class ConnectedComponent extends React.Component<WrappedComponentOwnProps<OP>> implements WrapperMembers<S, OP, SP, DP> {
        public connectedComponent: ConnectedComponentClass<ComponentType<never>, OP>
        public mapStateToProps: (state: S, ownProps?: OP) => SP
        public mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP

        constructor(props: WrappedComponentOwnProps<OP>) {
            super(props)
            this.mapStateToProps = mapStateToProps
                ? (__, ownProps?) =>
                      mapStateToProps(this.props.featureContext, this.props.featureContext.getStore<S>().getState(), ownProps)
                : (_.stubObject as Returns<SP>)
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps?) => mapDispatchToProps(this.props.featureContext, dispatch, ownProps)
                : (_.stubObject as Returns<DP>)
            this.connectedComponent = reduxConnect<SP, DP, OP, S>(this.mapStateToProps, this.mapDispatchToProps)(component as any) as any
        }

        public render() {
            const Component = this.connectedComponent
            return <Component {...this.props} />
        }
    }

    return (props: OP) => (
        <ShellContext.Consumer>
            {featureContext => <ConnectedComponent {...props} featureContext={featureContext as ShellContextWithApi} />}
        </ShellContext.Consumer>
    )
}

export function connectWithFeature<S = {}, OP = {}, SP = {}, DP = {}>(
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>
) {
    return (component: React.ComponentType<OP & SP & DP>) => {
        return wrapWithFeatureContext(component, mapStateToProps, mapDispatchToProps)
    }
}
