import { AnyEntryPoint, AnySlotKey } from './API';

import _ from 'lodash';

export const dependentAPIs = (entryPoint: AnyEntryPoint): AnySlotKey[] => {
  return _.chain(entryPoint)
    .invoke('getDependencyAPIs')
    .defaultTo([])
    .value();
};

export const declaredAPIs = (entryPoint: AnyEntryPoint): AnySlotKey[] => {
  return _.chain(entryPoint)
    .invoke('declareAPIs')
    .defaultTo([])
    .value();
};
