# Table of contents

- [Concept](#concept)
- [Programmer's Guide](#programmers-guide)
  - [Developing main application](#developing-main-application)
  - [Developing pluggable package](#developing-pluggable-package)
- [API Reference](#api-reference)

# Concept

`react-app-lego` allows composition of a React-with-Redux application entirely from a list of _pluggable packages_, much like a lego built from pieces. 

The packages can be plugged in and out at runtime without the need to reload the application.

## Main application

This is the application being composed as a lego. We refer to it as _main application_. 

The main application can be as small as an empty shell. Its functionality can be composed completely from the packages, where each loaded package contributes its pieces to the whole.

The minimal responsibilities of the main application are:

- Initialize an `AppHost` object with a list of pluggable packages. 
   > The `AppHost` object orchestrates lifecycle of the packages, handles cross-cutting concerns at package boundaries, and provides dependency injection to Redux-connected components.

- Render `AppMainView` component, passing it the initialized `AppHost` in props.

## Pluggable packages

Pluggable package (or simply _package_) is a regular Node package, which exports an array of _entry points_. 

The packages are loaded in the order they are listed when passed to `AppHost`. Entry points are invoked in the load order of the packages, in the array order within the package.

## Entry points

Every entry point contributes one or more pieces to the whole lego of the application. 

Examples of contributed pieces include React components, panel item descriptors, UI command descriptors, etc etc. They can be anything, provided that they are expected by the lego. Here _expected_ means that some package provides an API, through which it accepts contributions of this specific type.

There are also two kinds of contributions supported directly by `react-app-lego`: _APIs_ and _reducers_.

Besides contributing lego pieces, entry points may contain additional lifecycle hooks.

## APIs

Some packages (providers) provide services to other packages (consumers). The services are provided through APIs. An API is an object, which implements a TypeScript interface, and is identified by an API key. An API key is another object declared as a const [TODO: link to example](), and exported from the package. 

In general, APIs allow packages to extend other packages (consumers call APIs, which let them pass contributions to the provider), and otherwise interact. Moreover, APIs are the only allowed way of interaction between packages.

In order to provide an API, a provider package does:
- declare and export API interface and API key
- implement API object according to the interface
- contribute API object under the key
 
In order to consume an API, a consumer package does:
- import API key and API interface from the provider package
- declare dependency on the API in relevant entry points
- retrieve API object by calling `getAPI` and passing it the API key [TODO: link to example]().

## Reducers 

`react-app-lego` requires all state of the application to be managed in Redux store. This ensures that all pieces are connected to a single event-driven mechanism. This in turn, guarantees that pure React components mapped to values returned by APIs, will re-render once these values change.

A package that has state must contribute one or more reducers responsible for managing that state. If such package contributes APIs, it can also include selectors and action dispatchers in the APIs.

The Redux store of the main application is combined from reducers contributed by stateful packages.

## Extension Slots

When a package accepts contributions from other packages, it must store contributed pieces in some kind of array. 

`react-app-lego` provides a "smart" array for this purpose, named _extension slot_. Extension slot is a generic object `ExtensionSlot<T>`, which accpets contributions of type `T`. 

Its additional responsibility is remembering which package and entry point each contribution was received from. This allows applying package boundaries and easily handling other cross-cutting concerns.

Extension slots are implementation details of a package, and they should never be directly exposed outside of the package. Instead, the package does: 

- internally initialize an extension slot for every kind or group of accepted contributions
- contribute an API that receives contributions from the outside and pushes them to an internal extension slot.

With that, the `AppHost` also tracks all existing extension slots. This approach allows easy implementation of application-wide aspects. For example, removal of a package with all of its contributions across the application.

## Package boundaries in DOM

Every React component rendered under the `AppMainView` is associated with an _entry point context_. 

The entry point context is a React context, which associates its children with a specific entry point, and thus the package that contains it. 

Such association provides several aspects to the children:

- performance measurements and errors reported by the children, are automatically tagged with the entry point and the package

- in Redux-connected components ([TODO: link to details]()):

  - dependency injection (the `getAPI` function): all dependencies are resolved in the context of the entry point

  - state scoping (the `state` in `mapStateToProps`, and `getState()` in thunks): returned state object is scoped to reducers contributed by the entry point.  

> TODO: verify that getState() in thunks is actually scoped

- when rendering an extension slot of contributed React components: each component is rendered within the context of the entry point it was contributed by.

## Progressive loading 

To make application loading reliable and fast, `react-app-lego` allows flexible control over package loading process. 

The loading process is abstracted from any concrete module system or loader. Packages can be in a monolith bundle, or loaded with dynamic imports, or with loaders like RequireJS. To add a package to an `AppHost`, all that's needed is a `Promise` of package default export. 

Packages can be added to an `AppHost` at different phases:

- During initialization of the `AppHost`
- Right after the `AppMainView` was rendered for the first time
- Lazily at any later time

Moreover, `AppHost` allows separating a whole package into multiple entry points. Some of the entry points are added right as the package is added to the `AppHost`, while others can be added later. 

Such separation allows incremental contribution of functional parts as they become ready. Some parts may need to dynamically load additional dependencies or request data from backends. Without the separation approach, the user won't be able to interact with any functionality of the package, until the entire package is initialized -- which would hurt the experience.

In addition, `AppHost` supports removal of previously added entry points or entire packages, at any time. Removal of a package means removal of all its entry points. When an entry point is removed, all contributions made from that entry point are removed altogether.

## API dependencies

Since APIs are contributed though entry points, their availability depends on the loading timing of the provider package, and a specific entry point within it. From a consumer package perspective, this creates a situation in which one or more of APIs the package depends on may be temporarily unavailable.

`AppHost` resolves that with the help of explicit dependency declarations. Every entry point must declare APIs on which it depends (including dependencies of all pieces contributed by the entry point). If any of the required APIs is unavailable, the entry point is put on hold. There are two possible cases:

- Attempted to add an entry point, but some of required APIs weren't available: the entry point is put on hold, and will be added as soon as all required APIs will be contributed.
- An entry point was added, but then some of its required APIs became unavailable: the entry point will be removed together with all its contributions, and put on hold. It will be added again as soon as all required APIs will be available.

Such approach guarantees that code dependent on an API from another package, will not run unless that API is available.

# Programmer's Guide

## TypeScript

`react-app-lego` primarily supports development in TypeScript. While development in JavaScript (and anything that transpiles into JavaScript) is possible, many design decisions bear TypeScript in mind.

## Developing main application

The main application is a React application, which uses `react-app-lego` package.

The `index.ts` of the application must perform the following steps.

1. Import from `react-app-lego`
   ```TypeScript
   import { createAppHost, AppMainView } from 'react-app-lego'
   ```

1. Provide loaders of pluggable packages. Here we give an example of three packages, each loaded in a different way:
   - `package-foo` is statically bundled with the main app
   - `package-bar` is in a separate chunk (WebPack code splitting). We'll load it with dynamic import
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
       bar,
       baz
   ])
   ```

1. Render `AppMainView` component, passing it the host:

   ```TypeScript
   ReactDOM.render(
       <AppMainView host={host} />, 
       document.getElementById('root')
   )
   ```

### Full code listing

```TypeScript
import ReactDOM from 'react-dom'
import { createAppHost, AppMainView } from 'react-app-lego'

import packageOne from 'package-one'
const packageTwo = () => import('package-two').then(m => m.default)
const packageThree = require('package-three')

const host = createAppHost([
    packageOne, 
    packageTwo,
    packageThree
])

ReactDOM.render(
    <AppMainView host={host} />, 
    document.getElementById('root')
)
```

## Developing pluggable package

### Creating package project

A package project is a regular Node project. 

Typically, it is set up with TypeScript, React, and Redux. The project must include dependency on `react-app-lego`. 

The rest of the configuration (Babel, WebPack, Jest, etc) heavily depends on organization of you codebase and release pipeline, and is out of scope of this README.

### Creating entry points

As we mentioned, each package must export one or more entry points, in order to be loaded by the main app.

An entry point is an object which implements `EntryPoint` interface:
```TypeScript
import { EntryPoint } from 'react-app-lego'

const FooEntryPoint: EntryPoint = {

    // required: specify name of the entry point
    name: 'FOO',

    // optional
    getDependencies() {
        return [ 
            // DO list required API keys 
            // DO list components form other packages,
            //    which are in use by your components
            BarAPI, BazInputBox
        ]
    }

    // optional
    install(host: EntryPointHost) {
        // DO contribute APIs 
        // DO contribute reducers
        // DO NOT consume APIs
        // DO NOT access store
        host.contributeAPI(FooAPI, () => createFooAPI(host))
    },

    // optional
    extend(host: EntryPointHost) {
        // DO access store if necessary
        host.getStore().dispatch(....)
        // DO consume APIs and contribute to other packages
        host.getAPI(BarAPI).contributeBarItem(() => <FooItem />)
    },

    // optional
    uninstall(host: EntryPointHost) {
        // DO perform any necessary cleanup
    }
}
```

The `EntryPoint` interface consists of:
- declarations: `name`, `getDependencies()`
- lifecycle hooks: `install()`, `extend()`, `uninstall()`

The lifecycle hooks receive an `EntryPointHost` object, which represents the `AppHost` for this specific entry point.

### Exporting entry points

The default export of the package must be array of its entry points. For example, in package root `index.ts` :

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

1. Declare an API key, which is a const named after the interface, as follows:
   ```TypeScript
   import { SlotKey } from 'react-app-lego'

   export const FooAPI: SlotKey<FooAPI> = { 
       name: 'Foo API', 
       public: true
   }
   ```
   Note that `public: true` is required if you plan to export your API outside of your package. The key must be declared in the same `.ts` file with the interface.

1. Implement your API. For example:
   ```TypeScript
   export function createFooAPI(host: EntryPointHost): FooAPI {
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

1. Contribute your API from an entry point `install` function:
    ```TypeScript
    import { FooAPI, createFooAPI } from './fooApi'

    const FooEntryPoint: EntryPoint = {

        ...

        install(host: EntryPointHost) {
            host.contributeAPI(FooAPI, () => createFooAPI(host))
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
    install(host: EntryPointHost) {
        host.contributeState<FooState>({
            baz: bazReducer,
            qux: quxReducer
        })
    }
    ```

    Here the argument passed to `contributeState()` is a reducer map object. This object contains all same keys of `FooState` (the `baz` and `qux`), but this time the keys are assigned their respective reducers. Such derivation of reducers map shape is enforced by the typings.

1. Expose selectors and action dispatchers through APIs:
 
    ```TypeScript
    export interface FooAPI {
        ...
        getBazXyzzy(): number
        setBazXyzzy(value: number): void
        ...
    }
    ```

    The above API lets read and change the value of `xyzzy` in the `BazState`. 
    
    Note that neither of these two functions are passed the state or the `Store` object. This is because their implementations are already bound to the store of the `AppHost`:

    ```TypeScript
    const createFooAPI = (host: EntryPointHost): FooAPI => {
        // this returns a scoped wrapper over the full 
        // store of the main application
        const entryPointStore = host.getStore()

        // IMPORTANT! the generic parameter (FooState)
        // must match the one specified when contributing state!
        // In our example, we did contributeState<FooState>(...)
        const getState = () => entryPointStore.getState<FooState>()

        return {
            ...
            getBazXyzzy(): number {
                const state: FooState = getState()
                return state.baz.xyzzy
            },
            setBazXyzzy(value: number): void {
                entryPointStore.dispatch(BazActionCreators.setXyzzy(value))
            }
            ...
        }
    }
    ```

### Creating React components

When creating a React component, we strongly recommend to follow the React-Redux pattern, and separate your component into a stateless render and a `connect` container. 

In `react-app-lego`, components often need to consume APIs. Although APIs can be obtained through `EntryPointHost` passed to lifecycle hooks in your entry point, propagating them down component hierarchy would be cumbersome.  

A more elegant solution is to use `connectWithEntryPoint()` function instead of the regular `connect()`. This provides connector with the ability to obtain APIs.

The usage of `connectWithEntryPoint()` is demonstrated in the example below. Suppose we want to create a component `<Foo />`, which would render like this:

    ```JSX
    (props) => (
        <div classname="foo">
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

1. Declare type of state props, which is the object you return from `mapStateToProps`: 
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
            <div classname="foo">
                ...
            </div>        
        )
    ```

1. Write the connected container using `connectWithEntryPoint`. The latter differs from `connect` in that it passes `EntryPointHost` as the first parameter to `mapStateToProps` and `mapDispatchToProps`. The new parameter is followed by the regular parameters passed by `connect`. Example:

    ```TypeScript
    export const Foo = connectWithEntryPoint(
        // mapStateToProps
        // - host: represents the associated entry point
        // - the rest are regular parameters of mapStateToProps 
        (host, state) => {
            return {
                // some properties can map from your own state
                xyzzy: state.baz.xyzzy,
                // some properties may come from other packages APIs
                bar: host.getAPI(BarAPI).getCurrentBar()
            }
        },
        // mapDispatchToProps
        // - host: represents the associated entry point
        // - the rest are regular parameters of mapDispatchToProps
        (host, dispatch) => {
            return {
                // some actions may alter your own state
                setXyzzy(newValue: string): void {
                    dispatch(FooActionCreators.setXyzzy(newValue))
                },
                // others may request actions from other packages APIs
                createNewBar() {
                    host.getAPI(BarAPI).createNewBar()  
                }
            }
        }
    )(FooPure)
    ```

    The `EntryPointHost` parameter is extracted from React context `EntryPointContext`, which represents current package boundary for the component. 


### Creating an exported React component

TBD

## Testing a package

TBD

# API Reference

TBD

