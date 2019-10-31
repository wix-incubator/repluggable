import { HostLogger, LogSeverity, ShellLogger, EntryPoint, AppHost, ShellLoggerSpan, EntryPointTags } from './API'

const noopLoggerSpan: ShellLoggerSpan = {
    end() {}
}

export const ConsoleHostLogger: HostLogger = {
    event() {
        //TODO:deprecated
    },
    spanRoot(messageId: string, keyValuePairs?: Object): ShellLoggerSpan {
        return noopLoggerSpan
    },
    spanChild(messageId: string, keyValuePairs?: Object): ShellLoggerSpan {
        return noopLoggerSpan
    },
    log(severity: LogSeverity, id: string, keyValuePairs?: Object): void {
        const consoleFunc = getConsoleOutputFunc(severity)
        consoleFunc(id, keyValuePairs)
    }
}

export function createShellLogger(host: AppHost, entryPoint: EntryPoint): ShellLogger {
    const entryPointTags = buildEntryPointTags()

    const spanChild = (messageId: string, keyValuePairs?: Object): ShellLoggerSpan => {
        return host.log.spanChild(messageId, withEntryPointTags(keyValuePairs))
    }

    const spanRoot = (messageId: string, keyValuePairs?: Object): ShellLoggerSpan => {
        return host.log.spanRoot(messageId, withEntryPointTags(keyValuePairs))
    }

    return {
        log(severity: LogSeverity, id: string, keyValuePairs?: Object): void {
            host.log.log(severity, id, withEntryPointTags(keyValuePairs))
        },
        debug(messageId: string, keyValuePairs?: Object): void {
            host.log.log('debug', messageId, withEntryPointTags(keyValuePairs))
        },
        info(messageId: string, keyValuePairs?: Object): void {
            host.log.log('info', messageId, withEntryPointTags(keyValuePairs))
        },
        event(messageId: string, keyValuePairs?: Object): void {
            host.log.log('event', messageId, withEntryPointTags(keyValuePairs))
        },
        warning(messageId: string, keyValuePairs?: Object): void {
            host.log.log('warning', messageId, withEntryPointTags(keyValuePairs))
        },
        error(messageId: string, keyValuePairs?: Object): void {
            host.log.log('error', messageId, withEntryPointTags(keyValuePairs))
        },
        critical(messageId: string, keyValuePairs?: Object): void {
            host.log.log('critical', messageId, withEntryPointTags(keyValuePairs))
        },
        spanChild,
        spanRoot,
        monitor
    }

    function monitor(messageId: string, keyValuePairs: Object, monitoredCode: () => any): any {
        const allTags = withEntryPointTags(keyValuePairs)
        const span = spanChild(messageId, allTags)

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

    function isPromise(obj: any | Promise<any>): obj is Promise<any> {
        return !!obj && typeof obj === 'object' && typeof obj.then === 'function'
    }
}

function getConsoleOutputFunc(severity: LogSeverity): Console['log'] {
    switch (severity) {
        case 'debug':
            return console.debug
        case 'event':
            return console.info
        case 'warning':
            return console.warn
        case 'error':
        case 'critical':
            return console.error
        default:
            return console.log
    }
}
