'use strict';

require.config({
    paths: {
        'feature-one': '/artifacts/feature-one-private',
        'feature-two': '/artifacts/feature-two-private',
    }
});

requirejs(['feature-one'], m => {
    console.log('EDITOR > loaded feature-one > ', m);
    window.onePrint = m.onePrint;
    console.log('EDITOR > invoke: window.onePrint()');
});

requirejs(['feature-two'], m => {
    console.log('EDITOR > loaded feature-two > ', m);
    window.twoPrint = m.twoPrint;
    console.log('EDITOR > invoke: window.twoPrint()');
});
