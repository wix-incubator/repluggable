import { AppHostOptions } from '../src/API'

export const emptyLoggerOptions: AppHostOptions = {
    logger: {
        log: jest.fn(),
        spanChild: jest.fn().mockImplementation(() => ({
            end() {}
        })),
        spanRoot: jest.fn().mockImplementation(() => ({
            end() {}
        })),
        interactionStarted: jest.fn(),
        interactionEnded: jest.fn()
    },
    monitoring: {}
}
