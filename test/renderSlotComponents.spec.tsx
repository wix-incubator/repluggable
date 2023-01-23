import _ from 'lodash'
import React, { FunctionComponent, PropsWithChildren } from 'react'
import { SlotKey, ReactComponentContributor, Shell } from '../src/API'
import { createAppHost, addMockShell, renderInHost, connectWithShell, SlotRenderer } from '../testKit/v2'
import { Provider } from 'react-redux'
import { AnyAction, createStore } from 'redux'
import { act, create, ReactTestRenderer } from 'react-test-renderer'

const CompA: FunctionComponent = () => <div id="A" className="mock-comp" />
const CompB: FunctionComponent = () => <div id="B" className="mock-comp" />
class CompC extends React.Component<{ onDidMount(): void }> {
    componentDidMount() {
        this.props.onDidMount()
    }
    render() {
        return <div id="C" className="mock-comp" />
    }
}

const getCompId = (wrapper: ReactTestRenderer | null, index: number) =>
    wrapper ? wrapper.root.findAll(x => x.props.className?.includes('mock-comp'))[index].props.id : ''

describe('SlotRenderer', () => {
    it('should render slot items', () => {
        const slotKey: SlotKey<ReactComponentContributor> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, () => <CompA />)
        slot.contribute(shell, () => <CompB />)

        const { testKit } = renderInHost(<SlotRenderer slot={slot} />, host, shell)
        expect(testKit.root.findAllByType(CompA).length).toBe(1)
        expect(testKit.root.findAllByType(CompB).length).toBe(1)
    })

    it('should map items by map function', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, { comp: () => <CompA /> })
        slot.contribute(shell, { comp: () => <CompB /> })

        const { testKit } = renderInHost(<SlotRenderer slot={slot} mapFunc={item => item.comp} />, host, shell)

        expect(testKit.root.findAllByType(CompA).length).toBe(1)
        expect(testKit.root.findAllByType(CompB).length).toBe(1)
    })

    it('should not render filtered out slot items', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor; shouldRender: boolean }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, { comp: () => <CompA />, shouldRender: false })
        slot.contribute(shell, { comp: () => <CompB />, shouldRender: true })

        const { testKit } = renderInHost(
            <SlotRenderer slot={slot} mapFunc={item => item.comp} filterFunc={item => item.shouldRender} />,
            host,
            shell
        )

        expect(testKit.root.findAllByType(CompA).length).toBe(0)
        expect(testKit.root.findAllByType(CompB).length).toBe(1)
    })

    it('should not render non enabled slot items', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, { comp: () => <CompA /> })
        slot.contribute(shell, { comp: () => <CompB /> }, () => false)

        const { testKit } = renderInHost(<SlotRenderer slot={slot} mapFunc={item => item.comp} />, host, shell)

        expect(testKit.root.findAllByType(CompA).length).toBe(1)
        expect(testKit.root.findAllByType(CompB).length).toBe(0)
    })

    it('should sort slot items by sort function', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor; order: number }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, { comp: () => <CompA />, order: 2 })
        slot.contribute(shell, { comp: () => <CompB />, order: 1 })

        const { testKit } = renderInHost(
            <SlotRenderer
                slot={slot}
                mapFunc={item => item.comp}
                sortFunc={(itemA, itemB) => itemA.contribution.order - itemB.contribution.order}
            />,
            host,
            shell
        )

        expect(getCompId(testKit, 0)).toBe('B')
        expect(getCompId(testKit, 1)).toBe('A')
    })

    it('should not mutate slot item order by sort function', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor; order: number }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, { comp: () => <CompA />, order: 2 })
        slot.contribute(shell, { comp: () => <CompB />, order: 1 })

        const getSlotItemsOrder = () => slot.getItems().map(item => getCompId(create(<>{item.contribution.comp()}</>), 0))

        const slotItemsOrder = getSlotItemsOrder()

        renderInHost(
            <SlotRenderer
                slot={slot}
                mapFunc={item => item.comp}
                sortFunc={(itemA, itemB) => itemA.contribution.order - itemB.contribution.order}
            />,
            host,
            shell
        )
        slot.getItems().map(item => getCompId(create(<>{item.contribution.comp()}</>), 0))

        expect(getSlotItemsOrder()).toEqual(['A', 'B'])
        expect(getSlotItemsOrder()).toEqual(slotItemsOrder)
    })

    it('should not sort slot items if no sort function provided', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor; order: number }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        slot.contribute(shell, { comp: () => <CompA />, order: 2 })
        slot.contribute(shell, { comp: () => <CompB />, order: 1 })

        const { testKit } = renderInHost(<SlotRenderer slot={slot} mapFunc={item => item.comp} />, host, shell)

        expect(getCompId(testKit, 0)).toBe('A')
        expect(getCompId(testKit, 1)).toBe('B')
    })

    it('should not remount component when slot items changed', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor; order: number }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        const onDidMount = jest.fn()
        const onRender = jest.fn()

        let isCompAEnabled = true

        slot.contribute(shell, { comp: () => <CompA />, order: 1 }, () => isCompAEnabled)
        slot.contribute(shell, { comp: () => <CompB />, order: 2 })
        slot.contribute(shell, { comp: () => <CompC onDidMount={onDidMount} />, order: 3 })

        class Container extends React.Component<{ children(): React.ReactNode }> {
            constructor(props: any) {
                super(props)
                this.state = { counter: 1 }
            }
            render() {
                onRender()
                return <div onClick={() => this.setState({ counter: 2 })}>{this.props.children()}</div>
            }
        }

        const { testKit } = renderInHost(
            <Container>
                {() => (
                    <SlotRenderer
                        slot={slot}
                        mapFunc={item => item.comp}
                        sortFunc={(itemA, itemB) => itemA.contribution.order - itemB.contribution.order}
                    />
                )}
            </Container>,
            host,
            shell
        )

        if (!testKit) {
            fail('could not render extension slot')
        }

        isCompAEnabled = false
        testKit.root.findByType(Container).findByType('div').props.onClick()

        expect(onDidMount).toHaveBeenCalledTimes(1)
        expect(onRender).toHaveBeenCalledTimes(2)
    })

    describe('Bound Props', function () {
        const NATIVE_STORE_INITIAL_NUM = 1
        const FOREIGN_STORE_INITIAL_NUM = 2
        const NATIVE_STORE_NEW_NUM = 3
        const FOREIGN_STORE_NEW_NUM = 4
        interface MyStateValue {
            num: number
        }
        interface MyStoreState {
            test: MyStateValue
        }

        it('should keep bound mapStateToProps', () => {
            const host = createAppHost([])
            const mockShell = addMockShell(host, {
                attach: shell => {
                    shell.contributeState(() => ({ test: () => ({ num: NATIVE_STORE_INITIAL_NUM }) }))
                }
            })

            const ForeignComponent: FunctionComponent<PropsWithChildren> = props => (
                <Provider store={createStore(() => ({ test: { num: FOREIGN_STORE_INITIAL_NUM } }))}>{props.children}</Provider>
            )

            const nativeComponentPure: FunctionComponent<MyStateValue> = props => <div className="native-component">{props.num}</div>

            const NativeComponent = connectWithShell<MyStoreState, {}, MyStateValue>(
                (shell, state) => ({
                    num: state.test.num
                }),
                undefined,
                mockShell,
                { allowOutOfEntryPoint: true }
            )(nativeComponentPure)

            const { testKit } = renderInHost(
                <ForeignComponent>
                    <NativeComponent />
                </ForeignComponent>,
                host
            )

            const hostComponent = testKit.root.find(x => x.props.className === 'native-component')
            expect(hostComponent.children[0]).toBe(`${NATIVE_STORE_INITIAL_NUM}`)
        })

        it('should keep bound mapDispatchToProps', async () => {
            const CHANGE_NUM = 'CHANGE_NUM'

            function nativeStoreReducer(state: MyStoreState['test'] = { num: NATIVE_STORE_INITIAL_NUM }, action: AnyAction) {
                switch (action.type) {
                    case CHANGE_NUM:
                        return {
                            ...state,
                            num: action.num
                        }
                    default:
                        return state
                }
            }

            function foreignStoreReducer(state: MyStoreState['test'] | undefined, action: AnyAction) {
                switch (action.type) {
                    case CHANGE_NUM:
                        throw new Error('The wrong store')
                    default:
                        return { num: FOREIGN_STORE_NEW_NUM }
                }
            }

            const host = createAppHost([])
            const mockShell = addMockShell(host, {
                attach: shell => {
                    shell.contributeState<MyStoreState>(() => ({ test: nativeStoreReducer }))
                }
            })

            const ForeignComponent: FunctionComponent<PropsWithChildren> = props => (
                <Provider store={createStore(foreignStoreReducer, { num: FOREIGN_STORE_INITIAL_NUM })}>{props.children}</Provider>
            )

            const nativeComponentPure: FunctionComponent<{ num: number; changeState(): void }> = props => {
                return (
                    <div className="native-component" onClick={() => props.changeState()}>
                        {props.num}
                    </div>
                )
            }

            const NativeComponent = connectWithShell<MyStoreState, {}, MyStateValue, { changeState(): void }>(
                (shell, state) => {
                    return {
                        num: state.test.num
                    }
                },
                (shell: Shell, dispatch: any) => {
                    return {
                        changeState: () => {
                            dispatch({ num: NATIVE_STORE_NEW_NUM, type: CHANGE_NUM })
                        }
                    }
                },
                mockShell,
                { allowOutOfEntryPoint: true }
            )(nativeComponentPure)

            const { testKit, rootComponent } = renderInHost(
                <ForeignComponent>
                    <NativeComponent />
                </ForeignComponent>,
                host
            )

            let component = testKit.root.find(x => x.props.className === 'native-component')

            component.props.onClick()
            act(() => {
                host.getStore().flush()
                testKit.update(rootComponent)
            })

            component = testKit.root.find(x => x.props.className === 'native-component')
            expect(component.children[0]).toBe(`${NATIVE_STORE_NEW_NUM}`)
        })
    })
})
