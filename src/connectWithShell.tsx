import _ from 'lodash'
import React, { ComponentType } from 'react'
import { connect as reduxConnect, ConnectedComponentClass } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { Shell } from './API'
import { ShellContext } from './shellContext'
import { ErrorBoundary } from './errorBoundary';

interface WrapperMembers<S, OP, SP, DP> {
    connectedComponent: any
    mapStateToProps: (state: S, ownProps?: OP) => SP
    mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP
}

type Maybe<T> = T | undefined
type Returns<T> = () => T
type MapStateToProps<S, OP, SP> = Maybe<(shell: Shell, state: S, ownProps?: OP) => SP>
type MapDispatchToProps<OP, DP> = Maybe<(shell: Shell, dispatch: Dispatch<Action>, ownProps?: OP) => DP>
type WithChildren<OP> = OP & { children?: React.ReactNode }
// @ts-ignore
type WrappedComponentOwnProps<OP> = OP & { shell: Shell }

function wrapWithShellContext<S, OP, SP, DP>(
    component: React.ComponentType<OP & SP & DP>,
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell
) {
    class ConnectedComponent extends React.Component<WrappedComponentOwnProps<OP>> implements WrapperMembers<S, OP, SP, DP> {
        public connectedComponent: ConnectedComponentClass<ComponentType<any>, OP>
        public mapStateToProps: (state: S, ownProps?: OP) => SP
        public mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP

        constructor(props: WrappedComponentOwnProps<OP>) {
            super(props)
            this.mapStateToProps = mapStateToProps
                ? (__, ownProps?) => mapStateToProps(this.props.shell, this.props.shell.getStore<S>().getState(), ownProps)
                : (_.stubObject as Returns<SP>)
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps?) => mapDispatchToProps(this.props.shell, dispatch, ownProps)
                : (_.stubObject as Returns<DP>)
            this.connectedComponent = reduxConnect<SP, DP, OP, S>(this.mapStateToProps, this.mapDispatchToProps)(component as any) as any
        }

        public render() {
            const Component = this.connectedComponent
            return <Component {..._.omit(this.props, 'shell')} />
        }
    }

    const wrapChildrenIfNeeded = (props: WithChildren<OP>, originalShell: Shell): WithChildren<OP> =>
        props.children
            ? {
                // @ts-ignore
                  ...props,
                  children: <ShellContext.Provider value={originalShell}>{props.children}</ShellContext.Provider>
              }
            : props

    return (props: WithChildren<OP>) => (
        <ShellContext.Consumer>
            {shell => {
                // @ts-ignore
                return (<ErrorBoundary shell={boundShell}>
                    <ConnectedComponent {...wrapChildrenIfNeeded(props, shell)} shell={boundShell} />
                </ErrorBoundary>)
            }}
        </ShellContext.Consumer>
    )
}

export function connectWithShell<S = {}, OP = {}, SP = {}, DP = {}>(
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell
) {
    return (component: React.ComponentType<OP & SP & DP>) => {
        return wrapWithShellContext(component, mapStateToProps, mapDispatchToProps, boundShell)
    }
}
