import React from 'react';
import { render } from '@testing-library/react';
import { HelloWorld } from './helloWorldComponent';

test('Hello world', () => {
  const { getByText } = render(<HelloWorld />);
  const pElement = getByText(/Repluggable/i);
  expect(pElement).toBeInTheDocument();
});
