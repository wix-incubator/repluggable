import { createAppHost } from '../src'

const unreadAPI = { name: 'unreadyAPI' }

const getUnreadyAPIs = async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    return globalThis.repluggableAppDebug.utils.getRootUnreadyAPI()
}

describe('RepluggableAppDebug', () => {
    describe('getRootUnreadyAPI', () => {
        it('should not report any issues in case there are no entry points', async () => {
            createAppHost([])

            const unreadyAPIs = await getUnreadyAPIs()

            expect(unreadyAPIs).toBeUndefined()
        })

        it('should not report any issues in case all entry points are loaded', async () => {
            createAppHost([
                {
                    name: 'entryPoint',
                    declareAPIs: () => []
                }
            ])

            const unreadyAPIs = await getUnreadyAPIs()

            expect(unreadyAPIs).toBeUndefined()
        })

        it('should return an API if its not ready', async () => {
            createAppHost([
                {
                    name: 'entryPoint',
                    getDependencyAPIs: () => [unreadAPI]
                }
            ])

            const unreadyAPIs = await getUnreadyAPIs()

            expect(unreadyAPIs).toEqual({ name: 'unreadyAPI' })
        })

        it('should return the root unready API when there are multiple entry points that depend on the same API', async () => {
            createAppHost([
                {
                    name: 'entryPoint A',
                    getDependencyAPIs: () => [unreadAPI]
                },
                {
                    name: 'entryPoint B',
                    getDependencyAPIs: () => [unreadAPI]
                },
                {
                    name: 'entryPoint C',
                    getDependencyAPIs: () => [unreadAPI]
                }
            ])

            const unreadyAPIs = await getUnreadyAPIs()

            expect(unreadyAPIs).toEqual({ name: 'unreadyAPI' })
        })

        it('should return the root unready API when there is a graph of dependencies', async () => {
            createAppHost([
                {
                    name: 'entryPoint A',
                    declareAPIs: () => [{ name: 'API A' }],
                    getDependencyAPIs: () => [{ name: 'API B' }]
                },
                {
                    name: 'entryPoint B',
                    declareAPIs: () => [{ name: 'API B' }],
                    getDependencyAPIs: () => [{ name: 'API C' }]
                },
                {
                    name: 'entryPoint C',
                    declareAPIs: () => [{ name: 'API C' }],
                    getDependencyAPIs: () => [unreadAPI]
                }
            ])

            const unreadyAPIs = await getUnreadyAPIs()

            expect(unreadyAPIs).toEqual({ name: 'unreadyAPI' })
        })

        it('should return the root unready API when there is a graph of dependencies (declation order is reversed)', async () => {
            createAppHost(
                [
                    {
                        name: 'entryPoint A',
                        declareAPIs: () => [{ name: 'API A' }],
                        getDependencyAPIs: () => [{ name: 'API B' }]
                    },
                    {
                        name: 'entryPoint B',
                        declareAPIs: () => [{ name: 'API B' }],
                        getDependencyAPIs: () => [{ name: 'API C' }]
                    },
                    {
                        name: 'entryPoint C',
                        declareAPIs: () => [{ name: 'API C' }],
                        getDependencyAPIs: () => [unreadAPI]
                    }
                ].reverse()
            )

            const unreadyAPIs = await getUnreadyAPIs()
            // because we take the first unready entry point, and in this case its the root,
            // we don't get the rest of the unready APIs
            expect(unreadyAPIs).toEqual({ name: 'unreadyAPI' })
        })
    })
})
