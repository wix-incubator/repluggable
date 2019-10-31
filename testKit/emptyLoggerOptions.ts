import { AppHostOptions } from '../src/API'

export const emptyLoggerOptions: AppHostOptions = {
    logger: {
        event: jest.fn(),
        log: jest.fn(),
        spanChild: jest.fn().mockImplementation(() => ({
            end() {}
        })),
        spanRoot: jest.fn().mockImplementation(() => ({
            end() {}
        }))
    },
    monitoring: {}
}
