import _ from 'lodash'
import { Action, AnyAction, Dispatch, Reducer, ReducersMapObject, Store, Unsubscribe, combineReducers, createStore } from 'redux'
import { devToolsEnhancer } from 'redux-devtools-extension'
import { AppHost, ExtensionSlot, ObservableState, ReducersMapObjectContributor, Shell, SlotKey, StateObserver } from './API'
import { AppHostServicesProvider } from './appHostServices'
import { contributeInstalledShellsState } from './installedShellsState'
import { interceptAnyObject } from './interceptAnyObject'
import { invokeSlotCallbacks } from './invokeSlotCallbacks'

type ReducerNotificationScope = 'broadcasting' | 'observable'
interface ShellsReducersMap {
    [shellName: string]: ReducersMapObject
}

interface AnyShellAction extends AnyAction {
    __shellName?: string
}

function createTimeOutPublisher(notify: () => void) {
    let id: null | NodeJS.Timeout = null
    return () => {
        if (id === null) {
            id = setTimeout(() => {
                id = null
                notify()
            }, 0)
        }
        return () => {
            if (id === null) {
                return
            }
            clearTimeout(id)
            id = null
        }
    }
}

function createAnimationFramePublisher(notify: () => void) {
    let id: null | number = null
    return () => {
        if (id === null) {
            id = requestAnimationFrame(() => {
                id = null
                notify()
            })
        }
        return () => {
            if (id === null) {
                return
            }
            cancelAnimationFrame(id)
            id = null
        }
    }
}

type Subscriber = () => void

export interface StateContribution<TState = {}, TAction extends AnyAction = AnyAction> {
    reducerFactory: ReducersMapObjectContributor<TState, TAction>
    notificationScope: ReducerNotificationScope
    observable?: AnyPrivateObservableState
}

export interface ThrottledStore<T = any> extends Store<T> {
    hasPendingSubscribers(): boolean
    flush(config?: { excecutionType: 'scheduled' | 'immediate' | 'default' }): void
    deferSubscriberNotifications<K>(action: () => K | Promise<K>, shouldDispatchClearCache?: boolean): Promise<K>
}

export interface PrivateThrottledStore<T = any> extends ThrottledStore<T> {
    broadcastNotify(): void
    observableNotify(observer: AnyPrivateObservableState): void
    resetPendingNotifications(): void
    syncSubscribe(listener: () => void): Unsubscribe
    dispatchWithShell(shell: Shell): Dispatch
}

export interface PrivateObservableState<TState, TSelector> extends ObservableState<TSelector> {
    notify(): void
}

export type AnyPrivateObservableState = PrivateObservableState<any, any>

