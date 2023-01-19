import _ from 'lodash'
import React from 'react'
import { connect as reduxConnect } from 'react-redux'
import { Action, Dispatch } from 'redux'
import { AnyFunction, ObservableState, StateObserverUnsubscribe, PrivateShell, Shell } from './API'
import { ErrorBoundary } from './errorBoundary'
import { ShellContext } from './shellContext'
import { StoreContext } from './storeContext'
import { propsDeepEqual } from './propsDeepEqual'

interface WrapperMembers<State, OwnProps, StateProps, DispatchProps> {
    connectedComponent: any
    mapStateToProps(state: State, ownProps?: OwnProps): StateProps
    mapDispatchToProps(dispatch: Dispatch<Action>, ownProps?: OwnProps): DispatchProps
}

type Maybe<T> = T | undefined
type Returns<T> = () => T
type MapStateToProps<State, OwnProps, StateProps> = Maybe<(shell: Shell, state: State, ownProps?: OwnProps) => StateProps>
type MapDispatchToProps<OwnProps, DispatchProps> = Maybe<(shell: Shell, dispatch: Dispatch<Action>, ownProps?: OwnProps) => DispatchProps>
type MapShellToStaticProps<ShellStaticProps, OwnProps> = Maybe<(shell: Shell, ownProps?: OwnProps) => ShellStaticProps>
type WithChildren<OwnProps> = OwnProps & { children?: React.ReactNode }
type WrappedComponentOwnProps<OwnProps> = OwnProps & { shell: Shell }

const reduxConnectOptions = {
    context: StoreContext,
    areStatePropsEqual: propsDeepEqual,
    areOwnPropsEqual: propsDeepEqual
}

function wrapWithShouldUpdate<F extends AnyFunction>(shouldUpdate: Maybe<(shell: Shell) => boolean>, func: F, shell: Shell): F {
    return ((...args: Parameters<F>) => (shouldUpdate && !shouldUpdate(shell) ? true : func(...args))) as F
}

