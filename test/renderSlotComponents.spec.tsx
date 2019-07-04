import React, { FunctionComponent } from 'react'
import { SlotKey, ReactComponentContributor } from '../src/API'
import { SlotRenderer } from '../src/renderSlotComponents'
import { createAppHost, addMockShell, renderInHost } from '../testKit'
import { ReactWrapper, mount } from 'enzyme'

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
})
