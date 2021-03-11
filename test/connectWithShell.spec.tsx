import _ from 'lodash'
import React, { FunctionComponent, ReactElement } from 'react'

import { AppHost, EntryPoint, Shell, SlotKey, ObservableState, AnySlotKey } from '../src/API'
import {
    createAppHost,
    mockPackage,
    mockShellStateKey,
    MockState,
    renderInHost,
    connectWithShell,
    connectWithShellAndObserve,
    withThrowOnError
} from '../testKit'
import { ReactWrapper } from 'enzyme'
import { AnyAction } from 'redux'

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

describe('connectWithShell', () => {
    it('should pass exact shell to mapStateToProps', () => {
        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapStateToProps = (s: Shell) => ({ shellName: s.name })
        let ConnectedComp: any

        const { renderInShellContext } = createMocks({
            ...mockPackage,
            attach(shell) {
                _.invoke(mockPackage, 'attach', shell)
                ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)
            }
        })

        const { parentWrapper: comp } = renderInShellContext(<ConnectedComp />)

        expect(comp && comp.text()).toBe(mockPackage.name)
    })

    it('should pass exact shell to mapDispatchToProps', () => {
        let ConnectedComp: any
        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapDispatchToProps = (s: Shell) => ({ shellName: s.name })

        const { renderInShellContext } = createMocks({
            ...mockPackage,
            attach(shell) {
                _.invoke(mockPackage, 'attach', shell)
                ConnectedComp = connectWithShell(undefined, mapDispatchToProps, shell)(PureComp)
            }
        })

        const { parentWrapper: comp } = renderInShellContext(<ConnectedComp />)

        expect(comp && comp.text()).toBe(mockPackage.name)
    })

    it('should optimize props comparison', () => {
        let ConnectedComp: any
        const mapStateToProps = () => props
        const PureComp: FunctionComponent<CompProps> = ({ obj, func }) => {
            renderSpy()
            return <div onClick={func}>{JSON.stringify(obj)}</div>
        }

        const { host, renderInShellContext } = createMocks({
            ...mockPackage,
            attach(shell) {
                _.invoke(mockPackage, 'attach', shell)
                ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)
            }
        })

        type FuncProps = (event: any) => void
        interface CompProps {
            obj: any
            func: FuncProps
        }
        const func1: FuncProps = jest.fn()
        const func2: FuncProps = jest.fn()
        const renderSpy = jest.fn()
        let props = { obj: { a: 1 }, func: func1 }

        let counter = 0
        host.getStore().replaceReducer(() => ({
            counter: ++counter
        }))

        const update = (ref: ReactWrapper, newProps?: CompProps) => {
            if (newProps) {
                props = newProps
            }
            host.getStore().dispatch({ type: '' })
            host.getStore().flush()
            ref.update()
        }

        const { root } = renderInShellContext(<ConnectedComp />)

        if (!root) {
            throw new Error('Connected component fail to render')
        }

        expect(root.find(ConnectedComp).text()).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(root, _.cloneDeep(props))
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(root, { ...props, obj: { a: 2 } })
        expect(root.find(ConnectedComp).text()).toBe('{"a":2}')
        expect(renderSpy).toHaveBeenCalledTimes(2)

        update(root, { ...props, func: func2 })
        root.find(PureComp).simulate('click')
        expect(renderSpy).toHaveBeenCalledTimes(2)
        expect(func1).toHaveBeenCalled()
        expect(func2).not.toHaveBeenCalled()
    })

    it('should optimize props comparison with should update', () => {
        let ConnectedComp: any
        const mapStateToProps = () => props
        const PureComp: FunctionComponent<CompProps> = ({ obj, func }) => {
            renderSpy()
            return <div onClick={func}>{JSON.stringify(obj)}</div>
        }

        const { host, renderInShellContext } = createMocks({
            ...mockPackage,
            attach(shell) {
                _.invoke(mockPackage, 'attach', shell)
                ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { shouldComponentUpdate: () => false })(PureComp)
            }
        })

        type FuncProps = (event: any) => void
        interface CompProps {
            obj: any
            func: FuncProps
        }
        const func1: FuncProps = jest.fn()
        const func2: FuncProps = jest.fn()
        const renderSpy = jest.fn()
        let props = { obj: { a: 1 }, func: func1 }

        let counter = 0
        host.getStore().replaceReducer(() => ({
            counter: ++counter
        }))

        const update = (ref: ReactWrapper, newProps?: CompProps) => {
            if (newProps) {
                props = newProps
            }
            host.getStore().dispatch({ type: '' })
            host.getStore().flush()
            ref.update()
        }

        const { root } = renderInShellContext(<ConnectedComp />)

        if (!root) {
            throw new Error('Connected component fail to render')
        }

        expect(root.find(ConnectedComp).text()).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(root, _.cloneDeep(props))
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(root, { ...props, obj: { a: 2 } })
        expect(root.find(ConnectedComp).text()).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        update(root, { ...props, func: func2 })
        root.find(PureComp).simulate('click')
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(func1).toHaveBeenCalled()
        expect(func2).not.toHaveBeenCalled()
    })

    it('should pass scoped state to mapStateToProps', () => {
        let ConnectedWithState: any
        const PureCompNeedsState = ({ valueFromState }: { valueFromState: string }) => <div>{valueFromState}</div>
        const mapStateToProps = (s: Shell, state: MockPackageState) => ({
            valueFromState: getValueFromState(state)
        })

        const { host, renderInShellContext } = createMocks({
            ...mockPackage,
            attach(shell) {
                _.invoke(mockPackage, 'attach', shell)
                ConnectedWithState = connectWithShell(mapStateToProps, undefined, shell)(PureCompNeedsState)
            }
        })

        const { parentWrapper: withConnectedState } = renderInShellContext(<ConnectedWithState />)

        expect(withConnectedState && withConnectedState.text()).toBe(getValueFromState(getMockShellState(host)))
    })

    it('should bind shell context', async () => {
        const { host, renderInShellContext } = createMocks(mockPackage)

        let ConnectedWithState: any
        const boundShellState = { mockValue: 'bound-value' }
        const PureComp = ({ value }: { value: string }) => <div>{value}</div>
        const mapStateToProps = (shell: Shell, state: MockPackageState) => ({
            value: getValueFromState(state)
        })
        const otherEntryPoint: EntryPoint = {
            name: 'bound',
            attach(shell) {
                shell.contributeState(() => ({
                    [mockShellStateKey]: () => boundShellState
                }))
                ConnectedWithState = connectWithShell(mapStateToProps, undefined, shell)(PureComp)
            }
        }

        await host.addShells([otherEntryPoint])

        const { parentWrapper: withConnectedState } = renderInShellContext(<ConnectedWithState />)

        expect(withConnectedState && withConnectedState.text()).toBe(boundShellState.mockValue)
    })

    it('should re-provide shell context for children of bound component', async () => {
        let ConnectedUnboundComp: any
        let ConnectedUnboundCompWithChildren: any

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
            <div id={id} data-value={value}>
                {children}
            </div>
        )
        const mapStateToProps = (s: Shell, state: MockPackageState) => ({
            value: getValueFromState(state)
        })

        const { host, renderInShellContext } = createMocks({
            ...mockPackage,
            attach(shell) {
                _.invoke(mockPackage, 'attach', shell)

                ConnectedUnboundComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)

                ConnectedUnboundCompWithChildren = connectWithShell<
                    MockPackageState,
                    PureCompWithChildrenOwnProps,
                    PureCompWithChildrenStateProps
                >(
                    mapStateToProps,
                    undefined,
                    shell
                )(PureCompWithChildren)
            }
        })

        let ConnectedBoundCompWithChildren: any
        const boundShellState = { mockValue: 'bound-value' }
        const otherEntryPoint: EntryPoint = {
            name: 'bound',
            attach(s) {
                s.contributeState(() => ({
                    [mockShellStateKey]: () => boundShellState
                }))
                ConnectedBoundCompWithChildren = connectWithShell<
                    MockPackageState,
                    PureCompWithChildrenOwnProps,
                    PureCompWithChildrenStateProps
                >(
                    mapStateToProps,
                    undefined,
                    s
                )(PureCompWithChildren)
            }
        }

        await host.addShells([otherEntryPoint])

        const { parentWrapper: withConnectedState } = renderInShellContext(
            <ConnectedUnboundCompWithChildren id="A">
                <ConnectedBoundCompWithChildren id="B">
                    <ConnectedUnboundComp />
                </ConnectedBoundCompWithChildren>
            </ConnectedUnboundCompWithChildren>
        )

        expect(withConnectedState && withConnectedState.find('div#A').prop('data-value')).toBe(getValueFromState(getMockShellState(host)))
        expect(withConnectedState && withConnectedState.find('div#B').prop('data-value')).toBe(boundShellState.mockValue)
        expect(withConnectedState && withConnectedState.text()).toBe(getValueFromState(getMockShellState(host)))
    })

    it('should render contributed boundary aspect', () => {
        // arrange
        let ConnectedComp: any
        const PureComp: FunctionComponent<{}> = () => <div className="TEST-PURE-COMP">TEST</div>
        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT">{props.children}</div>)
                ConnectedComp = connectWithShell(undefined, undefined, myShell)(PureComp)
            }
        })

        // act
        const result = renderInHost(<ConnectedComp />, host, shell)

        // assert
        const rootWrapper = result.root as ReactWrapper
        expect(rootWrapper.find('div.TEST-ASPECT').length).toBe(1)
        expect(rootWrapper.find('div.TEST-PURE-COMP').length).toBe(1)
        expect(rootWrapper.exists('div.TEST-ASPECT div.TEST-PURE-COMP')).toBe(true)
    })

    it('should render multiple contributed boundary aspects', () => {
        // arrange

        const PureComp: FunctionComponent<{}> = () => <div className="TEST-PURE-COMP">TEST</div>
        let ConnectedComp: any
        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT-A">{props.children}</div>)
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT-B">{props.children}</div>)
                ConnectedComp = connectWithShell(undefined, undefined, myShell)(PureComp)
            }
        })

        // act

        const result = renderInHost(<ConnectedComp />, host, shell)

        // assert

        const rootWrapper = result.root as ReactWrapper
        expect(rootWrapper.find('div.TEST-ASPECT-A').length).toBe(1)
        expect(rootWrapper.find('div.TEST-ASPECT-B').length).toBe(1)
        expect(rootWrapper.find('div.TEST-PURE-COMP').length).toBe(1)
        expect(rootWrapper.exists('div.TEST-ASPECT-A div.TEST-ASPECT-B div.TEST-PURE-COMP')).toBe(true)
    })

    it('should handle boundary aspect contexts', () => {
        // arrange

        let ConnectedComp: any
        const TestAspectContext = React.createContext({ theNumber: 0 })
        const PureComp: FunctionComponent<{}> = () => (
            <TestAspectContext.Consumer>{aspect => <div className="TEST-PURE-COMP">{aspect.theNumber}</div>}</TestAspectContext.Consumer>
        )

        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => (
                    <div className="TEST-ASPECT">
                        <TestAspectContext.Provider value={{ theNumber: 123 }}>{props.children}</TestAspectContext.Provider>
                    </div>
                ))
                ConnectedComp = connectWithShell(undefined, undefined, myShell)(PureComp)
            }
        })

        // act

        const result = renderInHost(<ConnectedComp />, host, shell)

        // assert

        const rootWrapper = result.root as ReactWrapper
        const pureCompQuery = rootWrapper.find('div.TEST-ASPECT div.TEST-PURE-COMP')

        expect(pureCompQuery.length).toBe(1)
        expect(pureCompQuery.first().text()).toBe('123')
    })
})

