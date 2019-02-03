import {
  EditorHost,
  EditorMainView,
  HostContext,
  createEditorHost
} from "../index";
import { Provider } from "react-redux";
import React, { Component, ReactElement } from "react";
import ReactDOM from "react-dom";
import _ from "lodash";

export { EditorHost, createEditorHost } from "../index";

export const renderHost = async (
  host: EditorHost
): Promise<{ root: Component | null; DOMNode: HTMLElement | null }> => {
  const div = document.createElement("div");
  let root = null;
  await new Promise(resolve => {
    root = ReactDOM.render(
      <Provider store={host.getStore()}>
        <EditorMainView host={host} />
      </Provider>,
      div,
      resolve
    ) as Component;
  });
  return { root, DOMNode: root && ReactDOM.findDOMNode(root) as HTMLElement };
};

export const renderInHost = async (
  reactElement: ReactElement<any>,
  host: EditorHost = createEditorHost([])
): Promise<{
  root: Component | null;
  parentRef: Component | null;
  DOMNode: HTMLElement | null;
  host: EditorHost;
}> => {
  const div = document.createElement("div");
  let root = null;
  const { ref } = await new Promise(resolve => {
    root = ReactDOM.render(
      <Provider store={host.getStore()}>
        <HostContext.Provider value={{ host }}>
          <div ref={ref => resolve({ ref })}>{reactElement}</div>
        </HostContext.Provider>
      </Provider>,
      div
    );
  });

  const parentNode: HTMLElement = ReactDOM.findDOMNode(ref) as HTMLElement;

  return {
    root,
    DOMNode: ref && (_.head(parentNode.children) as HTMLElement),
    parentRef: ref,
    host
  };
};
