import _ from 'lodash'
import React, { FunctionComponent, ReactElement, useEffect } from 'react'

import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { AnyAction } from 'redux'
import { ObservedSelectorsMap, observeWithShell } from '../src'
import { AnySlotKey, AppHost, EntryPoint, ObservableState, Shell, SlotKey } from '../src/API'
import {
    collectAllTexts,
    connectWithShell,
    connectWithShellAndObserve,
    createAppHost,
    mockPackage,
    mockShellStateKey,
    MockState,
    renderInHost,
    TOGGLE_MOCK_VALUE,
    withThrowOnError
} from '../testKit'

interface MockPackageState {
    [mockShellStateKey]: MockState
}

const getMockShellState = (host: AppHost) => _.get(host.getStore().getState(), [mockPackage.name], null)
const getValueFromState = (state: MockPackageState) => `${state[mockShellStateKey].mockValue}`

const createMocks = (entryPoint: EntryPoint, moreEntryPoints: EntryPoint[] = []) => {
    let cachedShell: Shell | null = null
    const wrappedPackage: EntryPoint = {
        ...entryPoint,
        attach(shell) {
            _.invoke(entryPoint, 'attach', shell)
            cachedShell = shell
        }
    }

    const host = createAppHost([wrappedPackage, ...moreEntryPoints], withThrowOnError())
    const getShell = () => cachedShell as Shell

    return {
        host,
        shell: getShell(),
        renderInShellContext: (reactElement: ReactElement<any>) => renderInHost(reactElement, host, getShell())
    }
}

const dispatchAndFlush = (action: AnyAction, { getStore }: AppHost) => {
    act(() => {
        getStore().dispatch(action)
        getStore().flush()
    })
}

