import { Reducer, createStore, Store, ReducersMapObject, combineReducers, AnyAction } from 'redux'
import { devToolsEnhancer } from 'redux-devtools-extension'
import { AppHostServicesProvider } from './appHostServices'
import _ from 'lodash'
import { AppHost, ExtensionSlot, ReducersMapObjectContributor, ChangeObserver, ChangeObserverCallback, Shell, SlotKey } from './API'
import { contributeInstalledShellsState } from './installedShellsState'
import { interceptAnyObject } from './interceptAnyObject'
import { invokeSlotCallbacks } from './invokeSlotCallbacks'

type ReducerNotificationScope = 'broadcasting' | 'observable'
interface ReducersMapObjectPerShell {
    [shellName: string]: ReducersMapObject
}
interface ShellsReducersMap {
    broadcastingReducers: ReducersMapObjectPerShell
    observableReducers: ReducersMapObjectPerShell
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
    notificationScope: ReducerNotificationScope
    observer?: PrivateChangeObserver
}

export interface ThrottledStore<T = any> extends Store<T> {
    flush(): void
}

export interface PrivateThrottledStore<T = any> extends ThrottledStore<T> {
    broadcastNotify(): void
}

export interface PrivateChangeObserver extends ChangeObserver {
    notify(): void
}

const buildStoreReducer = (contributedState: ExtensionSlot<StateContribution>, broadcastNotify: () => void): Reducer => {
    function withBroadcast(reducer: Reducer): Reducer {
        return (state0, action) => {
            const state1 = reducer(state0, action)
            if (state1 !== state0) {
                broadcastNotify()
            }
            return state1
        }
    }

    function withBroadcastingReducers(original: ReducersMapObject): ReducersMapObject {
        const wrapper = interceptAnyObject(original, (name, original) => {
            const originalReducer = original as Reducer
            return withBroadcast(originalReducer)
        })
        return wrapper
    }

    function withObserver(reducer: Reducer, observer: PrivateChangeObserver): Reducer {
        return (state0, action) => {
            const state1 = reducer(state0, action)
            if (state1 !== state0) {
                observer.notify()
            }
            return state1
        }
    }

    function withObservableReducers(original: ReducersMapObject, observer: PrivateChangeObserver): ReducersMapObject {
        const wrapper = interceptAnyObject(original, (name, original) => {
            const originalReducer = original as Reducer
            return withObserver(originalReducer, observer)
        })
        return wrapper
    }

    function getPerShellReducersMapObject(): ShellsReducersMap {
        const emptyMap: ShellsReducersMap = {
            broadcastingReducers: {},
            observableReducers: {}
        }
        return contributedState.getItems().reduce((reducersMap: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            const { observer, reducerFactory } = item.contribution
            switch (item.contribution.notificationScope) {
                case 'broadcasting':
                    reducersMap.broadcastingReducers[shellName] = {
                        ...reducersMap.broadcastingReducers[shellName],
                        ...withBroadcastingReducers(reducerFactory() || {})
                    }
                    break
                case 'observable':
                    if (!observer) {
                        // should never happen; would be an internal bug
                        throw new Error(`getPerShellReducersMapObject: notificationScope=observable but observer is falsy in shell '${shellName}'`)
                    }
                    reducersMap.observableReducers[shellName] = {
                        ...reducersMap.observableReducers[shellName],
                        ...withObservableReducers(reducerFactory() || {}, observer)
                    }
            }
            return reducersMap
        }, emptyMap)
    }

    function getCombinedShellReducers(): ReducersMapObject {
        const shellsReducerMaps = getPerShellReducersMapObject()
        return Object.keys(shellsReducerMaps.broadcastingReducers).reduce((reducersMap: ReducersMapObject, shellName: string) => {
            reducersMap[shellName] = combineReducers(shellsReducerMaps.broadcastingReducers[shellName])
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

export const updateThrottledStore = (store: PrivateThrottledStore, contributedState: ExtensionSlot<StateContribution>): void => {
    const newReducer = buildStoreReducer(contributedState, store.broadcastNotify)
    store.replaceReducer(newReducer)
}

export const createThrottledStore = (
    host: AppHost & AppHostServicesProvider,
    contributedState: ExtensionSlot<StateContribution>,
    requestAnimationFrame: Window['requestAnimationFrame'],
    cancelAnimationFrame: Window['cancelAnimationFrame']
): PrivateThrottledStore => {
    const reducer = buildStoreReducer(contributedState, () => {})
    const store: Store = host.options.enableReduxDevtoolsExtension
        ? createStore(reducer, devToolsEnhancer({ name: 'repluggable' }))
        : createStore(reducer)
    const invoke = (f: Subscriber) => f()

    let receivedNotifyBroadcast = false
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
        if (receivedNotifyBroadcast) {
            try {
                cancelRender = notifySubscribersOnAnimationFrame()
            } finally {
                receivedNotifyBroadcast = false
            }
        }
    })

    const flush = () => {
        cancelRender()
        notifySubscribers()
    }

    const onBroadcastNotify = () => {
        receivedNotifyBroadcast = true
    }

    //TODO: temporary for debug; remove when done
    // const dispatch: Dispatch<AnyAction> = (action) => {
    //     receivedNotifyBroadcast = true
    //     const result = store.dispatch(action)
    //     return result
    // }

    const result: PrivateThrottledStore = {
        ...store,
        subscribe,
        //dispatch,
        flush,
        broadcastNotify: onBroadcastNotify
    }
    return result
}

export const createChangeObserver = (shell: Shell, uniqueName: string): PrivateChangeObserver => {
    const subscribersSlotKey: SlotKey<ChangeObserverCallback> = {
        name: uniqueName
    }
    const subscribersSlot = shell.declareSlot(subscribersSlotKey)
    return {
        type: 'RepluggableChangeObserver',
        subscribe(fromShell, callback) {
            if (typeof callback == 'function') {
                subscribersSlot.contribute(fromShell, callback)
            }
        },
        notify() {
            invokeSlotCallbacks(subscribersSlot)
        }
    }
}
