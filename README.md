# Bootman
### Start and stop services dependent on one another in order

<hr />

## Usage

#### 1. Define Individual Services

```js
// services/d.js
export default {
  dependsOn: ['a', 'b', 'c'], // Services which must be started prior to this service
  start: () => {}, // Start up function, called when this service is started
  stop: () => {} // Teardown function, called when this service is stopped
};
```

#### 2. Initialize Bootman with Defined Services

```js
// services/index.js
import bootman from 'bootman';
import a from 'services/a.js';
import b from 'services/b.js';
import c from 'services/c.js';
import d from 'services/d.js';

export default bootman({ a, b, c, d });
```

#### 3. Start or Stop Services

##### Start
```js
import services from 'services/index.js';

export default services.start(['d']);

/*
  In this particular example, since service d dependsOn services a, b, and c, 
  all three of those services must be in a "started" state before service d 
  will be started.

  The .start and .stop functions accepts either an individual name, i.e. 'd'
  or an array of names, i.e. ['d', 'c', 'b', 'a'].
*/
```

##### Stop

```js
// Stop a service
import services from 'services/index.js';

export default services.stop(['d']);
```
