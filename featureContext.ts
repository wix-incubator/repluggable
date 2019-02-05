import { createContext } from 'react';
import { SlotKey, ExtensionSlot } from './api';

export interface FeatureContext {
    getSlot<TItem>(key: SlotKey<TItem>): ExtensionSlot<TItem>;
    //readonly log: FeatureLogger; //TODO: define logging abstraction
};

export const FeatureContext = createContext<FeatureContext | null>(null) as React.Context<FeatureContext>;
