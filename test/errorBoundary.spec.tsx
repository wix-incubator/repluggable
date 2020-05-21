import _ from 'lodash'
import React from 'react'
import { createAppHost, addMockShell, renderInHost, withConsoleErrors } from '../testKit'
import { ErrorBoundary } from '../src'

describe('ErrorBoundary', () => {
    let renderShouldThrow: boolean

    const TestComponent: React.FunctionComponent = () => {
        if (renderShouldThrow) {
            throw new Error('Test error')
        }
        return <div className="test-comp">test comp</div>
    }

    it('should render enclosed UI when no errors', () => {
        const host = createAppHost([])
        const shell = addMockShell(host)

        renderShouldThrow = false
        const { root } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(root?.exists('.test-comp')).toBe(true)
    })

    it('should render empty on error', () => {
        const host = createAppHost([])
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(root?.exists('.test-comp')).toBe(false)
        expect(root?.isEmptyRender()).toBe(true)
    })

    it('should recover by change in store', () => {
        const host = createAppHost([])
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(root?.exists('.test-comp')).toBe(false)

        renderShouldThrow = false
        host.getStore().dispatch({ type: 'TEST' })
        host.getStore().flush()
        root?.update()

        expect(root?.exists('.test-comp')).toBe(true)
    })

    it('should show sticky error', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )

        expect(root?.exists('.test-comp')).toBe(false)
        expect(root?.exists('.component-error')).toBe(true)
        expect(root?.find('.component-error').text()).toContain(`error in ${shell.name} / test_comp`)
        expect(root?.find('.component-error').find('button').text()).toBe('reset')
    })

    it('should keep sticky error after change in store', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )

        renderShouldThrow = false
        host.getStore().dispatch({ type: 'TEST' })
        host.getStore().flush()
        root?.update()

        expect(root?.exists('.test-comp')).toBe(false)
        expect(root?.exists('.component-error')).toBe(true)
        expect(root?.find('.component-error').text()).toContain(`error in ${shell.name} / test_comp`)
        expect(root?.find('.component-error').find('button').text()).toBe('reset')
    })

    it('should reset sticky error on reset button click', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )

        const resetButton = root?.find('.component-error').find('button')
        expect(resetButton?.exists()).toBe(true)

        renderShouldThrow = false
        resetButton?.simulate('click')
        root?.update()

        expect(root?.exists('.test-comp')).toBe(true)
        expect(root?.exists('.component-error')).toBe(false)
    })
})
