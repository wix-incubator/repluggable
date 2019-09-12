import _ from 'lodash'
import React, { ComponentType } from 'react'
import { connect as reduxConnect, Options as ReduxConnectOptions } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { Shell } from './API'
import { ErrorBoundary } from './errorBoundary'
import { ShellContext } from './shellContext'
import { STORE_KEY } from './appStore'

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

const propsDeepEqual = (propsA: any, propsB: any) => {
    const customizer: _.IsEqualCustomizer = (a, b, key, objectA) => {
        if (key === 'children' && objectA === propsA) {
            if (_.isFunction(a) && _.isFunction(b)) {
                return false
            }
            return
        }

        if (_.isFunction(a) && _.isFunction(b)) {
            return true
        }

        return
    }

    return _.isEqualWith(propsA, propsB, customizer)
}

const reduxConnectOptions: ReduxConnectOptions = {
    storeKey: STORE_KEY,
    pure: true,
    areStatePropsEqual: propsDeepEqual,
    areOwnPropsEqual: propsDeepEqual
}

function wrapWithShellContext<S, OP, SP, DP>(
    component: React.ComponentType<OP & SP & DP>,
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell
) {
    class ConnectedComponent extends React.Component<WrappedComponentOwnProps<OP>> implements WrapperMembers<S, OP, SP, DP> {
        public connectedComponent: React.ComponentClass<OP>
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

            this.connectedComponent = reduxConnect<SP, DP, OP, S>(
                this.mapStateToProps,
                this.mapDispatchToProps,
                undefined,
                reduxConnectOptions
            )(component) as any
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
                    <ErrorBoundary shell={boundShell}>
                        {<ConnectedComponent {...wrapChildrenIfNeeded(props, shell)} shell={boundShell} />}
                    </ErrorBoundary>
                )
            }}
        </ShellContext.Consumer>
    )
}

export interface ConnectWithShellOptions {
    readonly allowOutOfEntryPoint?: boolean
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
                `connectWithShell(${boundShell.name})(${componentText}): [will upgrade to ERROR by Sep 1]:` +
                'attempt to create component type outside of Entry Point lifecycle. ' +
                'To fix this, call connectWithShell() from Entry Point attach() or extend(). ' +
                'If you really have to create this component type dynamically, ' +
                "pass {allowOutOfEntryPoint:true} in the 'options' parameter."
            //TODO: replace with throw after a grace period
            boundShell.log.warning(errorText)
        }
    }

    return (component: React.ComponentType<OP & SP & DP>) => {
        validateLifecycle(component)
        return wrapWithShellContext(component, mapStateToProps, mapDispatchToProps, boundShell)
    }
}
