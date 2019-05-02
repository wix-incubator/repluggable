import _ from 'lodash'
import { EntryPoint, EntryPointInterceptor } from '../src/API'
import { interceptEntryPoints, interceptEntryPointsMap } from '../src/interceptEntryPoints'

describe('interceptEntryPoints', () => {
    it('should intercept name', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(2, log)
        const interceptor = createTestInterceptor(log, { interceptName: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        expect(intercepted[0].name).toBe('INTERCEPTED!EP-0')
        expect(intercepted[1].name).toBe('INTERCEPTED!EP-1')
    })
    it('should intercept attach', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(1, log)
        const interceptor = createTestInterceptor(log, { interceptAttach: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].attach && intercepted[0].attach({} as any)

        expect(log).toEqual(['INTERCEPTED:attach', 'EP-0:attach'])
    })
    it('should intercept extend', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(1, log)
        const interceptor = createTestInterceptor(log, { interceptExtend: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].extend && intercepted[0].extend({} as any)

        expect(log).toEqual(['INTERCEPTED:extend', 'EP-0:extend'])
    })
    it('should intercept detach', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(1, log)
        const interceptor = createTestInterceptor(log, { interceptDetach: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].detach && intercepted[0].detach({} as any)

        expect(log).toEqual(['INTERCEPTED:detach', 'EP-0:detach'])
    })
    it('should intercept declareAPIs', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(1, log)
        const interceptor = createTestInterceptor(log, { interceptDeclareAPIs: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].declareAPIs && intercepted[0].declareAPIs()

        expect(log).toEqual(['INTERCEPTED:declareAPIs', 'EP-0:declareAPIs'])
    })
    it('should intercept getDependencyAPIs', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(1, log)
        const interceptor = createTestInterceptor(log, { interceptGetDependencyAPIs: true })
        const intercepted = interceptEntryPoints(entryPoints, interceptor)

        intercepted[0].getDependencyAPIs && intercepted[0].getDependencyAPIs()

        expect(log).toEqual(['INTERCEPTED:getDependencyAPIs', 'EP-0:getDependencyAPIs'])
    })
    it('should handle single entry point', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(3, log)
        const interceptor = createTestInterceptor(log, { interceptAttach: true })
        const intercepted = interceptEntryPoints(entryPoints[0], interceptor)

        intercepted[0].attach && intercepted[0].attach({} as any)

        expect(log).toEqual(['INTERCEPTED:attach', 'EP-0:attach'])
    })

    it('should recognize maps of entry points', () => {
        const log: string[] = []

        const entryPoints = createTestEntryPoints(3, log)
        const packagesMap = {
            one: entryPoints[0],
            two: [entryPoints[1], entryPoints[2]]
        }
        const interceptor = createTestInterceptor(log, { interceptAttach: true })
        const interceptedMap = interceptEntryPointsMap(packagesMap, interceptor)
        const intercepted = [
            (interceptedMap.one as EntryPoint[])[0],
            (interceptedMap.two as EntryPoint[])[0],
            (interceptedMap.two as EntryPoint[])[1]
        ]

        intercepted[0].attach && intercepted[0].attach({} as any)
        intercepted[1].attach && intercepted[1].attach({} as any)
        intercepted[2].attach && intercepted[2].attach({} as any)

        expect(typeof interceptedMap).toBe('object')
        expect(log).toEqual(['INTERCEPTED:attach', 'EP-0:attach', 'INTERCEPTED:attach', 'EP-1:attach', 'INTERCEPTED:attach', 'EP-2:attach'])
    })
})

type TestInterceptorFlags = { [P in keyof EntryPointInterceptor]?: boolean }

function createTestEntryPoints(count: number, log: string[]): EntryPoint[] {
    return _.range(count).map<EntryPoint>(index => ({
        name: `EP-${index}`,
        getDependencyAPIs() {
            log.push(`EP-${index}:getDependencyAPIs`)
            return []
        },
        declareAPIs() {
            log.push(`EP-${index}:declareAPIs`)
            return []
        },
        attach() {
            log.push(`EP-${index}:attach`)
            return []
        },
        extend() {
            log.push(`EP-${index}:extend`)
            return []
        },
        detach() {
            log.push(`EP-${index}:detach`)
            return []
        }
    }))
}

function createTestInterceptor(log: string[], flags: TestInterceptorFlags): EntryPointInterceptor {
    return {
        interceptName: flags.interceptName
            ? name => {
                  return `INTERCEPTED!${name}`
              }
            : undefined,
        interceptDeclareAPIs: flags.interceptDeclareAPIs
            ? innerDeclareAPIs => {
                  return () => {
                      log.push(`INTERCEPTED:declareAPIs`)
                      return (innerDeclareAPIs && innerDeclareAPIs()) || []
                  }
              }
            : undefined,
        interceptGetDependencyAPIs: flags.interceptGetDependencyAPIs
            ? innerGetDependencyAPIs => {
                  return () => {
                      log.push(`INTERCEPTED:getDependencyAPIs`)
                      return (innerGetDependencyAPIs && innerGetDependencyAPIs()) || []
                  }
              }
            : undefined,
        interceptAttach: flags.interceptAttach
            ? innerAttach => {
                  return shell => {
                      log.push(`INTERCEPTED:attach`)
                      innerAttach && innerAttach(shell)
                  }
              }
            : undefined,
        interceptExtend: flags.interceptExtend
            ? innerExtend => {
                  return shell => {
                      log.push(`INTERCEPTED:extend`)
                      innerExtend && innerExtend(shell)
                  }
              }
            : undefined,
        interceptDetach: flags.interceptDetach
            ? innerDetach => {
                  return shell => {
                      log.push(`INTERCEPTED:detach`)
                      innerDetach && innerDetach(shell)
                  }
              }
            : undefined
    }
}
