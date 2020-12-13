import { Reducer, createStore, Store, ReducersMapObject, combineReducers, AnyAction, Dispatch } from 'redux'
import { devToolsEnhancer } from 'redux-devtools-extension'
import { AppHostServicesProvider } from './appHostServices'
import _ from 'lodash'
import { AppHost, ExtensionSlot, ReducersMapObjectContributor, ChangeObserver, ChangeObserverCallback, Shell, SlotKey } from './API'
import { contributeInstalledShellsState } from './installedShellsState'
import { interceptAnyObject } from './interceptAnyObject'
import { invokeSlotCallbacks } from './invokeSlotCallbacks'

type ReducerNotificationScope = 'broadcasting' | 'observable'
// interface ReducersMapObjectPerShell {
//     [shellName: string]: ReducersMapObject
// }
interface ShellsReducersMap {
    //broadcastingReducers: ReducersMapObjectPerShell
    //observableReducers: ReducersMapObjectPerShell
    [shellName: string]: ReducersMapObject
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
    observerNotify(observer: PrivateChangeObserver): void
}

export interface PrivateChangeObserver extends ChangeObserver {
    notify(): void
}

const buildStoreReducer = (
    contributedState: ExtensionSlot<StateContribution>, 
    broadcastNotify: PrivateThrottledStore['broadcastNotify'],
    observerNotify: PrivateThrottledStore['observerNotify']
): Reducer => {

    function withBroadcastingReducers(original: ReducersMapObject): ReducersMapObject {
        const withBroadcast = (reducer: Reducer): Reducer => {
            return (state0, action) => {
                const state1 = reducer(state0, action)
                if (state1 !== state0) {
                    broadcastNotify()
                }
                return state1
            }
        }
        const wrapper = interceptAnyObject(original, (name, original) => {
            const originalReducer = original as Reducer
            return withBroadcast(originalReducer)
        })
        return wrapper
    }

    function withObservableReducers(original: ReducersMapObject, observer: PrivateChangeObserver): ReducersMapObject {
        const withObserver = (reducer: Reducer): Reducer => {
            return (state0, action) => {
                const state1 = reducer(state0, action)
                if (state1 !== state0) {
                    observerNotify(observer)
                }
                return state1
            }
        }
        const wrapper = interceptAnyObject(original, (name, original) => {
            const originalReducer = original as Reducer
            return withObserver(originalReducer)
        })
        return wrapper
    }

    function withBroadcastingOrObservable({notificationScope, reducerFactory, observer}: StateContribution, shellName: string): ReducersMapObject {
        if (notificationScope === 'broadcasting') {
            return withBroadcastingReducers(reducerFactory())
        }
        if (!observer) {
            // should never happen; would be an internal bug
            throw new Error(`getPerShellReducersMapObject: notificationScope=observable but observer is falsy in shell '${shellName}'`)
        }
        return withObservableReducers(reducerFactory(), observer)
    }

    function getPerShellReducersMapObject(): ShellsReducersMap {
        return contributedState.getItems().reduce((reducersMap: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            reducersMap[shellName] = {
                ...reducersMap[shellName],
                ...withBroadcastingOrObservable(item.contribution, shellName)
            }
            return reducersMap
        }, {})
    }

    function getCombinedShellReducers(): ReducersMapObject {
        const shellsReducerMaps = getPerShellReducersMapObject()
        const combinedReducersMap = Object.keys(shellsReducerMaps).reduce((reducersMap: ReducersMapObject, shellName: string) => {
            reducersMap[shellName] = combineReducers(shellsReducerMaps[shellName])
            return reducersMap
        }, {})
        return combinedReducersMap
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
    const newReducer = buildStoreReducer(contributedState, store.broadcastNotify, store.observerNotify)
    store.replaceReducer(newReducer)
}

export const createThrottledStore = (
    host: AppHost & AppHostServicesProvider,
    contributedState: ExtensionSlot<StateContribution>,
    requestAnimationFrame: Window['requestAnimationFrame'],
    cancelAnimationFrame: Window['cancelAnimationFrame']
): PrivateThrottledStore => {
    let pendingBroadcastNotify = false
    let pendingObserversToNotify: PrivateChangeObserver[] = []

    const onBroadcastNotify = () => {
        pendingBroadcastNotify = true
    }
    const onObserverNotify = (observer: PrivateChangeObserver) => {
        pendingObserversToNotify.push(observer)
    }

    const reducer = buildStoreReducer(contributedState, onBroadcastNotify, onObserverNotify)
    const store: Store = host.options.enableReduxDevtoolsExtension
        ? createStore(reducer, devToolsEnhancer({ name: 'repluggable' }))
        : createStore(reducer)
    const invoke = (f: Subscriber) => f()

    let broadcastSubscribers: Subscriber[] = []

    const subscribe = (subscriber: Subscriber) => {
        broadcastSubscribers = _.concat(broadcastSubscribers, subscriber)
        return () => {
            broadcastSubscribers = _.without(broadcastSubscribers, subscriber)
        }
    }
    const notifySubscribers = () => {
        try {
            if (pendingBroadcastNotify || pendingObserversToNotify.length === 0) {
                host.getAppHostServicesShell().log.monitor('ThrottledStore.notifySubscribers', {}, () => _.forEach(broadcastSubscribers, invoke))
            } 
            pendingObserversToNotify.forEach(observer => {
                observer.notify()
            })
        } finally {
            pendingBroadcastNotify = false
            pendingObserversToNotify = []
        }
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

    //TODO: temporary for debug; remove when done
    const dispatch: Dispatch<AnyAction> = (action) => {
        pendingBroadcastNotify = false //true
        const result = store.dispatch(action)
        return result
    }

    const result: PrivateThrottledStore = {
        ...store,
        subscribe,
        dispatch,
        flush,
        broadcastNotify: onBroadcastNotify,
        observerNotify: onObserverNotify
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