function wrapWithShellContext<State, OwnProps, StateProps, DispatchProps>(
    component: React.ComponentType<OwnProps & StateProps & DispatchProps>,
    mapStateToProps: MapStateToProps<State, OwnProps, StateProps>,
    mapDispatchToProps: MapDispatchToProps<OwnProps, DispatchProps>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
): ComponentWithChildrenProps<OwnProps> {
    class ConnectedComponent
        extends React.Component<WrappedComponentOwnProps<OwnProps>>
        implements WrapperMembers<State, OwnProps, StateProps, DispatchProps>
    {
        public connectedComponent: React.ComponentType<OwnProps>
        public mapStateToProps: (state: State, ownProps?: OwnProps) => StateProps
        public mapDispatchToProps: (dispatch: Dispatch<Action>, ownProps?: OwnProps) => DispatchProps

        constructor(props: WrappedComponentOwnProps<OwnProps>) {
            super(props)
            this.mapStateToProps = mapStateToProps
                ? (__, ownProps?) => {
                      return this.props.shell.log.monitor(`connectWithShell.mapStateToProps ${this.props.shell.name}`, {}, () =>
                          mapStateToProps(this.props.shell, this.props.shell.getStore<State>().getState(), ownProps)
                      )
                  }
                : (_.stubObject as Returns<StateProps>)
            this.mapDispatchToProps = mapDispatchToProps
                ? (dispatch, ownProps?) => {
                      return this.props.shell.log.monitor(`connectWithShell.mapDispatchToProps ${this.props.shell.name}`, {}, () =>
                          mapDispatchToProps(this.props.shell, dispatch, ownProps)
                      )
                  }
                : (_.stubObject as Returns<DispatchProps>)

            const shouldComponentUpdate =
                options.shouldComponentUpdate && this.props.shell.memoizeForState(options.shouldComponentUpdate, () => '*')

            const memoWithShouldUpdate = <F extends AnyFunction>(f: F): F => {
                let last: ReturnType<F> | null = null
                return ((...args) => {
                    if (last && shouldComponentUpdate && !shouldComponentUpdate(this.props.shell)) {
                        return last
                    }
                    last = f(...args)
                    return last
                }) as F
            }

            this.connectedComponent = reduxConnect<StateProps, DispatchProps, OwnProps, State>(
                memoWithShouldUpdate(this.mapStateToProps),
                this.mapDispatchToProps,
                undefined,
                options.shouldComponentUpdate
                    ? {
                          ...reduxConnectOptions,
                          areStatePropsEqual: wrapWithShouldUpdate(
                              shouldComponentUpdate,
                              reduxConnectOptions.areStatePropsEqual,
                              boundShell
                          ),
                          areOwnPropsEqual: wrapWithShouldUpdate(shouldComponentUpdate, reduxConnectOptions.areOwnPropsEqual, boundShell)
                      }
                    : reduxConnectOptions
            )(component as React.ComponentType<any>) as React.ComponentType<any> // TODO: Fix 'as any'
        }

        public render() {
            const Component = this.connectedComponent
            const props = (_.omit(this.props, 'shell') as unknown) as React.PropsWithChildren<OwnProps> & JSX.IntrinsicAttributes
            return <Component {...props} />
        }
    }

    const wrapChildrenIfNeeded = (props: WithChildren<OwnProps>, originalShell: Shell): WithChildren<OwnProps> =>
        props.children
            ? {
                  ...props,
                  children: <ShellContext.Provider value={originalShell}>{props.children}</ShellContext.Provider>
              }
            : props

    return (props: WithChildren<OwnProps>) => (
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

function wrapWithShellRenderer<OwnProps>(
    boundShell: Shell,
    component: ComponentWithChildrenProps<OwnProps>
): ComponentWithChildrenProps<OwnProps> {
    return (props: WithChildren<OwnProps>) => (boundShell as PrivateShell).wrapWithShellRenderer(component(props))
}

export interface ConnectWithShellOptions {
    readonly componentName?: string
    /**
     * Allow connecting the component outside of Entry Point lifecycle (use only when you really have no choice)
     */
    readonly allowOutOfEntryPoint?: boolean
    /**
     * Update the component only when this function returns true
     */
    shouldComponentUpdate?(shell: Shell): boolean
    /**
     * Wraps the component with host and shell contexts, to allow valid connection outside AppHost
     */
    renderOutsideProvider?: boolean
}

type ComponentWithChildrenProps<OwnProps> = (props: WithChildren<OwnProps>) => JSX.Element

export type ConnectedComponentFactory<State = {}, OwnProps = {}, StateProps = {}, DispatchProps = {}, OwnPropsPure = OwnProps> = (
    component: React.ComponentType<OwnPropsPure & StateProps & DispatchProps>
) => ComponentWithChildrenProps<OwnProps>

/**
 * Connect the component as a subscriber to any state updates
 * @param mapStateToProps - Map the state to component props
 * @param mapDispatchToProps - Map the state dispatch function to component functional props
 * @param boundShell - The connecting shell
 * @param options - Optional extra settings
 */
export function connectWithShell<State = {}, OwnProps = {}, StateProps = {}, DispatchProps = {}>(
    mapStateToProps: MapStateToProps<State, OwnProps, StateProps>,
    mapDispatchToProps: MapDispatchToProps<OwnProps, DispatchProps>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
): ConnectedComponentFactory<State, OwnProps, StateProps, DispatchProps> {
    const validateLifecycle = (component: React.ComponentType<any>) => {
        if (boundShell.wasInitializationCompleted() && !options.allowOutOfEntryPoint) {
            const componentText = component.displayName || component.name || component
            const errorText =
                `connectWithShell(${boundShell.name})(${componentText}): ` +
                'attempt to create component type outside of Entry Point lifecycle. ' +
                'To fix this, call connectWithShell() from Entry Point attach() or extend(). '
            throw new Error(errorText)
        }
    }

    return (component: React.ComponentType<OwnProps & StateProps & DispatchProps>) => {
        validateLifecycle(component)
        const wrappedWithShellContext = wrapWithShellContext(component, mapStateToProps, mapDispatchToProps, boundShell, options)
        if (options.renderOutsideProvider) {
            return wrapWithShellRenderer(boundShell, wrappedWithShellContext)
        }
        return wrappedWithShellContext
    }
}

export interface ObservablesMap {
    [key: string]: ObservableState<any>
}

export type ObservedSelectorsMap<M> = {
    [K in keyof M]: M[K] extends ObservableState<infer S> ? S : undefined
}

export type OmitObservedSelectors<T, M> = Omit<T, keyof M>

function mapObservablesToSelectors<M extends ObservablesMap>(map: M, allowUnsafeReading?: boolean): ObservedSelectorsMap<M> {
    const result = _.mapValues(map, observable => {
        const selector = observable.current(allowUnsafeReading)
        return selector
    })
    return result
}

function createObservableConnectedComponentFactory<
    State,
    MappedObservables extends ObservablesMap,
    OwnProps extends ObservedSelectorsMap<MappedObservables>,
    StateProps,
    DispatchProps,
    ShellStaticProps = {}
>(
    observables: MappedObservables,
    boundShell: Shell,
    mapShellToStaticProps: MapShellToStaticProps<ShellStaticProps, OwnProps>,
    innerFactory?: ConnectedComponentFactory<State, OwnProps, StateProps, DispatchProps>
): ConnectedComponentFactory<State, OmitObservedSelectors<OwnProps, MappedObservables>, StateProps, DispatchProps, OwnProps> {
    type ObservableWrapperProps = OmitObservedSelectors<OwnProps, MappedObservables>
    type ObservableWrapperState = ObservedSelectorsMap<MappedObservables>

    const observableConnectedComponentFactory: ConnectedComponentFactory<
        State,
        ObservableWrapperProps,
        StateProps,
        DispatchProps,
        OwnProps
    > = pureComponent => {
        const ConnectedComponent: React.ComponentType<any> = innerFactory ? innerFactory(pureComponent) : pureComponent

        class ObservableWrapperComponent extends React.Component<ObservableWrapperProps, ObservableWrapperState> {
            public unsubscribes: StateObserverUnsubscribe[]
            public staticShellProps: ShellStaticProps

            constructor(props: OwnProps) {
                super(props)
                this.unsubscribes = []
                this.state = mapObservablesToSelectors(observables, true)
                this.staticShellProps = mapShellToStaticProps ? mapShellToStaticProps(boundShell, props) : ({} as ShellStaticProps)
            }

            public componentDidMount() {
                for (const key in observables) {
                    const unsubscribe = observables[key].subscribe(boundShell, () => {
                        const newState = mapObservablesToSelectors(observables, true)
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
                const connectedComponentProps: OwnProps = {
                    ...this.props, // OP excluding observed selectors
                    ...this.state, // observed selectors
                    ...this.staticShellProps // shell static props
                } as OwnProps // TypeScript doesn't get it
                return <ConnectedComponent {...connectedComponentProps} />
            }
        }

        const hoc = (props: WithChildren<OmitObservedSelectors<OwnProps, MappedObservables>>) => {
            return <ObservableWrapperComponent {...props} {...mapObservablesToSelectors(observables, true)} />
        }

        return hoc
    }

    return observableConnectedComponentFactory
}

export function observeWithShell<
    MappedObservables extends ObservablesMap,
    OwnProps extends ObservedSelectorsMap<MappedObservables>,
    ShellStaticProps = {}
>(
    observables: MappedObservables,
    boundShell: Shell,
    mapShellToStaticProps?: MapShellToStaticProps<ShellStaticProps, OwnProps>
): ConnectedComponentFactory<{}, OmitObservedSelectors<OwnProps, MappedObservables>, ShellStaticProps, {}, OwnProps> {
    return createObservableConnectedComponentFactory(observables, boundShell, mapShellToStaticProps)
}

export function connectWithShellAndObserve<
    MappedObservables extends ObservablesMap,
    OwnProps extends ObservedSelectorsMap<MappedObservables>,
    State = {},
    StateProps = {},
    DispatchProps = {}
>(
    observables: MappedObservables,
    mapStateToProps: MapStateToProps<State, OwnProps, StateProps>,
    mapDispatchToProps: MapDispatchToProps<OwnProps, DispatchProps>,
    boundShell: Shell,
    options: ConnectWithShellOptions = {}
): ConnectedComponentFactory<State, OmitObservedSelectors<OwnProps, MappedObservables>, StateProps, DispatchProps, OwnProps> {
    const innerFactory = connectWithShell(mapStateToProps, mapDispatchToProps, boundShell, options)
    const wrapperFactory = observeConnectedComponentWithShell<MappedObservables, OwnProps>(observables, boundShell)(innerFactory)
    return wrapperFactory
}

function observeConnectedComponentWithShell<
    MappedObservables extends ObservablesMap,
    OwnProps extends ObservedSelectorsMap<MappedObservables>
>(
    observables: MappedObservables,
    boundShell: Shell
): <S, SP, DP>(
    innerFactory: ConnectedComponentFactory<S, OwnProps, SP, DP>
) => ConnectedComponentFactory<S, OmitObservedSelectors<OwnProps, MappedObservables>, SP, DP, OwnProps> {
    return <S, SP, DP>(innerFactory: ConnectedComponentFactory<S, OwnProps, SP, DP>) => {
        return createObservableConnectedComponentFactory(observables, boundShell, undefined, innerFactory)
    }
}
