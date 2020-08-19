const createDeferred = () => {
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) =>
    Object.assign(deferred, { resolve, reject })
  );
  return deferred;
};

export default services => {
  const started = new Set();
  const starting = new Set();
  const stopped = new Set(Object.keys(services));
  const stopping = new Set();
  const waits = {};
  const intents = Object.fromEntries(
    Object.entries(services).map(([name]) => [name, 'stop'])
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

    if (name instanceof Set) name = [...name];

    if (Array.isArray(name)) return Promise.all(name.map(start));

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    intents[name] = 'start';

    if (started.has(name)) return;

    if (starting.has(name)) return wait('start', name);

    if (stopping.has(name)) {
      await wait('stop', name);
      return intents[name] === 'start' && start(name);
    }

    if (
      service.dependsOn &&
      ![...service.dependsOn].every(name => started.has(name))
    ) {
      await start(service.dependsOn);
      return intents[name] === 'start' && start(name);
    }

    stopped.delete(name);
    starting.add(name);
    if (service.start) await service.start();
    starting.delete(name);
    started.add(name);
    emit('start', name);
  };

  const stop = async name => {
    if (!name) return stop(Object.keys(services));

    if (name instanceof Set) name = [...name];

    if (Array.isArray(name)) return Promise.all(name.map(stop));

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    intents[name] = 'stop';

    if (stopped.has(name)) return;

    if (stopping.has(name)) return wait('stop', name);

    if (starting.has(name)) {
      await wait('start', name);
      return intents[name] === 'stop' && stop(name);
    }

    const dependents = Object.entries(services).reduce(
      (dependents, [otherName, service]) => {
        if (service.dependsOn && service.dependsOn.has(name)) {
          dependents.add(otherName);
        }
        return dependents;
      },
      new Set()
    );

    if (dependents.size && ![...dependents].every(name => stopped.has(name))) {
      await stop(dependents);
      return intents[name] === 'stop' && stop(name);
    }

    started.delete(name);
    stopping.add(name);
    if (service.stop) await service.stop();
    stopping.delete(name);
    stopped.add(name);
    emit('stop', name);
  };

  return { start, stop };
};
