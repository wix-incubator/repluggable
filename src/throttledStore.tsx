import { Reducer, createStore, Store, ReducersMapObject, combineReducers, AnyAction, Dispatch } from 'redux'
import { devToolsEnhancer } from 'redux-devtools-extension'
import { AppHostServicesProvider } from './appHostServices'
import _ from 'lodash'
import { AppHost, ExtensionSlot, ReducersMapObjectContributor, ObservableState, StateObserver, Shell, SlotKey } from './API'
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
    observable?: AnyPrivateObservableState
}

export interface ThrottledStore<T = any> extends Store<T> {
    flush(): void
}

export type ActionMonitorCallback = (action: AnyAction) => void
export interface PrivateThrottledStore<T = any> extends ThrottledStore<T> {
    broadcastNotify(): void
    observableNotify(observer: AnyPrivateObservableState): void
    resetPendingNotifications(): void
    setActionMonitor(callback: ActionMonitorCallback | null): void
}

export interface PrivateObservableState<TState, TSelector> extends ObservableState<TSelector> {
    notify(): void
}

export type AnyPrivateObservableState = PrivateObservableState<any, any>

const buildStoreReducer = (
    contributedState: ExtensionSlot<StateContribution>,
    broadcastNotify: PrivateThrottledStore['broadcastNotify'],
    observableNotify: PrivateThrottledStore['observableNotify']
): Reducer => {
    function withNotifyAction(originalReducersMap: ReducersMapObject, notifyAction: () => void): ReducersMapObject {
        const decorateReducer = (originalReducer: Reducer): Reducer => {
            return (state0, action) => {
                const state1 = originalReducer(state0, action)
                if (state1 !== state0) {
                    notifyAction()
                }
                return state1
            }
        }
        const wrapper = interceptAnyObject(originalReducersMap, (name, func) => {
            const originalReducer = func as Reducer
            return decorateReducer(originalReducer)
        })
        return wrapper
    }

    function withBroadcastOrObservableNotify(
        { notificationScope, reducerFactory, observable }: StateContribution,
        shellName: string
    ): ReducersMapObject {
        const originalReducersMap = reducerFactory()
        if (notificationScope === 'broadcasting') {
            return withNotifyAction(originalReducersMap, broadcastNotify)
        }
        if (!observable) {
            // should never happen; would be an internal bug
            throw new Error(`getPerShellReducersMapObject: notificationScope=observable but 'observable' is falsy, in shell '${shellName}'`)
        }
        return withNotifyAction(originalReducersMap, () => observableNotify(observable))
    }

    function getPerShellReducersMapObject(): ShellsReducersMap {
        return contributedState.getItems().reduce((map: ShellsReducersMap, item) => {
            const shellName = item.shell.name
            map[shellName] = {
                ...map[shellName],
                ...withBroadcastOrObservableNotify(item.contribution, shellName)
            }
            return map
        }, {})
    }

    function getCombinedShellReducers(): ReducersMapObject {
        const shellsReducerMaps = getPerShellReducersMapObject()
        const combinedReducersMap = _.mapValues(shellsReducerMaps, singleMap => combineReducers(singleMap))
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
    const newReducer = buildStoreReducer(contributedState, store.broadcastNotify, store.observableNotify)
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
    let pendingObservableNotifications: Set<AnyPrivateObservableState> | undefined
    let actionMonitor: ActionMonitorCallback | null = null

    const onBroadcastNotify = () => {
        pendingBroadcastNotification = true
    }
    const onObservableNotify = (observable: AnyPrivateObservableState) => {
        if (!pendingObservableNotifications) {
            pendingObservableNotifications = new Set<AnyPrivateObservableState>()
        }
        pendingObservableNotifications.add(observable)
    }
    const resetPendingNotifications = () => {
        pendingBroadcastNotification = false
        pendingObservableNotifications = undefined
    }

    const reducer = buildStoreReducer(contributedState, onBroadcastNotify, onObservableNotify)
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
            if (pendingBroadcastNotification || !pendingObservableNotifications) {
                host.getAppHostServicesShell().log.monitor('ThrottledStore.notifySubscribers', {}, () =>
                    _.forEach(broadcastSubscribers, invoke)
                )
            }
        } finally {
            resetPendingNotifications()
        }
    }

    const notifyObservers = () => {
        try {
            if (pendingObservableNotifications) {
                pendingObservableNotifications.forEach(observable => {
                    observable.notify()
                })
            }
        } finally {
            pendingObservableNotifications?.clear()
        }
    }

    const notifySubscribersOnAnimationFrame = animationFrameRenderer(requestAnimationFrame, cancelAnimationFrame, notifySubscribers)

    let cancelRender = _.noop

    store.subscribe(() => {
        notifyObservers()
        cancelRender = notifySubscribersOnAnimationFrame()
    })

    const flush = () => {
        cancelRender()
        notifySubscribers()
    }

    const dispatch: Dispatch<AnyAction> = action => {
        resetPendingNotifications()
        actionMonitor && actionMonitor(action)
        const dispatchResult = store.dispatch(action)
        return dispatchResult
    }

    const result: PrivateThrottledStore = {
        ...store,
        subscribe,
        dispatch,
        flush,
        broadcastNotify: onBroadcastNotify,
        observableNotify: onObservableNotify,
        resetPendingNotifications,
        setActionMonitor(callback: ActionMonitorCallback | null) {
            actionMonitor = callback
        }
    }

    resetPendingNotifications()
    return result
}

export const createObservable = <TState, TSelector>(
    shell: Shell,
    uniqueName: string,
    selectorFactory: (state: TState) => TSelector
): PrivateObservableState<TState, TSelector> => {
    const subscribersSlotKey: SlotKey<StateObserver<TSelector>> = {
        name: uniqueName
    }
    const observersSlot = shell.declareSlot(subscribersSlotKey)
    let cachedSelector: TSelector | undefined

    const getOrCreateCachedSelector = (): TSelector => {
        if (cachedSelector) {
            return cachedSelector
        }
        const newSelector = selectorFactory(shell.getStore<TState>().getState())
        cachedSelector = newSelector
        return newSelector
    }

    return {
        subscribe(fromShell, callback) {
            observersSlot.contribute(fromShell, callback)
            return () => {
                observersSlot.discardBy(item => item.contribution === callback)
            }
        },
        notify() {
            cachedSelector = undefined
            const newSelector = getOrCreateCachedSelector()
            invokeSlotCallbacks(observersSlot, newSelector)
        },
        current: getOrCreateCachedSelector
    }
}
