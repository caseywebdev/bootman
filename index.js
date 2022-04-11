const { Promise } = globalThis;

const createDeferred = () => {
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) =>
    Object.assign(deferred, { resolve, reject })
  );
  return deferred;
};

export default services => {
  const states = Object.fromEntries(
    Object.keys(services).map(name => [name, 'stopped'])
  );
  const waits = {};
  const intents = Object.fromEntries(
    Object.keys(services).map(name => [name, 'stop'])
  );

  const wait = (event, name) => {
    const deferred = createDeferred();
    if (!waits[event]) waits[event] = {};
    if (!waits[event][name]) waits[event][name] = [];
    waits[event][name].push(deferred);
    return deferred.promise;
  };

  const emit = (event, name) => {
    if (!waits[event] || !waits[event][name]) return;

    const deferreds = waits[event][name];
    delete waits[event][name];
    for (const deferred of deferreds) deferred.resolve();
  };

  const start = async name => {
    if (!name) return start(Object.keys(services));

    if (Array.isArray(name)) return Promise.all(name.map(start));

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    intents[name] = 'start';

    if (states[name] === 'started') return;

    if (states[name] === 'starting') return wait('start', name);

    if (states[name] === 'stopping') {
      await wait('stop', name);
      return intents[name] === 'start' && start(name);
    }

    if (service.dependsOn?.some(name => states[name] !== 'started')) {
      await start(service.dependsOn);
      return intents[name] === 'start' && start(name);
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

  const stop = async name => {
    if (!name) return stop(Object.keys(services));

    if (Array.isArray(name)) return Promise.all(name.map(stop));

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    intents[name] = 'stop';

    if (states[name] === 'stopped') return;

    if (states[name] === 'stopping') return wait('stop', name);

    if (states[name] === 'starting') {
      await wait('start', name);
      return intents[name] === 'stop' && stop(name);
    }

    const dependents = Object.entries(services).reduce(
      (dependents, [otherName, service]) => {
        if (service.dependsOn?.includes(name)) dependents.push(otherName);
        return dependents;
      },
      []
    );

    if (dependents.some(name => states[name] !== 'stopped')) {
      await stop(dependents);
      return intents[name] === 'stop' && stop(name);
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
