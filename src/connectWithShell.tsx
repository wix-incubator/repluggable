import _ from 'lodash'
import React from 'react'
import { connect as reduxConnect, Options as ReduxConnectOptions } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { Shell, AnyFunction, ObservableState, StateObserverUnsubscribe } from './API'
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
                      return this.props.shell.log.monitor(`connectWithShell.mapStateToProps ${this.props.shell.name}`, {}, () =>
                          mapStateToProps(this.props.shell, this.props.shell.getStore<S>().getState(), ownProps)
                      )
                  }
                : (_.stubObject as Returns<SP>)
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps?) => {
                      return this.props.shell.log.monitor(`connectWithShell.mapDispatchToProps ${this.props.shell.name}`, {}, () =>
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

export type ConnectedComponentFactory<S = {}, OP = {}, SP = {}, DP = {}, OPPure = OP> = (
    component: React.ComponentType<OPPure & SP & DP>
) => (props: WithChildren<OP>) => JSX.Element

export function connectWithShell<S = {}, OP = {}, SP = {}, DP = {}>(
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
): ConnectedComponentFactory<S, OP, SP, DP> {
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
            boundShell.log.error(errorText)
        }
    }

    return (component: React.ComponentType<OP & SP & DP>) => {
        validateLifecycle(component)
        return wrapWithShellContext(component, mapStateToProps, mapDispatchToProps, boundShell, options)
    }
}

export interface ObservablesMap {
    [key: string]: ObservableState<any>
}

export type ObservedSelectorsMap<M> = {
    [K in keyof M]: M[K] extends ObservableState<infer S> ? S : undefined
}

export type OmitObservedSelectors<T, M> = Omit<T, keyof M>

export function mapObservablesToSelectors<M extends ObservablesMap>(map: M): ObservedSelectorsMap<M> {
    const result = _.mapValues(map, observable => {
        const selector = observable.current()
        return selector
    })
    return result
}

export function observeWithShell<OM extends ObservablesMap, OP extends ObservedSelectorsMap<OM>>(
    observables: OM,
    boundShell: Shell
): <S, SP, DP>(
    innerFactory: ConnectedComponentFactory<S, OP, SP, DP>
) => ConnectedComponentFactory<S, OmitObservedSelectors<OP, OM>, SP, DP, OP> {
    return <S, SP, DP>(innerFactory: ConnectedComponentFactory<S, OP, SP, DP>) => {
        // exclude observed selectors from wrapper props, because we want those selectors to be in the wrapper's state instead
        type ObservableWrapperProps = OmitObservedSelectors<OP, OM>
        type ObservableWrapperState = ObservedSelectorsMap<OM>

        const observableConnectedComponentFactory: ConnectedComponentFactory<S, ObservableWrapperProps, SP, DP, OP> = pureComponent => {
            class ObservableWrapperComponent extends React.Component<ObservableWrapperProps, ObservableWrapperState> {
                public connectedComponent: React.ComponentType<OP>
                public unsubscribes: StateObserverUnsubscribe[]

                constructor(props: OP) {
                    super(props)
                    this.connectedComponent = innerFactory(pureComponent)
                    this.unsubscribes = []
                    this.state = mapObservablesToSelectors(observables)
                }

                public componentDidMount() {
                    for (const key in observables) {
                        const unsubscribe = observables[key].subscribe(boundShell, () => {
                            const newState = mapObservablesToSelectors(observables)
                            this.setState(newState)
                        })
                        this.unsubscribes.push(unsubscribe)
                    }
                }

                public componentWillUnmount() {
                    this.unsubscribes.forEach(unsubscribe => unsubscribe())
                    this.unsubscribes = []
                }

                public render() {
                    const ConnectedComponent = this.connectedComponent
                    const connectedComponentProps: OP = {
                        ...this.props, // OP excluding observed selectors
                        ...this.state // observed selectors
                    } as OP // TypeScript doesn't get it
                    return <ConnectedComponent {...connectedComponentProps} />
                }
            }

            const hoc = (props: WithChildren<OmitObservedSelectors<OP, OM>>) => {
                return <ObservableWrapperComponent {...props} {...mapObservablesToSelectors(observables)} />
            }

            return hoc
        }

        return observableConnectedComponentFactory
    }
}

export function connectWithShellAndObserve<OM extends ObservablesMap, OP extends ObservedSelectorsMap<OM>, S = {}, SP = {}, DP = {}>(
    observables: OM,
    mapStateToProps: MapStateToProps<S, OP, SP>,
    mapDispatchToProps: MapDispatchToProps<OP, DP>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
): ConnectedComponentFactory<S, OmitObservedSelectors<OP, OM>, SP, DP, OP> {
    const innerFactory = connectWithShell(mapStateToProps, mapDispatchToProps, boundShell, options)
    const wrapperFactory = observeWithShell<OM, OP>(observables, boundShell)(innerFactory)
    return wrapperFactory
}
