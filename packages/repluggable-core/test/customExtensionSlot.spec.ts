import _ from "lodash";
import {
  EntryPoint,
  SlotKey,
  Shell,
  CustomExtensionSlot,
  CustomExtensionSlotHandler,
  ExtensionItem,
} from "../src";
import { createAppHost, addMockShell } from "../testKit";

interface TestItem {
  value: string;
}

const slotKey: SlotKey<TestItem> = { name: "TEST_SLOT" };

describe("Custom Extension Slot", () => {
  let slotUnderTest: CustomExtensionSlot<TestItem>;
  let slotHandler: CustomExtensionSlotHandler<TestItem>;
  let ownerShell: Shell | undefined;

  const testEntryPoint: EntryPoint = {
    name: "TEST",
    attach(shell) {
      ownerShell = shell;
      slotUnderTest = shell.declareCustomSlot<TestItem>(slotKey, slotHandler);
    },
    detach(shell) {
      ownerShell = undefined;
    },
  };

  beforeEach(() => {
    slotHandler = {
      contribute: jest.fn(),
      discardBy: jest.fn(),
    };
    ownerShell = undefined;
  });

  it("can be declared", () => {
    createAppHost([testEntryPoint]);

    expect(slotUnderTest).toBeDefined();
  });

  it("can be retrieved by key", async () => {
    createAppHost([testEntryPoint]);

    expect(ownerShell).toBeDefined();
    expect(ownerShell && ownerShell.getSlot(slotKey)).toBeDefined();
  });

  it("invokes callback on contribute", () => {
    const host = createAppHost([testEntryPoint]);
    const contributorShell = addMockShell(host);
    const item = { value: "abc" };

    slotUnderTest.contribute(contributorShell, item);

    expect(slotHandler.contribute).toBeCalledTimes(1);
    expect(slotHandler.contribute).toBeCalledWith(contributorShell, item);
    expect(slotHandler.discardBy).not.toHaveBeenCalled();
  });

  it("invokes callback on discard", () => {
    createAppHost([testEntryPoint]);
    const predicate = (item: ExtensionItem<TestItem>) => true;

    slotUnderTest.discardBy(predicate);

    expect(slotHandler.contribute).not.toHaveBeenCalled();
    expect(slotHandler.discardBy).toBeCalledTimes(1);
    expect(slotHandler.discardBy).toBeCalledWith(predicate);
  });

  it("cannot create two slots with same key: custom and standard", () => {
    const beforeTestEntryPoint: EntryPoint = {
      name: "BEFORE_TEST",
      attach(shell) {
        shell.declareSlot(slotKey);
      },
    };

    expect(() =>
      createAppHost([beforeTestEntryPoint, testEntryPoint])
    ).toThrowError();
  });

  it("cannot create two slots with same key: custom and custom", () => {
    const beforeTestEntryPoint: EntryPoint = {
      name: "BEFORE_TEST",
      attach(shell) {
        shell.declareCustomSlot(slotKey, {
          contribute: () => {},
          discardBy: () => {},
        });
      },
    };

    expect(() =>
      createAppHost([beforeTestEntryPoint, testEntryPoint])
    ).toThrowError();
  });

  it("cannot create two slots with same name: custom and standard", () => {
    const beforeTestEntryPoint: EntryPoint = {
      name: "BEFORE_TEST",
      attach(shell) {
        shell.declareSlot({ name: slotKey.name });
      },
    };

    expect(() =>
      createAppHost([beforeTestEntryPoint, testEntryPoint])
    ).toThrowError();
  });

  it("cannot create two slots with same name: custom and custom", () => {
    const beforeTestEntryPoint: EntryPoint = {
      name: "BEFORE_TEST",
      attach(shell) {
        shell.declareCustomSlot(
          { name: slotKey.name },
          {
            contribute: () => {},
            discardBy: () => {},
          }
        );
      },
    };

    expect(() =>
      createAppHost([beforeTestEntryPoint, testEntryPoint])
    ).toThrowError();
  });

  it("can reload entry point that declares custom slots", async () => {
    const host = createAppHost([testEntryPoint]);

    expect(ownerShell).toBeDefined();

    await host.removeShells([testEntryPoint.name]);

    expect(ownerShell).toBeUndefined();

    await host.addShells([_.cloneDeep(testEntryPoint)]);

    expect(ownerShell).toBeDefined();
    expect(ownerShell && ownerShell.getSlot(slotKey)).toBeDefined();
  });
});
