import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import * as serviceWorker from './serviceWorker';

import { createAppHost, AppMainView } from 'repluggable';
import { HelloWorldPackage } from './packages/helloWorld';
import { MainViewPackage } from './packages/mainView';

const host = createAppHost([
    MainViewPackage,
    HelloWorldPackage
]);

ReactDOM.render(<AppMainView host={host} />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
