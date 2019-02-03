import React, { ErrorInfo } from "react";

type ErrorBoundaryProps = {
    readonly featureName: string;
    readonly componentName?: string;
    readonly errorClassName?: string;
}

type ErrorBoundaryState = {
    readonly hasError: boolean;
    readonly errorMessage: string | null;
}

function getQualifiedName(featureName: string, componentName: string | undefined): string {
    return (componentName ? `${featureName} / ${componentName}` : featureName);
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { 
            hasError: false,
            errorMessage: null 
        };
    }

    componentDidCatch?(error: Error, errorInfo: ErrorInfo): void {
        //TODO: log error
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className={`component-error ${this.props.errorClassName || ''}`} title={this.state.errorMessage || '(unknown error)'}>
                    error in {getQualifiedName(this.props.featureName, this.props.componentName)}
                </div>
            );
        }

        return this.props.children;
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { 
            hasError: true,
            errorMessage: error.message 
        };
    }
}
