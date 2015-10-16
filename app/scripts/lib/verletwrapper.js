'use strict';

const myWorker = new Worker("./scripts/verletworker.js");

function workerMessage(message) {

	// This wraps the message posting/response in a promise, which will resolve if the response doesn't
	// contain an error, and reject with the error if it does. If you'd prefer, it's possible to call
	// controller.postMessage() and set up the onmessage handler independently of a promise, but this is
	// a convenient wrapper.
	return new Promise(function workerMessagePromise(resolve, reject) {
		const messageChannel = new MessageChannel();
		messageChannel.port1.onmessage = function resolveMessagePromise(event) {
			messageChannel.port1.onmessage = undefined;
			if (event.data.error) {
				reject(event.data.error);
			} else {
				resolve(JSON.parse(event.data));
			}
		};

		myWorker.postMessage(message, [messageChannel.port2]);
	});
}

class Verlet {
	init(options) {
		return workerMessage({action: 'init', options});
	}

	getPoints() {
		return workerMessage({action: 'getPoints'})
			.then(e => e.points);
	}

	addPoint(pointOptions) {
		return workerMessage({action: 'addPoint', pointOptions});
	}

	updatePoint(pointOptions) {
		return workerMessage({action: 'updatePoint', pointOptions});
	}

	connectPoints(p1, p2, constraintOptions) {
		return workerMessage({action: 'connectPoints', options: {p1, p2, constraintOptions}});
	}

	updateConstraint(options) {
		return workerMessage({action: 'updateConstraint', options });
	}

	reset() {
		return workerMessage({action: 'reset'});
	}
}

module.exports = Verlet;