const buildStoreReducer = (
    contributedState: ExtensionSlot<StateContribution>,
    broadcastNotify: PrivateThrottledStore['broadcastNotify'],
    observableNotify: PrivateThrottledStore['observableNotify'],
    shouldScopeReducers?: boolean
): Reducer => {
    function withNotifyAction(
        originalReducersMap: ReducersMapObject,
        notifyAction: () => void,
        storeShellName?: string
    ): ReducersMapObject {
        const decorateReducer = (originalReducer: Reducer): Reducer => {
            return (state0, action: AnyShellAction) => {
                if (shouldScopeReducers && state0 && storeShellName && action.__shellName && storeShellName !== action.__shellName) {
                    return state0
                }
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
        storeShellName: string
    ): ReducersMapObject {
        const originalReducersMap = reducerFactory()
        if (notificationScope === 'broadcasting') {
            return withNotifyAction(originalReducersMap, broadcastNotify, storeShellName)
        }
        if (!observable) {
            // should never happen; would be an internal bug
            throw new Error(
                `getPerShellReducersMapObject: notificationScope=observable but 'observable' is falsy, in shell '${storeShellName}'`
            )
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

export const updateThrottledStore = (
    host: AppHost & AppHostServicesProvider,
    store: PrivateThrottledStore,
    contributedState: ExtensionSlot<StateContribution>
): void => {
    const newReducer = buildStoreReducer(contributedState, store.broadcastNotify, store.observableNotify, host.options.shouldScopeReducers)
    store.replaceReducer(newReducer)
    store.resetPendingNotifications()
}

export const createThrottledStore = (
    host: AppHost & AppHostServicesProvider,
    contributedState: ExtensionSlot<StateContribution>,
    updateIsSubscriptionNotifyInProgress: (isSubscriptionNotifyInProgress: boolean) => void,
    updateIsObserversNotifyInProgress: (isObserversNotifyInProgress: boolean) => void,
    updateShouldFlushMemoizationSync: (shouldFlushMemoizationSync: boolean) => void
): PrivateThrottledStore => {
    let pendingBroadcastNotification = false
    let pendingObservableNotifications: Set<AnyPrivateObservableState> | undefined
    let isDeferrringNotifications = false
    let pendingFlush = false

    const onBroadcastNotify = () => {
        pendingBroadcastNotification = true
    }

    const onObservableNotify = (observable: AnyPrivateObservableState) => {
        if (!pendingObservableNotifications) {
            pendingObservableNotifications = new Set<AnyPrivateObservableState>()
        }
        pendingObservableNotifications.add(observable)
    }

    const resetAllPendingNotifications = () => {
        pendingBroadcastNotification = false
        pendingObservableNotifications = undefined
    }

    const reducer = buildStoreReducer(contributedState, onBroadcastNotify, onObservableNotify, host.options.shouldScopeReducers)
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
        if (pendingBroadcastNotification || !pendingObservableNotifications) {
            host.getAppHostServicesShell().log.monitor('ThrottledStore.notifySubscribers', {}, () =>
                _.forEach(broadcastSubscribers, invoke)
            )
        }
    }

    const notifyObservers = () => {
        if (pendingObservableNotifications) {
            pendingObservableNotifications.forEach(observable => {
                observable.notify()
            })
        }
    }

    const notifyAll = () => {
        try {
            updateIsObserversNotifyInProgress(true)
            notifyObservers()
            updateIsSubscriptionNotifyInProgress(true)
            notifySubscribers()
        } finally {
            resetAllPendingNotifications()
            updateIsSubscriptionNotifyInProgress(false)
            updateIsObserversNotifyInProgress(false)
        }
    }

    const scheduledNotifyAll = () => {
        if (isDeferrringNotifications) {
            return
        }
        notifyAll()
    }

    const notifyAllOnPublish =
        typeof window === 'undefined' ? createTimeOutPublisher(scheduledNotifyAll) : createAnimationFramePublisher(scheduledNotifyAll)

    let cancelRender = _.noop

    store.subscribe(() => {
        cancelRender = notifyAllOnPublish()
    })

    const flush = (config = { excecutionType: 'default' }) => {
        if (isDeferrringNotifications && config.excecutionType !== 'immediate') {
            pendingFlush = true
            return
        }
        if (config.excecutionType !== 'scheduled') {
            cancelRender()
        }
        notifyAll()
    }

    const dispatch: Dispatch<AnyAction> = action => {
        return store.dispatch(action)
    }

    const toShellAction = <T extends Action>(shell: Shell, action: T): T => ({
        ...action,
        __shellName: shell.name
    })

    const executePendingActions = () => {
        if (pendingFlush) {
            pendingFlush = false
            flush()
        } else if (pendingBroadcastNotification || pendingObservableNotifications) {
            notifyAll()
        }
    }

    const result: PrivateThrottledStore = {
        ...store,
        subscribe,
        syncSubscribe: store.subscribe,
        dispatch,
        dispatchWithShell: shell => action => dispatch(toShellAction(shell, action)),
        flush,
        broadcastNotify: onBroadcastNotify,
        observableNotify: onObservableNotify,
        resetPendingNotifications: resetAllPendingNotifications,
        hasPendingSubscribers: () => pendingBroadcastNotification,
        deferSubscriberNotifications: async (action, shouldDispatchClearCache) => {
            if (isDeferrringNotifications) {
                return action()
            }
            try {
                executePendingActions()
                isDeferrringNotifications = true
                shouldDispatchClearCache && updateShouldFlushMemoizationSync(isDeferrringNotifications)
                const functionResult = await action()
                return functionResult
            } finally {
                isDeferrringNotifications = false
                shouldDispatchClearCache && updateShouldFlushMemoizationSync(isDeferrringNotifications)
                executePendingActions()
            }
        }
    }

    resetAllPendingNotifications()
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

    const createSelector = (): TSelector => {
        return selectorFactory(shell.getStore<TState>().getState())
    }

    return {
        subscribe(fromShell, callback) {
            observersSlot.contribute(fromShell, callback)
            return () => {
                observersSlot.discardBy(item => item.contribution === callback)
            }
        },
        notify() {
            const newSelector = createSelector()
            invokeSlotCallbacks(observersSlot, newSelector)
        },
        current: createSelector
    }
}
