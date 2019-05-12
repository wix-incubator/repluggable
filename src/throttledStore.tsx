import { Reducer, Action, createStore, Store } from 'redux'
import _ from 'lodash'

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

export const createThrottledStore = (
    reducer: Reducer<any, Action<any>>,
    requestAnimationFrame: Window['requestAnimationFrame'],
    cancelAnimationFrame: Window['cancelAnimationFrame']
): Store => {
    const store = createStore(reducer)

    const invoke = (f: Subscriber) => f()
    let subscribers: Subscriber[] = []
    const subscribe = (subscriber: Subscriber) => {
        subscribers = _.concat(subscribers, subscriber)
        return () => {
            subscribers = _.without(subscribers, subscriber)
        }
    }
    const notifySubscribers = () => _.forEach(subscribers, invoke)

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
