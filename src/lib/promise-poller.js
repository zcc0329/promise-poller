import Promise from 'bluebird';
import debugModule from 'debug';

const debug = debugModule('promisePoller');

const strategies = {
  'fixed-interval': {
    defaults: {
      interval: 1000
    },
    getNextInterval: function(count, options) {
      return options.interval;
    }
  },

  'linear-backoff': {
    defaults: {
      start: 1000,
      increment: 1000
    },
    getNextInterval: function(count, options) {
      return options.start + (options.increment * (count - 1));
    }
  },

  'exponential-backoff': {
    defaults: {
      min: 1000,
      max: 30000
    },
    getNextInterval: function(count, options) {
      const rand = Math.round(Math.random() * (Math.pow(2, count) * 1000 - options.min));
      return Math.min(options.max, rand);
    }
  }
};

const DEFAULTS = {
  strategy: 'fixed-interval',
  retries: 5
};

let pollerCount = 0;

function promisePoller(options = {}) {
  if (typeof options.taskFn !== 'function') {
    throw new Error('No taskFn function specified in options');
  }

  Object.keys(DEFAULTS).forEach(option => options[option] = options[option] || DEFAULTS[option]);
  options.name = options.name || `Poller-${pollerCount++}`;
  debug(`Creating a promise poller "${options.name}" with interval=${options.interval}, retries=${options.retries}`);

  if (!strategies[options.strategy]) {
    throw new Error(`Invalid strategy "${options.strategy}". Valid strategies are ${Object.keys(strategies)}`);
  }
  const strategy = strategies[options.strategy];
  debug(`(${options.name}) Using strategy "${options.strategy}".`);
  const strategyDefaults = strategy.defaults;
  Object.keys(strategyDefaults).forEach(option => options[option] = options[option] || strategyDefaults[option]);

  debug(`(${options.name}) Options:`);
  Object.keys(options).forEach(option => {
    debug(`    "${option}": ${options[option]}`);
  });

  return new Promise(function(resolve, reject) {
    let retriesRemaining = options.retries;
    function poll() {
      Promise.resolve(options.taskFn()).then(function(result) {
        debug(`(${options.name}) Poll succeeded. Resolving master promise.`);
        resolve(result);
      }, function(err) {
        if (typeof options.progressCallback === 'function') {
          options.progressCallback(retriesRemaining, err);
        }

        if (!--retriesRemaining) {
          debug(`(${options.name}) Maximum retries reached. Rejecting master promise.`);
          reject(err);
        } else {
          debug(`(${options.name}) Poll failed. ${retriesRemaining} retries remaining.`);

          const nextInterval = strategy.getNextInterval(options.retries - retriesRemaining, options);

          debug(`(${options.name}) Waiting ${nextInterval}ms to try again.`);
          Promise.delay(nextInterval).then(poll);
        }
      });
    }

    poll();
  });
}

module.exports = promisePoller;
