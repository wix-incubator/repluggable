import { EntryPoint, SlotKey } from '../src/API';

export const createCircularEntryPoints = (): EntryPoint[] => {
  const MockAPI1: SlotKey<{}> = { name: 'Mock-API-1' };
  const MockAPI2: SlotKey<{}> = { name: 'Mock-API-2' };
  const MockAPI3: SlotKey<{}> = { name: 'Mock-API-3' };
  return [
    {
      name: 'MOCK_ENTRY_POINT_1',
      getDependencyAPIs: () => [MockAPI2],
      declareAPIs: () => [MockAPI1],
    },
    {
      name: 'MOCK_ENTRY_POINT_2',
      getDependencyAPIs: () => [MockAPI3],
      declareAPIs: () => [MockAPI2],
    },
    {
      name: 'MOCK_ENTRY_POINT_3',
      getDependencyAPIs: () => [MockAPI1],
      declareAPIs: () => [MockAPI3],
    },
  ];
};
