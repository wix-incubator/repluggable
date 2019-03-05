import { twoPublic } from './public';

const twoPrivate = [
    'TWO-PRIVATE-1',
    'TWO-PRIVATE-2',
    'TWO-PRIVATE-3',
    'TWO-PRIVATE-4',
    'TWO-PRIVATE-5',
    'TWO-PRIVATE-6',
    'TWO-PRIVATE-7',
    'TWO-PRIVATE-8',
    'TWO-PRIVATE-9',
    'TWO-PRIVATE-10',
    'TWO-PRIVATE-11',
    'TWO-PRIVATE-12',
    'TWO-PRIVATE-13',
    'TWO-PRIVATE-14',
    'TWO-PRIVATE-15',
    'TWO-PRIVATE-16',
    'TWO-PRIVATE-17',
    'TWO-PRIVATE-18',
    'TWO-PRIVATE-19',
    'TWO-PRIVATE-20',
];

export function twoPrint() {
    console.group('feature-two > PRINT');
    console.log('twoPublic > ', twoPublic);
    console.log('twoPrivate > ', twoPrivate);
    console.groupEnd();
}

console.log('feature-two > INITIALIZING');
