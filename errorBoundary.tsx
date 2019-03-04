import React, { ErrorInfo } from 'react'
import { PrivateFeatureHost } from './api';
import { featureContextTypes } from './connectWithFeatureContext';

interface ErrorBoundaryProps {
    readonly feature: PrivateFeatureHost;
    readonly componentName?: string;
    readonly errorClassName?: string;
}

interface ErrorBoundaryState {
    readonly hasError: boolean
    readonly errorMessage: string | null
}

function getQualifiedName(featureName: string, componentName: string | undefined): string {
    return componentName ? `${featureName} / ${componentName}` : featureName
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: error.message
        }
    }
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = {
            hasError: false,
            errorMessage: null
        }
    }

    public componentDidCatch?(error: Error, errorInfo: ErrorInfo): void {
        // TODO: log error
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className={`component-error ${this.props.errorClassName || ''}`} title={this.state.errorMessage || '(unknown error)'}>
                    error in {getQualifiedName(this.props.feature.name, this.props.componentName)}
                </div>
            )
        }

        return this.props.children
    }

    public getChildContext() {
        return {
            getSlot: this.props.feature.getSlot,
            getApi: this.props.feature.getApi,
            isFeatureActive: this.props.feature.isFeatureInstalled,
            isFeatureInstalled: this.props.feature.isFeatureInstalled,
            isLazyFeature: this.props.feature.isLazyFeature,
            installFeatures: this.props.feature.installFeatures,
            uninstallFeatures: this.props.feature.uninstallFeatures
            //log: this.props.feature.log //TODO: define logging abstraction
        };
    }

    static childContextTypes = featureContextTypes;
}
