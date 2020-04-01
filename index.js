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
  const targets = {};
  const waits = {};

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
    if (!name) return start([...stopping, ...stopped]);

    if (name instanceof Set) return start([...name]);

    if (Array.isArray(name)) return Promise.all(name.map(start));

    targets[name] = 'start';

    if (started.has(name)) return;

    if (starting.has(name)) return wait('start', name);

    if (stopping.has(name)) await wait('stop', name);

    if (targets[name] !== 'start') return;

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    if (service.dependsOn) await start(service.dependsOn);

    if (targets[name] !== 'start') return;

    stopped.delete(name);
    starting.add(name);
    if (service.start) await service.start();
    starting.delete(name);
    started.add(name);
    emit('start', name);
  };

  const stop = async name => {
    if (!name) return stop([...starting, ...started]);

    if (name instanceof Set) return stop([...name]);

    if (Array.isArray(name)) return Promise.all(name.map(stop));

    targets[name] = 'stop';

    if (stopped.has(name)) return;

    if (stopping.has(name)) return wait('stop', name);

    if (starting.has(name)) await wait('start', name);

    if (targets[name] !== 'stop') return;

    const service = services[name];
    if (!service) throw new Error(`Unknown service '${name}'`);

    const dependents = Object.entries(services).reduce(
      (dependents, [otherName, service]) => {
        if (service.dependsOn && service.dependsOn.has(name)) {
          dependents.add(otherName);
        }
        return dependents;
      },
      new Set()
    );
    if (dependents.size) await stop(dependents);

    if (targets[name] !== 'stop') return;

    started.delete(name);
    stopping.add(name);
    if (service.stop) await service.stop();
    stopping.delete(name);
    stopped.add(name);
    emit('stop', name);
  };

  return { start, stop };
};
