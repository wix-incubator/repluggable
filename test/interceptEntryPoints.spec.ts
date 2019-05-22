import _ from 'lodash'
import { EntryPoint, EntryPointInterceptor } from '../src/API'
import { interceptEntryPoints, interceptEntryPointsMap } from '../src/interceptEntryPoints'
import { mockPackage, createAppHost } from '../testKit'

type LogSpy = jest.Mock<void, string[]>

function takeLog(spy: LogSpy): string[] {
    return _.flatten(spy.mock.calls)
}

function takeAndClearLog(spy: LogSpy): string[] {
    const result = takeLog(spy)
    spy.mockClear()
    return result
}

describe('interceptEntryPoints', () => {
    it('should intercept name', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(2, spy)
        const interceptor = createTestInterceptor(spy, 'INTR1', { interceptName: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        expect(intercepted[0].name).toBe('INTR1!EP-0')
        expect(intercepted[1].name).toBe('INTR1!EP-1')
    })
    it('should intercept tags', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(2, spy)
        const interceptor = createTestInterceptor(spy, 'INTR1', { interceptTags: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        expect(intercepted[0].tags).toMatchObject({ test_ep_index: '0', intercepted_by: 'INTR1' })
        expect(intercepted[1].tags).toMatchObject({ test_ep_index: '1', intercepted_by: 'INTR1' })
    })
    it('should intercept attach', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'INTR1', { interceptAttach: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].attach && intercepted[0].attach({} as any)

        expect(takeLog(spy)).toEqual(['INTR1:attach', 'EP-0:attach'])
    })
    it('should intercept extend', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'INTR1', { interceptExtend: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].extend && intercepted[0].extend({} as any)

        expect(takeLog(spy)).toEqual(['INTR1:extend', 'EP-0:extend'])
    })
    it('should intercept detach', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'INTR1', { interceptDetach: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].detach && intercepted[0].detach({} as any)

        expect(takeLog(spy)).toEqual(['INTR1:detach', 'EP-0:detach'])
    })
    it('should intercept declareAPIs', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'I1', { interceptDeclareAPIs: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].declareAPIs && intercepted[0].declareAPIs()

        expect(takeLog(spy)).toEqual(['I1:declareAPIs', 'EP-0:declareAPIs'])
    })
    it('should intercept getDependencyAPIs', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'I1', { interceptGetDependencyAPIs: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].getDependencyAPIs && intercepted[0].getDependencyAPIs()

        expect(takeLog(spy)).toEqual(['I1:getDependencyAPIs', 'EP-0:getDependencyAPIs'])
    })
    it('should invoke original if not intercepted', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'INTR1', {}) // flags are all false
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        const interceptedName = intercepted[0].name
        intercepted[0].attach && intercepted[0].attach({} as any)
        intercepted[0].extend && intercepted[0].extend({} as any)
        intercepted[0].detach && intercepted[0].detach({} as any)
        intercepted[0].getDependencyAPIs && intercepted[0].getDependencyAPIs()
        intercepted[0].declareAPIs && intercepted[0].declareAPIs()

        expect(interceptedName).toBe('EP-0')
        expect(takeLog(spy)).toEqual(['EP-0:attach', 'EP-0:extend', 'EP-0:detach', 'EP-0:getDependencyAPIs', 'EP-0:declareAPIs'])
    })
    it('should allow multiple interceptors', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(3, spy)
        const interceptor1 = createTestInterceptor(spy, 'I1', { interceptAttach: true })
        const interceptor2 = createTestInterceptor(spy, 'I2', { interceptAttach: true })
        const intercepted1 = interceptEntryPoints(entryPoints[0], interceptor1)
        const intercepted2 = interceptEntryPoints(intercepted1, interceptor2)

        intercepted2[0].attach && intercepted2[0].attach({} as any)

        expect(takeLog(spy)).toEqual(['I2:attach', 'I1:attach', 'EP-0:attach'])
    })
    it('should apply single interceptor to map of entry points', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(3, spy)
        const packagesMap = {
            one: entryPoints[0],
            two: [entryPoints[1], entryPoints[2]]
        }
        const interceptor = createTestInterceptor(spy, 'I1', { interceptAttach: true })
        const interceptedMap = interceptEntryPointsMap(packagesMap, interceptor)
        const intercepted = [
            (interceptedMap.one as EntryPoint[])[0],
            (interceptedMap.two as EntryPoint[])[0],
            (interceptedMap.two as EntryPoint[])[1]
        ]

        intercepted[0].attach && intercepted[0].attach({} as any)
        const logOne0 = takeAndClearLog(spy)

        intercepted[1].attach && intercepted[1].attach({} as any)
        const logTwo0 = takeAndClearLog(spy)

        intercepted[2].attach && intercepted[2].attach({} as any)
        const logTwo1 = takeAndClearLog(spy)

        expect(typeof interceptedMap).toBe('object')
        expect(logOne0).toEqual(['I1:attach', 'EP-0:attach'])
        expect(logTwo0).toEqual(['I1:attach', 'EP-1:attach'])
        expect(logTwo1).toEqual(['I1:attach', 'EP-2:attach'])
    })
    it('should apply multiple interceptors to map of entry points', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(3, spy)
        const packagesMap = {
            one: entryPoints[0],
            two: [entryPoints[1], entryPoints[2]]
        }
        const interceptor1 = createTestInterceptor(spy, 'I1', { interceptAttach: true })
        const interceptor2 = createTestInterceptor(spy, 'I2', { interceptAttach: true })
        const interceptedMap1 = interceptEntryPointsMap(packagesMap, interceptor1)
        const interceptedMap2 = interceptEntryPointsMap(interceptedMap1, interceptor2)
        const intercepted = [
            (interceptedMap2.one as EntryPoint[])[0],
            (interceptedMap2.two as EntryPoint[])[0],
            (interceptedMap2.two as EntryPoint[])[1]
        ]

        intercepted[0].attach && intercepted[0].attach({} as any)
        const logOne0 = takeAndClearLog(spy)

        intercepted[1].attach && intercepted[1].attach({} as any)
        const logTwo0 = takeAndClearLog(spy)

        intercepted[2].attach && intercepted[2].attach({} as any)
        const logTwo1 = takeAndClearLog(spy)

        expect(typeof interceptedMap1).toBe('object')
        expect(logOne0).toEqual(['I2:attach', 'I1:attach', 'EP-0:attach'])
        expect(logTwo0).toEqual(['I2:attach', 'I1:attach', 'EP-1:attach'])
        expect(logTwo1).toEqual(['I2:attach', 'I1:attach', 'EP-2:attach'])
    })
    it('should be able to add intercepted entry point to AppHost', () => {
        const spy: LogSpy = jest.fn()

        const entryPoints = createTestEntryPoints(1, spy)
        const interceptor = createTestInterceptor(spy, 'I1', { interceptAttach: true, interceptExtend: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        createAppHost(intercepted)

        // getDependencyAPIs appears to be called multiple times
        expect(_.uniq(takeLog(spy))).toEqual([
            'EP-0:declareAPIs', // called because of circular validation
            'EP-0:getDependencyAPIs',
            'I1:attach',
            'EP-0:attach',
            'I1:extend',
            'EP-0:extend'
        ])
    })
})

