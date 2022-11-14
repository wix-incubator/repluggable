import _ from 'lodash'
import React, { FunctionComponent, ReactElement, useEffect } from 'react'

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
import { mount, ReactWrapper } from 'enzyme'
import { AnyAction } from 'redux'
import { TOGGLE_MOCK_VALUE } from '../testKit/mockPackage'
import { ObservedSelectorsMap, observeWithShell } from '../src'

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
    getStore().dispatch(action)
    getStore().flush()
}

describe('connectWithShell', () => {
    it('should pass exact shell to mapStateToProps', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapStateToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

        const { parentWrapper: comp } = renderInShellContext(<ConnectedComp />)

        expect(comp && comp.text()).toBe(mockPackage.name)
    })

    it('should have shell context outside of main view with renderOutsideProvider option', () => {
        const { shell } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div className={'my-wrapper'}>{shellName}</div>
        const mapStateToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            renderOutsideProvider: true,
            allowOutOfEntryPoint: true
        })(PureComp)

        const reactWrapper = mount(<ConnectedComp />)
        const myWrapperDiv = reactWrapper.find('.my-wrapper')

        expect(myWrapperDiv).toBeDefined()
        expect(myWrapperDiv && myWrapperDiv.text()).toBe(mockPackage.name)
    })

    it('should pass exact shell to mapDispatchToProps', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapDispatchToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(undefined, mapDispatchToProps, shell, { allowOutOfEntryPoint: true })(PureComp)

        const { parentWrapper: comp } = renderInShellContext(<ConnectedComp />)

        expect(comp && comp.text()).toBe(mockPackage.name)
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

        const update = (ref: ReactWrapper, newProps?: CompProps) => {
            if (newProps) {
                props = newProps
            }
            host.getStore().dispatch({ type: '' })
            host.getStore().flush()
            ref.update()
        }

        const PureComp: FunctionComponent<CompProps> = ({ obj, func }) => {
            renderSpy()
            return <div onClick={func}>{JSON.stringify(obj)}</div>
        }

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

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

        const update = (ref: ReactWrapper, newProps?: CompProps) => {
            if (newProps) {
                props = newProps
            }
            host.getStore().dispatch({ type: '' })
            host.getStore().flush()
            ref.update()
        }

        const PureComp: FunctionComponent<CompProps> = ({ obj, func }) => {
            renderSpy()
            return <div onClick={func}>{JSON.stringify(obj)}</div>
        }

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, {
            shouldComponentUpdate: () => false,
            allowOutOfEntryPoint: true
        })(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)

        if (!root) {
            throw new Error('Connected component fail to render')
        }

        expect(root.find(ConnectedComp).text()).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)

        update(root, _.cloneDeep(props))
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)

        update(root, { ...props, obj: { a: 2 } })
        expect(root.find(ConnectedComp).text()).toBe('{"a":1}')
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)

        update(root, { ...props, func: func2 })
        root.find(PureComp).simulate('click')
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(mapStateSpy).toHaveBeenCalledTimes(1)
        expect(func1).toHaveBeenCalled()
        expect(func2).not.toHaveBeenCalled()
    })

    it('should pass scoped state to mapStateToProps', () => {
        const { host, shell, renderInShellContext } = createMocks(mockPackage)

        const PureCompNeedsState = ({ valueFromState }: { valueFromState: string }) => <div>{valueFromState}</div>
        const mapStateToProps = (s: Shell, state: MockPackageState) => ({
            valueFromState: getValueFromState(state)
        })

        const ConnectedWithState = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureCompNeedsState)

        const { parentWrapper: withConnectedState } = renderInShellContext(<ConnectedWithState />)

        expect(withConnectedState && withConnectedState.text()).toBe(getValueFromState(getMockShellState(host)))
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

        const { parentWrapper: withConnectedState } = renderInShellContext(<ConnectedWithState />)

        expect(withConnectedState && withConnectedState.text()).toBe(boundShellState.mockValue)
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
            <div id={id} data-value={value}>
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
        >(mapStateToProps, undefined, getBoundShell(), { allowOutOfEntryPoint: true })(PureCompWithChildren)

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
        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT">{props.children}</div>)
            }
        })
        const PureComp: FunctionComponent<{}> = () => <div className="TEST-PURE-COMP">TEST</div>
        const ConnectedComp = connectWithShell(undefined, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

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

        const { host, shell } = createMocks({
            name: 'ASPECT-TEST-EP',
            attach: myShell => {
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT-A">{props.children}</div>)
                myShell.contributeBoundaryAspect(props => <div className="TEST-ASPECT-B">{props.children}</div>)
            }
        })
        const PureComp: FunctionComponent<{}> = () => <div className="TEST-PURE-COMP">TEST</div>
        const ConnectedComp = connectWithShell(undefined, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

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
        const ConnectedComp = connectWithShell(undefined, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

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
    const SecondStateAPI: SlotKey<SecondStateAPI> = { name: 'TWO_API', public: true }

    interface FirstObservableAPI {
        observables: { three: ObservableState<FirstObservableSelectors> }
    }
    interface FirstObservableSelectors {
        getValueThree(): string
    }
    const FirstObservableAPI: SlotKey<FirstObservableAPI> = { name: 'THREE_API', public: true }

    interface SecondObservableAPI {
        observables: { four: ObservableState<SecondObservableSelectors> }
    }
    interface SecondObservableSelectors {
        getValueFour(): string
    }
    const SecondObservableAPI: SlotKey<SecondObservableAPI> = { name: 'FOUR_API', public: true }

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
                <div id="ONE">{valueOne}</div>
                <div id="TWO">{valueTwo}</div>
                <div id="THREE">{valueThree}</div>
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

    beforeEach(() => {
        renderSpy.mockClear()
        mapStateToPropsSpy.mockClear()
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

    it('should not mount connected component on props update', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [entryPointSecondStateWithAPI])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)
        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
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
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        dispatchAndFlush({ type: 'SET_SECOND_STATE', value: 'update2' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)

        dispatchAndFlush({ type: 'SOME_OTHER_ACTION' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should not update uninterested component on change in observable state', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointWithState, [
            entryPointSecondStateWithAPI,
            entryPointFirstObservable
        ])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { allowOutOfEntryPoint: true })(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        // this should not notify the uninterested component
        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: 'update3' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
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

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('init3')

        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_STATE', value: 'update1' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('init3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(renderSpy).toHaveBeenCalledTimes(2)

        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: 'update3' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('update3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)

        dispatchAndFlush({ type: 'SOME_OTHER_ACTION' }, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(root.find(ConnectedComp).find('#THREE').text()).toBe('update3')
        expect(mapStateToPropsSpy).toHaveBeenCalledTimes(3)
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should throw if observable is read in store subscription', async () => {
        const { host } = createMocks(withDependencyAPIs(entryPointSecondStateWithAPI, []), [entryPointFirstObservable])

        host.getStore().subscribe(() => {
            host.getAPI(FirstObservableAPI).observables.three.current().getValueThree()
        })

        expect(() => dispatchAndFlush({ type: 'SET_SECOND_STATE', value: 'update2' }, host)).toThrowError()
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

        const { root } = renderInShellContext(
            <>
                <FirstConnectedComp />
                <SecondConnectedComp />
            </>
        )
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(FirstConnectedComp).find('#THREE').text()).toBe('init3')
        expect(root.find(SecondConnectedComp).find('#THREE').text()).toBe('init4')

        expect(firstMapStateToPropsSpy).toHaveBeenCalledTimes(1)
        expect(secondMapStateToPropsSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: 'update3' }, host)

        expect(root.find(FirstConnectedComp).find('#THREE').text()).toBe('update3')
        expect(root.find(SecondConnectedComp).find('#THREE').text()).toBe('init4')

        expect(firstMapStateToPropsSpy).toHaveBeenCalledTimes(2)
        expect(secondMapStateToPropsSpy).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_SECOND_OBSERVABLE', value: 'update4' }, host)

        expect(root.find(FirstConnectedComp).find('#THREE').text()).toBe('update3')
        expect(root.find(SecondConnectedComp).find('#THREE').text()).toBe('update4')

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
    const ObservableAPI: SlotKey<ObservableAPI> = { name: 'OBSERVABLE_API', public: true }
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

        const { root } = renderInShellContext(<ObservingComponent />)
        if (!root) {
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

        const { root } = renderInShellContext(<ObservingComponent />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ObservingComponent).find('#OBSERVED_NUMBER').text()).toBe('1')
        expect(root.find(ObservingComponent).find('#OBSERVED_STRING').text()).toBe('init')

        expect(renderSpyFunc).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: 'SET_STRING', value: 'update' }, host)

        expect(root.find(ObservingComponent).find('#OBSERVED_NUMBER').text()).toBe('1')
        expect(root.find(ObservingComponent).find('#OBSERVED_STRING').text()).toBe('update')

        expect(renderSpyFunc).toHaveBeenCalledTimes(2)

        dispatchAndFlush({ type: 'SET_NUMBER', value: '2' }, host)

        expect(root.find(ObservingComponent).find('#OBSERVED_NUMBER').text()).toBe('2')
        expect(root.find(ObservingComponent).find('#OBSERVED_STRING').text()).toBe('update')

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

        const { root } = renderInShellContext(<ObservingComponent />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        root.find('button').simulate('click')
        expect(myFunctionSpy).toHaveBeenCalledWith(1)

        dispatchAndFlush({ type: 'SET_NUMBER', value: 2 }, host)
        root.find('button').simulate('click')
        expect(myFunctionSpy).toHaveBeenCalledWith(2)
    })
})
