import _ from 'lodash'
import React, { FunctionComponent, ReactElement } from 'react'

import { AppHost, EntryPoint, Shell, SlotKey, ChangeObserver } from '../src/API'
import { createAppHost, mockPackage, mockShellStateKey, MockState, renderInHost, connectWithShell } from '../testKit'
import { ReactWrapper } from 'enzyme'
import { AnyAction } from 'redux'
import { connectWithShellAndObserve } from '../src'

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

    const host = createAppHost([wrappedPackage, ...moreEntryPoints])
    const getShell = () => cachedShell as Shell

    return {
        host,
        shell: getShell(),
        renderInShellContext: (reactElement: ReactElement<any>) => renderInHost(reactElement, host, getShell())
    }
}

describe('connectWithShell', () => {

    it('should pass exact shell to mapStateToProps', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapStateToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)

        const { parentWrapper: comp } = renderInShellContext(<ConnectedComp />)

        expect(comp && comp.text()).toBe(mockPackage.name)
    })

    it('should pass exact shell to mapDispatchToProps', () => {
        const { shell, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapDispatchToProps = (s: Shell) => ({ shellName: s.name })

        const ConnectedComp = connectWithShell(undefined, mapDispatchToProps, shell)(PureComp)

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

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)

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

        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell, { shouldComponentUpdate: () => false })(PureComp)

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
        const { host, shell, renderInShellContext } = createMocks(mockPackage)

        const PureCompNeedsState = ({ valueFromState }: { valueFromState: string }) => <div>{valueFromState}</div>
        const mapStateToProps = (s: Shell, state: MockPackageState) => ({
            valueFromState: getValueFromState(state)
        })

        const ConnectedWithState = connectWithShell(mapStateToProps, undefined, shell)(PureCompNeedsState)

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

        const ConnectedWithState = connectWithShell(mapStateToProps, undefined, getBoundShell())(PureComp)

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

        const ConnectedUnboundComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)

        const ConnectedUnboundCompWithChildren = connectWithShell<
            MockPackageState,
            PureCompWithChildrenOwnProps,
            PureCompWithChildrenStateProps
        >(
            mapStateToProps,
            undefined,
            shell
        )(PureCompWithChildren)

        const ConnectedBoundCompWithChildren = connectWithShell<
            MockPackageState,
            PureCompWithChildrenOwnProps,
            PureCompWithChildrenStateProps
        >(
            mapStateToProps,
            undefined,
            getBoundShell()
        )(PureCompWithChildren)

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
        const ConnectedComp = connectWithShell(undefined, undefined, shell)(PureComp)

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
        const ConnectedComp = connectWithShell(undefined, undefined, shell)(PureComp)

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
        const ConnectedComp = connectWithShell(undefined, undefined, shell)(PureComp)

        // act

        const result = renderInHost(<ConnectedComp />, host, shell)

        // assert

        const rootWrapper = result.root as ReactWrapper
        const pureCompQuery = rootWrapper.find('div.TEST-ASPECT div.TEST-PURE-COMP')

        expect(pureCompQuery.length).toBe(1)
        expect(pureCompQuery.first().text()).toBe('123')
    })

})

