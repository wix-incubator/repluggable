import { createContext } from 'react';
import { AppHost } from './api';

export interface HostContext {
    readonly host: AppHost;
};

export const HostContext = createContext<HostContext | null>(null) as React.Context<HostContext>;
