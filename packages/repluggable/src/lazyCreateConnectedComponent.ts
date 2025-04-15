import React from 'react'

import { Shell } from './API'

type CreateConnectedComponent<T extends React.ComponentType<any>> = (boundShell: Shell) => T

export interface LazyConnectedComponent<T extends React.ComponentType<any>> extends React.LazyExoticComponent<T> {
    preload(): Promise<void>
}

/**
 * Like `React.lazy` but for components created with repluggable `createConnected` function.
 * @see {@link https://react.dev/reference/react/lazy React Docs}
 *
 * @example <caption>having `./AddPanel.tsx` - module with **default** export of createConnected function</caption>
 * ```ts
 * const Component = lazyCreateConnectedComponent(shell,
 *   () => import('./AddPanel')
 * );
 *
 * // `./AddPanel.tsx`
 * export default function createConnectedAddPanel(shell: Shell) { ...}
 * ```
 * @example <caption>having `./AddPanel.tsx` - module with **named** export of createConnected function</caption>
 * ```ts
 * const Component = lazyCreateConnectedComponent(shell,
 *   () => import('./AddPanel').then(module => module.createConnectedAddPanel)
 * );
 *
 * // `./AddPanel.tsx`
 * export function createConnectedAddPanel(shell: Shell) { ... }
 * ```
 */
export function lazyCreateConnectedComponent<T extends React.ComponentType<any>>(
    fromShell: Shell,
    loadComponentFactory: () => Promise<{ default: CreateConnectedComponent<T> } | CreateConnectedComponent<T>>
): LazyConnectedComponent<T> {
    let loadComponentPromise: Promise<T>
    async function loadComponent() {
        loadComponentPromise ??= loadComponentFactory().then(componentFactoryModuleOrFn => {
            const componentFactory =
                typeof componentFactoryModuleOrFn === 'function' ? componentFactoryModuleOrFn : componentFactoryModuleOrFn?.default

            if (typeof componentFactory !== 'function') {
                throw new Error(
                    'Expected a createConnected function or a module with a default export of one.\n' +
                        `Received: ${typeof componentFactory}. Please ensure the module exports the correct function.`
                )
            }

            const Component = fromShell.runLateInitializer(() => componentFactory(fromShell))

            return Component
        })

        return loadComponentPromise
    }

    /**
     * Preloads the connected component to ensure it is ready before rendering.
     * Useful for optimizing performance in scenarios where the component will be needed soon.
     *
     * ```ts
     * const Component = lazyCreateConnectedComponent(shell, () => import('./AddPanel'));
     *
     * // preload the component
     * onMouseHover(() => {
     *   Component.preload();
     * });
     * ```
     */
    async function preload() {
        await loadComponent()
    }

    const LazyComponent = React.lazy<T>(async () => {
        const Component = await loadComponent()

        // NOTE: satisfy React.lazy expectation for module with default export
        return { default: Component }
    })

    // NOTE: `Object.assign` is OK here,
    // so disable "prefer-object-spread"
    /* tslint:disable-next-line */
    return Object.assign(LazyComponent, { preload })
}
