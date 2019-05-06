import { EntryPoint, SlotKey } from '../src/API'

export const createCircularEntryPoints = (usePublicAPIKeys: boolean = false): EntryPoint[] => {
    const MockAPI1: SlotKey<{}> = { name: 'Mock-API-1', public: usePublicAPIKeys }
    const MockAPI2: SlotKey<{}> = { name: 'Mock-API-2', public: usePublicAPIKeys }
    const MockAPI3: SlotKey<{}> = { name: 'Mock-API-3', public: usePublicAPIKeys }
    const MockAPI4: SlotKey<{}> = { name: 'Mock-API-4', public: usePublicAPIKeys }

    const ep1Deps = usePublicAPIKeys ? [{ name: 'Mock-API-2', public: true }, { name: 'Mock-API-3', public: true }] : [MockAPI2, MockAPI3]
    const ep2Deps = usePublicAPIKeys ? [{ name: 'Mock-API-4', public: true }] : [MockAPI4]
    const ep3Deps = usePublicAPIKeys ? [{ name: 'Mock-API-4', public: true }] : [MockAPI4]
    const ep4Deps = usePublicAPIKeys ? [{ name: 'Mock-API-1', public: true }] : [MockAPI1]

    return [
        {
            name: 'MOCK_ENTRY_POINT_1',
            getDependencyAPIs: () => ep1Deps,
            declareAPIs: () => [MockAPI1]
        },
        {
            name: 'MOCK_ENTRY_POINT_2',
            getDependencyAPIs: () => ep2Deps,
            declareAPIs: () => [MockAPI2]
        },
        {
            name: 'MOCK_ENTRY_POINT_3',
            getDependencyAPIs: () => ep3Deps,
            declareAPIs: () => [MockAPI3]
        },
        {
            name: 'MOCK_ENTRY_POINT_4',
            getDependencyAPIs: () => ep4Deps,
            declareAPIs: () => [MockAPI4]
        }
    ]
}

export const createDirectCircularEntryPoints = (usePublicAPIKeys: boolean = false): EntryPoint[] => {
    const MockAPI1: SlotKey<{}> = { name: 'Mock-API-1', public: usePublicAPIKeys }
    const MockAPI2: SlotKey<{}> = { name: 'Mock-API-2', public: usePublicAPIKeys }
    return [
        {
            name: 'MOCK_ENTRY_POINT_1',
            getDependencyAPIs: () => [usePublicAPIKeys ? { name: 'Mock-API-2', public: true } : MockAPI2],
            declareAPIs: () => [MockAPI1]
        },
        {
            name: 'MOCK_ENTRY_POINT_2',
            getDependencyAPIs: () => [usePublicAPIKeys ? { name: 'Mock-API-1', public: true } : MockAPI1],
            declareAPIs: () => [MockAPI2]
        }
    ]
}
