import { createAppHost, SlotKey } from "../src";
import {
  EntryPoint,
  ExtensionItem,
  PrivateAppHost,
  PrivateExtensionSlot,
  Shell,
} from "../src/API";
import { createExtensionSlot } from "../src/extensionSlot";
import { addMockShell } from "../testKit";

describe("ExtensionSlot", () => {
  describe("Subscribe", () => {
    it("should be invoked on contribution", () => {
      const slotKey: SlotKey<{}> = {
        name: "mock_key",
      };
      const host = createAppHost([]);
      const shell = addMockShell(host);
      const spy = jest.fn();
      const slot = shell.declareSlot(slotKey) as PrivateExtensionSlot<{}>;

      slot.subscribe(spy);

      slot.contribute(shell, () => ({}));

      expect(spy).toBeCalledTimes(1);

      slot.contribute(shell, () => ({}));

      expect(spy).toBeCalledTimes(2);
    });
    it("should be invoked once when contribution is during installation phase", () => {
      interface SlotItem {
        name: string;
      }
      const slotKey: SlotKey<SlotItem> = {
        name: "MOCK_SLOT",
      };
      interface MockContributionAPI {
        contributeItem(fromShell: Shell, item: SlotItem): void;
      }

      const ContributionAPI: SlotKey<MockContributionAPI> = {
        name: "CONTRIBUTION_API",
      };

      const spy = jest.fn();

      const contributionEntryPoint: EntryPoint = {
        name: "PRIVATE CONTRIBUTION ENTRY POINT",
        declareAPIs() {
          return [ContributionAPI];
        },
        attach(shell) {
          const slot = shell.declareSlot(
            slotKey
          ) as PrivateExtensionSlot<SlotItem>;
          slot.subscribe(spy);
          shell.contributeAPI(ContributionAPI, () => ({
            contributeItem(fromShell, item) {
              shell.getSlot(slotKey).contribute(fromShell, item);
            },
          }));
        },
      };

      const API_A: SlotKey<{}> = { name: "API_A" };

      const itemContributionEntryPointA: EntryPoint = {
        name: "ITEM CONTRIBUTION ENTRY POINT A",
        getDependencyAPIs() {
          return [ContributionAPI];
        },
        declareAPIs(): SlotKey<{}>[] {
          return [API_A];
        },
        attach(shell: Shell) {
          shell.contributeAPI(API_A, () => ({}));
        },
        extend(shell: Shell) {
          shell.getAPI(ContributionAPI).contributeItem(shell, { name: "A.1" });
          shell.getAPI(ContributionAPI).contributeItem(shell, { name: "A.2" });
        },
      };

      const itemContributionEntryPointB: EntryPoint = {
        name: "ITEM CONTRIBUTION ENTRY POINT B",
        getDependencyAPIs() {
          return [ContributionAPI, API_A];
        },
        extend(shell: Shell) {
          shell.getAPI(ContributionAPI).contributeItem(shell, { name: "B.1" });
          shell.getAPI(ContributionAPI).contributeItem(shell, { name: "B.2" });
        },
      };

      createAppHost([
        contributionEntryPoint,
        itemContributionEntryPointA,
        itemContributionEntryPointB,
      ]);

      expect(spy).toBeCalledTimes(1);
    });
  });

  describe("Custom Items Data Structure with Signals", () => {
    // Naive signals implementation
    type Signal<T> = {
      get: () => T;
      set: (value: T) => void;
    };

    let currentEffect: (() => void) | null = null;

    const signal = <T>(initialValue: T): Signal<T> => {
      let value = initialValue;
      const subscribers = new Set<() => void>();

      return {
        get: () => {
          if (currentEffect) {
            subscribers.add(currentEffect);
          }
          return value;
        },
        set: (newValue: T) => {
          value = newValue;
          subscribers.forEach((fn) => fn());
        },
      };
    };

    const effect = (fn: () => void): (() => void) => {
      const execute = () => {
        currentEffect = execute;
        fn();
        currentEffect = null;
      };
      execute();
      return () => {
        currentEffect = null;
      };
    };

    const createSignalItemsDataStructure = () => {
      let signalToTrack: Signal<ExtensionItem<any>[]> | null = null;
      return {
        dataStructure: <U>() => {
          const itemsSignal = signal<ExtensionItem<U>[]>([]);
          signalToTrack = itemsSignal;
          return {
            get: () => itemsSignal.get(),
            add: (item: ExtensionItem<U>) => {
              itemsSignal.set([...itemsSignal.get(), item]);
            },
            filter: (predicate: (item: ExtensionItem<U>) => boolean) => {
              itemsSignal.set(itemsSignal.get().filter(predicate));
            },
          };
        },
        getSignalToTrack: () => {
          if (!signalToTrack) {
            throw new Error("Signal to track is not set");
          }
          return signalToTrack;
        },
      };
    };

    it("should notify effect when items are added", () => {
      const slotKey: SlotKey<{ value: string }> = { name: "signal_slot" };
      const host = createAppHost([]) as PrivateAppHost;
      const shell = addMockShell(host);

      const { dataStructure, getSignalToTrack } =
        createSignalItemsDataStructure();
      const effectSpy = jest.fn();

      const slot = createExtensionSlot(slotKey, host, {
        customItemsDataStructure: dataStructure,
      });

      effect(() => {
        getSignalToTrack().get();
        effectSpy();
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      slot.contribute(shell, { value: "item1" });
      expect(effectSpy).toHaveBeenCalledTimes(2);

      slot.contribute(shell, { value: "item2" });
      expect(effectSpy).toHaveBeenCalledTimes(3);
    });

    it("should notify effect when items are filtered/removed", () => {
      const slotKey: SlotKey<{ id: number }> = { name: "filter_signal_slot" };
      const host = createAppHost([]) as PrivateAppHost;
      const shell = addMockShell(host);

      const { dataStructure, getSignalToTrack } =
        createSignalItemsDataStructure();
      const effectSpy = jest.fn();

      const slot = createExtensionSlot(slotKey, host, {
        customItemsDataStructure: dataStructure,
      });

      effect(() => {
        getSignalToTrack().get();
        effectSpy();
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      slot.contribute(shell, { id: 1 });
      slot.contribute(shell, { id: 2 });
      expect(effectSpy).toHaveBeenCalledTimes(3);

      slot.discardBy(
        (item: ExtensionItem<{ id: number }>) => item.contribution.id === 1
      );
      expect(effectSpy).toHaveBeenCalledTimes(4);
    });

    it("should track signal value correctly", () => {
      const slotKey: SlotKey<{ name: string }> = { name: "track_slot" };
      const host = createAppHost([]) as PrivateAppHost;
      const shell = addMockShell(host);

      const { dataStructure, getSignalToTrack } =
        createSignalItemsDataStructure();
      let capturedItems: ExtensionItem<{ name: string }>[] = [];

      const slot = createExtensionSlot(slotKey, host, {
        customItemsDataStructure: dataStructure,
      });

      effect(() => {
        capturedItems = getSignalToTrack().get();
      });

      slot.contribute(shell, { name: "first" });
      expect(capturedItems).toHaveLength(1);
      expect(capturedItems[0].contribution.name).toBe("first");

      slot.contribute(shell, { name: "second" });
      expect(capturedItems).toHaveLength(2);
      expect(capturedItems[1].contribution.name).toBe("second");
    });
  });
});
