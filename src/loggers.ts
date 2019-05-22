import { HostLogger, LogSeverity, LogSpanFlag, ShellLogger, EntryPoint, AppHost, ShellLoggerSpan } from './API'
import { EntryPointTags } from '../dist/src/API'

export const ConsoleHostLogger: HostLogger = {
    event(severity: LogSeverity, id: string, keyValuePairs?: Object, spanFlag?: LogSpanFlag): void {
        switch (spanFlag) {
            case 'begin':
                console.group(id, keyValuePairs)
                console.time(id)
                break
            case 'end':
                console.timeLog(id)
                console.groupEnd()
                break
            default:
                getConsoleOutputFunc(severity)(id, keyValuePairs)
        }
    }
}

export function createShellLogger(host: AppHost, entryPoint: EntryPoint): ShellLogger {
    const entryPointTags = buildEntryPointTags()

    const beginSpan = (messageId: string, keyValuePairs?: Object): ShellLoggerSpan => {
        host.log.event('span', messageId, withEntryPointTags(keyValuePairs), 'begin')
        return createSpan(messageId, keyValuePairs)
    }

    const endSpan = (messageId: string, success: boolean, error?: Error, keyValuePairs?: Object): void => {
        host.log.event('span', messageId, { error, ...withEntryPointTags(keyValuePairs), success }, 'end')
    }

    return {
        event(severity: LogSeverity, id: string, keyValuePairs?: Object, spanFlag?: LogSpanFlag): void {
            host.log.event(severity, id, withEntryPointTags(keyValuePairs), spanFlag)
        },
        debug(messageId: string, keyValuePairs?: Object): void {
            host.log.event('debug', messageId, withEntryPointTags(keyValuePairs))
        },
        info(messageId: string, keyValuePairs?: Object): void {
            host.log.event('info', messageId, withEntryPointTags(keyValuePairs))
        },
        warning(messageId: string, keyValuePairs?: Object): void {
            host.log.event('warning', messageId, withEntryPointTags(keyValuePairs))
        },
        error(messageId: string, keyValuePairs?: Object): void {
            host.log.event('error', messageId, withEntryPointTags(keyValuePairs))
        },
        begin: beginSpan,
        end: endSpan,
        monitor
    }

    function monitor(messageId: string, keyValuePairs: Object, monitoredCode: () => any): any {
        const allTags = withEntryPointTags(keyValuePairs)
        const span = beginSpan(messageId, allTags)

        try {
            const returnValue = monitoredCode()

            if (isPromise(returnValue)) {
                return returnValue
                    .then(retVal => {
                        span.end(true, undefined, { ...allTags, returnValue: retVal })
                        return retVal
                    })
                    .catch(error => {
                        span.end(false, error, allTags)
                        throw error
                    })
            }
            span.end(true, undefined, { ...allTags, returnValue })
            return returnValue
        } catch (error) {
            span.end(false, error, allTags)
            throw error
        }
    }

    function buildEntryPointTags(): EntryPointTags {
        return entryPoint.tags ? { ...entryPoint.tags, $ep: entryPoint.name } : { $ep: entryPoint.name }
    }

    function withEntryPointTags(keyValuePairs?: Object): Object | undefined {
        return keyValuePairs ? { ...keyValuePairs, ...entryPointTags } : entryPointTags
    }

    function createSpan(messageId: string, keyValuePairs?: Object): ShellLoggerSpan {
        return {
            end(success: boolean, error?: Error, endKeyValuePairs?: Object): void {
                endSpan(messageId, success, error, endKeyValuePairs || keyValuePairs)
            },
            success(): void {
                endSpan(messageId, true, undefined, keyValuePairs)
            },
            failure(error: Error): void {
                endSpan(messageId, false, error, keyValuePairs)
            }
        }
    }

    function isPromise(obj: any | Promise<any>): obj is Promise<any> {
        return typeof obj === 'object' && typeof obj.then === 'function'
    }
}

function getConsoleOutputFunc(severity: LogSeverity): Console['log'] {
    switch (severity) {
        case 'debug':
            return console.debug
        case 'info':
            return console.info
        case 'warning':
            return console.warn
        case 'error':
            return console.error
        default:
            return console.log
    }
}
