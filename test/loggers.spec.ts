import { EntryPoint, HostLogger, EntryPointTags } from '../src/API'
import { createAppHost } from '../src/appHost'
import { createShellLogger } from '../src/loggers'

describe('ShellLogger', () => {
    function setup(tags?: EntryPointTags) {
        const logSpy = jest.fn()
        const spanSpy = jest.fn().mockImplementation(() => ({}))

        const entryPoint: EntryPoint = {
            name: 'ep-1',
            tags
        }
        const hostLogger: HostLogger = {
            log: logSpy,
            spanChild: spanSpy,
            spanRoot: spanSpy,
            interactionStarted: jest.fn(),
            interactionEnded: jest.fn()
        }
        const host = createAppHost([], { logger: hostLogger, monitoring: {} })
        const shellLogger = createShellLogger(host, entryPoint)

        logSpy.mockClear()

        return {
            entryPoint,
            hostLogger,
            host,
            shellLogger
        }
    }

    function delay(milliseconds: number) {
        return new Promise(resolve => {
            setTimeout(resolve, milliseconds)
        })
    }

    it('should log simple message', () => {
        const { shellLogger, hostLogger } = setup()

        shellLogger.debug('M1')
        shellLogger.info('M2')
        shellLogger.warning('M3')
        shellLogger.error('M4')

        expect(hostLogger.log).toHaveBeenCalledTimes(4)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'debug', 'M1', { $ep: 'ep-1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'info', 'M2', { $ep: 'ep-1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(3, 'warning', 'M3', { $ep: 'ep-1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(4, 'error', 'M4', { $ep: 'ep-1' })
    })

    it('should log simple message with key-value pairs', () => {
        const { shellLogger, hostLogger } = setup()

        shellLogger.debug('M1', { k1: 'v1' })
        shellLogger.info('M2', { k2: 'v2' })
        shellLogger.warning('M3', { k3: 'v3' })
        shellLogger.error('M4', { k4: 'v4' })

        expect(hostLogger.log).toHaveBeenCalledTimes(4)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'debug', 'M1', { $ep: 'ep-1', k1: 'v1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'info', 'M2', { $ep: 'ep-1', k2: 'v2' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(3, 'warning', 'M3', { $ep: 'ep-1', k3: 'v3' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(4, 'error', 'M4', { $ep: 'ep-1', k4: 'v4' })
    })

    it('should include entry point tags in key-value pairs', () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1', t2: 'T2' })

        shellLogger.debug('M1', { k1: 'v1' })
        shellLogger.info('M2', { k2: 'v2' })
        shellLogger.warning('M3', { k3: 'v3' })
        shellLogger.error('M4', { k4: 'v4' })

        expect(hostLogger.log).toHaveBeenCalledTimes(4)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'debug', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1', t2: 'T2' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'info', 'M2', { $ep: 'ep-1', k2: 'v2', t1: 'T1', t2: 'T2' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(3, 'warning', 'M3', { $ep: 'ep-1', k3: 'v3', t1: 'T1', t2: 'T2' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(4, 'error', 'M4', { $ep: 'ep-1', k4: 'v4', t1: 'T1', t2: 'T2' })
    })

    it('should begin span', () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        const span = shellLogger.spanChild('M1', { k1: 'v1' })

        expect(span).toBeDefined()
        expect(hostLogger.spanChild).toHaveBeenCalledTimes(1)
        expect(hostLogger.spanChild).toHaveBeenNthCalledWith(1, 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' })
    })

    it.skip('should monitor synchronous void function success', () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        shellLogger.monitor('M1', { k1: 'v1' }, () => {
            shellLogger.debug('this-is-monitored-code')
        })

        expect(hostLogger.log).toHaveBeenCalledTimes(3)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'debug', 'this-is-monitored-code', { $ep: 'ep-1', t1: 'T1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            3,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: true,
                returnValue: undefined,
                error: undefined
            },
            'end'
        )
    })

    it.skip('should monitor synchronous non-void function success', () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        const returnValue = shellLogger.monitor('M1', { k1: 'v1' }, () => {
            shellLogger.debug('this-is-monitored-code')
            return 123
        })

        expect(returnValue).toBe(123)
        expect(hostLogger.log).toHaveBeenCalledTimes(3)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'debug', 'this-is-monitored-code', { $ep: 'ep-1', t1: 'T1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            3,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: true,
                returnValue: 123,
                error: undefined
            },
            'end'
        )
    })

    it.skip('should monitor synchronous function that returns null', () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        const returnValue = shellLogger.monitor('M1', { k1: 'v1' }, () => {
            shellLogger.debug('this-is-monitored-code')
            return null
        })

        expect(returnValue).toBeNull()
        expect(hostLogger.log).toHaveBeenCalledTimes(3)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'debug', 'this-is-monitored-code', { $ep: 'ep-1', t1: 'T1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            3,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: true,
                returnValue: null,
                error: undefined
            },
            'end'
        )
    })

    it.skip('should monitor synchronous function failure', () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        expect(() => {
            shellLogger.monitor('M1', { k1: 'v1' }, () => {
                throw new Error('ERR1')
            })
        }).toThrowError('ERR1')

        expect(hostLogger.log).toHaveBeenCalledTimes(2)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            2,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: false,
                returnValue: undefined,
                error: new Error('ERR1')
            },
            'end'
        )
    })

    it.skip('should monitor async void function success', async () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        await shellLogger.monitor('M1', { k1: 'v1' }, async () => {
            await delay(10)
            shellLogger.debug('this-is-monitored-code')
        })

        expect(hostLogger.log).toHaveBeenCalledTimes(3)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'debug', 'this-is-monitored-code', { $ep: 'ep-1', t1: 'T1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            3,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: true,
                returnValue: undefined,
                error: undefined
            },
            'end'
        )
    })

    it.skip('should monitor async non-void function success', async () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        const returnValue = await shellLogger.monitor('M1', { k1: 'v1' }, async () => {
            shellLogger.debug('this-is-monitored-code')
            await delay(10)
            return 123
        })

        expect(returnValue).toBe(123)
        expect(hostLogger.log).toHaveBeenCalledTimes(3)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(2, 'debug', 'this-is-monitored-code', { $ep: 'ep-1', t1: 'T1' })
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            3,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: true,
                returnValue: 123,
                error: undefined
            },
            'end'
        )
    })

    it.skip('should monitor async function failure', async () => {
        const { shellLogger, hostLogger } = setup({ t1: 'T1' })

        try {
            await shellLogger.monitor('M1', { k1: 'v1' }, async () => {
                await delay(10)
                throw new Error('ERR1')
            })
            fail('expected to throw, but did not')
        } catch (err) {
            expect(err.message).toBe('ERR1')
        }

        expect(hostLogger.log).toHaveBeenCalledTimes(2)
        expect(hostLogger.log).toHaveBeenNthCalledWith(1, 'span', 'M1', { $ep: 'ep-1', k1: 'v1', t1: 'T1' }, 'begin')
        expect(hostLogger.log).toHaveBeenNthCalledWith(
            2,
            'span',
            'M1',
            {
                $ep: 'ep-1',
                k1: 'v1',
                t1: 'T1',
                success: false,
                returnValue: undefined,
                error: new Error('ERR1')
            },
            'end'
        )
    })
})
