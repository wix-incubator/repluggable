import _ from 'lodash'
import React, { ComponentType } from 'react'
import { connect as reduxConnect, ConnectedComponentClass } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { Shell } from './API'
import { ShellContext } from './shellContext'

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
    boundShell?: Shell
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

    const wrapChildrenInNeeded = (props: WithChildren<OP>, originalShell: Shell): WithChildren<OP> =>
        boundShell && props.children
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
             return <ConnectedComponent {...wrapChildrenInNeeded(props, shell)} shell={boundShell || shell} />
            }}
        </ShellContext.Consumer>
    )
}

function connectWithShell<S = {}, OP = {}, SP = {}, DP = {}>(
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell?: Shell
) {
    return (component: React.ComponentType<OP & SP & DP>) => {
        return wrapWithShellContext(component, mapStateToProps, mapDispatchToProps, boundShell)
    }
}

interface FluentComponentBuilder<S, OP, SP, DP> {
    withShell(shell: Shell): FluentComponentBuilder<S, OP, SP, DP>

    withContributedState<TOwnState>(): FluentComponentBuilder<TOwnState, OP, SP, DP>

    withOwnProps<TOwnProps>(): FluentComponentBuilder<S, TOwnProps, SP, DP>

    mapStateToProps<TStateProps>(func: MapStateToProps<S, OP, TStateProps>): FluentComponentBuilder<S, OP, TStateProps, DP>

    mapDispatchToProps<TDispProps>(func: MapDispatchToProps<OP, TDispProps>): FluentComponentBuilder<S, OP, SP, TDispProps>

    wrap(pure: React.FunctionComponent<OP & SP & DP>): React.FunctionComponent<OP>
}

export function buildConnectedComponent<S = {}, OP = {}, SP = {}, DP = {}>(): FluentComponentBuilder<S, OP, SP, DP> {
    return createPrivateBuilder<S, OP, SP, DP>()
}

function createPrivateBuilder<S, OP, SP, DP>(): FluentComponentBuilder<S, OP, SP, DP> {
    let _shell: Shell
    let _mapStateToProps: MapStateToProps<S, OP, any>
    let _mapDispatchToProps: MapDispatchToProps<OP, any>
    const _this = {
        withShell(shell: Shell) {
            _shell = shell
            return _this as any
        },
        withContributedState<TOwnState>(): FluentComponentBuilder<TOwnState, OP, SP, DP> {
            return _this as any
        },
        withOwnProps<TOwnProps>(): FluentComponentBuilder<S, TOwnProps, SP, DP> {
            return _this as any
        },
        mapStateToProps<TStateProps>(func: MapStateToProps<S, OP, TStateProps>): FluentComponentBuilder<S, OP, TStateProps, DP> {
            _mapStateToProps = func
            return _this as any
        },
        mapDispatchToProps<TDispProps>(func: MapDispatchToProps<OP, TDispProps>): FluentComponentBuilder<S, OP, SP, TDispProps> {
            _mapDispatchToProps = func
            return _this as any
        },
        wrap(pure: React.FunctionComponent<OP & SP & DP>): React.FunctionComponent<OP> {
            return connectWithShell<S, OP, SP, DP>(_mapStateToProps, _mapDispatchToProps, _shell)(pure) as any
        }
    }
    return _this
}
