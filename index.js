const { Promise } = globalThis;

/** @typedef {{ dependsOn?: string[]; start: () => void; stop: () => void }} Service */

/**
 * @template {{ [K: string]: Service }} T
 * @template {string} [U=keyof T & string] Default is `keyof T & string`
 * @param {T} services
 */
export const createServiceController = services => {
  const states =
    /**
     * @type {{
     *   [K in U]: 'starting' | 'started' | 'stopping' | 'stopped';
     * }}
     */
    (Object.fromEntries(Object.keys(services).map(name => [name, 'stopped'])));

  /**
   * @type {{
   *   [K in 'start' | 'stop']?: { [K in U]?: PromiseWithResolvers<void>[] };
   * }}
   */
  const waits = {};
  const intents = /** @type {{ [K in U]: 'start' | 'stop' }} */ (
    Object.fromEntries(Object.keys(services).map(name => [name, 'stop']))
  );

  /**
   * @param {'start' | 'stop'} event
   * @param {U} name
   */
  const wait = (event, name) => {
    const deferred = Promise.withResolvers();
    if (!waits[event]) waits[event] = {};
    if (!waits[event][name]) waits[event][name] = [];
    waits[event][name].push(deferred);
    return deferred.promise;
  };

  /**
   * @param {'start' | 'stop'} event
   * @param {U} name
   */
  const emit = (event, name) => {
    if (!waits[event] || !waits[event][name]) return;

    const deferreds = waits[event][name];
    delete waits[event][name];
    for (const deferred of deferreds) deferred.resolve();
  };

  /** @param {U | U[]} [name] */
  const start = async name => {
    if (!name) {
      await start(/** @type {U[]} */ (Object.keys(services)));
      return;
    }

    if (Array.isArray(name)) {
      await Promise.all(name.map(start));
      return;
    }

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    intents[name] = 'start';

    if (states[name] === 'started') return;

    if (states[name] === 'starting') {
      await wait('start', name);
      return;
    }

    if (states[name] === 'stopping') {
      await wait('stop', name);
      if (intents[name] === 'start') await start(name);
      return;
    }

    const dependsOn = /** @type {U[] | undefined} */ (service.dependsOn);
    if (dependsOn?.some(name => states[name] !== 'started')) {
      await start(dependsOn);
      if (intents[name] === 'start') await start(name);
      return;
    }

    states[name] = 'starting';
    try {
      await service.start?.();
    } catch (er) {
      states[name] = 'stopped';
      throw er;
    }
    states[name] = 'started';
    emit('start', name);
  };

  /** @param {U | U[]} [name] */
  const stop = async name => {
    if (!name) {
      await stop(/** @type {U[]} */ (Object.keys(services)));
      return;
    }

    if (Array.isArray(name)) {
      await Promise.all(name.map(stop));
      return;
    }

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    intents[name] = 'stop';

    if (states[name] === 'stopped') return;

    if (states[name] === 'stopping') {
      await wait('stop', name);
      return;
    }

    if (states[name] === 'starting') {
      await wait('start', name);
      if (intents[name] === 'stop') await stop(name);
      return;
    }

    const dependents = Object.entries(services).reduce(
      (dependents, [otherName, service]) => {
        if (service.dependsOn?.includes(name)) {
          dependents.push(/** @type {U} */ (otherName));
        }
        return dependents;
      },
      /** @type {U[]} */ ([])
    );

    if (dependents.some(name => states[name] !== 'stopped')) {
      await stop(dependents);
      if (intents[name] === 'stop') await stop(name);
      return;
    }

    states[name] = 'stopping';
    try {
      await service.stop?.();
    } catch (er) {
      states[name] = 'started';
      throw er;
    }
    states[name] = 'stopped';
    emit('stop', name);
  };

  return { start, stop };
};
