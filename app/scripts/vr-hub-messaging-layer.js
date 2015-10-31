'use strict';
const EventEmitter = require('fast-event-emitter');
const util = require('util');
const VR_HUB_API_VERSION = 0;

/**
 * EVENT REFERENCE - Events emmited by the controller
 *
 * 'connected'
 * A parent window responds to the VR Hub API and is ready to communicate
 * If this is the case the window should already be fullscreen so activate
 * VR mode in your app.
 * 
 */

 /**
  * API REFERENCE - Actions sent to the parent window
  *
  * All messages are sent via a data channel in the format:
  *
  * {
  * 	action,
  * 	message,
  * 	VR_HUB_API_VERSION,
  * }
  *
  * Actions:
  *
  * action: 'vr-hub-handshake'
  * message: [message not used]
  * expected response: {
  * 	action: 'vr-hub-handshake'
  * }
  * error response: {
  * 	action: 'vr-hub-handshake',
  * 	error: [error message]
  * }
  * comments: This ensure the VR-Hub is present and will start a progress indicator showing.
  *
  *
  * 
  * 
  * action: 'vr-hub-ready'
  * message: [message not used]
  * expected response: {
  * 	action: 'vr-hub-ready'
  * }
  * error response: {
  * 	action: 'vr-hub-ready',
  * 	error: [error message]
  * }
  * comment: Indicate that the page is displaying VR and ready to be shown
  *
  *
  * 
  * 
  * action: 'vr-hub-update-progress'
  * message: {progress: [number between 0 and 1]}
  * expected response: {
  * 	action: 'vr-hub-update-progress'
  * }
  * error response: {
  * 	action: 'vr-hub-update-progress',
  * 	error: [error message]
  * }
  * comment: Update the loading progress
  * 
  *
  *
  * 
  * action: 'vr-hub-save-link'
  * message: {url}
  * expected response: {
  * 	action: vr-hub-save-link'
  * }
  * error response: {
  * 	action: 'vr-hub-save-link',
  * 	error: [error message]
  * }
  * comment: Save a link for later
  *
  *
  * 
  * 
  * action: 'vr-hub-load-link'
  * message: {url}
  * expected response: {
  * 	action: 'vr-hub-load-link'
  * }
  * error response: {
  * 	action: 'vr-hub-load-link',
  * 	error: [error message]
  * }
  * comment: Close this, drop back to the vr-hub and start loading a new page
  * 
  */



function messageParent(action, message) {
	var messageOut = {
		action,
		message,
		VR_HUB_API_VERSION
	}
}

function VRHubMessagingLayer() {
		EventEmitter.call(this);

		// Handshake parent window
		messageParent('vr-hub-handshake')
		.then(function (details) {

		});
}
util.inherits(VRHubMessagingLayer, EventEmitter);

if (!window.VRHUB) {
	window.VRHUB = new VRHubMessagingLayer();
} else {
	throw Error('VR Hub Messaging Layer Already Present');
}
