import { AppHostOptions } from '../src/API'

export const emptyLoggerOptions: AppHostOptions = {
    logger: {
        event: jest.fn
    }
}
