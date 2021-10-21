<p align="center">
  <img class="logo" src="https://raw.githubusercontent.com/wix/repluggable/master/media/repluggable-logo.svg" height="280">
</p>

# Repluggable

[![master build](https://github.com/wix/repluggable/workflows/Master%20Build/badge.svg)](https://github.com/wix/repluggable/actions?query=workflow%3A%22Master+Build%22)
[![npm version](https://img.shields.io/npm/v/repluggable)](https://www.npmjs.com/package/repluggable)

Repluggable is a library that's implementing inversion of control for front end applications and makes development of medium or high-complexity projects much easier. Currently Repluggable implements micro-frontends in a React+Redux app, with plans to make it framework-independent in the future.

Functionality of a Repluggable app is composed incrementally from a list of pluggable packages. Every package extends the already loaded ones by contributing new functionality into them. Sections of UI, contributed by a certain package, can be rendered anywhere and are not limited to dedicated subtree of DOM. All packages privately manage their state in a modular Redux store, which plays the role of common event mechanism. Packages interact with each other by contributing and consuming APIs, which are objects that implement declared interfaces. Packages can be plugged in and out at runtime without the need to reload a page. Check out the [architecture](#Architecture) section of the docs to learn more about the design decisions behind Repluggable.

Quick docs links: [How-to](#How-to) | [Architecture and core concepts](#Architecture)

# Getting started

All code in this README is in TypeScript.

## Installation

To add Repluggable to an existing React+Redux application:

```
$ npm install repluggable
```

## Create a new Repluggable project
Run the following commands:
```
npx create-react-app your-app-name --template typescript
cd your-app-name
yarn add react@16.14.0 react-dom@16.14.0 @types/react@16.14.0 @types/react-dom@16.9.0 repluggable
rm src/App*
rm src/logo*
cp -R node_modules/repluggable/examples/helloWorld/src/ ./src
yarn start
```

## Writing a pluggable package

A pluggable package is basically an array of entry points. An entry point is an object which contributes certain functionality to the application. Below is an example of a simple entry point.

`foo.ts`
```TypeScript
import { EntryPoint } from 'repluggable'

export const Foo : EntryPoint = {
    name: 'FOO',

    attach() {
        console.log('FOO is here!')
    }
}
```

Usually, a pluggable package will be a separate npm project, which exports an array of entry points. But it isn't required - entry points can also be part of the main app.

## Bootstrapping the main application

Main application is the React+Redux app that's being composed from packages. Suppose we also have `bar.ts` implemented similarly to `Foo` above.

`App.tsx`

```TypeScript
import { createAppHost, AppMainView } from 'repluggable'
import { Foo } from './foo'
import { Bar } from './bar'

const host = createAppHost([
    // the list of initially loaded packages
    Foo,
    Bar
])

ReactDOM.render(
    <AppMainView host={host} />,
    document.getElementById('root')
)
```

When run, the application will print two messages to console, first 'FOO is here!', then 'BAR is here!'.

# How-to

## Developing main application

The main application is a React application, which uses the `repluggable` package.

The `index.ts` of the application must perform the following steps.

1. Import from `repluggable`
   ```TypeScript
   import { createAppHost, AppMainView } from 'repluggable'
   ```

1. Provide loaders of pluggable packages. Below is an example of three packages, each loaded in a different way:
   - `package-foo` is statically bundled with the main app
   - `package-bar` is in a separate chunk (WebPack code splitting). We'll load it with dynamic import.
   - `package-baz` is in an AMD module, deployed separately. We'll load it with RequireJS.

   This is how the three packages are loaded:

   ```TypeScript
   import foo from 'package-foo'
   const bar = () => import('package-bar').then(m => m.default)
   const baz = require('package-baz')
   ```

1. Initialize `AppHost` with the packages:
   ```TypeScript
   const host = createAppHost([
       foo,
       baz
   ])

   // Later
   void bar().then(p => host.addShells([p]))
   ```

1. Render `AppMainView` component, passing it the host:

   ```TypeScript
   ReactDOM.render(
       <AppMainView host={host} />,
       document.getElementById('root')
   )
   ```

### Full code

```TypeScript
import ReactDOM from 'react-dom'
import { createAppHost, AppMainView } from 'repluggable'

import packageOne from 'package-one'
const packageTwo = () => import('package-two').then(m => m.default)
const packageThree = require('package-three')

const host = createAppHost([
    packageOne,
    packageThree
])

ReactDOM.render(
    <AppMainView host={host} />,
    document.getElementById('root')
)

// Sometime later
void packageTwo().then(p => host.addShells([p]))
```

## Developing a pluggable package

### Creating a package project

A package project is a regular Node project.

Typically, it is set up with TypeScript, React, and Redux. Such a project **must** include a `repluggable` dependency.

The rest of the configuration (Babel, WebPack, Jest, etc) heavily depends on the organization of your codebase and release pipeline, and is outside the scope of this README.

### Creating entry points

As we mentioned before, each package must export one or more entry points in order to be loaded by the main app.

An entry point is an object which implements an `EntryPoint` interface:
```TypeScript
import { EntryPoint } from 'repluggable'

const FooEntryPoint: EntryPoint = {

    // required: specify unique name of the entry point
    name: 'FOO',

    // optional
    getDependencyAPIs() {
        return [
            // DO list required API keys
            BarAPI
        ]
    },

    // optional
    declareAPIs() {
        // DO list API keys that will be contributed 
        return [
            FooAPI
        ]
    },

    // optional
    attach(shell: Shell) {
        // DO contribute APIs
        // DO contribute reducers
        // DO NOT consume APIs
        // DO NOT access store
        shell.contributeAPI(FooAPI, () => createFooAPI(shell))
    },

    // optional
    extend(shell: Shell) {
        // DO access store if necessary
        shell.getStore().dispatch(....)
        // DO consume APIs and contribute to other packages
        shell.getAPI(BarAPI).contributeBarItem(() => <FooItem />)
    },

    // optional
    detach(shell: Shell) {
        // DO perform any necessary cleanup
    }
}
```

The `EntryPoint` interface consists of:
- declarations: `name`, `getDependencies()`
- lifecycle hooks: `attach()`, `extend()`, `detach()`

The lifecycle hooks receive a `Shell` object, which represents the `AppHost` for this specific entry point.

### Exporting entry points

The default export of a package must be an array of its entry points. For example, in package root `index.ts` :

```TypeScript
import { FooEntryPoint } from './fooEntryPoint'
import { BarEntryPoint } from './barEntryPoint'

export default [
    FooEntryPoint,
    BarEntryPoint
]
```

### Creating an API

To create an API, perform these steps:

1. Declare an API interface. For example:
   ```TypeScript
   export interface FooAPI {
       doSomething(): void
       doSomethingElse(what: string): Promise<number>
   }
   ```

1. Declare an API key, which is a *const* named after the interface, as follows:
   ```TypeScript
   import { SlotKey } from 'repluggable'

   export const FooAPI: SlotKey<FooAPI> = {
       name: 'Foo API',
       public: true
   }
   ```
   Note that `public: true` is required if you plan to export your API outside of your package. The key must be declared in the same `.ts` file with the interface.

1. Implement your API. For example:
   ```TypeScript
   export function createFooAPI(shell: Shell): FooAPI {
       return {
           doSomething(): void {
               // ...
           },
           doSomethingElse(what: string): Promise<number> {
               // ...
           }
       }
   }
   ```

1. Contribute your API from an entry point `attach` function:
    ```TypeScript
    import { FooAPI, createFooAPI } from './fooApi'

    const FooEntryPoint: EntryPoint = {

        ...

        attach(shell: Shell) {
            shell.contributeAPI(FooAPI, () => createFooAPI(shell))
        }

        ...

    }
    ```

1. Export your API from the package. For example, in the `index.ts` of your package:
    ```TypeScript
    export { FooAPI } from './fooApi'
    ```

### Managing state

In order to manage state in a package, you need to contribute one or more reducers.

In the example below, `FooEntryPoint` will contribute two reducers, `bazReducer` and `quxReducer`.

To contribute the reducers, perform these steps:

1. Declare types that represent the state for each reducer:
    ```TypeScript
    // state managed by bazReducer
    export interface BazState {
        ...
        xyzzy: number // for example
    }

    // state managed by quxReducer
    export interface QuxState {
        ...
    }
    ```

1. Wrap these state types in a root state type. This root type determines the shape of the state in the entry point.

    ```TypeScript
    // the root type on entry point level
    export interface FooState {
        baz: BazState
        qux: QuxState
    }
    ```

1. Write the two reducers. For example, they can look like this:
    ```TypeScript
    function bazReducer(
        state: BazState = { /* initial values */ },
        action: Action)
    {
         ...
    }

    function quxReducer(
        state: QuxState = { /* initial values */ },
        action: Action)
    {
         ...
    }
    ```

1. Contribute state in the entry point:

    ```TypeScript
    attach(shell: Shell) {
        shell.contributeState<FooState>(() => ({
            baz: bazReducer,
            qux: quxReducer
        }))
    }
    ```

    Here, an argument passed to `contributeState()` is a reducer map object. This object contains all the same keys of `FooState` (the `baz` and `qux`), but this time the keys are assigned their respective reducers. Such derivation of reducers' map shape is enforced by the typings.

1. Expose selectors and action dispatchers through APIs:

    ```TypeScript
    export interface FooAPI {
        ...
        getBazXyzzy(): number
        setBazXyzzy(value: number): void
        ...
    }
    ```

    The above API allows to read and change the value of `xyzzy` in the `BazState`.

    Note that neither of these two functions are passed the state or the `Store` object. This is because their implementations are already bound to the store of the `AppHost`:

    ```TypeScript
    const createFooAPI = (shell: Shell): FooAPI => {
        // this returns a scoped wrapper over the full
        // store of the main application
        // IMPORTANT! the generic parameter (FooState)
        // must match the one specified when contributing state!
        // In our example, we did contributeState<FooState>(...)
        const entryPointStore = shell.getStore<FooState>()

        const getState = () => entryPointStore.getState()

        return {
            ...
            // example of selector
            getBazXyzzy(): number {
                const state: FooState = getState()
                return state.baz.xyzzy
            },
            // example of action dispatcher
            setBazXyzzy(value: number): void {
                entryPointStore.dispatch(BazActionCreators.setXyzzy(value))
            }
            ...
        }
    }
    ```

### Creating React components

When creating a React component, we strongly recommend to follow the React-Redux pattern, and separate your component into a stateless render and a `connect` container.

In `repluggable`, components often need to consume APIs. Although APIs can be obtained through `Shell`, when it is passed to lifecycle hooks in your entry point, propagating them down the component hierarchy would be cumbersome.  

A more elegant solution is to use `connectWithShell()` function instead of the regular `connect()`. This provides the connector with the ability to obtain APIs.

The example below illustrates how `connectWithShell()` is used. Suppose we want to create a component `<Foo />`, which would render like this:

```jsx
(props) => (
    <div className="foo">
        <div>
            <label>XYZZY</label>
            <input
                type="text"
                defaultValue={props.xyzzy}
                onChange={e => props.setXyzzy(e.target.value)} />
        </div>
        <div>
            Current BAR = {props.bar}
            <button onClick={() => props.createNewBar()}>
                Create new BAR
            </button>
        </div>
    </div>
)
```

In order to implement such a component, follow these steps:

1. Declare the type of state props, which is the object you return from `mapStateToProps`:
    ```TypeScript
    type FooStateProps = {
        // retrieved from own package state
        xyzzy: string
        // retrieved from another package API
        bar: number
    }
    ```

1. Declare type of dispatch props, which is the object you return from `mapDispatchToProps`:
    ```TypeScript
    type FooDispatchProps = {
        setXyzzy(newValue: string): void
        createNewBar(): void
    }
    ```

1. Write the stateless function component. Note that its props type is specified as `FooStateProps & FooDispatchProps`:
    ```TypeScript
    const FooSfc: React.SFC<FooStateProps & FooDispatchProps> =
        (props) => (
            <div className="foo">
                ...
            </div>        
        )
    ```

1. Write the connected container using `connectWithShell`. The latter differs from `connect` in that it passes `Shell` as the first parameter to `mapStateToProps` and `mapDispatchToProps`. The new parameter is followed by the regular parameters passed by `connect`. For example:

    ```TypeScript
    export const createFoo = (boundShell: Shell) => connectWithShell(
        // mapStateToProps
        // - shell: represents the associated entry point
        // - the rest are regular parameters of mapStateToProps
        (shell, state) => {
            return {
                // some properties can map from your own state
                xyzzy: state.baz.xyzzy,
                // some properties may come from other packages' APIs
                bar: shell.getAPI(BarAPI).getCurrentBar()
            }
        },
        // mapDispatchToProps
        // - shell: represents the associated entry point
        // - the rest are regular parameters of mapDispatchToProps
        (shell, dispatch) => {
            return {
                // some actions may alter your own state
                setXyzzy(newValue: string): void {
                    dispatch(FooActionCreators.setXyzzy(newValue))
                },
                // others may request actions from other packages' APIs
                createNewBar() {
                    shell.getAPI(BarAPI).createNewBar()  
                }
            }
        },
        boundShell
    )(FooSfc)
    ```

    The `Shell` parameter is extracted from React context `EntryPointContext`, which represents current package boundary for the component.


### Exporting React components

TBD (advanced topic)

## Testing a package

TBD

# Architecture

`repluggable` allows composition of a React+Redux application entirely from a list of pluggable packages.

Think of a package as a box of lego pieces - such as UI, state, and logic. When a package is plugged in, it contributes its pieces by connecting them to other pieces added earlier. In this way, the entire application is built up from connected pieces, much like a lego set.

For two pieces to connect, one piece defines a connection point (an _extension slot_) for another specific type of a piece. In order to connect, the other piece has to match the type of the slot. One slot can contain many pieces.

Packages can be plugged in and out at runtime. Contributed pieces are added and removed from the application on the fly, without the need for a page to reload.

## Main application

This is the application being composed, much like a lego set. We refer to it as _main application_.

The main application can be as small as an empty shell. Its functionality can be completely composed by the packages, where each plugged package contributes its pieces to the whole.

The minimal responsibilities of the main application are:

- Initialize an `AppHost` object with a list of pluggable packages.
   > The `AppHost` object orchestrates lifecycle of the packages, handles cross-cutting concerns at package boundaries, and provides dependency injection to Redux-connected components.

- Render `AppMainView` component, passing it the initialized `AppHost` in props.

## Pluggable packages

Pluggable package (or simply _package_) is a regular Node package, which exports an array of _entry points_.

The packages are plugged in the order they are listed when passed to `AppHost`. Entry points are invoked in the list order of the packages, in the array order within the package.

## Entry points

Every entry point contributes one or more pieces to the whole lego set of the application.

Examples of contributed pieces include React components, panel item descriptors, UI command descriptors, etc, etc. They can be anything, provided that they are expected by the "lego set". Here _expected_ means that some package provides an API, through which it accepts contributions of this specific type.

There are also two kinds of contributions supported directly by `repluggable`: _APIs_ and _reducers_.

Besides contributing lego pieces, entry points may contain additional lifecycle hooks.

## APIs

Some packages (providers) provide services to other packages (consumers). The services are provided through APIs. An API is an object, which implements a TypeScript interface, and is identified by an API key. An API key is another object declared as a const [TODO: link to example](), and exported from the package.

In general, APIs allow packages to extend other packages (consumers call APIs, which let them pass contributions to the provider), and otherwise interact. Moreover, APIs are the only allowed way of interaction between packages.

In order to provide an API, a provider package:
- declares and exports an API interface and an API key
- implements an API object according to the interface
- contributes an API object under the key

In order to consume an API, a consumer package:
- imports an API key and an API interface from the provider package
- declares dependency on the API in relevant entry points
- retrieves an API object by calling `getAPI` and passing it the API key [TODO: link to example]().

## Reducers

`repluggable` requires that all state of the application is managed in a Redux store. This ensures that all pieces are connected to a single event-driven mechanism. In turn, this  guarantees that pure React components mapped to values returned by APIs will re-render once these values change.

A package that has state must contribute one or more reducers responsible for managing that state. If such a package contributes APIs, it can also include selectors and action dispatchers in the APIs.

The Redux store of the main application is combined from reducers, contributed by stateful packages.

## Extension Slots

When a package accepts contributions from other packages, it must store contributed pieces in some kind of an array.

`repluggable` provides a "smart" array for this purpose, named _extension slot_. Extension slot is a generic object `ExtensionSlot<T>`, which accepts contributions of type `T`.

Its additional responsibility is remembering which package and entry point each contribution was received from. This allows applying package boundaries and easily handling other cross-cutting concerns.

Extension slots are implementation details of a package, and they should never be directly exposed outside of the package. Instead, a package:

- internally initializes an extension slot for every kind or group of accepted contributions.
- contributes an API that receives contributions from the outside and pushes them to an internal extension slot.

With that, the `AppHost` also tracks all existing extension slots. This approach allows for an easy implementation of application-wide aspects. For example, removal of a package with all of its contributions across an application.

## Package boundaries in DOM

Every React component rendered under the `AppMainView` is associated with an _entry point context_.

The entry point context is a React context, which associates its children with a specific entry point, and thus the package that contains it.

Such association provides several aspects to the children:

- performance measurements and errors reported by the children are automatically tagged with the entry point and the package

- in Redux-connected components ([TODO: link to details]()):

  - dependency injection (the `getAPI` function): all dependencies are resolved in the context of the entry point

  - state scoping (the `state` in `mapStateToProps`, and `getState()` in thunks): returned state object is scoped to reducers contributed by the entry point.  

  > TODO: verify that getState() in thunks is actually scoped

  - when rendering an extension slot of contributed React components: each component is rendered within the context of the entry point it was contributed by.

## Progressive loading

To make application loading reliable and fast, `repluggable` allows flexible control over package loading process.

The loading process is abstracted from any concrete module system or loader. Packages can be in a monolith bundle, or loaded with dynamic imports, or with loaders like RequireJS. To add a package to an `AppHost`, all that's needed is a `Promise` of a package default export.

Packages can be added to an `AppHost` at different stages:

- During initialization of the `AppHost`
- Right after the `AppMainView` was rendered for the first time
- Lazily at any later time

Moreover, `AppHost` allows separating the whole package into multiple entry points. Some of the entry points are added right as the package is added to the `AppHost`, while others can be added later.

Such separation allows incremental contribution of functional parts as they become ready. Some parts may need to dynamically load additional dependencies or request data from backends. Without the separation approach, a user won't be able to interact with any functionality of the package, until the entire package is initialized -- which would hurt the experience.

In addition, `AppHost` supports removal of previously added entry points or entire packages, at any time. Removal of a package means removal of all its entry points. When an entry point is removed, all contributions made from that entry point are removed too.

## API dependencies

Since APIs are contributed though entry points, their availability depends on the loading time of the provider package and a specific entry point within it. From a consumer package perspective, this creates a situation in which one or more of the APIs the package depends on may be temporarily unavailable.

`AppHost` resolves that with the help of explicit dependency declarations. Every entry point must declare APIs which it's dependent on (including dependencies of all pieces contributed by the entry point). If any of the required APIs is unavailable, the entry point is put on hold. There are two possible cases:

- Attempted to add an entry point, but some of required APIs weren't available: the entry point is put on hold, and will be added as soon as all required APIs are contributed.
- An entry point was added, but then some of its required APIs became unavailable: the entry point will be removed together with all of its contributions, and put on hold. It will be added once again as soon as all required APIs are available.

Such approach guarantees that code dependent on an API from another package will not run unless that API is available.

## Licenses

3-rd party licenses are listed in [docs/3rd-party-licenses.md](docs/3rd-party-licenses.md)
