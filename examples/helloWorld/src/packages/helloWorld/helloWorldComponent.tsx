import React, { FunctionComponent } from 'react';
import './helloWorldComponent.css';

export const HelloWorld: FunctionComponent = () => (
    <div className="hello-world">
      <header className="hello-world-header">
        <p>
          Hello from <code>Repluggable</code>
        </p>
      </header>
    </div>
);