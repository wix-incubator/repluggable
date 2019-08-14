import _ from 'lodash'
import React, { FunctionComponent } from 'react'
import { SlotKey, ReactComponentContributor, Shell } from '../src/API'
import { SlotRenderer } from '../src/renderSlotComponents'
import { createAppHost, addMockShell, renderInHost } from '../testKit'
import { ReactWrapper, mount } from 'enzyme'
import { Provider } from 'react-redux'
import { AnyAction, createStore } from 'redux'
import { connectWithShell } from '../src'

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

const getCompId = (wrapper: ReactWrapper | null, index: number) =>
    wrapper
        ? wrapper
              .find('.mock-comp')
              .at(index)
              .prop('id')
        : ''

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

        const { root } = renderInHost(<SlotRenderer slot={slot} />, host, shell)

        expect(root && root.find(CompA).length).toBe(1)
        expect(root && root.find(CompB).length).toBe(1)
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

        const { root } = renderInHost(<SlotRenderer slot={slot} mapFunc={item => item.comp} />, host, shell)

        expect(root && root.find(CompA).length).toBe(1)
        expect(root && root.find(CompB).length).toBe(1)
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

        const { root } = renderInHost(
            <SlotRenderer slot={slot} mapFunc={item => item.comp} filterFunc={item => item.shouldRender} />,
            host,
            shell
        )

        expect(root && root.find(CompA).length).toBe(0)
        expect(root && root.find(CompB).length).toBe(1)
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

        const { root } = renderInHost(<SlotRenderer slot={slot} mapFunc={item => item.comp} />, host, shell)

        expect(root && root.find(CompA).length).toBe(1)
        expect(root && root.find(CompB).length).toBe(0)
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

        const { root } = renderInHost(
            <SlotRenderer
                slot={slot}
                mapFunc={item => item.comp}
                sortFunc={(itemA, itemB) => itemA.contribution.order - itemB.contribution.order}
            />,
            host,
            shell
        )

        expect(getCompId(root, 0)).toBe('B')
        expect(getCompId(root, 1)).toBe('A')
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

        const getSlotItemsOrder = () => slot.getItems().map(item => getCompId(mount(<>{item.contribution.comp()}</>), 0))

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
        slot.getItems().map(item => getCompId(mount(<>{item.contribution.comp()}</>), 0))

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

        const { root } = renderInHost(<SlotRenderer slot={slot} mapFunc={item => item.comp} />, host, shell)

        expect(getCompId(root, 0)).toBe('A')
        expect(getCompId(root, 1)).toBe('B')
    })

    it('should not remount component when slot items changed', () => {
        const slotKey: SlotKey<{ comp: ReactComponentContributor; order: number }> = {
            name: 'mock_key'
        }
        const host = createAppHost([])
        const shell = addMockShell(host)

        const slot = shell.declareSlot(slotKey)

        const onWillUnmount = jest.fn()
        const onDidMount = jest.fn()

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
                return this.props.children()
            }
        }

        const { root } = renderInHost(
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

        if (!root) {
            fail('could not render extension slot')
            return
        }

        isCompAEnabled = false
        root.find(Container).setState({ counter: 2 })
        root.find(Container).update()

        expect(onDidMount).toHaveBeenCalledTimes(1)
    })

    describe('Bound Props', function() {
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

            const ForeignComponent: FunctionComponent = props => (
                <Provider store={createStore(() => ({ test: { num: FOREIGN_STORE_INITIAL_NUM } }))}>{props.children}</Provider>
            )

            const nativeComponentPure: FunctionComponent<MyStateValue> = props => <div className="native-component">{props.num}</div>

            const NativeComponent = connectWithShell<MyStoreState, {}, MyStateValue>(
                (shell, state) => ({
                    num: state.test.num
                }),
                undefined,
                mockShell
            )(nativeComponentPure)

            const { root } = renderInHost(
                <ForeignComponent>
                    <NativeComponent />
                </ForeignComponent>,
                host
            )

            const rootWrapper = root as ReactWrapper
            const hostComponent = rootWrapper.find('div.native-component')

            expect(hostComponent.text()).toBe(`${NATIVE_STORE_INITIAL_NUM}`)
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

            const ForeignComponent: FunctionComponent = props => (
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
                mockShell
            )(nativeComponentPure)

            const { root } = renderInHost(
                <ForeignComponent>
                    <NativeComponent />
                </ForeignComponent>,
                host
            )

            const rootWrapper = root as ReactWrapper
            const component = rootWrapper.find('div.native-component')

            _.attempt(component.prop('onClick') as () => {})
            host.getStore().flush()
            component.update()

            expect(component.text()).toBe(`${NATIVE_STORE_NEW_NUM}`)
        })
    })
})
