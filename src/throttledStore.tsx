import { Reducer, createStore, Store, ReducersMapObject, combineReducers, AnyAction, Dispatch } from 'redux'
import { devToolsEnhancer } from 'redux-devtools-extension'
import { AppHostServicesProvider } from './appHostServices'
import _ from 'lodash'
import { AppHost, ExtensionSlot, ReducersMapObjectContributor, ChangeObserver, ChangeObserverCallback, Shell, SlotKey } from './API'
import { contributeInstalledShellsState } from './installedShellsState'
import { interceptAnyObject } from './interceptAnyObject'
import { invokeSlotCallbacks } from './invokeSlotCallbacks'

type ReducerNotificationScope = 'broadcasting' | 'observable'
interface ShellsReducersMap {
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
    observer?: AnyPrivateChangeObserver
}

export interface ThrottledStore<T = any> extends Store<T> {
    flush(): void
}

export interface PrivateThrottledStore<T = any> extends ThrottledStore<T> {
    broadcastNotify(): void
    observerNotify(observer: AnyPrivateChangeObserver): void
    resetPendingNotifications(): void
}

export interface PrivateChangeObserver<TState, TSelector> extends ChangeObserver<TSelector> {
    notify(): void
}

export type AnyPrivateChangeObserver = PrivateChangeObserver<any, any>

const buildStoreReducer = (
    contributedState: ExtensionSlot<StateContribution>,
    broadcastNotify: PrivateThrottledStore['broadcastNotify'],
    observerNotify: PrivateThrottledStore['observerNotify']
): Reducer => {
    function withBroadcastingReducers(originalReducersMap: ReducersMapObject): ReducersMapObject {
        const withBroadcast = (originalReducer: Reducer): Reducer => {
            return (state0, action) => {
                const state1 = originalReducer(state0, action)
                if (/*state0 && */ state1 !== state0) {
                    broadcastNotify()
                }
                return state1
            }
        }
        const wrapper = interceptAnyObject(originalReducersMap, (name, func) => {
            const originalReducer = func as Reducer
            return withBroadcast(originalReducer)
        })
        return wrapper
    }

    function withObservableReducers(originalReducersMap: ReducersMapObject, observer: AnyPrivateChangeObserver): ReducersMapObject {
        const withObserver = (originalReducer: Reducer): Reducer => {
            return (state0, action) => {
                const state1 = originalReducer(state0, action)
                if (state1 !== state0) {
                    observerNotify(observer)
                }
                return state1
            }
        }
        const wrapper = interceptAnyObject(originalReducersMap, (name, func) => {
            const originalReducer = func as Reducer
            return withObserver(originalReducer)
        })
        return wrapper
    }

    function withBroadcastingOrObservable(
        { notificationScope, reducerFactory, observer }: StateContribution,
        shellName: string
    ): ReducersMapObject {
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
        return contributedState.getItems().reduce((map: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            map[shellName] = {
                ...map[shellName],
                ...withBroadcastingOrObservable(item.contribution, shellName)
            }
            return map
        }, {})
    }

    function getCombinedShellReducers(): ReducersMapObject {
        const shellsReducerMaps = getPerShellReducersMapObject()
        const combinedReducersMap = Object.keys(shellsReducerMaps).reduce((map: ReducersMapObject, shellName: string) => {
            map[shellName] = combineReducers(shellsReducerMaps[shellName])
            return map
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
    const combinedReducer = combineReducers(reducersMap)
    return combinedReducer
}

export const updateThrottledStore = (store: PrivateThrottledStore, contributedState: ExtensionSlot<StateContribution>): void => {
    const newReducer = buildStoreReducer(contributedState, store.broadcastNotify, store.observerNotify)
    store.replaceReducer(newReducer)
    store.resetPendingNotifications()
}

export const createThrottledStore = (
    host: AppHost & AppHostServicesProvider,
    contributedState: ExtensionSlot<StateContribution>,
    requestAnimationFrame: Window['requestAnimationFrame'],
    cancelAnimationFrame: Window['cancelAnimationFrame']
): PrivateThrottledStore => {
    let pendingBroadcastNotification = false
    let pendingObserverNotifications: Set<AnyPrivateChangeObserver> | undefined

    const onBroadcastNotify = () => {
        pendingBroadcastNotification = true
    }
    const onObserverNotify = (observer: AnyPrivateChangeObserver) => {
        if (!pendingObserverNotifications) {
            pendingObserverNotifications = new Set<AnyPrivateChangeObserver>()
        }
        pendingObserverNotifications.add(observer)
    }
    const resetPendingNotifications = () => {
        pendingBroadcastNotification = false
        pendingObserverNotifications = undefined
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
            if (pendingBroadcastNotification || !pendingObserverNotifications) {
                host.getAppHostServicesShell().log.monitor('ThrottledStore.notifySubscribers', {}, () =>
                    _.forEach(broadcastSubscribers, invoke)
                )
            }
            if (pendingObserverNotifications) {
                pendingObserverNotifications.forEach(observer => {
                    observer.notify()
                })
            }
        } finally {
            resetPendingNotifications()
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

    const dispatch: Dispatch<AnyAction> = action => {
        resetPendingNotifications()
        const dispatchResult = store.dispatch(action)
        return dispatchResult
    }

    const result: PrivateThrottledStore = {
        ...store,
        subscribe,
        dispatch,
        flush,
        broadcastNotify: onBroadcastNotify,
        observerNotify: onObserverNotify,
        resetPendingNotifications
    }

    resetPendingNotifications()
    return result
}

export const createChangeObserver = <TState, TSelector>(
    shell: Shell,
    uniqueName: string,
    selectorFactory: (state: TState) => TSelector
): PrivateChangeObserver<TState, TSelector> => {
    const subscribersSlotKey: SlotKey<ChangeObserverCallback<TSelector>> = {
        name: uniqueName
    }
    const subscribersSlot = shell.declareSlot(subscribersSlotKey)
    let selector: TSelector | undefined

    const getOrCreateSelector = (): TSelector => {
        if (selector) {
            return selector
        }
        const newSelector = selectorFactory(shell.getStore<TState>().getState())
        selector = newSelector
        return newSelector
    }

    return {
        subscribe(fromShell, callback) {
            subscribersSlot.contribute(fromShell, callback)
            return () => {
                subscribersSlot.discardBy(item => item.contribution === callback)
            }
        },
        notify() {
            selector = undefined
            const newSelector = getOrCreateSelector()
            invokeSlotCallbacks(subscribersSlot, newSelector)
        },
        getValue: getOrCreateSelector
    }
}
