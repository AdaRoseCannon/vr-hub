'use strict';

const myWorker = new Worker("./scripts/verletworker.js");
const messageQueue = [];

function workerMessage(message) {

	const id = Date.now() + Math.floor(Math.random() * 1000000);

	// This wraps the message posting/response in a promise, which will resolve if the response doesn't
	// contain an error, and reject with the error if it does. If you'd prefer, it's possible to call
	// controller.postMessage() and set up the onmessage handler independently of a promise, but this is
	// a convenient wrapper.
	return new Promise(function workerMessagePromise(resolve, reject) {
		const data = {
			id,
			message,
			resolve,
			reject
		};
		messageQueue.push(data);
	});
}

// Process messages once per frame	
requestAnimationFrame(function process() {
	if (messageQueue.length) {

		const extractedMessages = messageQueue.splice(0);

		const messageToSend = JSON.stringify(extractedMessages.map(i => (
			{ message: i.message, id: i.id }
		)));

		const messageChannel = new MessageChannel();
		messageChannel.port1.onmessage = function resolveMessagePromise(event) {
			messageChannel.port1.onmessage = undefined;

			// Iterate over the responses and resolve/reject accordingly
			const response = JSON.parse(event.data);
			response.forEach((d, i) => {
				if (extractedMessages[i].id !== d.id) {
					throw Error('ID Mismatch!!!');
				}
				if (!d.error) {
					extractedMessages[i].resolve(d);
				} else {
					extractedMessages[i].reject(d.error);
				}
			});
		};
		myWorker.postMessage(messageToSend, [messageChannel.port2]);
	}
	requestAnimationFrame(process);
});

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