describe('connectWithShell', () => {
    it('should pass exact shell to mapStateToProps', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapStateToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { parentWrapper } = renderInShellContext(<ConnectedComp />)
        expect(collectAllTexts(parentWrapper)).toContain(mockPackage.name)
    })

    it('should have shell context outside of main view with renderOutsideProvider option', () => {
        const { shell } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div className={'my-wrapper'}>{shellName}</div>
        const mapStateToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            renderOutsideProvider: true,
            allowOutOfEntryPoint: true
        })(PureComp)

        const testKit = create(<ConnectedComp />)
        const node = testKit.root.findByProps({ className: 'my-wrapper' })
        expect(node.children[0]).toEqual(mockPackage.name)
    })

    it('should pass exact shell to mapDispatchToProps', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapDispatchToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(undefined, mapDispatchToProps, shell, { allowOutOfEntryPoint: true })(PureComp)

        const { parentWrapper } = renderInShellContext(<ConnectedComp />)
        expect(collectAllTexts(parentWrapper)).toContain(mockPackage.name)
    })

    it('should optimize props comparison', () => {
        const { host, shell, renderInShellContext } = createMocks(mockPackage)

        type FuncProps = (event: any) => void
        interface CompProps {
            obj: any
            func: FuncProps
        }
        const func1: FuncProps = jest.fn()
        const func2: FuncProps = jest.fn()
        const renderSpy = jest.fn()
        let props = { obj: { a: 1 }, func: func1 }
        const mapStateToProps = () => props

        let counter = 0
        host.getStore().replaceReducer(() => ({
            counter: ++counter
        }))

        const update = (r: ReactTestRenderer, newProps?: CompProps) => {
            if (newProps) {
                props = newProps
            }

            act(() => {
                host.getStore().dispatch({ type: '' })
                host.getStore().flush()
            })
        }

        const PureComp: FunctionComponent<CompProps> = ({ obj, func }) => {
            renderSpy()
            return <div onClick={func}>{JSON.stringify(obj)}</div>
        }

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)

        if (!testKit) {
            throw new Error('Connected component fail to render')
        }

        expect(testKit.root.findByType(ConnectedComp).find(x => typeof x.children[0] === 'string').children[0]).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(testKit, _.cloneDeep(props))
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(testKit, { ...props, obj: { a: 2 } })
        expect(testKit.root.findByType(ConnectedComp).find(x => typeof x.children[0] === 'string').children[0]).toBe('{"a":2}')
        expect(renderSpy).toHaveBeenCalledTimes(2)

        update(testKit, { ...props, func: func2 })
        testKit.root
            .findByType(PureComp)
            .find(x => x.type === 'div')
            .props.onClick()
        expect(renderSpy).toHaveBeenCalledTimes(2)
        expect(func1).toHaveBeenCalled()
        expect(func2).not.toHaveBeenCalled()
    })

    it('should avoid mapping state with should update', () => {
        const { host, shell, renderInShellContext } = createMocks(mockPackage)

        type FuncProps = (event: any) => void
        interface CompProps {
            obj: any
            func: FuncProps
        }
        const func1: FuncProps = jest.fn()
        const func2: FuncProps = jest.fn()
        const renderSpy = jest.fn()
        const mapStateSpy = jest.fn()
        let props = { obj: { a: 1 }, func: func1 }
        const mapStateToProps = () => {
            mapStateSpy()
            return props
        }

        let counter = 0
        host.getStore().replaceReducer(() => ({
            counter: ++counter
        }))

        const update = (r: ReactTestRenderer, newProps?: CompProps) => {
            if (newProps) {
                props = newProps
            }

            act(() => {
                host.getStore().dispatch({ type: '' })
                host.getStore().flush()
            })
        }

        const PureComp: FunctionComponent<CompProps> = ({ obj, func }) => {
            renderSpy()
            return <div onClick={func}>{JSON.stringify(obj)}</div>
        }

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            shouldComponentUpdate: () => false,
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)

        if (!testKit) {
            throw new Error('Connected component fail to render')
        }

        expect(testKit.root.findByType(ConnectedComp).find(x => typeof x.children[0] === 'string').children[0]).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)

        update(testKit, _.cloneDeep(props))
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)

        update(testKit, { ...props, obj: { a: 2 } })
        expect(testKit.root.findByType(ConnectedComp).find(x => typeof x.children[0] === 'string').children[0]).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)

        update(testKit, { ...props, func: func2 })
        testKit.root
            .findByType(PureComp)
            .find(x => x.type === 'div')
            .props.onClick()
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)
        expect(func1).toHaveBeenCalled()
        expect(func2).not.toHaveBeenCalled()
    })

    it('should pass ownProps to shouldComponentUpdate', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        interface CompOwnProps {
            ownProp: boolean
        }
        const ownPropsSpy = jest.fn()
        const PureComp: FunctionComponent<CompOwnProps> = () => {
            return <div>Pure Comp</div>
        }

        const ConnectedComp = connectWithShell<{}, CompOwnProps>(undefined, undefined, shell, {
            shouldComponentUpdate: (_shell, _ownProps) => {
                ownPropsSpy(_ownProps)

                return false
            },
            allowOutOfEntryPoint: true
        })(PureComp)

        renderInShellContext(<ConnectedComp ownProp={true} />)

        expect(ownPropsSpy).toHaveBeenCalledTimes(1)
        expect(ownPropsSpy).toHaveBeenCalledWith({ ownProp: true })
    })

    describe('arePropsEqualFuncWrapper', () => {
        interface InnerCompDispatchProps {
            onClick(): void
        }
        interface InnerCompOwnProps {
            num: number
        }
        type InnerCompProps = InnerCompOwnProps & InnerCompDispatchProps
        interface OuterCompStateProps {
            num: number
            str: string
        }
        type OuterCompProps = OuterCompStateProps

        // spies
        let mapDispatchInnerCompSpy: jest.Mock
        let innerComponentRender: jest.Mock
        let mapStateOuterCompSpy: jest.Mock
        let outerComponentRenderSpy: jest.Mock
        let innerCompOnClickSpy: jest.Mock
        let innerCompShouldComponentUpdateSpy: jest.Mock

        // action helpers
        let shouldUpdateInnerComp: boolean
        let updateOuterComp: (newStateProps: OuterCompStateProps) => void

        // assertion helpers
        let getInnerCompText: () => ReactTestInstance | string
        let invokeInnerCompOnClick: () => void

        beforeEach(() => {
            const { host, shell, renderInShellContext } = createMocks(mockPackage)

            // Setup - create connected inner Component
            innerComponentRender = jest.fn()
            mapDispatchInnerCompSpy = jest.fn()
            shouldUpdateInnerComp = false
            innerCompOnClickSpy = jest.fn(num => {})
            innerCompShouldComponentUpdateSpy = jest.fn((ownProps: InnerCompOwnProps) => {})

            const mapDispatchToProps = (shell: Shell, state: unknown, ownProps?: InnerCompOwnProps): InnerCompDispatchProps => {
                mapDispatchInnerCompSpy()
                return {
                    onClick: () => innerCompOnClickSpy(ownProps?.num || 0)
                }
            }

            const PureInnerComp: FunctionComponent<InnerCompProps> = ({ num, onClick }) => {
                innerComponentRender()
                return <div onClick={onClick}>{num.toString()}</div>
            }

            const ConnectedInnerComp = connectWithShell(undefined, mapDispatchToProps, shell, {
                shouldComponentUpdate: (shell, nextOwnProps) => {
                    innerCompShouldComponentUpdateSpy(nextOwnProps)
                    return shouldUpdateInnerComp
                },
                allowOutOfEntryPoint: true
            })(PureInnerComp)

            // Setup - create connected outer Component
            mapStateOuterCompSpy = jest.fn()
            outerComponentRenderSpy = jest.fn()

            let stateProps: OuterCompStateProps = { num: 1, str: 'initialState' }
            const mapStateToProps = (): OuterCompStateProps => {
                mapStateOuterCompSpy()
                return stateProps
            }

            const PureOuterComp: FunctionComponent<OuterCompProps> = ({ num }) => {
                outerComponentRenderSpy()
                return <ConnectedInnerComp num={num} />
            }

            const ConnectedOuterComp = connectWithShell(mapStateToProps, undefined, shell, {
                allowOutOfEntryPoint: true
            })(PureOuterComp)

            updateOuterComp = (newStateProps: OuterCompStateProps) => {
                stateProps = newStateProps

                act(() => {
                    host.getStore().dispatch({ type: '' })
                    host.getStore().flush()
                })
            }

            // SetUp - use a reducer that creates a new state for any dispatched action
            let counter = 0
            host.getStore().replaceReducer(() => ({
                counter: ++counter
            }))

            // Setup - render outer component
            const { testKit } = renderInShellContext(<ConnectedOuterComp />)

            if (!testKit) {
                throw new Error('Connected component fail to render')
            }

            // create assertion helpers
            getInnerCompText = () => testKit.root.findByType(ConnectedInnerComp).find(x => typeof x.children[0] === 'string').children[0]
            invokeInnerCompOnClick = () =>
                testKit.root
                    .findByType(PureInnerComp)
                    .find(x => x.type === 'div')
                    .props.onClick()
        })
        it('should execute mapDispatchToProps, mapStateToProps, and render for both components during mount phase', () => {
            // Assert initial execution of mapping functions and components render
            expect(mapStateOuterCompSpy).toHaveBeenCalledTimes(1)
            expect(outerComponentRenderSpy).toHaveBeenCalledTimes(1)
            expect(mapDispatchInnerCompSpy).toHaveBeenCalledTimes(1)
            expect(innerComponentRender).toHaveBeenCalledTimes(1)
            expect(getInnerCompText()).toBe('1')
            invokeInnerCompOnClick()
            expect(innerCompOnClickSpy).toHaveBeenCalledWith(1)
        })
        it('should not trigger mapDispatchToProps or re-render the inner component when ownProps change while updates are blocked for the inner component', () => {
            // Act - update outer component, while updates for inner component are blocked
            updateOuterComp({ num: 2, str: 'nextState_1' })

            // Assert - outer component re-rendered and passed new ownProps to inner component
            expect(mapStateOuterCompSpy).toHaveBeenCalledTimes(2)
            expect(outerComponentRenderSpy).toHaveBeenCalledTimes(2)
            expect(innerCompShouldComponentUpdateSpy).toHaveBeenCalledWith({
                num: 2
            })

            // Assert - should not trigger mapDispatchToProps or re-render of inner component even though it's ownProps have changed
            expect(mapDispatchInnerCompSpy).toHaveBeenCalledTimes(1)
            expect(innerComponentRender).toHaveBeenCalledTimes(1)
        })
        it('should trigger recalculation of mergedProps with consideration of ownProps change once updates are permitted', () => {
            // Act - update outer component, while updates for inner component are blocked
            updateOuterComp({ num: 2, str: 'nextState_1' })

            // Act - allow updates for inner component, then update outer component
            shouldUpdateInnerComp = true
            updateOuterComp({ num: 2, str: 'nextState_2' })

            // Assert - mapDispatchToProps and re-render of inner component were triggered
            expect(mapDispatchInnerCompSpy).toHaveBeenCalledTimes(2)
            expect(innerComponentRender).toHaveBeenCalledTimes(2)
            expect(getInnerCompText()).toBe('2')
            invokeInnerCompOnClick()
            expect(innerCompOnClickSpy).toHaveBeenCalledWith(2)
        })
    })

    it('should pass scoped state to mapStateToProps', () => {
        const { host, shell, renderInShellContext } = createMocks(mockPackage)

        const PureCompNeedsState = ({ valueFromState }: { valueFromState: string }) => <div>{valueFromState}</div>
        const mapStateToProps = (s: Shell, state: MockPackageState) => ({
            valueFromState: getValueFromState(state)
        })

        const ConnectedWithState = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureCompNeedsState)

        const { parentWrapper } = renderInShellContext(<ConnectedWithState />)
        expect(collectAllTexts(parentWrapper)).toContain(getValueFromState(getMockShellState(host)))
    })

    it('should bind shell context', async () => {
        const { host, renderInShellContext } = createMocks(mockPackage)

        let cachedBoundShell: Shell | null = null
        const boundShellState = { mockValue: 'bound-value' }
        const otherEntryPoint: EntryPoint = {
            name: 'bound',
            attach(shell) {
                shell.contributeState(() => ({
                    [mockShellStateKey]: () => boundShellState
                }))
                cachedBoundShell = shell
            }
        }
        const getBoundShell = () => cachedBoundShell as Shell

        await host.addShells([otherEntryPoint])

        const PureComp = ({ value }: { value: string }) => <div>{value}</div>
        const mapStateToProps = (shell: Shell, state: MockPackageState) => ({
            value: getValueFromState(state)
        })

        const ConnectedWithState = connectWithShell(mapStateToProps, undefined, getBoundShell(), { allowOutOfEntryPoint: true })(PureComp)

        const { parentWrapper } = renderInShellContext(<ConnectedWithState />)
        expect(collectAllTexts(parentWrapper)).toContain(boundShellState.mockValue)
    })

    it('should re-provide shell context for children of bound component', async () => {
        const { host, shell, renderInShellContext } = createMocks(mockPackage)

        let cachedBoundShell: Shell | null = null
        const boundShellState = { mockValue: 'bound-value' }
        const otherEntryPoint: EntryPoint = {
            name: 'bound',
            attach(s) {
                s.contributeState(() => ({
                    [mockShellStateKey]: () => boundShellState
                }))
                cachedBoundShell = s
            }
        }
        const getBoundShell = () => cachedBoundShell as Shell

        await host.addShells([otherEntryPoint])

        const PureComp = ({ value }: { value: string }) => <div>{value}</div>
        interface PureCompWithChildrenOwnProps {
            children?: React.ReactNode
            id: string
        }
        interface PureCompWithChildrenStateProps {
            value: string
        }
        type PureCompWithChildrenProps = PureCompWithChildrenOwnProps & PureCompWithChildrenStateProps

        const PureCompWithChildren: FunctionComponent<PureCompWithChildrenProps> = ({ children, value, id }) => (
            <div className={id} data-value={value}>
                {children}
            </div>
        )
        const mapStateToProps = (s: Shell, state: MockPackageState) => ({
            value: getValueFromState(state)
        })

        const ConnectedUnboundComp = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

        const ConnectedUnboundCompWithChildren = connectWithShell<
            MockPackageState,
            PureCompWithChildrenOwnProps,
            PureCompWithChildrenStateProps
        >(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureCompWithChildren)

        const ConnectedBoundCompWithChildren = connectWithShell<
            MockPackageState,
            PureCompWithChildrenOwnProps,
            PureCompWithChildrenStateProps
        >(mapStateToProps, undefined, getBoundShell(), {
            allowOutOfEntryPoint: true
        })(PureCompWithChildren)

        const { testKit } = renderInShellContext(
            <ConnectedUnboundCompWithChildren id="A">
                <ConnectedBoundCompWithChildren id="B">
                    <ConnectedUnboundComp />
                </ConnectedBoundCompWithChildren>
            </ConnectedUnboundCompWithChildren>
        )

        expect(testKit.root.findByProps({ className: 'A' }).props['data-value']).toBe(getValueFromState(getMockShellState(host)))
        expect(testKit.root.findByProps({ className: 'B' }).props['data-value']).toBe(boundShellState.mockValue)
        expect(collectAllTexts(testKit.root)).toContain(getValueFromState(getMockShellState(host)))
    })

    it('should render contributed boundary aspect', () => {
        // arrange
        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT">{props.children}</div>)
            }
        })
        const PureComp: FunctionComponent<{}> = () => <div className="TEST-PURE-COMP">TEST</div>
        const ConnectedComp = connectWithShell(undefined, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        // act
        const { testKit } = renderInHost(<ConnectedComp />, host, shell)

        // assert
        expect(testKit.root.findAllByProps({ className: 'TEST-ASPECT' }).length).toBe(1)
        expect(testKit.root.findAllByProps({ className: 'TEST-PURE-COMP' }).length).toBe(1)
    })

    it('should render multiple contributed boundary aspects', () => {
        // arrange

        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT-A">{props.children}</div>)
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT-B">{props.children}</div>)
            }
        })
        const PureComp: FunctionComponent<{}> = () => <div className="TEST-PURE-COMP">TEST</div>
        const ConnectedComp = connectWithShell(undefined, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        // act

        const { testKit } = renderInHost(<ConnectedComp />, host, shell)

        // assert
        expect(testKit.root.findAllByProps({ className: 'TEST-ASPECT-A' }).length).toBe(1)
        expect(testKit.root.findAllByProps({ className: 'TEST-ASPECT-B' }).length).toBe(1)
        expect(testKit.root.findAllByProps({ className: 'TEST-PURE-COMP' }).length).toBe(1)
    })

    it('should handle boundary aspect contexts', () => {
        // arrange

        const TestAspectContext = React.createContext({ theNumber: 0 })

        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => (
                    <div className="TEST-ASPECT">
                        <TestAspectContext.Provider value={{ theNumber: 123 }}>{props.children}</TestAspectContext.Provider>
                    </div>
                ))
            }
        })
        const PureComp: FunctionComponent<{}> = () => (
            <TestAspectContext.Consumer>{aspect => <div className="TEST-PURE-COMP">{aspect.theNumber}</div>}</TestAspectContext.Consumer>
        )
        const ConnectedComp = connectWithShell(undefined, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        // act

        const { testKit } = renderInHost(<ConnectedComp />, host, shell)

        // assert
        expect(testKit.root.findAllByProps({ className: 'TEST-PURE-COMP' }).length).toBe(1)
        expect(collectAllTexts(testKit.root)).toContain('123')
    })
})

