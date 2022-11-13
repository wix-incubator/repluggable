import { AnySlotKey, AppHost, EntryPoint, ObservableState, Shell, SlotKey } from '../src'
import _ from 'lodash'
import { createAppHost, renderInHost, withThrowOnError } from '../testKit'
import { ReactElement } from 'react'
import { ObservedSelectorsMap } from '../src/API'
import { AnyAction } from 'redux'
// import { AnyAction } from 'redux'

const withDependencyAPIs = (ep: EntryPoint, deps: AnySlotKey[]): EntryPoint => {
    return {
        ...ep,
        getDependencyAPIs: () => (ep.getDependencyAPIs ? [...ep.getDependencyAPIs(), ...deps] : deps)
    }
}

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
                        return action.type === 'SET_FIRST_OBSERVABLE' ? { firstObservableValue: action.value } : state
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
                        return action.type === 'SET_SECOND_OBSERVABLE' ? { secondObservableValue: action.value } : state
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

    interface ObservedData {
        firstObservable: ObservableState<FirstObservableSelectors>
        secondObservable: ObservableState<SecondObservableSelectors>
    }
    type ObservedDataMap = ObservedSelectorsMap<ObservedData>

    it('should update chain subscriber on dependency update', () => {
        const { host, shell } = createMocks(withDependencyAPIs(entryPointFirstObservable, [SecondObservableAPI]), [
            entryPointSecondObservable
        ])

        const chainSpy = jest.fn()
        const firstObservable = shell.getAPI(FirstObservableAPI).observables.firstObservable
        const secondObservable = shell.getAPI(SecondObservableAPI).observables.secondObservable

        const chain = shell.contributeChainObservableState(
            { firstObservable, secondObservable },
            (observedDependencies: ObservedDataMap) => {
                return (
                    observedDependencies.firstObservable.getFirstObservableValue() +
                    '**' +
                    observedDependencies.secondObservable.getSecondObservableValue()
                )
            }
        )

        const firstUpdate = 'first_update'
        const secondUpdate = 'second_update'

        chain.subscribe(shell, newChain => {
            chainSpy(newChain)
        })

        let expectedValue = firstInitialValue + separator + secondInitialValue
        expect(chain.current()).toBe(expectedValue)

        dispatchAndFlush({ type: 'SET_FIRST_OBSERVABLE', value: firstUpdate }, host)

        expectedValue = firstUpdate + separator + secondInitialValue
        expect(chainSpy).toHaveBeenCalledWith(expectedValue)
        expect(chain.current()).toBe(expectedValue)

        dispatchAndFlush({ type: 'SET_SECOND_OBSERVABLE', value: secondUpdate }, host)

        expectedValue = firstUpdate + separator + secondUpdate
        expect(chainSpy).toHaveBeenCalledWith(expectedValue)
        expect(chain.current()).toBe(expectedValue)
    })
})
