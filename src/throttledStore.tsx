import { Reducer, createStore, Store, ReducersMapObject, combineReducers, AnyAction } from 'redux'
import { devToolsEnhancer } from 'redux-devtools-extension'
import { AppHostServicesProvider } from './appHostServices'
import _ from 'lodash'
import { AppHost, ExtensionSlot, ReducersMapObjectContributor, StateObserver } from './API'
import { contributeInstalledShellsState } from './installedShellsState'
//TODO import { interceptAnyObject } from './interceptAnyObject'

interface ShellsReducersMap {
    slowlyChanging: {
        [shellName: string]: ReducersMapObject
    }
    rapidlyChanging: {
        [shellName: string]: ReducersMapObject
    }
}

const curry = _.curry

const animationFrameRenderer = curry(
    (requestAnimationFrame: Window['requestAnimationFrame'], cancelAnimationFrame: Window['cancelAnimationFrame'], render: () => void) => {
        let requestId: number | null = null
        return () => {
            if (!requestId) {
                requestId = requestAnimationFrame(() => {
                    requestId = null
                    render()
                })
            }
            return () => {
                cancelAnimationFrame(requestId || -1)
                requestId = null
            }
        }
    }
)

type Subscriber = () => void

export interface StateContribution<TState = {}, TAction extends AnyAction = AnyAction> {
    reducerFactory: ReducersMapObjectContributor<TState, TAction>
    observers: StateObserver[]
    changeRate: 'slow' | 'rapid'
}

export interface ThrottledStore<T = any> extends Store<T> {
    flush(): void
}

const buildStoreReducer = (contributedState: ExtensionSlot<StateContribution>): Reducer => {

    //TODO
    // let slowStateChangeCount = 0

    // function interceptSlowlyChangingReducer(reducer: Reducer): Reducer {
    //     return (state0, action) => {
    //         slowStateChangeCount++
    //         const state1 = reducer(state0, action)
    //         if (state1 !== state0) {
    //             slowStateChangeCount++
    //         }
    //         return state1
    //     }
    // }

    function getPerShellReducersMapObject(): ShellsReducersMap {
        const emptyMap: ShellsReducersMap = {
            slowlyChanging: {},
            rapidlyChanging: {}
        }
        return contributedState.getItems().reduce((reducersMap: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            reducersMap.slowlyChanging[shellName] = {
                ...reducersMap.slowlyChanging[shellName],
                ...item.contribution.reducerFactory()
            }
            return reducersMap
        }, emptyMap)
    }

    function getCombinedShellReducers(): ReducersMapObject {
        const shellsReducerMaps = getPerShellReducersMapObject()
        return Object.keys(shellsReducerMaps).reduce((reducersMap: ReducersMapObject, shellName: string) => {
            reducersMap[shellName] = combineReducers(shellsReducerMaps.slowlyChanging[shellName])
            return reducersMap
        }, {})
    }

    function buildReducersMapObject(): ReducersMapObject {
        // TODO: get rid of builtInReducersMaps
        const builtInReducersMaps: ReducersMapObject = {
            ...contributeInstalledShellsState()
        }
        return { ...builtInReducersMaps, ...getCombinedShellReducers() }
    }

    const reducersMap = buildReducersMapObject()
    const reducer = combineReducers(reducersMap)
    
    return reducer
}

export const updateThrottledStore = (
    store: ThrottledStore,
    contributedState: ExtensionSlot<StateContribution>
): void => {
    const newReducer = buildStoreReducer(contributedState)
    store.replaceReducer(newReducer)
}

export const createThrottledStore = (
    host: AppHost & AppHostServicesProvider,
    contributedState: ExtensionSlot<StateContribution>,
    requestAnimationFrame: Window['requestAnimationFrame'],
    cancelAnimationFrame: Window['cancelAnimationFrame']
): ThrottledStore => {

    const reducer = buildStoreReducer(contributedState)
    const store = host.options.enableReduxDevtoolsExtension
        ? createStore(reducer, devToolsEnhancer({ name: 'repluggable' }))
        : createStore(reducer)
    const invoke = (f: Subscriber) => f()
    let subscribers: Subscriber[] = []
    const subscribe = (subscriber: Subscriber) => {
        subscribers = _.concat(subscribers, subscriber)
        return () => {
            subscribers = _.without(subscribers, subscriber)
        }
    }
    const notifySubscribers = () => {
        host.getAppHostServicesShell().log.monitor('ThrottledStore.notifySubscribers', {}, () => _.forEach(subscribers, invoke))
    }

    const notifySubscribersOnAnimationFrame = animationFrameRenderer(requestAnimationFrame, cancelAnimationFrame, notifySubscribers)

    let cancelRender = _.noop

    store.subscribe(() => {
        cancelRender = notifySubscribersOnAnimationFrame()
    })

    const flush = () => {
        cancelRender()
        notifySubscribers()
    }

    return _.defaults(
        {
            subscribe,
            flush
        },
        store
    )
}
