import { AppHostOptions, HostLogger, LogSeverity, ShellLoggerSpan } from '../src/API'

export function withThrowOnError(options: AppHostOptions = { monitoring: {} }): AppHostOptions {
    const throwError = (error: Error, keyValuePairs?: Object) => {
        throw new Error(`${error} ${keyValuePairs ? JSON.stringify(keyValuePairs) : ''}`)
    }

    const span: ShellLoggerSpan = {
        end(success, error, keyValuePairs) {
            if (error) {
                throwError(error, keyValuePairs)
            }
        }
    }

    const logger: HostLogger = {
        spanRoot(messageId: string, error?: Error, keyValuePairs?: Object): ShellLoggerSpan {
            return span
        },
        spanChild(messageId: string, error?: Error, keyValuePairs?: Object): ShellLoggerSpan {
            return span
        },
        log(severity: LogSeverity, id: string, error?: Error, keyValuePairs?: Object): void {
            if (severity === 'error' || severity === 'critical') {
                throwError(error || new Error('Unknown error'), keyValuePairs)
            }
        }
    }

    return {
        ...options,
        logger
    }
}
