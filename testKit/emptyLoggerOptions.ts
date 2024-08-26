import { AppHostOptions } from '../src/API'

export const emptyLoggerOptions: AppHostOptions = {
    logger: {
        log: () => {},
        spanChild: () => ({ end: () => {} }),
        spanRoot: () => ({ end: () => {} })
    },
    monitoring: {
        disableMonitoring: true
    }
}
