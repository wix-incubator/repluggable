import React from 'react'

import { lazyCreateConnectedComponent } from '../src'
import { Shell } from '../src/API'
import { addMockShell, collectAllTexts, connectWithShell, createAppHost, renderInHost } from '../testKit'

function createFallbackTrackerComponent() {
    let onMounted: () => void
    let onUnmounted: () => void
    const mountedPromise = new Promise<void>(resolve => {
        onMounted = resolve
    })
    const unmountedPromise = new Promise<void>(resolve => {
        onUnmounted = resolve
    })

    const Fallback: React.FC = () => {
        React.useEffect(() => {
            onMounted()
            return onUnmounted
        }, [])
        return <div>Loading...</div>
    }

    // NOTE: `Object.assign` is OK here,
    // so disable "prefer-object-spread"
    /* tslint:disable-next-line */
    return Object.assign(Fallback, {
        mounted: mountedPromise,
        unmounted: unmountedPromise
    })
}

describe('lazyCreateConnectedComponent', () => {
    const TEXT_IN_LAZY_COMPONENT = 'HELLO FROM LAZY COMPONENT'

    const lazyComponentFactoryMock = (() => {
        interface MyComponentStateProps {
            foo: string
        }

        const MyComponent: React.FC<MyComponentStateProps> = props => <div className="my-component">{props.foo}</div>

        const createMyComponent = (boundShell: Shell) =>
            connectWithShell<{}, {}, MyComponentStateProps>(
                () => ({
                    foo: TEXT_IN_LAZY_COMPONENT
                }),
                undefined,
                boundShell
            )(MyComponent)

        return {
            loadWithNamedExport: async () => ({
                createMyComponent
            }),
            loadWithDefaultExport: async () => ({
                default: createMyComponent
            })
        }
    })()

    it('should create and render connected component from lazy factory (with default export)', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const loadComponentFactory = lazyComponentFactoryMock.loadWithDefaultExport

        const MyComponent = lazyCreateConnectedComponent(boundShell, () => loadComponentFactory())

        const FallbackTracker = createFallbackTrackerComponent()

        const { parentWrapper } = renderInHost(
            <React.Suspense fallback={<FallbackTracker />}>
                <MyComponent />
            </React.Suspense>,
            host
        )

        // Check that the component is not rendered yet
        // and the fallback is shown
        expect(collectAllTexts(parentWrapper)).not.toContain(TEXT_IN_LAZY_COMPONENT)

        await FallbackTracker.mounted
        await FallbackTracker.unmounted

        expect(collectAllTexts(parentWrapper)).toContain(TEXT_IN_LAZY_COMPONENT)
    })

    it('should create and render connected component from lazy factory (with named export)', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const loadComponentFactory = lazyComponentFactoryMock.loadWithNamedExport

        const MyComponent = lazyCreateConnectedComponent(boundShell, () => loadComponentFactory().then(module => module.createMyComponent))

        const FallbackTracker = createFallbackTrackerComponent()

        const { parentWrapper } = renderInHost(
            <React.Suspense fallback={<FallbackTracker />}>
                <MyComponent />
            </React.Suspense>,
            host
        )

        expect(collectAllTexts(parentWrapper)).not.toContain(TEXT_IN_LAZY_COMPONENT)

        await FallbackTracker.mounted
        await FallbackTracker.unmounted

        expect(collectAllTexts(parentWrapper)).toContain(TEXT_IN_LAZY_COMPONENT)
    })

    it('should call `loadComponentFactory` only after first render', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const loadComponentFactorySpy = jest.fn(lazyComponentFactoryMock.loadWithDefaultExport)

        const MyComponent = lazyCreateConnectedComponent(boundShell, () => loadComponentFactorySpy())

        expect(loadComponentFactorySpy).not.toHaveBeenCalled()

        renderInHost(
            <React.Suspense fallback={null}>
                <MyComponent />
            </React.Suspense>,
            host
        )

        expect(loadComponentFactorySpy).toHaveBeenCalled()
    })

    it('should preload component with `loadComponentFactory` on `Component.preload` call', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const loadComponentFactorySpy = jest.fn(lazyComponentFactoryMock.loadWithDefaultExport)

        const MyComponent = lazyCreateConnectedComponent(boundShell, () => loadComponentFactorySpy())

        expect(loadComponentFactorySpy).not.toHaveBeenCalled()

        MyComponent.preload()

        expect(loadComponentFactorySpy).toHaveBeenCalled()

        renderInHost(
            <React.Suspense fallback={null}>
                <MyComponent />
            </React.Suspense>,
            host
        )

        expect(loadComponentFactorySpy).toHaveBeenCalledTimes(1)
    })
})
