import { createContext } from 'react';
import { EditorHost } from './api';

export interface HostContext {
    readonly host: EditorHost;
};

export const HostContext = createContext<HostContext | null>(null) as React.Context<HostContext>;
