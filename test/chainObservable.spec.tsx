import { AnySlotKey, EntryPoint, ObservableState, observeWithShell, SlotKey } from '../src'
import { ObservedSelectorsMap, Shell } from '../src/API'
import { createMocks, dispatchAndFlush } from './utils'
import React, { FunctionComponent } from 'react'

const withDependencyAPIs = (ep: EntryPoint, deps: AnySlotKey[]): EntryPoint => {
    return {
        ...ep,
        getDependencyAPIs: () => (ep.getDependencyAPIs ? [...ep.getDependencyAPIs(), ...deps] : deps)
    }
}

describe('chainObservable', () => {
    interface FirstObservableState {
        firstObservable: { firstObservableValue: string }
    }
    interface SecondObservableState {
        secondObservable: { secondObservableValue: string }
    }

    interface FirstObservableAPI {
        observables: { firstObservable: ObservableState<FirstObservableSelectors> }
    }
    interface FirstObservableSelectors {
        getFirstObservableValue(): string
    }
    const FirstObservableAPI: SlotKey<FirstObservableAPI> = { name: 'FIRST_OBSERVABLE_API', public: true }

    interface SecondObservableAPI {
        observables: { secondObservable: ObservableState<SecondObservableSelectors> }
    }
    interface SecondObservableSelectors {
        getSecondObservableValue(): string
    }
    const SecondObservableAPI: SlotKey<SecondObservableAPI> = { name: 'SECOND_OBSERVABLE_API', public: true }

    interface ObservedChain {
        observablesChain: ObservableState<string>
    }
    type ObservedChainMap = ObservedSelectorsMap<ObservedChain>

    interface ChainDependencies {
        firstObservable: ObservableState<FirstObservableSelectors>
        secondObservable: ObservableState<SecondObservableSelectors>
    }
    type ChainDependenciesMap = ObservedSelectorsMap<ChainDependencies>

    interface ChainAPI {
        chainedObservable: ObservableState<string>
    }
    const ChainAPI: SlotKey<ChainAPI> = { name: 'Chain API', public: true }

    const setFirstObservableType = 'SET_FIRST_OBSERVABLE'
    const setSecondObservableType = 'SET_SECOND_OBSERVABLE'

    const firstInitialValue = 'first_init'
    const secondInitialValue = 'second_init'
    const separator = '**'

    const entryPointFirstObservable: EntryPoint = {
        name: 'FIRST_OBSERVABLE_ENTRY_POINT',
        declareAPIs: () => [FirstObservableAPI],
        attach(shell) {
            const firstObservable = shell.contributeObservableState<FirstObservableState, FirstObservableSelectors>(
                () => ({
                    firstObservable: (state = { firstObservableValue: firstInitialValue }, action) => {
                        return action.type === setFirstObservableType ? { firstObservableValue: action.value } : state
                    }
                }),
                state => {
                    return {
                        getFirstObservableValue: () => state.firstObservable.firstObservableValue
                    }
                }
            )
            shell.contributeAPI(FirstObservableAPI, () => ({
                observables: {
                    firstObservable
                }
            }))
        }
    }

    const entryPointSecondObservable: EntryPoint = {
        name: 'SECOND_OBSERVABLE_ENTRY_POINT',
        declareAPIs: () => [SecondObservableAPI],
        attach(shell) {
            const secondObservable = shell.contributeObservableState<SecondObservableState, SecondObservableSelectors>(
                () => ({
                    secondObservable: (state = { secondObservableValue: secondInitialValue }, action) => {
                        return action.type === setSecondObservableType ? { secondObservableValue: action.value } : state
                    }
                }),
                state => {
                    return {
                        getSecondObservableValue: () => state.secondObservable.secondObservableValue
                    }
                }
            )
            shell.contributeAPI(SecondObservableAPI, () => ({
                observables: {
                    secondObservable
                }
            }))
        }
    }

    const chainEntryPoint: EntryPoint = {
        name: 'Chain entry point',
        getDependencyAPIs: () => [FirstObservableAPI, SecondObservableAPI],
        declareAPIs: () => [ChainAPI],
        attach(boundShell: Shell) {
            const chain = chainTwoObservables(boundShell)
            boundShell.contributeAPI(ChainAPI, () => ({
                chainedObservable: chain
            }))
        }
    }

    const chainSpy = jest.fn()
    const chainTwoObservables = (shell: Shell) => {
        const firstObservable = shell.getAPI(FirstObservableAPI).observables.firstObservable
        const secondObservable = shell.getAPI(SecondObservableAPI).observables.secondObservable

        return shell.contributeChainObservableState({ firstObservable, secondObservable }, (observedDependencies: ChainDependenciesMap) => {
            return (
                observedDependencies.firstObservable.getFirstObservableValue() +
                separator +
                observedDependencies.secondObservable.getSecondObservableValue()
            )
        })
    }

    beforeEach(() => {
        chainSpy.mockClear()
    })

    it('should update chain subscriber on dependency update', () => {
        const { host, shell } = createMocks(withDependencyAPIs(entryPointFirstObservable, [SecondObservableAPI]), [
            entryPointSecondObservable
        ])

        const chain = chainTwoObservables(shell)

        const firstUpdate = 'first_update'
        const secondUpdate = 'second_update'

        chain.subscribe(shell, newChain => {
            chainSpy(newChain)
        })

        let expectedValue = firstInitialValue + separator + secondInitialValue
        expect(chain.current()).toBe(expectedValue)

        dispatchAndFlush({ type: setFirstObservableType, value: firstUpdate }, host)

        expectedValue = firstUpdate + separator + secondInitialValue
        expect(chainSpy).toHaveBeenCalledWith(expectedValue)
        expect(chain.current()).toBe(expectedValue)

        dispatchAndFlush({ type: setSecondObservableType, value: secondUpdate }, host)

        expectedValue = firstUpdate + separator + secondUpdate
        expect(chainSpy).toHaveBeenCalledWith(expectedValue)
        expect(chain.current()).toBe(expectedValue)
    })

    it('should be able to chain a chain', () => {
        const { host, shell } = createMocks(entryPointFirstObservable, [entryPointSecondObservable, chainEntryPoint])
        const newChainEnding = '#$%'

        const observablesChain = host.getAPI(ChainAPI).chainedObservable
        const newChain = shell.contributeChainObservableState({ observablesChain }, (observedDependencies: ObservedChainMap) => {
            return observedDependencies.observablesChain + newChainEnding
        })

        const newChainSpy = jest.fn()
        newChain.subscribe(shell, newValue => {
            newChainSpy(newValue)
        })

        expect(newChain.current()).toBe(firstInitialValue + separator + secondInitialValue + newChainEnding)

        dispatchAndFlush({ type: setSecondObservableType, value: 'Hello' }, host)

        const newChainedValue = firstInitialValue + separator + 'Hello' + newChainEnding
        expect(newChainSpy).toHaveBeenCalledWith(newChainedValue)
        expect(newChain.current()).toBe(newChainedValue)
    })

    it('should update component observing a chain', () => {
        const renderSpyFunc = jest.fn()
        const PureComp: FunctionComponent<ObservedSelectorsMap<{ chain: ObservableState<string> }>> = props => {
            renderSpyFunc()
            return (
                <div>
                    <div id="CHAIN">{props.chain}</div>
                </div>
            )
        }

        const { host, shell, renderInShellContext } = createMocks(entryPointFirstObservable, [entryPointSecondObservable, chainEntryPoint])

        const ObservingComponent = observeWithShell(
            {
                chain: host.getAPI(ChainAPI).chainedObservable
            },
            shell
        )(PureComp)

        const { root } = renderInShellContext(<ObservingComponent />)
        if (!root) {
            throw new Error('Connected component failed to render')
        }

        expect(root.find(ObservingComponent).find('#CHAIN').text()).toBe(firstInitialValue + separator + secondInitialValue)
        expect(renderSpyFunc).toHaveBeenCalledTimes(1)

        dispatchAndFlush({ type: setFirstObservableType, value: 'UPDATE' }, host)

        expect(renderSpyFunc).toHaveBeenCalledTimes(2)
        expect(root.find(ObservingComponent).find('#CHAIN').text()).toBe('UPDATE' + separator + secondInitialValue)

        dispatchAndFlush({ type: 'NonExisting', value: 'UPDATE' }, host)
        expect(renderSpyFunc).toHaveBeenCalledTimes(2)
    })
})
