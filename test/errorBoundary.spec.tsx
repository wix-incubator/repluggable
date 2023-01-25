import _ from 'lodash'
import React from 'react'
import { createAppHost, addMockShell, renderInHost, withConsoleErrors } from '../testKit/v2'
import { ErrorBoundary } from '../src'
import { act } from 'react-test-renderer'

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
        const { testKit } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(1)
    })

    it('should render empty on error', () => {
        const host = createAppHost([])
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { testKit } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        const node = testKit.toJSON()
        if (!node || !('type' in node)) {
            fail('Expecting object')
        }

        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)
        expect(node.children).toBeNull()
    })

    it('should recover by change in store', () => {
        const host = createAppHost([])
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { testKit, rootComponent } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)

        renderShouldThrow = false
        act(() => {
            host.getStore().dispatch({ type: 'TEST' })
            host.getStore().flush()
            testKit.update(rootComponent)
        })

        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(1)
    })

    it('should show sticky error', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { testKit } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )
        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)
        const errors = testKit.root.findAll(x => x.props.className?.includes('component-error'))

        expect(errors.length).toBe(1)
        expect(errors[0].children[0]).toBe('error in ')
        expect((errors[0].children[1] as any).children[0]).toBe(`${shell.name} / test_comp`)
        expect(errors[0].findByType('button').children[0]).toBe('reset')
    })

    it('should keep sticky error after change in store', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { testKit, rootComponent } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )

        renderShouldThrow = false
        act(() => {
            host.getStore().dispatch({ type: 'TEST' })
            host.getStore().flush()
            testKit.update(rootComponent)
        })

        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)
        const errors = testKit.root.findAll(x => x.props.className?.includes('component-error'))

        expect(errors.length).toBe(1)
        expect(errors[0].children[0]).toBe('error in ')
        expect((errors[0].children[1] as any).children[0]).toBe(`${shell.name} / test_comp`)
        expect(errors[0].findByType('button').children[0]).toBe('reset')
    })

    it('should reset sticky error on reset button click', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { testKit, rootComponent } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )

        const button = testKit.root.findByType('button')
        expect(button).toBeDefined()

        renderShouldThrow = false
        button.props.onClick()
        act(() => {
            testKit.update(rootComponent)
        })

        expect(testKit.root.findAll(x => x.props.className === 'test-comp').length).toBe(1)
        expect(testKit.root.findAll(x => x.props.className?.includes('component-error')).length).toBe(0)
    })
})
