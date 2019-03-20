# Table of contents

- [Concept](#concept)
- [Programmer's Guide](#programmers-guide)
  - [Developing main application](#developing-main-application)
  - [Developing pluggable package](#developing-pluggable-package)
- [API Reference](#api-reference)

# Concept

`react-app-lego` allows composition of a React-with-Redux application entirely from a list of _pluggable packages_, much like a lego built from pieces.

## Main application

This is the application being composed as a lego. We refer to it as _main application_. 

The main application can be as small empty shell. Its minimal responsibilities are:

- Initialize an `AppHost` object with a list of pluggable packages. The `AppHost` object orchestrates lifecycle of the pluggable packages, and provides dependency injection.
- Render `AppMainView` component, passing it the `AppHost` in its props.

## Pluggable packages

Pluggable packages (or simply _packages_) are regular Node packages, which export one or more _entry points_. 

The packages are loaded in the order they are listed in the main app, and their entry points are invoked in the load order.

## Entry points

Every entry point contributes one or more pieces to the whole lego of the application. 

Examples of contributed pieces include React components, panel item descriptors, UI command descriptors, etc etc. They can be anything, provided that they are expected by the lego. Here _expected_ means that another package provides an API, through which it accepts contributions of this specific type.

There are also two kinds of contributions supported directly by `react-app-lego`: _APIs_ and _reducers_.

Besides contributing lego pieces, entry points may contain additional lifecycle hooks.

## APIs

Some packages (providers) provide services to other packages (consumers). The services are provided through APIs. An API is an object, which implements a TypeScript interface, and is identified by an API key. An API key is another object declared as a const [TODO: link to example](), and exported from the package. 

In general, APIs allow packages to extend each other (consumers call APIs and pass contributions to the provider), and otherwise interact. Moreover, APIs are the only allowed way of interaction between packages.

In order to provide an API, a provider package contributes that API under corresponding API key. 

In order to consume an API, a consumer package does:
- import API key from the provider package, together with the API interface
- declare dependency on the API in relevant entry points
- retrieve API object by calling `getApi` and passing it the API key [TODO: link to example]().

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
- contribute an API that receives contributions from the outside and pushes them to an appropriate extension slot.

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
   ```
   import { createAppHost, AppMainView } from 'react-app-lego'
   ```

1. Provide loaders of pluggable packages. Here we give an example of three packages, each loaded in a different way:
   - `package-one` is statically bundled with the main app
   - `package-two` is in a separate chunk (WebPack code splitting). We'll load it with dynamic 
   import
   - `package-three` is in an AMD module, deployed separately. We'll load it with RequireJS.
   
   This is how the three packages are loaded:

   ```
   import packageOne from 'package-one'
   const packageTwo = () => import('package-two').then(m => m.default)
   const packageThree = require('package-three')
   ```

1. Initialize `AppHost` with the packages:
   ```
   const host = createAppHost([
       packageOne, 
       packageTwo,
       packageThree
   ])
   ```

1. Render `AppMainView` component, passing it the host:

   ```
   ReactDOM.render(
       <AppMainView host={host} />, 
       document.getElementById('root')
   )
   ```


The full code listing looks like this:

```
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

TBD 
# API Reference

TBD

# === ==== Draft offcuts ==== ===







- Why TypeScript? 

  - Better tools that back the devs up (static type checking...) -> less bugs
  - Better code navigation - let the devs quickly figure out how the things are done or what's expected -> less bugs, faster progress
  - Productivity:
    - with JS, you code quickly but maintain slowly
    - with TS, you code slowly but maintain quickly
    - with JS, you spend more time fixing defects -> slower progress with new tasks
  - In the bottom line: TypeScript === less technical risk

- Why infrastructure layer? Let reusable modules emerge as we go.

  - 


- Why AppHost? We can just use static imports across the packages.



- Why should AppHost hold my extension slots? My feature can hold them privately instead. 



- Why should I always lookup APIs and slots through AppHost? I can lookup once in the build time, then cache privately.



- Why bother separating build-time and run-time APIs?



- The typings look cryptographic! Can they be simplified?














# Concept

`react-app-lego` allows composition of a React-with-Redux application entirely from a list of _plugin packages_, much like a lego built from pieces.

Such application is referred to as _main application_. 

The main application can be as small as just an empty shell. Yet, its responsibilities include:
- initialize an `AppHost` object with a list of plugins. This is where the composition takes place.
- render an `<AppMainView />` component, which is the presentation layer of the lego

```
// TODO: provide an example
```

## Plugin packages

Plugin packages (or simply _plugins_) are regular Node packages, which export one or more _entry points_. 

The plugins are loaded in the order they are listed in the main app, and their entry points are invoked in the load order.

```
// TODO: provide an example
```

## Entry points

Every entry point contributes one or more pieces to the whole lego of the application.

Contributed pieces can be anything, provided that they are expected by the lego. Here _expected_ means that another plugin provides an API, through which it accepts contributions of this specific type.

```
// TODO: provide an example
```

Examples of contributed pieces include React components, panel item descriptors, UI command descriptors, etc etc. There are also two kinds of contributions supported directly by `react-app-lego`: _APIs_ and _reducers_.

## APIs

Some plugins provide services to other plugins. We'll refer to them as _providers_ and _consumers_, respectively.

A provider plugin contributes one or more APIs, which can be used by consumers. APIs allow plugins to extend each other and otherwise interact. Moreover, APIs are the only allowed way of interaction between plugins.

An API is basically a TypeScript `interface`, accompanied by a unique strongly-typed key `SlotKey<T>`, which represents the interface type at runtime, and thus is named after the interface.

```
export interface MyAPI {
    doSomething(value: number): void;
}

export const MyAPI: SlotKey<MyAPI> = { name: 'MyPackage.MyAPI', public: true }
```

Provider plugin must contribute its APIs 



## Extension Slots


- internally, initialized an _extension slot_ (basically, a typed array of contributions)
- exposed an _API_, through which other plugins can contribute to the extension slot


There are few types of contributions supported directly by `react-app-lego`:

- APIs
- Reducers


(React components, Redux reducers, API contracts and implementations, various descriptors, etc etc)

# Developing main application

# Developing plugin package




# API Reference






- Why TypeScript? 

  - Better tools that back the devs up (static type checking...) -> less bugs
  - Better code navigation - let the devs quickly figure out how the things are done or what's expected -> less bugs, faster progress
  - Productivity:
    - with JS, you code quickly but maintain slowly
    - with TS, you code slowly but maintain quickly
    - with JS, you spend more time fixing defects -> slower progress with new tasks
  - In the bottom line: TypeScript === less technical risk

- Why infrastructure layer? Let reusable modules emerge as we go.

  - 


- Why AppHost? We can just use static imports across the packages.



- Why should AppHost hold my extension slots? My feature can hold them privately instead. 



- Why should I always lookup APIs and slots through AppHost? I can lookup once in the build time, then cache privately.



- Why bother separating build-time and run-time APIs?



- The typings look cryptographic! Can they be simplified?




A package that accepts contributions, must perform these steps for every kind of contributions:

- internally, initialize an `ExtensionSlot<T>` 
- contribute an API with a function that receives contributed piece, and pushes it to the extension slot.
- consume items from the extension slot, as necessary




key must be declared as a `const` named after the API interface. Example:

```
// API is a TypeScript interface

export interface MyAPI {
    doSomething(): void;
    doSomethingElse(what: string): Promise<boolean>;
}

// API key is an object that implements SlotKey<T> 
// where T is the API interface
// The key must declared as a const named after the interface

export const MyAPI: SlotKey<MyAPI> = { name: "My API", public: true }
```

