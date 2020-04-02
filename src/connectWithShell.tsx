import _ from 'lodash'
import React from 'react'
import { connect as reduxConnect, Options as ReduxConnectOptions } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { Shell, AnyFunction } from './API'
import { ErrorBoundary } from './errorBoundary'
import { ShellContext } from './shellContext'
import { StoreContext } from './storeContext'
import { propsDeepEqual } from './propsDeepEqual'

interface WrapperMembers<S, OP, SP, DP> {
    connectedComponent: any
    mapStateToProps(state: S, ownProps?: OP): SP
    mapDispatchToProps(dispatch: Dispatch<Action>, ownProps?: OP): DP
}

type Maybe<T> = T | undefined
type Returns<T> = () => T
type MapStateToProps<S, OP, SP> = Maybe<(shell: Shell, state: S, ownProps?: OP) => SP>
type MapDispatchToProps<OP, DP> = Maybe<(shell: Shell, dispatch: Dispatch<Action>, ownProps?: OP) => DP>
type WithChildren<OP> = OP & { children?: React.ReactNode }
type WrappedComponentOwnProps<OP> = OP & { shell: Shell }
type Mandatory<T> = { [K in keyof T]-?: T[K] }

const reduxConnectOptions: ReduxConnectOptions & Pick<Mandatory<ReduxConnectOptions>, 'areStatePropsEqual' | 'areOwnPropsEqual'> = {
    context: StoreContext,
    pure: true,
    areStatePropsEqual: propsDeepEqual,
    areOwnPropsEqual: propsDeepEqual
}

function wrapWithShouldUpdate<F extends AnyFunction>(shouldUpdate: Maybe<(shell: Shell) => boolean>, func: F, shell: Shell): F {
    return ((...args: Parameters<F>) => (shouldUpdate && !shouldUpdate(shell) ? true : func(...args))) as F
}

function wrapWithShellContext<S, OP, SP, DP>(
    component: React.ComponentType<OP & SP & DP>,
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
) {
    class ConnectedComponent extends React.Component<WrappedComponentOwnProps<OP>> implements WrapperMembers<S, OP, SP, DP> {
        public connectedComponent: React.ComponentType<OP>
        public mapStateToProps: (state: S, ownProps?: OP) => SP
        public mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OP) => DP

        constructor(props: WrappedComponentOwnProps<OP>) {
            super(props)
            this.mapStateToProps = mapStateToProps
                ? (__, ownProps?) => {
                      return this.props.shell.log.monitor('connectWithShell.mapStateToProps', {}, () =>
                          mapStateToProps(this.props.shell, this.props.shell.getStore<S>().getState(), ownProps)
                      )
                  }
                : (_.stubObject as Returns<SP>)
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps?) => {
                      return this.props.shell.log.monitor('connectWithShell.mapDispatchToProps', {}, () =>
                          mapDispatchToProps(this.props.shell, dispatch, ownProps)
                      )
                  }
                : (_.stubObject as Returns<DP>)

            this.connectedComponent = reduxConnect<SP, DP, OP, S>(
                this.mapStateToProps,
                this.mapDispatchToProps,
                undefined,
                options.shouldComponentUpdate
                    ? {
                          ...reduxConnectOptions,
                          areStatePropsEqual: wrapWithShouldUpdate(
                              options.shouldComponentUpdate,
                              reduxConnectOptions.areStatePropsEqual,
                              boundShell
                          ),
                          areOwnPropsEqual: wrapWithShouldUpdate(
                              options.shouldComponentUpdate,
                              reduxConnectOptions.areOwnPropsEqual,
                              boundShell
                          )
                      }
                    : reduxConnectOptions
            )(component as React.ComponentType<any>) as React.ComponentType<any> // TODO: Fix 'as any'
        }

        public render() {
            const Component = this.connectedComponent
            const props = _.omit(this.props, 'shell') as OP
            return <Component {...props} />
        }
    }

    const wrapChildrenIfNeeded = (props: WithChildren<OP>, originalShell: Shell): WithChildren<OP> =>
        props.children
            ? {
                  ...props,
                  children: <ShellContext.Provider value={originalShell}>{props.children}</ShellContext.Provider>
              }
            : props

    return (props: WithChildren<OP>) => (
        <ShellContext.Consumer>
            {shell => {
                return (
                    <ErrorBoundary shell={boundShell} componentName={options.componentName}>
                        {<ConnectedComponent {...wrapChildrenIfNeeded(props, shell)} shell={boundShell} />}
                    </ErrorBoundary>
                )
            }}
        </ShellContext.Consumer>
    )
}

export interface ConnectWithShellOptions {
    readonly componentName?: string
    readonly allowOutOfEntryPoint?: boolean
    shouldComponentUpdate?(shell: Shell): boolean
}

export function connectWithShell<S = {}, OP = {}, SP = {}, DP = {}>(
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
) {
    const validateLifecycle = (component: React.ComponentType<any>) => {
        if (boundShell.wasInitializationCompleted() && !options.allowOutOfEntryPoint) {
            const componentText = component.displayName || component.name || component
            const errorText =
                `connectWithShell(${boundShell.name})(${componentText}): ` +
                'attempt to create component type outside of Entry Point lifecycle. ' +
                'To fix this, call connectWithShell() from Entry Point attach() or extend(). ' +
                'If you really have to create this component type dynamically, ' +
                'either pass {allowOutOfEntryPoint:true} in options, or use shell.runLateInitializer().'
            //TODO: replace with throw after a grace period
            boundShell.log.warning(errorText)
        }
    }

    return (component: React.ComponentType<OP & SP & DP>) => {
        validateLifecycle(component)
        return wrapWithShellContext(component, mapStateToProps, mapDispatchToProps, boundShell, options)
    }
}
