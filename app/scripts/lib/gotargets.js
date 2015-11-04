'use strict';
const textSprite = require('./textSprite');
const EventEmitter = require('fast-event-emitter');
const util = require('util');

/*global THREE*/

module.exports = function GoTargetConfig(three) {

	function GoTarget(node) {

		EventEmitter.call(this);

		this.position = node.position;
		this.hasHover = false;
		this.sprite = node;
		this.sprite.material.opacity = 0.5;

		this.on('hover', () => {
			this.hasHover = true;
			this.sprite.material.opacity = 1;
		});

		this.on('hoverOut', () => {
			this.hasHover = false;
			this.sprite.material.opacity = 0.5;
		});

		this.hide = () =>{
			this.sprite.visible = false;
		};

		this.show = () =>{
			this.sprite.visible = true;
		};
	}
	util.inherits(GoTarget, EventEmitter);

	this.targets = new Map();

	three.on('prerender', () => {
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(0,0), three.camera);
		const hits = raycaster.intersectObjects(
			Array.from(this.targets.values())
			.map(target => target.sprite)
			.filter(sprite => sprite.visible)
		);

		let target = false;

		if (hits.length) {

			// Show hidden text sprite child
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
	});

	const interact = (event) => {
		Array.from(this.targets.values()).forEach(target => {
			if (target.hasHover) {
				target.emit(event.type);
			}
		});
	};

	three.domElement.addEventListener('click', interact);
	three.domElement.addEventListener('mousedown', interact);
	three.domElement.addEventListener('mouseup', interact);
	three.domElement.addEventListener('touchup', interact);
	three.domElement.addEventListener('touchdown', interact);
	three.deviceOrientationController
	.addEventListener('userinteractionend', function () {
		interact({type: 'click'});
	});

	this.makeTarget = node => {
		const newTarget = new GoTarget(node);
		this.targets.set(node, newTarget);
		return newTarget;
	};
};
