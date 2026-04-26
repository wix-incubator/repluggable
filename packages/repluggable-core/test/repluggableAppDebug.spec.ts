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

        it('should return all traversal paths from an entry point to a transitive API', () => {
            createAppHost([
                {
                    name: 'entryPoint A',
                    getDependencyAPIs: () => [{ name: 'API B' }]
                },
                {
                    name: 'entryPoint B',
                    declareAPIs: () => [{ name: 'API B' }],
                    getDependencyAPIs: () => [{ name: 'API C' }]
                },
                {
                    name: 'entryPoint C',
                    declareAPIs: () => [{ name: 'API C' }]
                }
            ])

            const { traceAPIDependency } = globalThis.repluggableAppDebug.utils

            expect(traceAPIDependency('entryPoint A', 'API C')).toEqual({
                entryPoint: 'entryPoint A',
                deps: [
                    {
                        api: 'API B',
                        subtree: {
                            entryPoint: 'entryPoint B',
                            deps: [{ api: 'API C', subtree: null }]
                        }
                    }
                ]
            })

            expect(traceAPIDependency('entryPoint A', 'API B')).toEqual({
                entryPoint: 'entryPoint A',
                deps: [{ api: 'API B', subtree: null }]
            })

            expect(traceAPIDependency('entryPoint C', 'API B')).toBeNull()
            expect(traceAPIDependency('nonexistent', 'API B')).toBeNull()
        })

        it('should branch the dependency tree when multiple routes reach the target API', () => {
            createAppHost([
                {
                    name: 'entryPoint A',
                    getDependencyAPIs: () => [{ name: 'API X' }, { name: 'API Y' }]
                },
                {
                    name: 'entryPoint B',
                    declareAPIs: () => [{ name: 'API X' }],
                    getDependencyAPIs: () => [{ name: 'API Z' }]
                },
                {
                    name: 'entryPoint C',
                    declareAPIs: () => [{ name: 'API Y' }],
                    getDependencyAPIs: () => [{ name: 'API Z' }]
                },
                {
                    name: 'entryPoint D',
                    declareAPIs: () => [{ name: 'API Z' }]
                }
            ])

            const { traceAPIDependency } = globalThis.repluggableAppDebug.utils

            expect(traceAPIDependency('entryPoint A', 'API Z')).toEqual({
                entryPoint: 'entryPoint A',
                deps: [
                    {
                        api: 'API X',
                        subtree: {
                            entryPoint: 'entryPoint B',
                            deps: [{ api: 'API Z', subtree: null }]
                        }
                    },
                    {
                        api: 'API Y',
                        subtree: {
                            entryPoint: 'entryPoint C',
                            deps: [{ api: 'API Z', subtree: null }]
                        }
                    }
                ]
            })
        })

        it('should visualize the dependency tree, collapsing shared prefixes', () => {
            createAppHost([
                {
                    name: 'entryPoint A',
                    getDependencyAPIs: () => [{ name: 'API B' }]
                },
                {
                    name: 'entryPoint B',
                    declareAPIs: () => [{ name: 'API B' }],
                    getDependencyAPIs: () => [{ name: 'API X' }, { name: 'API Y' }]
                },
                {
                    name: 'entryPoint X',
                    declareAPIs: () => [{ name: 'API X' }],
                    getDependencyAPIs: () => [{ name: 'API Z' }]
                },
                {
                    name: 'entryPoint Y',
                    declareAPIs: () => [{ name: 'API Y' }],
                    getDependencyAPIs: () => [{ name: 'API Z' }]
                },
                {
                    name: 'entryPoint Z',
                    declareAPIs: () => [{ name: 'API Z' }]
                }
            ])

            const { traceAPIDependency, visualizeDependencyTree } = globalThis.repluggableAppDebug.utils
            const tree = traceAPIDependency('entryPoint A', 'API Z')

            expect(visualizeDependencyTree(tree)).toBe(
                [
                    'entryPoint A',
                    '└─ API B (declared by entryPoint B)',
                    '   ├─ API X (declared by entryPoint X)',
                    '   │  └─ API Z',
                    '   └─ API Y (declared by entryPoint Y)',
                    '      └─ API Z'
                ].join('\n')
            )

            expect(visualizeDependencyTree(null)).toBe('(no dependency paths)')
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
