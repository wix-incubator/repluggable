import { ExtensionItem } from "../src/API";

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

export const createSignalItemsDataStructure = () => {
  let signalToTrack: Signal<ExtensionItem<any>[]> | null = null;
  return {
    createDataStructure: <U>() => {
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
    effect,
  };
};