describe('connectWithShell-componentUpdates', () => {
    interface TestStateOne {
        one: {
            valueOne: string
        }
    }
    
    interface TestStateTwo {
        two: {
            valueTwo: string
        }
    }

    interface TwoAPI {
        getValueTwo(): string
        observers: {
            valueTwo: ChangeObserver
        }
    }
    const TwoAPI: SlotKey<TwoAPI> = { name: 'TWO_API', public: true }
    
    const entryPointOne : EntryPoint = {
        name: 'ONE',
        getDependencyAPIs: () => [TwoAPI],
        attach(shell) {
            shell.contributeState<TestStateOne>(() => ({
                one: (state = {valueOne: 'init1'}, action) => {
                    return (action.type === 'SET_ONE' ? {valueOne: action.value} : state)
                }
            }))
        }
    }

    const entryPointTwo : EntryPoint = {
        name: 'TWO',
        declareAPIs: () => [TwoAPI],
        attach(shell) {
            shell.contributeState<TestStateTwo>(() => ({
                two: (state = {valueTwo: 'init2'}, action) => {
                    return (action.type === 'SET_TWO' ? {valueTwo: action.value} : state)
                }
            }))
            shell.contributeAPI(TwoAPI, () => ({
                getValueTwo() {
                    return shell.getStore<TestStateTwo>().getState().two.valueTwo
                },
                observers: {
                    valueTwo: {} //TODO: why is this allowed?! 
                }
            }))
        }
    }

    // same as EntryPointTwo, but this time it contributes observable state
    const entryPointTwoWithObserver : EntryPoint = {
        name: 'TWO_WITH_OBSERVER',
        declareAPIs: () => [TwoAPI],
        attach(shell) {
            const valueTwoObserver = shell.contributeObservableState<TestStateTwo>(() => ({
                two: (state = {valueTwo: 'init2'}, action) => {
                    return (action.type === 'SET_TWO' ? {valueTwo: action.value} : state)
                }
            }))
            shell.contributeAPI(TwoAPI, () => ({
                getValueTwo() {
                    return shell.getStore<TestStateTwo>().getState().two.valueTwo
                },
                observers: {
                    valueTwo: valueTwoObserver
                }
            }))
        }
    }

    interface CompProps { 
        valueOne: string
        valueTwo: string 
    }

    const renderSpy = jest.fn()
    const PureComp: FunctionComponent<CompProps> = ({ valueOne, valueTwo }) => {
        renderSpy()
        return (
            <div>
                <div id="ONE">{valueOne}</div>
                <div id="TWO">{valueTwo}</div>
            </div>
        )
    }
    const mapStateToProps = (shell: Shell, state: TestStateOne): CompProps => {
        return {
            valueOne: state.one.valueOne,
            valueTwo: shell.getAPI(TwoAPI).getValueTwo()
        }
    }

    beforeEach(() => {
        renderSpy.mockClear()
    })

    const handleAction = (action: AnyAction, dom: ReactWrapper, { getStore }: AppHost) => {
        getStore().dispatch(action)
        getStore().flush()
        //dom.update()
    }

    it('should update component on change in regular state', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointOne, [entryPointTwo])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        handleAction({type: 'SET_ONE', value: 'update1'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(2)

        handleAction({type: 'SET_TWO', value: 'update2'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(renderSpy).toHaveBeenCalledTimes(3)

        handleAction({type: 'SET_THREE', value: 'update3'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    it('should not update uninterested component on change in observable state', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointOne, [entryPointTwoWithObserver])
        const ConnectedComp = connectWithShell(mapStateToProps, undefined, shell)(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        handleAction({type: 'SET_ONE', value: 'update1'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(2)

        handleAction({type: 'SET_TWO', value: 'update2'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it.skip('should update component through observer', () => {
        const { host, shell, renderInShellContext } = createMocks(entryPointOne, [entryPointTwoWithObserver])
        const ConnectedComp = connectWithShellAndObserve([], mapStateToProps, undefined, shell)(PureComp)

        const { root } = renderInShellContext(<ConnectedComp />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('init1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        handleAction({type: 'SET_ONE', value: 'update1'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('init2')
        expect(renderSpy).toHaveBeenCalledTimes(2)

        handleAction({type: 'SET_TWO', value: 'update2'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(renderSpy).toHaveBeenCalledTimes(3)

        handleAction({type: 'SET_THREE', value: 'update3'}, root, host)

        expect(root.find(ConnectedComp).find('#ONE').text()).toBe('update1')
        expect(root.find(ConnectedComp).find('#TWO').text()).toBe('update2')
        expect(renderSpy).toHaveBeenCalledTimes(3)
    })
    
})
