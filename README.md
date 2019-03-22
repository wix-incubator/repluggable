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

## Package context in DOM

Every React component rendered under the `AppMainView` is associated with a package context. 

The package context is a React context, which associates its children with a specific package, and a specific entry point within the package. 

- actually, the context is associated with an entry point, which is in turn associated with containing package. 

Such association provides several aspects to the children:

- performance measurements and errors reported by the children, are automatically tagged with the package and the entry point

- in Redux-connected components ([TODO: link to details]()):

  - dependency injection (the `getAPI` function): all dependencies are resolved in the context of the entry point

  - state scoping (the `state` in `mapStateToProps`, and `getState()` in thunks): the state is scoped to reducers contributed by the entry point.  

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

Since APIs are contributed though entry points, their availability depends on the loading timing of the provider package, and a specific entry point within it. From a consumer package perspective, this creates a situation in which one or more of APIs the package depends on may be unavailable.

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
   ```JavaScript
   import { createAppHost, AppMainView } from 'react-app-lego'
   ```

1. Provide loaders of pluggable packages. Here we give an example of three packages, each loaded in a different way:
   - `package-one` is statically bundled with the main app
   - `package-two` is in a separate chunk (WebPack code splitting). We'll load it with dynamic 
   import
   - `package-three` is in an AMD module, deployed separately. We'll load it with RequireJS.
   
   This is how the three packages are loaded:

   ```JavaScript
   import packageOne from 'package-one'
   const packageTwo = () => import('package-two').then(m => m.default)
   const packageThree = require('package-three')
   ```

1. Initialize `AppHost` with the packages:
   ```JavaScript
   const host = createAppHost([
       packageOne, 
       packageTwo,
       packageThree
   ])
   ```

1. Render `AppMainView` component, passing it the host:

   ```JavaScript
   ReactDOM.render(
       <AppMainView host={host} />, 
       document.getElementById('root')
   )
   ```


### Full code listing

```JavaScript
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
```JavaScript
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
        host.getStore()....
        // DO consume APIs and contribute to other packages
        host.getAPI(BarAPI).contributeBarItem(() => <FooItem />)
    },

    // optional
    uninstall(host: EntryPointHost) {
        // DO perform any necessary cleanup
    }
}
```

The default export of the package must be array of its entry points. For example, in package root `index.ts` :

```JavaScript
import { FooEntryPoint } from './fooEntryPoint'

export default [ 
    FooEntryPoint 
    // list additional entry points here
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
   ```JavaScript
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
    ```JavaScript
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
    ```JavaScript
    export { FooAPI } from './fooApi'
    ```


### Managing state

In order to manage state in a package, you need to contribute one or more reducers.

In the example below, `FooEntryPoint` will contribute two reducers, `fooReducerOne` and `fooReducerTwo`.
 
To contribute the reducers, perform these steps:

1. Declare types that represent the state for each reducer: 
    ```JavaScript
    // state managed by fooReducerOne
    export interface FooStateOne {
        ...
    }

    // state managed by fooReducerTwo
    export interface FooStateTwo {
        ...
    }
    ```

1. Wrap these state types in a root state type. This root type determines the shape of the state in the entry point.

    ```JavaScript
    // the root type on entry point level 
    export interface FooEntryPointState {
        one: FooStateOne
        two: FooStateTwo
    }
    ```

1. Write the two reducers. For example, they can look like this:
    ```JavaScript
    function fooReducerOne(
        state: FooStateOne = { /* initial values */ }, 
        action: Action)
    {
         ...
    }

    function fooReducerTwo(
        state: FooStateTwo = { /* initial values */ }, 
        action: Action)
    {
         ...
    }
    ```

1. Contribute state in the entry point:

    ```JavaScript
    install(host: EntryPointHost) {
        host.contributeState<FooEntryPointState>({
            one: fooReducerOne,
            two: fooReducerTwo
        })
    }
    ```

    Here the argument passed to `contributeState()` is a reducer map object. This object contains all same keys of `FooEntryPointState`, but here the keys are assigned their respective reducers. Such shape of the reducers map is also enforced by the typings.

1. 

### Creating a connected React component



### Creating an exported React component


## Testing a package

# API Reference

TBD

