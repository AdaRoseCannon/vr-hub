/**
 * Sets up an enviroment for detecting that 
 * the camera is looking at objects.
 */

'use strict';
const EventEmitter = require('fast-event-emitter');
const util = require('util');

/*global THREE*/
/**
 * Keeps track of interactive 3D elements and 
 * can be used to trigger events on them.
 *
 * The domElement is to pick up touch ineractions
 * 
 * @param  {[type]} domElement [description]
 * @return {[type]}            [description]
 */
module.exports = function CameraInteractivityWorld(domElement) {

	function InteractivityTarget(node) {

		EventEmitter.call(this);

		this.position = node.position;
		this.hasHover = false;
		this.object3d = node;

		this.on('hover', () => {
			if (!this.hasHover) {
				this.emit('hoverStart');
			}
			this.hasHover = true;
		});

		this.on('hoverOut', () => {
			this.hasHover = false;
		});

		this.hide = () =>{
			this.object3d.visible = false;
		};

		this.show = () =>{
			this.object3d.visible = true;
		};
	}
	util.inherits(InteractivityTarget, EventEmitter);

	this.targets = new Map();

	this.detectInteractions = function (camera) {

		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
		const hits = raycaster.intersectObjects(
			Array.from(this.targets.values())
			.map(target => target.object3d)
			.filter(object3d => object3d.visible)
		);

		let target = false;

		if (hits.length) {

			// Show hidden text object3d child
			target = this.targets.get(hits[0].object);
			if (target) target.emit('hover');
		}

		// if it is not the one just marked for highlight
		// and it used to be highlighted un highlight it.
		Array.from(this.targets.values())
		.filter(eachTarget => eachTarget !== target)
		.forEach(eachNotHit => {
			if (eachNotHit.hasHover) eachNotHit.emit('hoverOut');
		});
	};

	const interact = (event) => {
		Array.from(this.targets.values()).forEach(target => {
			if (target.hasHover) {
				target.emit(event.type);
			}
		});
	};
	this.interact = interact;

	domElement.addEventListener('click', interact);
	domElement.addEventListener('mousedown', interact);
	domElement.addEventListener('mouseup', interact);
	domElement.addEventListener('touchup', interact);
	domElement.addEventListener('touchdown', interact);

	this.makeTarget = node => {
		const newTarget = new InteractivityTarget(node);
		this.targets.set(node, newTarget);
		return newTarget;
	};
};
