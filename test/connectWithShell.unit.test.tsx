import _ from 'lodash'
import React, { FunctionComponent, ReactElement } from 'react'

import { AppHost, EntryPoint, Shell } from '../src/API'
import { buildConnectedComponent } from '../src/connectWithShell'
import { createAppHost, MockAPI, mockPackage, mockShellStateKey, MockState, renderInHost } from '../testKit'

interface MockPackageState {
    [mockShellStateKey]: MockState
}

const getMockShellState = (host: AppHost) => _.get(host.getStore().getState(), [mockPackage.name], null)
const getValueFromAPI = (shellOrHost: Shell | AppHost) => `${shellOrHost.getAPI(MockAPI).stubTrue()}`
const getValueFromState = (state: MockPackageState) => `${state[mockShellStateKey].mockValue}`

const createMocks = (entryPoint: EntryPoint) => {
    let cachedShell: Shell | null = null
    const wrappedPackage: EntryPoint = {
        ...entryPoint,
        attach(shell) {
            _.invoke(entryPoint, 'attach', shell)
            cachedShell = shell
        }
    }

    const host = createAppHost([wrappedPackage])
    const getShell = () => cachedShell as Shell

    return {
        host,
        renderInShellContext: (reactElement: ReactElement<any>) => renderInHost(reactElement, host, getShell())
    }
}

describe('buildConnectedComponent', () => {
    it('should pass shell to mapStateToProps', () => {
        const host = createAppHost([mockPackage])

        const PureCompNeedsState = ({ valueFromState }: { valueFromState: string }) => <div>{valueFromState}</div>
        const mapStateToProps = (shell: Shell) => ({ valueFromState: getValueFromAPI(shell) })

        const ConnectedWithState = buildConnectedComponent()
            .mapStateToProps(mapStateToProps)
            .render(PureCompNeedsState)

        const { parentWrapper: withConnectedState } = renderInHost(<ConnectedWithState />, host)

        expect(withConnectedState && withConnectedState.text()).toBe(getValueFromAPI(host))
    })

    it('should pass shell to mapDispatchToProps', () => {
        const host = createAppHost([mockPackage])

        const PureCompNeedsDispatch = ({ valueFromDispatch }: { valueFromDispatch: string }) => <div>{valueFromDispatch}</div>
        const mapDispatchToProps = (shell: Shell) => ({ valueFromDispatch: getValueFromAPI(shell) })

        const ConnectedWithDispatch = buildConnectedComponent()
            .mapDispatchToProps(mapDispatchToProps)
            .render(PureCompNeedsDispatch)

        const { parentWrapper: withConnectedDispatch } = renderInHost(<ConnectedWithDispatch />, host)

        expect(withConnectedDispatch && withConnectedDispatch.text()).toBe(getValueFromAPI(host))
    })

    it('should pass exact shell to mapStateToProps', () => {
        const { host, renderInShellContext } = createMocks(mockPackage)

        const PureComp = ({ shellName }: { shellName: string }) => <div>{shellName}</div>
        const mapStateToProps = (shell: Shell) => ({ shellName: shell.name })

        const ConnectedComp = buildConnectedComponent()
            .mapStateToProps(mapStateToProps)
            .render(PureComp)

        const { parentWrapper: comp } = renderInShellContext(<ConnectedComp />)

        expect(comp && comp.text()).toBe(mockPackage.name)
    })

    it('should pass scoped state to mapStateToProps', () => {
        const { host, renderInShellContext } = createMocks(mockPackage)

        const PureCompNeedsState = ({ valueFromState }: { valueFromState: string }) => <div>{valueFromState}</div>
        const mapStateToProps = (shell: Shell, state: MockPackageState) => ({ valueFromState: getValueFromState(state) })

        const ConnectedWithState = buildConnectedComponent()
            .mapStateToProps(mapStateToProps)
            .render(PureCompNeedsState)

        const { parentWrapper: withConnectedState } = renderInShellContext(<ConnectedWithState />)

        expect(withConnectedState && withConnectedState.text()).toBe(getValueFromState(getMockShellState(host)))
    })

    it('should bind shell context', () => {
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

        host.addShells([otherEntryPoint])

        const PureComp = ({ value }: { value: string }) => <div>{value}</div>
        const mapStateToProps = (shell: Shell, state: MockPackageState) => ({ value: getValueFromState(state) })

        const ConnectedWithState = buildConnectedComponent()
            .withShell(getBoundShell())
            .mapStateToProps(mapStateToProps)
            .render(PureComp)

        const { parentWrapper: withConnectedState } = renderInShellContext(<ConnectedWithState />)

        expect(withConnectedState && withConnectedState.text()).toBe(boundShellState.mockValue)
    })

    it('should re-provide shell context for children of bound component', () => {
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

        host.addShells([otherEntryPoint])

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
        const mapStateToProps = (shell: Shell, state: MockPackageState) => ({ value: getValueFromState(state) })

        const ConnectedUnboundComp = buildConnectedComponent()
            .mapStateToProps(mapStateToProps)
            .render(PureComp)

        const ConnectedUnboundCompWithChildren = buildConnectedComponent()
            .mapStateToProps(mapStateToProps)
            .render(PureCompWithChildren)

        const ConnectedBoundCompWithChildren = buildConnectedComponent()
            .withShell(getBoundShell())
            .mapStateToProps(mapStateToProps)
            .render(PureCompWithChildren)

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
})
