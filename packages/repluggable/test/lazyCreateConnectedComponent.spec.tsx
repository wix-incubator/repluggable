import React from 'react'

import { lazyCreateConnectedComponent } from '../src'
import { Shell } from '../src/API'
import { addMockShell, collectAllTexts, connectWithShell, createAppHost, renderInHost } from '../testKit'

function createFallbackTrackerComponent(label: string = 'loading...') {
    let handleMounted: () => void
    let handleUnmounted: () => void
    const mountedPromise = new Promise<void>(resolve => {
        handleMounted = resolve
    })
    const unmountedPromise = new Promise<void>(resolve => {
        handleUnmounted = resolve
    })

    const Fallback: React.FC = () => {
        React.useEffect(() => {
            handleMounted()
            return handleUnmounted
        }, [])
        return <div>{label}</div>
    }

    // NOTE: `Object.assign` is OK here,
    // so disable "prefer-object-spread"
    /* tslint:disable-next-line */
  return Object.assign(Fallback, {
        LABEL: label,
        waitMounted: () => mountedPromise,
        waitUnmounted: () => unmountedPromise
    })
}

const TEXT_IN_LAZY_COMPONENT = 'HELLO FROM LAZY COMPONENT'

const lazyComponentFactoryMock = (() => {
    interface MyComponentStateProps {
        foo: string
    }

    interface MyComponentOwnProps {
        bar?: string
    }

    const MyComponent: React.FC<MyComponentStateProps & MyComponentOwnProps> = props => (
        <div className="my-component">
            {props.foo}
            <span>{props.bar}</span>
        </div>
    )

    const createMyComponent = (boundShell: Shell) =>
        connectWithShell<{}, MyComponentOwnProps, MyComponentStateProps>(
            () => ({
                foo: TEXT_IN_LAZY_COMPONENT
            }),
            undefined,
            boundShell
        )(MyComponent)

    return {
        /**
         * represents a module with a named export
         * @example
         * ```
         * export function createMyComponent(shell: Shell) {}
         * ```
         */
        loadWithNamedExport: async () => ({
            createMyComponent
        }),
        /**
         * represents a module with a default export
         * @example
         * ```
         * export default function createMyComponent(shell: Shell) {}
         * ```
         */
        loadWithDefaultExport: async () => ({
            default: createMyComponent
        })
    }
})()

describe.each([
    ["with 'default export' module", () => lazyComponentFactoryMock.loadWithDefaultExport()],
    ["with 'named export' module", () => lazyComponentFactoryMock.loadWithNamedExport().then(module => module.createMyComponent)]
])('lazyCreateConnectedComponent (loadComponentFactory %s)', (_, loadComponentFactory) => {
    it('should create and render connected component from lazy factory', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const MyComponent = lazyCreateConnectedComponent(boundShell, loadComponentFactory)

        const FallbackTracker = createFallbackTrackerComponent()

        const { parentWrapper } = renderInHost(
            <React.Suspense fallback={<FallbackTracker />}>
                <MyComponent />
            </React.Suspense>,
            host
        )

        // Check that the component shows the fallback, while the lazy component is loading
        expect(collectAllTexts(parentWrapper)).toContain(FallbackTracker.LABEL)
        expect(collectAllTexts(parentWrapper)).not.toContain(TEXT_IN_LAZY_COMPONENT)

        await FallbackTracker.waitUnmounted()

        // Check that the component shows the loaded content
        expect(collectAllTexts(parentWrapper)).not.toContain(FallbackTracker.LABEL)
        expect(collectAllTexts(parentWrapper)).toContain(TEXT_IN_LAZY_COMPONENT)
    })

    it('should create and render connected componet with forwarding own props', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const MyComponent = lazyCreateConnectedComponent(boundShell, loadComponentFactory)

        const FallbackTracker = createFallbackTrackerComponent()

        const TEST_PROP = 'HELLO_FROM_PROPS'

        const { parentWrapper } = renderInHost(
            <React.Suspense fallback={<FallbackTracker />}>
                <MyComponent bar={TEST_PROP} />
            </React.Suspense>,
            host
        )

        expect(collectAllTexts(parentWrapper)).not.toContain(TEST_PROP)

        await FallbackTracker.waitUnmounted()

        expect(collectAllTexts(parentWrapper)).toContain(TEST_PROP)
    })

    it('should call `loadComponentFactory` only after first render', async () => {
        const host = createAppHost([])
        const boundShell = addMockShell(host)

        const loadComponentFactorySpy = jest.fn(() => loadComponentFactory())

        const MyComponent = lazyCreateConnectedComponent(boundShell, loadComponentFactorySpy)

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

        const loadComponentFactorySpy = jest.fn(() => loadComponentFactory())

        const MyComponent = lazyCreateConnectedComponent(boundShell, loadComponentFactorySpy)

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
