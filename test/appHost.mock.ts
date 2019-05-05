import { EntryPoint, SlotKey } from '../src/API'

export const createCircularEntryPoints = (usePublicAPIKeys: boolean = false): EntryPoint[] => {
    const MockAPI1: SlotKey<{}> = { name: 'Mock-API-1', public: usePublicAPIKeys }
    const MockAPI2: SlotKey<{}> = { name: 'Mock-API-2', public: usePublicAPIKeys }
    const MockAPI3: SlotKey<{}> = { name: 'Mock-API-3', public: usePublicAPIKeys }
    return [
        {
            name: 'MOCK_ENTRY_POINT_1',
            getDependencyAPIs: () => [usePublicAPIKeys ? { name: 'Mock-API-2', public: true } : MockAPI2],
            declareAPIs: () => [MockAPI1]
        },
        {
            name: 'MOCK_ENTRY_POINT_2',
            getDependencyAPIs: () => [usePublicAPIKeys ? { name: 'Mock-API-3', public: true } : MockAPI3],
            declareAPIs: () => [MockAPI2]
        },
        {
            name: 'MOCK_ENTRY_POINT_3',
            getDependencyAPIs: () => [usePublicAPIKeys ? { name: 'Mock-API-1', public: true } : MockAPI1],
            declareAPIs: () => [MockAPI3]
        }
    ]
}