type TestInterceptorFlags = { [P in keyof EntryPointInterceptor]?: boolean }

function createTestEntryPoints(count: number, spy: LogSpy): EntryPoint[] {
    return _.times(count).map<EntryPoint>(index => ({
        name: `EP-${index}`,
        tags: { test_ep_index: `${index}` },
        getDependencyAPIs() {
            spy(`EP-${index}:getDependencyAPIs`)
            return []
        },
        declareAPIs() {
            spy(`EP-${index}:declareAPIs`)
            return []
        },
        attach() {
            spy(`EP-${index}:attach`)
            return []
        },
        extend() {
            spy(`EP-${index}:extend`)
            return []
        },
        detach() {
            spy(`EP-${index}:detach`)
            return []
        }
    }))
}

function createTestInterceptor(spy: LogSpy, interceptorName: string, flags: TestInterceptorFlags): EntryPointInterceptor {
    return {
        interceptName: flags.interceptName
            ? name => {
                  return `${interceptorName}!${name}`
              }
            : undefined,
        interceptTags: flags.interceptTags
            ? tags => {
                  return { intercepted_by: interceptorName, ...tags }
              }
            : undefined,
        interceptDeclareAPIs: flags.interceptDeclareAPIs
            ? innerDeclareAPIs => {
                  return () => {
                      spy(`${interceptorName}:declareAPIs`)
                      return (innerDeclareAPIs && innerDeclareAPIs()) || []
                  }
              }
            : undefined,
        interceptGetDependencyAPIs: flags.interceptGetDependencyAPIs
            ? innerGetDependencyAPIs => {
                  return () => {
                      spy(`${interceptorName}:getDependencyAPIs`)
                      return (innerGetDependencyAPIs && innerGetDependencyAPIs()) || []
                  }
              }
            : undefined,
        interceptAttach: flags.interceptAttach
            ? innerAttach => {
                  return shell => {
                      spy(`${interceptorName}:attach`)
                      innerAttach && innerAttach(shell)
                  }
              }
            : undefined,
        interceptExtend: flags.interceptExtend
            ? innerExtend => {
                  return shell => {
                      spy(`${interceptorName}:extend`)
                      innerExtend && innerExtend(shell)
                  }
              }
            : undefined,
        interceptDetach: flags.interceptDetach
            ? innerDetach => {
                  return shell => {
                      spy(`${interceptorName}:detach`)
                      innerDetach && innerDetach(shell)
                  }
              }
            : undefined
    }
}
