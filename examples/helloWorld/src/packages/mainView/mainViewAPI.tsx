import { ReactComponentContributor, Shell, SlotKey } from 'repluggable';

export interface MainViewAPI {
    contributeComponent(fromShell: Shell, contribution: ContributedComponent): void
}

export const MainViewAPI: SlotKey<MainViewAPI> = {
    name: 'Main View API',
    public: true,
};

export interface ContributedComponent {
  component: ReactComponentContributor;
}

export const componentsSlotKey: SlotKey<ContributedComponent> = {
  name: 'contributedComponent',
};

export const createMainViewAPI = (shell: Shell): MainViewAPI => {
    const componentsSlot = shell.declareSlot(componentsSlotKey)

    return {
        contributeComponent(fromShell, contribution) {
            componentsSlot.contribute(fromShell, contribution)
        }
    }
};