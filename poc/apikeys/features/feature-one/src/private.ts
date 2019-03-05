import { twoPublic } from 'feature-two';
import { onePublic } from './public';

const onePrivate = [
    'ONE-PRIVATE-1',
    'ONE-PRIVATE-2',
    'ONE-PRIVATE-3',
    'ONE-PRIVATE-4',
    'ONE-PRIVATE-5',
    'ONE-PRIVATE-6',
    'ONE-PRIVATE-7',
    'ONE-PRIVATE-8',
    'ONE-PRIVATE-9',
    'ONE-PRIVATE-10',
    'ONE-PRIVATE-11',
    'ONE-PRIVATE-12',
    'ONE-PRIVATE-13',
    'ONE-PRIVATE-14',
    'ONE-PRIVATE-15',
    'ONE-PRIVATE-16',
    'ONE-PRIVATE-17',
    'ONE-PRIVATE-18',
    'ONE-PRIVATE-19',
    'ONE-PRIVATE-20',
];

export function onePrint() {
    console.group('feature-one > PRINT');
    console.log('onePublic > ', onePublic);
    console.log('onePrivate > ', onePrivate);
    console.log('twoPublic > ', twoPublic);
    console.groupEnd();
}

console.log('feature-one > INITIALIZING');