describe('connectWithShell-useCases', () => {
    interface FirstState {
        firstState: { valueOne: string }
    }
    interface SecondState {
        secondState: { valueTwo: string }
    }
    interface FirstObservableState {
        firstObservable: { valueThree: string }
    }
    interface SecondObservableState {
        secondObservable: { valueFour: string }
    }

    interface SecondStateAPI {
        getValueTwo(): string
    }
    const SecondStateAPI: SlotKey<SecondStateAPI> = {
        name: 'TWO_API',
        public: true
    }

    interface FirstObservableAPI {
        observables: { three: ObservableState<FirstObservableSelectors> }
    }
    interface FirstObservableSelectors {
        getValueThree(): string
    }
    const FirstObservableAPI: SlotKey<FirstObservableAPI> = {
        name: 'THREE_API',
        public: true
    }

    interface SecondObservableAPI {
        observables: { four: ObservableState<SecondObservableSelectors> }
    }
    interface SecondObservableSelectors {
        getValueFour(): string
    }
    const SecondObservableAPI: SlotKey<SecondObservableAPI> = {
        name: 'FOUR_API',
        public: true
    }

    const entryPointWithState: EntryPoint = {
        name: 'ONE',
        getDependencyAPIs: () => [SecondStateAPI],
        attach(shell) {
            shell.contributeState<FirstState>(() => ({
                firstState: (state = { valueOne: 'init1' }, action) => {
                    return action.type === 'SET_FIRST_STATE' ? { valueOne: action.value } : state
                }
            }))
        }
    }

    const entryPointSecondStateWithAPI: EntryPoint = {
        name: 'TWO',
        declareAPIs: () => [SecondStateAPI],
        attach(shell) {
            shell.contributeState<SecondState>(() => ({
                secondState: (state = { valueTwo: 'init2' }, action) => {
                    return action.type === 'SET_SECOND_STATE' ? { valueTwo: action.value } : state
                }
            }))
            shell.contributeAPI(SecondStateAPI, () => ({
                getValueTwo() {
                    return shell.getStore<SecondState>().getState().secondState.valueTwo
                }
            }))
        }
    }

    const entryPointFirstObservable: EntryPoint = {
        name: 'THREE',
        declareAPIs: () => [FirstObservableAPI],
        attach(shell) {
            const observableThree = shell.contributeObservableState<FirstObservableState, FirstObservableSelectors>(
                () => ({
                    firstObservable: (state = { valueThree: 'init3' }, action) => {
                        return action.type === 'SET_FIRST_OBSERVABLE' ? { valueThree: action.value } : state
                    }
                }),
                state => {
                    return {
                        getValueThree: () => state.firstObservable.valueThree
                    }
                }
            )
            shell.contributeAPI(FirstObservableAPI, () => ({
                observables: {
                    three: observableThree
                }
            }))
        }
    }

    const entryPointSecondObservable: EntryPoint = {
        name: 'Four',
        declareAPIs: () => [SecondObservableAPI],
        attach(shell) {
            const observableFour = shell.contributeObservableState<SecondObservableState, SecondObservableSelectors>(
                () => ({
                    secondObservable: (state = { valueFour: 'init4' }, action) => {
                        return action.type === 'SET_SECOND_OBSERVABLE' ? { valueFour: action.value } : state
                    }
                }),
                state => {
                    return {
                        getValueFour: () => state.secondObservable.valueFour
                    }
                }
            )
            shell.contributeAPI(SecondObservableAPI, () => ({
                observables: {
                    four: observableFour
                }
            }))
        }
    }

    const withDependencyAPIs = (ep: EntryPoint, deps: AnySlotKey[]): EntryPoint => {
        return {
            ...ep,
            getDependencyAPIs: () => (ep.getDependencyAPIs ? [...ep.getDependencyAPIs(), ...deps] : deps)
        }
    }

    interface CompProps {
        valueOne: string
        valueTwo: string
        valueThree: string
    }

    const renderSpy = jest.fn()
    const mountSpy = jest.fn()
    const mapStateToPropsSpy = jest.fn()

    const PureComp: FunctionComponent<CompProps> = ({ valueOne, valueTwo, valueThree }) => {
        useEffect(() => {
            mountSpy()
        }, [])
        renderSpy()
        return (
            <div>
                <div className="ONE">{valueOne}</div>
                <div className="TWO">{valueTwo}</div>
                <div className="THREE">{valueThree}</div>
            </div>
        )
    }
    const mapStateToProps = (shell: Shell, state: FirstState): CompProps => {
        mapStateToPropsSpy()
        return {
            valueOne: state.firstState.valueOne,
            valueTwo: shell.getAPI(SecondStateAPI).getValueTwo(),
            valueThree: ''
        }
    }

    const getComponentValueByClassName = (className: string, testKit: ReactTestRenderer) =>
        testKit.root.findByProps({ className }).children[0]

    beforeEach(() => {
        renderSpy.mockClear()
        mapStateToPropsSpy.mockClear()
        mountSpy.mockClear()
    })

    it('should include observable state in store', () => {
        const { shell } = createMocks(entryPointFirstObservable)

        const state = shell.getStore<FirstObservableState>().getState()

        expect(state).toBeDefined()
        expect(state.firstObservable.valueThree).toBe('init3')
    })

    it('should dispatch actions to observable reducers', () => {
        const { shell } = createMocks(entryPointFirstObservable)

        shell.getStore<FirstObservableState>().dispatch({ type: 'SET_FIRST_OBSERVABLE', value: 'updated_by_test' })

        const state = shell.getStore<FirstObservableState>().getState()
        expect(state.firstObservable.valueThree).toEqual('updated_by_test')
    })

    it('should invoke subscribed callback when observed state changes', () => {
        const { shell } = createMocks(entryPointFirstObservable)

        const receivedSelectors: FirstObservableSelectors[] = []
        shell.getAPI(FirstObservableAPI).observables.three.subscribe(shell, next => {
            receivedSelectors.push(next)
        })

        const { dispatch, flush } = shell.getStore<FirstObservableState>()
        dispatch({ type: 'SET_FIRST_OBSERVABLE', value: 'updated_by_test' })
        flush()

        expect(receivedSelectors.length).toBe(1)
        expect(receivedSelectors[0].getValueThree()).toBe('updated_by_test')
    })

    it('should get correct value for having pending subscribers', () => {
        const { host } = createMocks(mockPackage)
        const { dispatch, flush, hasPendingSubscribers } = host.getStore()

        expect(hasPendingSubscribers()).toBe(false)
        dispatch({ type: TOGGLE_MOCK_VALUE })
        expect(hasPendingSubscribers()).toBe(true)
        flush()
        expect(hasPendingSubscribers()).toBe(false)
    })

    it('should not notify subscribers when deferring notifications', async () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(getComponentValueByClassName('ONE', testKit)).toBe('init1')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        let valueOneWhileDeferring

        await act(async () => {
            await host.getStore().deferSubscriberNotifications(() => {
                dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)
                valueOneWhileDeferring = getComponentValueByClassName('ONE', testKit)
            })
        })

        expect(valueOneWhileDeferring).toBe('init1')
        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it('should not have pending subscribers when starting to defer notifications', async () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        let hasPendingSubscribersWhileDeferring
        await act(async () => {
            host.getStore().dispatch({ type: 'SET_FIRST_STATE', value: 'update1' })
            await host.getStore().deferSubscriberNotifications(() => {
                hasPendingSubscribersWhileDeferring = shell.getStore().hasPendingSubscribers()
            })
        })

        expect(hasPendingSubscribersWhileDeferring).toBe(false)
    })

    it('should notify subscribers of state changes before deferring notifications', async () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)

        await act(async () => {
            host.getStore().dispatch({ type: 'SET_FIRST_STATE', value: 'update1' })
            await host.getStore().deferSubscriberNotifications(() => {
                expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
            })
        })
    })

    it('should notify after action failed while deferring notifications', async () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(getComponentValueByClassName('ONE', testKit)).toBe('init1')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        try {
            await act(async () => {
                await host.getStore().deferSubscriberNotifications(() => {
                    dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)
                    throw new Error('test error')
                })
            })
        } catch (e) {}

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it('should flush while deferring notifications if immediate flush was called during that action', async () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        let valueOneWhileDeferring

        await host.getStore().deferSubscriberNotifications(() => {
            act(() => {
                host.getStore().dispatch({ type: 'SET_FIRST_STATE', value: 'update1' })
                host.getStore().flush({ excecutionType: 'immediate' })
            })
            valueOneWhileDeferring = getComponentValueByClassName('ONE', testKit)
        })

        expect(valueOneWhileDeferring).toEqual('update1')
    })

    it('should support nested defered notification actions', async () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(getComponentValueByClassName('ONE', testKit)).toBe('init1')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)
        let valueOneInOuterDeferNotifications
        let valueOneInInnerDeferNotifications

        await act(async () => {
            await host.getStore().deferSubscriberNotifications(async () => {
                dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update from outer' }, host)
                await host.getStore().deferSubscriberNotifications(() => {
                    dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update from inner' }, host)
                    valueOneInInnerDeferNotifications = getComponentValueByClassName('ONE', testKit)
                })
                valueOneInOuterDeferNotifications = getComponentValueByClassName('ONE', testKit)
            })
        })

        expect(valueOneInInnerDeferNotifications).toBe('init1')
        expect(valueOneInOuterDeferNotifications).toBe('init1')
        expect(getComponentValueByClassName('ONE', testKit)).toBe('update from inner')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it('should clear state memoization on dispatch when deferring notifications and setting shouldDispatchClearCache', async () => {
        const { host, shell } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        let numberOfCalls = 0
        const originalFn = jest.fn(() => ++numberOfCalls)
        const memoizedFn = shell.memoizeForState(originalFn, () => '*') as _.MemoizedFunction
        const clearCacheSpy = jest.spyOn(memoizedFn.cache, 'clear')

        await host.getStore().deferSubscriberNotifications(() => {
            host.getStore().dispatch({ type: 'MOCK' })
        }, true)

        expect(clearCacheSpy).toHaveBeenCalledTimes(1)
    })

    it('should not clear state memoization on dispatch when deferring notifications without setting shouldDispatchClearCache', async () => {
        const { host, shell } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        let numberOfCalls = 0
        const originalFn = jest.fn(() => ++numberOfCalls)
        const memoizedFn = shell.memoizeForState(originalFn, () => '*') as _.MemoizedFunction
        const clearCacheSpy = jest.spyOn(memoizedFn.cache, 'clear')

        await host.getStore().deferSubscriberNotifications(() => {
            host.getStore().dispatch({ type: 'MOCK' })
        })

        expect(clearCacheSpy).toHaveBeenCalledTimes(0)
    })

    it('should not mount connected component on props update', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)
        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mountSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(renderSpy).toHaveBeenCalledTimes(2)
        expect(mountSpy).toHaveBeenCalledTimes(1)
    })

    it('should update component on change in regular state', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(getComponentValueByClassName('ONE', testKit)).toBe('init1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        dispatchAndFlush({ type: 'SET_SECOND_STATE', value: 'update2' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('update2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)

        dispatchAndFlush({ type: 'SOME_OTHER_ACTION' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('update2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should not update uninterested component on change in observable state', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [
            entryPointSecondStateWithAPI,
            entryPointFirstObservable
        ])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            allowOutOfEntryPoint: true
        })(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(getComponentValueByClassName('ONE', testKit)).toBe('init1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        // this should not notify the uninterested component
        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: 'update3' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it('should update component through observer', () => {
        const { host, shell, renderInShellContext } = createMocks(withDependencyAPIs(entryPointWithState, [FirstObservableAPI]), [
            entryPointSecondStateWithAPI,
            entryPointFirstObservable
        ])

        const ConnectedComp = connectWithShellAndObserve(
            {
                observedThree: host.getAPI(FirstObservableAPI).observables.three
            },
            (_shell, state: FirstState, ownProps): CompProps => {
                mapStateToPropsSpy()
                return {
                    valueOne: state.firstState.valueOne,
                    valueTwo: _shell.getAPI(SecondStateAPI).getValueTwo(),
                    valueThree: ownProps?.observedThree.getValueThree() || 'N/A'
                }
            },
            undefined,
            shell,
            { allowOutOfEntryPoint: true }
        )(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(getComponentValueByClassName('ONE', testKit)).toBe('init1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(getComponentValueByClassName('THREE', testKit)).toBe('init3')

        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(getComponentValueByClassName('THREE', testKit)).toBe('init3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: 'update3' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(getComponentValueByClassName('THREE', testKit)).toBe('update3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)

        dispatchAndFlush({ type: 'SOME_OTHER_ACTION' }, host)

        expect(getComponentValueByClassName('ONE', testKit)).toBe('update1')
        expect(getComponentValueByClassName('TWO', testKit)).toBe('init2')
        expect(getComponentValueByClassName('THREE', testKit)).toBe('update3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should throw if observable is read in store subscription', () => {
        const { host, shell, renderInShellContext } = createMocks(withDependencyAPIs(entryPointSecondStateWithAPI, [FirstObservableAPI]), [
            entryPointFirstObservable
        ])

        const throwSpy = jest.fn()

        const ConnectedComp = connectWithShellAndObserve(
            {
                observedThree: host.getAPI(FirstObservableAPI).observables.three
            },
            (_shell, state: FirstState, ownProps): CompProps => {
                let valueThree = 'three'
                try {
                    valueThree = _shell.getAPI(FirstObservableAPI).observables.three.current().getValueThree()
                } catch (e) {
                    throwSpy(e)
                }
                return {
                    valueOne: 'one',
                    valueTwo: 'two',
                    valueThree
                }
            },
            undefined,
            shell,
            { allowOutOfEntryPoint: true }
        )(PureComp)

        const { testKit } = renderInShellContext(<ConnectedComp />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(throwSpy).toHaveBeenCalledTimes(0)

        dispatchAndFlush({ type: 'SET_SECOND_STATE', value: 'update2' }, host)
        expect(throwSpy).toHaveBeenCalledTimes(1)
    })

    it('should update only the relevant observing components', () => {
        const { host, shell, renderInShellContext } = createMocks(withDependencyAPIs(entryPointFirstObservable, [SecondObservableAPI]), [
            entryPointSecondObservable
        ])

        const firstMapStateToPropsSpy = jest.fn()
        const FirstConnectedComp = connectWithShellAndObserve(
            {
                observedThree: host.getAPI(FirstObservableAPI).observables.three
            },
            (_shell, state, ownProps): CompProps => {
                firstMapStateToPropsSpy()
                return {
                    valueOne: 'one',
                    valueTwo: 'two',
                    valueThree: ownProps?.observedThree.getValueThree() || 'N/A'
                }
            },
            undefined,
            shell,
            { allowOutOfEntryPoint: true }
        )(PureComp)

        const secondMapStateToPropsSpy = jest.fn()
        const SecondConnectedComp = connectWithShellAndObserve(
            {
                observedFour: host.getAPI(SecondObservableAPI).observables.four
            },
            (_shell, state, ownProps): CompProps => {
                secondMapStateToPropsSpy()
                return {
                    valueOne: 'one',
                    valueTwo: 'two',
                    valueThree: ownProps?.observedFour.getValueFour() || 'N/A'
                }
            },
            undefined,
            shell,
            { allowOutOfEntryPoint: true }
        )(PureComp)

        const { testKit } = renderInShellContext(
            <>
                <FirstConnectedComp />
                <SecondConnectedComp />
            </>
        )
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        let nodes = testKit.root.findAllByProps({ className: 'THREE' })
        expect(nodes[0].children[0]).toBe('init3')
        expect(nodes[1].children[0]).toBe('init4')

        expect(firstMapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(secondMapStateToPropsSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: 'update3' }, host)

        nodes = testKit.root.findAllByProps({ className: 'THREE' })
        expect(nodes[0].children[0]).toBe('update3')
        expect(nodes[1].children[0]).toBe('init4')

        expect(firstMapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(secondMapStateToPropsSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_SECOND_OBSERVABLE', value: 'update4' }, host)

        nodes = testKit.root.findAllByProps({ className: 'THREE' })
        expect(nodes[0].children[0]).toBe('update3')
        expect(nodes[1].children[0]).toBe('update4')

        expect(firstMapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(secondMapStateToPropsSpy).toHaveBeenCalledTimes(2)
    })
})

describe('observeWithShellPureComponent', () => {
    interface ObservableAPI {
        observable: ObservableState<ObservableAPISelectors>
    }
    interface ObservableAPISelectors {
        getStringValue(): string
        getNumberValue(): number
    }
    const ObservableAPI: SlotKey<ObservableAPI> = {
        name: 'OBSERVABLE_API',
        public: true
    }
    interface ActualObservableState {
        stringValue: string
        numberValue: number
    }

    const observableEntryPoint: EntryPoint = {
        name: 'ObservableEntryPoint',
        declareAPIs: () => [ObservableAPI],
        attach(shell) {
            const observableState = shell.contributeObservableState<ActualObservableState, ObservableAPISelectors>(
                () => ({
                    stringValue: (state = 'init', action) => {
                        return action.type === 'SET_STRING' ? action.value : state
                    },
                    numberValue: (state = 1, action) => {
                        return action.type === 'SET_NUMBER' ? action.value : state
                    }
                }),
                state => {
                    return {
                        getStringValue: () => state.stringValue,
                        getNumberValue: () => state.numberValue
                    }
                }
            )
            shell.contributeAPI(ObservableAPI, () => ({
                observable: observableState
            }))
        }
    }

    const renderSpyFunc = jest.fn()

    const ComponentToObserve: FunctionComponent<ObservedSelectorsMap<ObservableAPI>> = props => {
        renderSpyFunc()
        return (
            <div>
                <div id="OBSERVED_NUMBER">{props.observable.getNumberValue()}</div>
                <div id="OBSERVED_STRING">{props.observable.getStringValue()}</div>
            </div>
        )
    }

    beforeEach(() => {
        renderSpyFunc.mockClear()
    })

    it('should not render observing component on state update', () => {
        interface TestState {
            stateValue: string
        }
        const stateEntryPoint: EntryPoint = {
            name: 'STATE_ENTRY_POINT',
            attach(stateShell) {
                stateShell.contributeState<TestState>(() => ({
                    stateValue: (state = 'stateInit', action) => {
                        return action.type === 'SET_STATE_VALUE' ? action.value : state
                    }
                }))
            }
        }

        const { host, shell, renderInShellContext } = createMocks(observableEntryPoint, [stateEntryPoint])

        const ObservingComponent = observeWithShell(
            {
                observable: host.getAPI(ObservableAPI).observable
            },
            shell
        )(ComponentToObserve)

        const { testKit } = renderInShellContext(<ObservingComponent />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(renderSpyFunc).toHaveBeenCalledTimes(1)

        host.getStore().dispatch({ type: 'SET_STATE_VALUE', value: 'newValue' })

        expect(renderSpyFunc).toHaveBeenCalledTimes(1)
    })

    it('should update observing component', () => {
        const { host, shell, renderInShellContext } = createMocks(observableEntryPoint)

        const ObservingComponent = observeWithShell(
            {
                observable: host.getAPI(ObservableAPI).observable
            },
            shell
        )(ComponentToObserve)

        const { testKit } = renderInShellContext(<ObservingComponent />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        expect(testKit.root.findByProps({ id: 'OBSERVED_NUMBER' }).children[0]).toBe('1')
        expect(testKit.root.findByProps({ id: 'OBSERVED_STRING' }).children[0]).toBe('init')

        expect(renderSpyFunc).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_STRING', value: 'update' }, host)

        expect(testKit.root.findByProps({ id: 'OBSERVED_NUMBER' }).children[0]).toBe('1')
        expect(testKit.root.findByProps({ id: 'OBSERVED_STRING' }).children[0]).toBe('update')

        expect(renderSpyFunc).toHaveBeenCalledTimes(2)

        dispatchAndFlush({ type: 'SET_NUMBER', value: '2' }, host)

        expect(testKit.root.findByProps({ id: 'OBSERVED_NUMBER' }).children[0]).toBe('2')
        expect(testKit.root.findByProps({ id: 'OBSERVED_STRING' }).children[0]).toBe('update')

        expect(renderSpyFunc).toHaveBeenCalledTimes(3)
    })

    it('should add props using mapShellToStaticProps', () => {
        interface MyAPI {
            myFunction(num: number): void
        }
        const MyAPI: SlotKey<MyAPI> = { name: 'MY API', public: true }
        const myFunctionSpy = jest.fn()

        const myAPIEntryPoint: EntryPoint = {
            name: 'My API Entry Point',
            getDependencyAPIs: () => [ObservableAPI],
            declareAPIs: () => [MyAPI],
            attach(boundShell) {
                boundShell.contributeAPI(MyAPI, () => ({
                    myFunction: num => {
                        myFunctionSpy(num)
                    }
                }))
            }
        }

        interface ComponentShellStaticProps {
            onClick(num: number): void
        }
        type ComponentProps = ObservedSelectorsMap<ObservableAPI> & ComponentShellStaticProps

        const PureComponent: FunctionComponent<ComponentProps> = props => {
            return (
                <div>
                    <button onClick={() => props.onClick(props.observable.getNumberValue())} />
                </div>
            )
        }

        const { host, shell, renderInShellContext } = createMocks(myAPIEntryPoint, [observableEntryPoint])

        const ObservingComponent = observeWithShell<
            { observable: ObservableState<ObservableAPISelectors> },
            ObservedSelectorsMap<ObservableAPI>,
            ComponentShellStaticProps
        >(
            {
                observable: host.getAPI(ObservableAPI).observable
            },
            shell,
            (funcShell, ownProps?: ObservedSelectorsMap<ObservableAPI>): ComponentShellStaticProps => {
                const myAPI = funcShell.getAPI(MyAPI)
                return {
                    onClick: (num: number) => {
                        myAPI.myFunction(num)
                    }
                }
            }
        )(PureComponent)

        const { testKit } = renderInShellContext(<ObservingComponent />)
        if (!testKit) {
            throw new Error('Connected component failed to render')
        }

        testKit.root.findByType('button').props.onClick()
        expect(myFunctionSpy).toHaveBeenCalledWith(1)

        dispatchAndFlush({ type: 'SET_NUMBER', value: 2 }, host)
        testKit.root.findByType('button').props.onClick()
        expect(myFunctionSpy).toHaveBeenCalledWith(2)
    })
})