describe('connectWithShell-useCases', () => {
    interface TestStateOne {
        one: { valueOne: string }
    }
    interface TestStateTwo {
        two: { valueTwo: string }
    }
    interface TestStateThree {
        three: { valueThree: string }
    }

    interface TwoAPI {
        getValueTwo(): string
    }
    const TwoAPI: SlotKey<TwoAPI> = { name: 'TWO_API', public: true }

    interface ThreeAPI {
        observables: { three: ObservableState<ThreeAPISelectors> }
    }
    interface ThreeAPISelectors {
        getValueThree(): string
    }
    const ThreeAPI: SlotKey<ThreeAPI> = { name: 'THREE_API', public: true }

    const entryPointOne: EntryPoint = {
        name: 'ONE',
        getDependencyAPIs: () => [TwoAPI],
        attach(shell) {
            shell.contributeState<TestStateOne>(() => ({
                one: (state = { valueOne: 'init1' }, action) => {
                    return action.type === 'SET_ONE' ? { valueOne: action.value } : state
                }
            }))
        }
    }

    const entryPointTwo: EntryPoint = {
        name: 'TWO',
        declareAPIs: () => [TwoAPI],
        attach(shell) {
            shell.contributeState<TestStateTwo>(() => ({
                two: (state = { valueTwo: 'init2' }, action) => {
                    return action.type === 'SET_TWO' ? { valueTwo: action.value } : state
                }
            }))
            shell.contributeAPI(TwoAPI, () => ({
                getValueTwo() {
                    return shell.getStore<TestStateTwo>().getState().two.valueTwo
                }
            }))
        }
    }

    const entryPointThree: EntryPoint = {
        name: 'THREE',
        declareAPIs: () => [ThreeAPI],
        attach(shell) {
            const observableThree = shell.contributeObservableState<TestStateThree, ThreeAPISelectors>(
                () => ({
                    three: (state = { valueThree: 'init3' }, action) => {
                        return action.type === 'SET_THREE' ? { valueThree: action.value } : state
                    }
                }),
                state => {
                    return {
                        getValueThree: () => state.three.valueThree
                    }
                }
            )
            shell.contributeAPI(ThreeAPI, () => ({
                observables: {
                    three: observableThree
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
    const mapStateToPropsSpy = jest.fn()

    const PureComp: FunctionComponent<CompProps> = ({ valueOne, valueTwo, valueThree }) => {
        renderSpy()
        return (
            <div>
                <div id="ONE">{valueOne}</div>
                <div id="TWO">{valueTwo}</div>
                <div id="THREE">{valueThree}</div>
            </div>
        )
    }
    const mapStateToProps = (shell: Shell, state: TestStateOne): CompProps => {
        mapStateToPropsSpy()
        return {
            valueOne: state.one.valueOne,
            valueTwo: shell.getAPI(TwoAPI).getValueTwo(),
            valueThree: ''
        }
    }

    beforeEach(() => {
        renderSpy.mockClear()
        mapStateToPropsSpy.mockClear()
    })

    const handleAction = (action: AnyAction, dom: ReactWrapper, { getStore }: AppHost) => {
        getStore().dispatch(action)
        getStore().flush()
        //dom.update()
    }

    it('should include observable state in store', () => {
        const { shell } = createMocks(entryPointThree)

        const state = shell.getStore<TestStateThree>().getState()

        expect(state).toBeDefined()
        expect(state.three.valueThree).toBe('init3')
    })

    it('should dispatch actions to observable reducers', () => {
        const { shell } = createMocks(entryPointThree)

        shell.getStore<TestStateThree>().dispatch({ type: 'SET_THREE', value: 'updated_by_test' })

        const state = shell.getStore<TestStateThree>().getState()
        expect(state.three.valueThree).toEqual('updated_by_test')
    })

    it('should invoke subscribed callback when observed state changes', () => {
        const { shell } = createMocks(entryPointThree)

        const receivedSelectors: ThreeAPISelectors[] = []
        shell.getAPI(ThreeAPI).observables.three.subscribe(shell, next => {
            receivedSelectors.push(next)
        })

        const { dispatch, flush } = shell.getStore<TestStateThree>()
        dispatch({ type: 'SET_THREE', value: 'updated_by_test' })
        flush()

        expect(receivedSelectors.length).toBe(1)
        expect(receivedSelectors[0].getValueThree()).toBe('updated_by_test')
    })

    it('should update component on change in regular state', () => {
        let ConnectedComp: any
        const { host, renderInShellContext } = createMocks(
            {
                ...entryPointOne,
                attach(shell) {
                    _.invoke(entryPointOne, 'attach', shell)
                    ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)
                }
            },
            [entryPointTwo]
        )

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        handleAction({ type: 'SET_ONE', value: 'update1' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        handleAction({ type: 'SET_TWO', value: 'update2' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)

        handleAction({ type: 'SOME_OTHER_ACTION' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should not update uninterested component on change in observable state', () => {
        let ConnectedComp: any
        const { host, renderInShellContext } = createMocks(
            {
                ...entryPointOne,
                attach(shell) {
                    _.invoke(entryPointOne, 'attach', shell)
                    ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)
                }
            },
            [entryPointTwo, entryPointThree]
        )

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        handleAction({ type: 'SET_ONE', value: 'update1' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        // this should not notify the uninterested component
        handleAction({ type: 'SET_THREE', value: 'update3' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it('should update component through observer', () => {
        const { host, shell, renderInShellContext } = createMocks(withDependencyAPIs(entryPointOne, [ThreeAPI]), [
            entryPointTwo,
            entryPointThree
        ])

        const ConnectedComp = connectWithShellAndObserve(
            {
                observedThree: host.getAPI(ThreeAPI).observables.three
            },
            (_shell, state: TestStateOne, ownProps): CompProps => {
                mapStateToPropsSpy()
                return {
                    valueOne: state.one.valueOne,
                    valueTwo: _shell.getAPI(TwoAPI).getValueTwo(),
                    valueThree: ownProps?.observedThree.getValueThree() || 'N/A'
                }
            },
            undefined,
            shell,
            { allowOutOfEntryPoint: true }
        )(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('init3')

        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        handleAction({ type: 'SET_ONE', value: 'update1' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('init3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        handleAction({ type: 'SET_THREE', value: 'update3' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('update3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)

        handleAction({ type: 'SOME_OTHER_ACTION' }, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('update3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })
})
