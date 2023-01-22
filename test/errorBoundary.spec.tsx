import _ from 'lodash'
import React from 'react'
import { createAppHost, addMockShell, renderInHost, withConsoleErrors, isNode } from '../testKit'
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
        const { root } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(1)
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

        const node = root.toJSON()

        if (!isNode(node)) {
            fail('Expected node')
        }

        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)
        expect(node.children).toBeNull()
    })

    it('should recover by change in store', () => {
        const host = createAppHost([])
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root, rootComponent } = renderInHost(
            <ErrorBoundary shell={shell}>
                <TestComponent />
            </ErrorBoundary>,
            host,
            shell
        )

        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)

        renderShouldThrow = false
        act(() => {
            host.getStore().dispatch({ type: 'TEST' })
            host.getStore().flush()
            root.update(rootComponent)
        })

        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(1)
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
        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)
        const errors = root.root.findAll(x => x.props.className?.includes('component-error'))

        expect(errors.length).toBe(1)
        expect(errors[0].children[0]).toBe('error in ')
        expect((errors[0].children[1] as any).children[0]).toBe(`${shell.name} / test_comp`)
        expect(errors[0].findByType('button').children[0]).toBe('reset')
    })

    it('should keep sticky error after change in store', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root, rootComponent } = withConsoleErrors(() =>
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
            root.update(rootComponent)
        })

        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(0)
        const errors = root.root.findAll(x => x.props.className?.includes('component-error'))

        expect(errors.length).toBe(1)
        expect(errors[0].children[0]).toBe('error in ')
        expect((errors[0].children[1] as any).children[0]).toBe(`${shell.name} / test_comp`)
        expect(errors[0].findByType('button').children[0]).toBe('reset')
    })

    it('should reset sticky error on reset button click', () => {
        const host = createAppHost([], { monitoring: {}, enableStickyErrorBoundaries: true })
        const shell = addMockShell(host)

        renderShouldThrow = true
        const { root, rootComponent } = withConsoleErrors(() =>
            renderInHost(
                <ErrorBoundary shell={shell} componentName="test_comp">
                    <TestComponent />
                </ErrorBoundary>,
                host,
                shell
            )
        )

        const button = root.root.findByType('button')
        expect(button).toBeDefined()

        renderShouldThrow = false
        button.props.onClick()
        act(() => {
            root.update(rootComponent)
        })

        expect(root.root.findAll(x => x.props.className === 'test-comp').length).toBe(1)
        expect(root.root.findAll(x => x.props.className?.includes('component-error')).length).toBe(0)
    })
})
