import _ from 'lodash'
import React, { ErrorInfo } from 'react'
import { Shell, PrivateShell, AppHostOptions } from './API'
import { isErrorLikeObject } from './typeGuards'
import { Unsubscribe } from 'redux'

interface ErrorBoundaryProps {
    readonly shell: Shell
    readonly componentName?: string
    readonly errorClassName?: string
}

interface ErrorBoundaryState {
    readonly hasError: boolean
    readonly errorMessage: string | null
    readonly unsubscribe?: Unsubscribe
}

function getQualifiedName(shellName: string, componentName: string | undefined): string {
    return componentName ? `${shellName} / ${componentName}` : shellName
}

function getHostOptions(shell: Shell): AppHostOptions {
    return (shell as PrivateShell).getHostOptions()
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren<ErrorBoundaryProps>, ErrorBoundaryState> {
    readonly throttledResetError: () => void

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: isErrorLikeObject(error) ? error.message : String(error)
        }
    }

    constructor(props: ErrorBoundaryProps) {
        super(props)

        this.throttledResetError = _.throttle(
            () => {
                this.resetError()
            },
            500,
            { leading: true }
        )

        this.state = {
            hasError: false,
            errorMessage: null
        }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const { shell, componentName } = this.props
        const { enableStickyErrorBoundaries } = getHostOptions(shell)

        const errorType = isErrorLikeObject(error) ? error.name : 'UnknownError'
        const qualifiedName = getQualifiedName(shell.name, componentName)
        shell.log.error(
            `ErrorBoundary(${qualifiedName}): ${errorType}`,
            new Error(`ErrorBoundary(${qualifiedName}): ${errorType}`, { cause: error }),
            { componentName, componentStack: errorInfo.componentStack }
        )

        if (!enableStickyErrorBoundaries) {
            this.attemptToRecoverOnNextState()
        }
    }

    public render() {
        if (this.state.hasError) {
            const { shell } = this.props
            const { enableStickyErrorBoundaries } = getHostOptions(shell)
            const qualifiedName = getQualifiedName(shell.name, this.props.componentName)

            if (enableStickyErrorBoundaries) {
                return (
                    <div
                        className={`component-error ${this.props.errorClassName || ''}`}
                        style={{ pointerEvents: 'all' }}
                        title={this.state.errorMessage || '(unknown error)'}
                    >
                        error in <b>{qualifiedName}</b>
                        <button onClick={() => this.resetError()}>reset</button>
                    </div>
                )
            }
            return null
        }

        return this.props.children || null
    }

    public componentWillUnmount() {
        this.cancelAttemptToRecover()
    }

    private resetError() {
        this.cancelAttemptToRecover()
        this.setState({
            hasError: false,
            errorMessage: null,
            unsubscribe: undefined
        })
    }

    private attemptToRecoverOnNextState() {
        const { shell } = this.props

        if (!this.state || !this.state.unsubscribe) {
            const unsubscribe = shell.getStore().subscribe(() => {
                this.throttledResetError()
            })
            this.setState({ unsubscribe })
        }
    }

    private cancelAttemptToRecover() {
        if (this.state && this.state.unsubscribe) {
            this.state.unsubscribe()
        }
    }
}
