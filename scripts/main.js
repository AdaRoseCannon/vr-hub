(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*global THREE*/
'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

function breakGeometryIntoVerletFaces(g, three, verlet) {

	function makePoint(position) {
		return verlet.addPoint({
			position: position,
			velocity: { x: 0, y: 0, z: 0 },
			radius: 0,
			mass: 0.01
		}).then(function (p) {
			return p.point;
		}).then(function (p) {
			var v = new THREE.Vector3(position.x, position.y, position.z);
			v.verletPoint = p;
			three.connectPhysicsToThree(v, p);
			return v;
		});
	}

	function makeAnchor(position) {
		return verlet.addPoint({
			position: position,
			velocity: { x: 0, y: 0, z: 0 },
			radius: 0,
			mass: 0
		}).then(function (p) {
			return p.point;
		});
	}

	var newGeom = new THREE.Geometry();
	newGeom.dynamic = true;

	// List of all constraint ids
	newGeom.vertexVerletIds = [];

	// Map of all constraint position
	newGeom.vertexVerletPositions = [];

	// List of all constraint ids
	newGeom.positionConstraintIds = [];

	var connections = [];

	return Promise.all(g.faces.map(function (face) {
		return Promise.all([makePoint(g.vertices[face.a]), makePoint(g.vertices[face.b]), makePoint(g.vertices[face.c])]).then(function (_ref) {
			var _newGeom$vertexVerletIds;

			var _ref2 = _slicedToArray(_ref, 3);

			var a = _ref2[0];
			var b = _ref2[1];
			var c = _ref2[2];

			if (!connections[face.a]) connections[face.a] = [];
			if (!connections[face.b]) connections[face.b] = [];
			if (!connections[face.c]) connections[face.c] = [];

			connections[face.a].push(a);
			connections[face.b].push(b);
			connections[face.c].push(c);

			var newFace = new THREE.Face3(newGeom.vertices.push(a) - 1, newGeom.vertices.push(b) - 1, newGeom.vertices.push(c) - 1);

			newFace.positionConstraintIds = [];
			newFace.vertexVerletIds = [a.verletPoint.id, b.verletPoint.id, c.verletPoint.id];
			newFace.adjacentFaces = new Set();

			(_newGeom$vertexVerletIds = newGeom.vertexVerletIds).push.apply(_newGeom$vertexVerletIds, _toConsumableArray(newFace.vertexVerletIds));
			newGeom.vertexVerletPositions[a.verletPoint.id] = a.clone();
			newGeom.vertexVerletPositions[b.verletPoint.id] = b.clone();
			newGeom.vertexVerletPositions[c.verletPoint.id] = c.clone();

			newGeom.faces.push(newFace);

			a.face = newFace;
			b.face = newFace;
			c.face = newFace;

			var stiffness = 0.4;
			verlet.connectPoints(a.verletPoint, b.verletPoint, {
				stiffness: stiffness,
				restingDistance: a.distanceTo(b)
			});
			verlet.connectPoints(b.verletPoint, c.verletPoint, {
				stiffness: stiffness,
				restingDistance: b.distanceTo(c)
			});
			verlet.connectPoints(c.verletPoint, a.verletPoint, {
				stiffness: stiffness,
				restingDistance: c.distanceTo(a)
			});
		});
	})).then(function () {

		// All the points which are 'the same' loosely connect them.
		return Promise.all(connections.map(function (pointsToConnect, i) {

			return makeAnchor(g.vertices[i]).then(function (anchor) {
				return Promise.all(pointsToConnect.map(function (p, i) {
					pointsToConnect.forEach(function (oP) {
						if (oP.face !== p.face) {
							p.face.adjacentFaces.add(oP.face);
						}
					});
					return verlet.connectPoints(p.verletPoint, anchor, {
						stiffness: 0.6,
						restingDistance: 0.01
					}).then(function (c) {
						p.face.positionConstraintIds.push(c.constraintId);
						newGeom.positionConstraintIds.push(c.constraintId);
					});
				}));
			});
		}));
	}).then(function () {

		newGeom.verticesNeedUpdate = true;
		newGeom.normalsNeedUpdate = true;

		// Convert Set into Array
		newGeom.faces.forEach(function (f) {
			return f.adjacentFaces = [].concat(_toConsumableArray(f.adjacentFaces));
		});
		return newGeom;
	});
}

module.exports = breakGeometryIntoVerletFaces;

},{}],2:[function(require,module,exports){
/*global THREE*/
'use strict';

module.exports = function setUpExplodingDome(dome, three, verlet) {

	return require('./breakGeometryIntoVerletFaces')(dome.geometry, three, verlet).then(setUpFallingAndReconstructionController);

	function setUpFallingAndReconstructionController(newGeom) {

		var destroyed = false;
		var timeouts = [];
		var fallRate = 500;
		var newDome = new THREE.Mesh(newGeom, dome.material);
		three.scene.add(newDome);

		newGeom.normalsNeedUpdate = true;
		three.on('prerender', function () {
			newGeom.verticesNeedUpdate = true;
		});

		function faceFall(f) {
			if (!f) return;
			for (var i = 0; i < 3; i++) {
				var constraintId = f.positionConstraintIds[i];
				var verletId = f.vertexVerletIds[i];
				verlet.updateConstraint({
					constraintId: constraintId,
					stiffness: 0
				});
				verlet.updatePoint({
					id: verletId,
					mass: 1,
					velocity: {
						x: 0.5 * (Math.random() - 0.5),
						y: 0.5 * (Math.random() - 0.5),
						z: 0.5 * (Math.random() - 0.5)
					}
				});
			}
		}

		function recursiveFall(startFace) {
			faceFall(startFace);
			var l = startFace.adjacentFaces.length;
			for (var i = 0; i < l; i++) {
				var f = startFace.adjacentFaces[i];
				if (!f.falling) {
					f.falling = true;
					timeouts.push(setTimeout(recursiveFall, fallRate, f));
				}
			}
		}

		function restore() {
			return new Promise(function (resolve) {
				while (timeouts.length) {
					clearTimeout(timeouts.pop());
				}
				newGeom.positionConstraintIds.forEach(function (constraintId) {
					return verlet.updateConstraint({ constraintId: constraintId, stiffness: 0.3 });
				});
				timeouts.push(setTimeout(function () {
					newGeom.positionConstraintIds.forEach(function (constraintId) {
						return verlet.updateConstraint({ constraintId: constraintId, stiffness: 0.5 });
					});
					newGeom.vertexVerletIds.forEach(function (id) {
						verlet.updatePoint({
							id: id,
							mass: 0,
							position: {
								x: newGeom.vertexVerletPositions[id].x,
								y: newGeom.vertexVerletPositions[id].y,
								z: newGeom.vertexVerletPositions[id].z
							}
						});
					});
					setTimeout(function () {
						return resolve();
					}, fallRate);
				}, fallRate));
				newGeom.faces.forEach(function (face) {
					return face.falling = false;
				});
				destroyed = false;
			});
		}

		function destroy() {
			return new Promise(function (resolve) {
				var raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(new THREE.Vector2(0, 0), three.camera);
				var hits = raycaster.intersectObjects([newDome]);
				if (hits.length) {
					recursiveFall(hits[0].face);
				}
				destroyed = true;
				resolve();
			});
		}

		return {
			destroy: destroy,
			restore: restore,
			toggle: function toggle() {
				(destroyed ? restore : destroy)();
			},
			mesh: newDome
		};
	}
};

},{"./breakGeometryIntoVerletFaces":1}],3:[function(require,module,exports){
'use strict';
var textSprite = require('./textSprite');
var EventEmitter = require('fast-event-emitter');
var util = require('util');

/*global THREE*/

module.exports = function GoTargetConfig(three) {
	var _this2 = this;

	function GoTarget(node) {
		var _this = this;

		EventEmitter.call(this);

		this.position = node.position;
		this.hasHover = false;
		this.sprite = node;
		this.sprite.material.opacity = 0.5;

		this.on('hover', function () {
			_this.hasHover = true;
			_this.sprite.material.opacity = 1;
		});

		this.on('hoverOut', function () {
			_this.hasHover = false;
			_this.sprite.material.opacity = 0.5;
		});

		this.hide = function () {
			_this.sprite.visible = false;
		};

		this.show = function () {
			_this.sprite.visible = true;
		};
	}
	util.inherits(GoTarget, EventEmitter);

	this.targets = new Map();

	three.on('prerender', function () {
		var raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(0, 0), three.camera);
		var hits = raycaster.intersectObjects(Array.from(_this2.targets.values()).map(function (target) {
			return target.sprite;
		}).filter(function (sprite) {
			return sprite.visible;
		}));

		var target = false;

		if (hits.length) {

			// Show hidden text sprite child
			target = _this2.targets.get(hits[0].object);
			if (target) target.emit('hover');
		}

		// if it is not the one just marked for highlight
		// and it used to be highlighted un highlight it.
		Array.from(_this2.targets.values()).filter(function (eachTarget) {
			return eachTarget !== target;
		}).forEach(function (eachNotHit) {
			if (eachNotHit.hasHover) eachNotHit.emit('hoverOut');
		});
	});

	var interact = function interact(event) {
		Array.from(_this2.targets.values()).forEach(function (target) {
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
	three.deviceOrientationController.addEventListener('userinteractionend', function () {
		interact({ type: 'click' });
	});

	this.makeTarget = function (node) {
		var newTarget = new GoTarget(node);
		_this2.targets.set(node, newTarget);
		return newTarget;
	};
};

},{"./textSprite":6,"fast-event-emitter":15,"util":14}],4:[function(require,module,exports){
'use strict';

function addScript(url) {
	return new Promise(function (resolve, reject) {
		var script = document.createElement('script');
		script.setAttribute('src', url);
		document.head.appendChild(script);
		script.onload = resolve;
		script.onerror = reject;
	});
}

module.exports = addScript;

},{}],5:[function(require,module,exports){
/*global THREE*/
'use strict';

module.exports = function initSky() {

	// Add Sky Mesh
	var sky = new THREE.Sky();

	var effectController = {
		turbidity: 10,
		reileigh: 2,
		mieCoefficient: 0.005,
		mieDirectionalG: 0.8,
		luminance: 1,
		inclination: 0.49, // elevation / inclination
		azimuth: 0.25 };

	// Facing front,
	var distance = 400000;

	function initUniforms() {

		var uniforms = sky.uniforms;
		var sunPos = new THREE.Vector3();
		uniforms.turbidity.value = effectController.turbidity;
		uniforms.reileigh.value = effectController.reileigh;
		uniforms.luminance.value = effectController.luminance;
		uniforms.mieCoefficient.value = effectController.mieCoefficient;
		uniforms.mieDirectionalG.value = effectController.mieDirectionalG;

		var theta = Math.PI * (effectController.inclination - 0.5);
		var phi = 2 * Math.PI * (effectController.azimuth - 0.5);

		sunPos.x = distance * Math.cos(phi);
		sunPos.y = distance * Math.sin(phi) * Math.sin(theta);
		sunPos.z = distance * Math.sin(phi) * Math.cos(theta);

		sky.uniforms.sunPosition.value.copy(sunPos);
	}
	initUniforms();

	return sky.mesh;
};

},{}],6:[function(require,module,exports){
// From http://stemkoski.github.io/Three.js/Sprite-Text-Labels.html
/*global THREE*/
'use strict';

function makeTextSprite(message, parameters) {
	if (parameters === undefined) parameters = {};

	var fontface = parameters.hasOwnProperty("fontface") ? parameters["fontface"] : "Arial";

	var borderThickness = parameters.hasOwnProperty("borderThickness") ? parameters["borderThickness"] : 2;

	// may tweaked later to scale text
	var size = parameters.hasOwnProperty("size") ? parameters["size"] : 1;

	var canvas1 = document.createElement('canvas');
	var context1 = canvas1.getContext('2d');
	var height = 256;

	function setStyle(context) {

		context.font = "Bold " + (height - borderThickness) + "px " + fontface;
		context.textAlign = 'center';
		context.textBaseline = 'middle';

		context.lineWidth = borderThickness;

		// text color
		context.strokeStyle = "rgba(255, 255, 255, 1.0)";
		context.fillStyle = "rgba(0, 0, 0, 1.0)";
	}

	setStyle(context1);

	var canvas2 = document.createElement('canvas');

	// Make the canvas width a power of 2 larger than the text width
	var measure = context1.measureText(message);
	canvas2.width = Math.pow(2, Math.ceil(Math.log2(measure.width)));
	canvas2.height = height;
	console.log(measure);
	var context2 = canvas2.getContext('2d');

	context2.rect(0, 0, canvas2.width, canvas2.height);
	context2.fillStyle = "red";
	context2.fill();

	setStyle(context2);

	context2.strokeText(message, canvas2.width / 2, canvas2.height / 2);
	context2.fillText(message, canvas2.width / 2, canvas2.height / 2);

	// canvas contents will be used for a texture
	var texture = new THREE.Texture(canvas2);
	texture.needsUpdate = true;

	var spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
	var sprite = new THREE.Sprite(spriteMaterial);

	var maxWidth = height * 4;

	if (canvas2.width > maxWidth) size *= maxWidth / canvas2.width;
	console.log(canvas2.width, canvas2.height);

	// get size data (height depends only on font size)
	sprite.scale.set(size * canvas2.width / canvas2.height, size, 1);
	return sprite;
}

module.exports = makeTextSprite;

},{}],7:[function(require,module,exports){
/* global THREE, DeviceOrientationController */
'use strict';
var EventEmitter = require('fast-event-emitter');
var util = require('util');
var TWEEN = require('tween.js');

var path = "images/";
var format = '.jpg';
var urls = [path + 'px' + format, path + 'nx' + format, path + 'py' + format, path + 'ny' + format, path + 'pz' + format, path + 'nz' + format];
var reflectionCube = THREE.ImageUtils.loadTextureCube(urls);
reflectionCube.format = THREE.RGBFormat;

var materials = {
	shiny: new THREE.MeshPhongMaterial({ color: 0x99ff99, specular: 0x440000, envMap: reflectionCube, combine: THREE.MixOperation, reflectivity: 0.3, metal: true }),
	boring2: new THREE.MeshPhongMaterial({ color: 0xC0B9BB, specular: 0, shading: THREE.FlatShading, side: THREE.DoubleSide, transparent: true, opacity: 0.2 }),
	wireframe: new THREE.MeshBasicMaterial({ color: 0xFFFFFF, wireframe: true })
};

var l = new THREE.ObjectLoader();
var loadScene = function loadScene(id) {
	return new Promise(function (resolve, reject) {
		l.load('models/' + id + '.json', resolve, undefined, reject);
	});
};

function myThreeFromJSON(id, target) {
	return loadScene(id).then(function (s) {
		return new MyThree(s, target);
	});
}

function MyThree(scene) {
	var _this = this;

	var target = arguments.length <= 1 || arguments[1] === undefined ? document.body : arguments[1];

	EventEmitter.call(this);

	this.scene = scene || new THREE.Scene();

	var camera = new THREE.PerspectiveCamera(75, target.scrollWidth / target.scrollHeight, 0.5, 20);
	camera.height = 2;
	camera.position.set(0, camera.height, 0);
	camera.lookAt(new THREE.Vector3(0, camera.height, -9));
	camera.rotation.y += Math.PI;
	this.camera = camera;

	var hud = new THREE.Object3D();
	hud.position.set(0, 0, -2.1);
	hud.scale.set(0.2, 0.2, 0.2);
	camera.add(hud);
	scene.add(camera);
	this.hud = hud;

	var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
	renderer.setPixelRatio(window.devicePixelRatio);

	this.renderMethod = renderer;

	var setAspect = function setAspect() {
		_this.renderMethod.setSize(target.scrollWidth, target.scrollHeight);
		camera.aspect = target.scrollWidth / target.scrollHeight;
		camera.updateProjectionMatrix();
	};
	window.addEventListener('resize', setAspect);
	setAspect();

	target.appendChild(renderer.domElement);
	this.domElement = renderer.domElement;
	this.domElement.style.position = 'fixed';

	this.materials = materials;

	var physicsObjects = [];
	var threeObjectsConnectedToPhysics = {};
	this.updateObjects = function (newObjects) {
		physicsObjects.splice(0);
		physicsObjects.push.apply(physicsObjects, newObjects);
	};

	this.on('prerender', function updatePositions() {

		var l = physicsObjects.length;

		// iterate over the physics physicsObjects
		for (var i = undefined, j = 0; j < l; j++) {

			var i = physicsObjects[j];
			if (threeObjectsConnectedToPhysics[i.id]) {

				var o = threeObjectsConnectedToPhysics[i.id];

				// Support maniplating a single vertex
				if (o.constructor === THREE.Vector3) {
					o.set(i.position.x, i.position.y, i.position.z);
					continue;
				}

				o.position.set(i.position.x, i.position.y, i.position.z);

				// Rotation
				if (i.quaternion) {
					o.rotation.setFromQuaternion(new THREE.Quaternion(i.quaternion.x, i.quaternion.y, i.quaternion.z, i.quaternion.w));
				}
			}
		}
	});

	this.on('prerender', TWEEN.update);

	this.connectPhysicsToThree = function (mesh, physicsMesh) {
		threeObjectsConnectedToPhysics[physicsMesh.id] = mesh;
		if (mesh.constructor === THREE.Vector3) return;
		scene.add(mesh);
	};

	// Useful for debugging
	this.createSphere = function (radius) {
		var geometry = new THREE.SphereGeometry(radius || 1, 8, 5);
		var mesh = new THREE.Mesh(geometry, materials.wireframe);
		return mesh;
	};

	this.walkTo = function (destination) {
		new TWEEN.Tween(camera.position).to(destination, 2000).easing(TWEEN.Easing.Quadratic.Out).onUpdate(function () {
			camera.position.set(this.x, this.y, this.z);
		}).start();
	};

	this.getCameraPositionAbove = function (point) {
		var raycaster = new THREE.Raycaster(point, new THREE.Vector3(0, -1, 0), 0, 20);

		for (var _len = arguments.length, objects = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
			objects[_key - 1] = arguments[_key];
		}

		var hits = raycaster.intersectObjects(objects);
		if (!hits.length) {
			return Promise.reject();
		} else {
			hits[0].point.y += camera.height;
			return Promise.resolve(hits[0].point);
		}
	};

	this.pickObjects = function (root) {

		var collection = {};

		for (var _len2 = arguments.length, namesIn = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
			namesIn[_key2 - 1] = arguments[_key2];
		}

		var names = new Set(namesIn);

		(function pickObjects(root) {
			if (root.children) {
				root.children.forEach(function (node) {
					if (names.has(node.name)) {
						collection[node.name] = node;
						names['delete'](node.name);
					}
					if (names.size) {
						pickObjects(node);
					}
				});
			}
		})(root);

		if (names.size) {
			console.warn('Not all objects found: ' + names.values().next().value + ' missing');
		}

		return collection;
	};

	this.useCardboard = function () {

		var effect = new THREE.StereoEffect(renderer);
		setAspect();
		effect.eyeSeparation = 0.008;
		effect.focalLength = 0.25;
		effect.setSize(window.innerWidth, window.innerHeight);
		_this.renderMethod = effect;
	};

	this.useSky = function () {
		var skyBox = require('./sky')();
		_this.skyBox = skyBox;
		scene.add(skyBox);
		skyBox.scale.multiplyScalar(0.00004);
	};

	this.deviceOrientation = function (_ref) {
		var manualControl = _ref.manualControl;

		// provide dummy element to prevent touch/click hijacking.
		var element = manualControl ? renderer.domElement : document.createElement("DIV");

		if (_this.deviceOrientationController) {
			_this.deviceOrientationController.disconnect();
			_this.deviceOrientationController.element = element;
			_this.deviceOrientationController.connect();
		} else {
			_this.deviceOrientationController = new DeviceOrientationController(camera, element);
			_this.deviceOrientationController.connect();
			_this.on('prerender', function () {
				return _this.deviceOrientationController.update();
			});
		}
	};

	this.render = function () {

		// note: three.js includes requestAnimationFrame shim
		_this.emit('prerender');
		_this.renderMethod.render(scene, camera);
	};
}
util.inherits(MyThree, EventEmitter);

module.exports.MyThree = MyThree;
module.exports.myThreeFromJSON = myThreeFromJSON;

},{"./sky":5,"fast-event-emitter":15,"tween.js":17,"util":14}],8:[function(require,module,exports){
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var myWorker = new Worker("./scripts/verletworker.js");
var messageQueue = [];

function workerMessage(message) {

	var id = Date.now() + Math.floor(Math.random() * 1000000);

	// This wraps the message posting/response in a promise, which will resolve if the response doesn't
	// contain an error, and reject with the error if it does. If you'd prefer, it's possible to call
	// controller.postMessage() and set up the onmessage handler independently of a promise, but this is
	// a convenient wrapper.
	return new Promise(function workerMessagePromise(resolve, reject) {
		var data = {
			id: id,
			message: message,
			resolve: resolve,
			reject: reject
		};
		messageQueue.push(data);
	});
}

// Process messages once per frame	
requestAnimationFrame(function process() {
	if (messageQueue.length) {
		(function () {

			var extractedMessages = messageQueue.splice(0);

			var messageToSend = JSON.stringify(extractedMessages.map(function (i) {
				return { message: i.message, id: i.id };
			}));

			var messageChannel = new MessageChannel();
			messageChannel.port1.onmessage = function resolveMessagePromise(event) {
				messageChannel.port1.onmessage = undefined;

				// Iterate over the responses and resolve/reject accordingly
				var response = JSON.parse(event.data);
				response.forEach(function (d, i) {
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
		})();
	}
	requestAnimationFrame(process);
});

var Verlet = (function () {
	function Verlet() {
		_classCallCheck(this, Verlet);
	}

	_createClass(Verlet, [{
		key: 'init',
		value: function init(options) {
			return workerMessage({ action: 'init', options: options });
		}
	}, {
		key: 'getPoints',
		value: function getPoints() {
			return workerMessage({ action: 'getPoints' }).then(function (e) {
				return e.points;
			});
		}
	}, {
		key: 'addPoint',
		value: function addPoint(pointOptions) {
			return workerMessage({ action: 'addPoint', pointOptions: pointOptions });
		}
	}, {
		key: 'updatePoint',
		value: function updatePoint(pointOptions) {
			return workerMessage({ action: 'updatePoint', pointOptions: pointOptions });
		}
	}, {
		key: 'connectPoints',
		value: function connectPoints(p1, p2, constraintOptions) {
			return workerMessage({ action: 'connectPoints', options: { p1: p1, p2: p2, constraintOptions: constraintOptions } });
		}
	}, {
		key: 'updateConstraint',
		value: function updateConstraint(options) {
			return workerMessage({ action: 'updateConstraint', options: options });
		}
	}, {
		key: 'reset',
		value: function reset() {
			return workerMessage({ action: 'reset' });
		}
	}]);

	return Verlet;
})();

module.exports = Verlet;

},{}],9:[function(require,module,exports){
'use strict';

module.exports = VRTarget;

function css(node, props) {
	function units(prop, i) {
		if (typeof i === "number") {
			if (prop.match(/width|height|top|left|right|bottom/)) {
				return i + "px";
			}
		}
		return i;
	}
	for (var n in props) {
		if (props.hasOwnProperty(n)) {
			node.style[n] = units(n, props[n]);
		}
	}
	return node;
}

function VRTarget(parent) {

	// Create iframe and add it to the doc
	var iframe = document.createElement('iframe');
	css(iframe, {
		position: 'absolute',
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
		width: '100%',
		height: '100%',
		border: 'none'
	});
	iframe.setAttribute('seamless', 'seamless');
	iframe.setAttribute('mozbrowser', '1');
	iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
	this.iframe = iframe;
	this.parent = parent || document.body;
	this.parent.insertBefore(this.iframe, this.parent.firstChild);
}

VRTarget.prototype.load = function (url) {
	this.iframe.src = url;
	return new Promise((function (resolve) {
		this.iframe.addEventListener('load', resolve);
	}).bind(this));
};

VRTarget.prototype.unload = function (url) {
	this.iframe.src = 'about:blank';
};

VRTarget.prototype.destroy = function (url) {
	this.parent.removeChild(this.iframe);
	this.iframe = null;
};

},{}],10:[function(require,module,exports){
/*global THREE*/
'use strict';
var addScript = require('./lib/loadScript'); // Promise wrapper for script loading
var VerletWrapper = require('./lib/verletwrapper'); // Wrapper of the verlet worker
var VRTarget = require('./lib/vrtarget'); // Append iframes to the page and provide a control interface
var textSprite = require('./lib/textSprite'); // Generally sprites from canvas
var GoTargetWorld = require('./lib/gotargets.js'); // Tool for making interactive VR elements
var TWEEN = require('tween.js');

var STATE_PAUSED = 0;
var STATE_PLAYING = 1;

var STATE_HUB_OPEN = 0;
var STATE_HUB_CLOSED = 1;

var animState = STATE_PLAYING;
var hubState = STATE_HUB_OPEN;

// no hsts so just redirect to https
if (window.location.protocol !== "https:" && window.location.hostname !== 'localhost') {
	window.location.protocol = "https:";
}

function serviceWorker() {

	return new Promise(function (resolve) {

		// Start service worker
		if ('serviceWorker' in navigator) {

			if (navigator.serviceWorker.controller) {
				console.log('Offlining Availble');
				resolve();
			} else {
				navigator.serviceWorker.register('./sw.js').then(function (reg) {
					console.log('sw registered', reg);
				}).then(resolve);
			}
		} else {
			console.error('No Service Worker, assets may not be cached');
			resolve();
		}
	});
}

serviceWorker().then(function () {
	return Promise.all([addScript('https://polyfill.webservices.ft.com/v1/polyfill.min.js?features=fetch,default'), addScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r73/three.min.js')]);
}).then(function () {
	return Promise.all([addScript('https://cdn.rawgit.com/mrdoob/three.js/master/examples/js/effects/StereoEffect.js'), addScript('https://cdn.rawgit.com/mrdoob/three.js/master/examples/js/SkyShader.js'), addScript('https://cdn.rawgit.com/richtr/threeVR/master/js/DeviceOrientationController.js')]);
}).then(function () {
	return require('./lib/three').myThreeFromJSON('hub');
}).then(function (three) {
	console.log('Ready');

	var frame = new VRTarget(); // Setup iframe for loading sites into

	three.deviceOrientation({ manualControl: true }); // Allow clicking and dragging

	var goTargetWorld = new GoTargetWorld(three);

	three.useSky();
	three.useCardboard();

	var dome = three.pickObjects(three.scene, 'dome').dome;
	dome.material = three.materials.boring2;
	three.scene.remove(dome);

	var grid = new THREE.GridHelper(10, 1);
	grid.setColors(0xff0000, 0xffffff);
	three.scene.add(grid);

	// Brand lights
	var ambientLight = new THREE.AmbientLight(0xc0b9bb);
	three.scene.add(ambientLight);

	var pLight0 = new THREE.DirectionalLight(0xC0B9BB, 0.5);
	pLight0.position.set(0, 1, 3);
	three.scene.add(pLight0);

	var pLight1 = new THREE.DirectionalLight(0xF9CCFF, 0.5);
	pLight1.position.set(8, -3, 0);
	three.scene.add(pLight1);

	var pLight2 = new THREE.DirectionalLight(0xE3FFAE, 0.5);
	pLight2.position.set(-8, -3, -3);
	three.scene.add(pLight2);

	// Run the verlet physics
	var verlet = new VerletWrapper();
	verlet.init({
		size: {
			x: 20,
			y: 20,
			z: 20
		},
		gravity: true
	}).then(function () {

		var waitingForPoints = false;
		requestAnimationFrame(function animate(time) {
			requestAnimationFrame(animate);
			if (animState !== STATE_PLAYING) return;
			if (!waitingForPoints) {
				verlet.getPoints().then(function (points) {
					three.updateObjects(points);
					waitingForPoints = false;
				});
				waitingForPoints = true;
			}
			three.render();
			TWEEN.update(time);
		});

		var map = THREE.ImageUtils.loadTexture("images/reticule.png");
		var material = new THREE.SpriteMaterial({ map: map, color: 0xffffff, fog: false, transparent: true });
		var sprite = new THREE.Sprite(material);
		three.hud.add(sprite);

		function loadDoc(url) {

			// Display the loading graphic

			// Get the frame to show
			return frame.load(url).then(function () {
				// remove the loading graphic
				console.log('loaded %s', url);
			});
		}

		function removeDoc() {
			frame.unload();
			return;
		}

		function addButton(str) {
			var sprite = textSprite(str, {
				fontsize: 18,
				fontface: 'Iceland',
				borderThickness: 20
			});
			three.scene.add(sprite);
			sprite.position.set(5, 5, 5);
			sprite.material.transparent = true;
			return goTargetWorld.makeTarget(sprite);
		}

		// Set up the dome breaking down and building back
		require('./lib/explodeDome')(dome, three, verlet).then(function (domeController) {
			window.addEventListener('dblclick', function () {
				return domeController.toggle();
			});
			window.addEventListener('touchend', function () {
				return domeController.toggle();
			});

			function tweenDomeOpacity(opacity) {
				var time = arguments.length <= 1 || arguments[1] === undefined ? 1000 : arguments[1];

				if (opacity !== undefined && opacity !== dome.material.opacity) {
					return new Promise(function (resolve) {
						return new TWEEN.Tween(dome.material).to({ opacity: opacity }, time).easing(TWEEN.Easing.Cubic.Out).start().onComplete(resolve);
					});
				} else {
					return Promise.resolve();
				}
			}

			function showDocument(url) {
				hubState = STATE_HUB_CLOSED;
				tweenDomeOpacity(1).then(function () {
					return three.skyBox.visible = false;
				}).then(function () {
					return loadDoc(url);
				}).then(function () {
					return domeController.destroy();
				}).then(function () {
					return tweenDomeOpacity(0, 4000);
				}).then(function () {
					if (hubState === STATE_HUB_CLOSED) {
						three.domElement.style.pointerEvents = 'none';
						domeController.mesh.visible = false;
						animState = STATE_PAUSED;
						three.scene.visible = false;
						three.render();
					}
				});
			}

			function closeDocument() {
				three.scene.visible = true;
				hubState = STATE_HUB_OPEN;
				console.log(animState);
				animState = STATE_PLAYING;
				domeController.mesh.visible = true;
				Promise.all([domeController.restore(), tweenDomeOpacity(1, 2000)]).then(function () {
					return removeDoc();
				}).then(function () {
					return three.domElement.style.pointerEvents = 'auto';
				}).then(function () {
					return three.skyBox.visible = true;
				}).then(function () {
					return tweenDomeOpacity(0.2);
				});
			}

			window.showDocument = showDocument;
			window.closeDocument = closeDocument;

			var lightHouseDemoButton = addButton('Load Demo');
			lightHouseDemoButton.on('click', function () {
				return showDocument('https://adaroseedwards.github.io/cardboard2/index.html#vr');
			});
		});

		function reset() {
			three.camera.position.set(0, three.camera.height, 0);
		}

		// Set initial properties
		reset();
		window.three = three;
	});
});

},{"./lib/explodeDome":2,"./lib/gotargets.js":3,"./lib/loadScript":4,"./lib/textSprite":6,"./lib/three":7,"./lib/verletwrapper":8,"./lib/vrtarget":9,"tween.js":17}],11:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],12:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],13:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],14:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":13,"_process":12,"inherits":11}],15:[function(require,module,exports){
"use strict";
var protoclass = require("protoclass");

/**
 * @module mojo
 * @submodule mojo-core
 */

/**
 * @class EventEmitter
 */

function EventEmitter () {
  this.__events = {};
}

/**
 * adds a listener on the event emitter
 *
 * @method on
 * @param {String} event event to listen on
 * @param {Function} listener to callback when `event` is emitted.
 * @returns {Disposable}
 */


EventEmitter.prototype.on = function (event, listener) {

  if (typeof listener !== "function") {
    throw new Error("listener must be a function for event '"+event+"'");
  }

  var listeners;
  if (!(listeners = this.__events[event])) {
    this.__events[event] = listener;
  } else if (typeof listeners === "function") {
    this.__events[event] = [listeners, listener];
  } else {
    listeners.push(listener);
  }

  var self = this;

  return {
    dispose: function() {
      self.off(event, listener);
    }
  };
};

/**
 * removes an event emitter
 * @method off
 * @param {String} event to remove
 * @param {Function} listener to remove
 */

EventEmitter.prototype.off = function (event, listener) {

  var listeners;

  if(!(listeners = this.__events[event])) {
    return;
  }

  if (typeof listeners === "function") {
    this.__events[event] = undefined;
  } else {
    var i = listeners.indexOf(listener);
    if (~i) listeners.splice(i, 1);
    if (!listeners.length) {
      this.__events[event] = undefined;
    }
  }
};

/**
 * adds a listener on the event emitter
 * @method once
 * @param {String} event event to listen on
 * @param {Function} listener to callback when `event` is emitted.
 * @returns {Disposable}
 */


EventEmitter.prototype.once = function (event, listener) {

  if (typeof listener !== "function") {
    throw new Error("listener must be a function for event '"+event+"'");
  }

  function listener2 () {
    disp.dispose();
    listener.apply(this, arguments);
  }

  var disp = this.on(event, listener2);
  disp.target = this;
  return disp;
};

/**
 * emits an event
 * @method emit
 * @param {String} event
 * @param {String}, `data...` data to emit
 */


EventEmitter.prototype.emit = function (event) {

  if (this.__events[event] === undefined) return;

  var listeners = this.__events[event],
  n = arguments.length,
  args,
  i,
  j;

  if (typeof listeners === "function") {
    if (n === 1) {
      listeners();
    } else {
      switch(n) {
        case 2:
          listeners(arguments[1]);
          break;
        case 3:
          listeners(arguments[1], arguments[2]);
          break;
        case 4:
          listeners(arguments[1], arguments[2], arguments[3]);
          break;
        default:
          args = new Array(n - 1);
          for(i = 1; i < n; i++) args[i-1] = arguments[i];
          listeners.apply(this, args);
    }
  }
  } else {
    args = new Array(n - 1);
    for(i = 1; i < n; i++) args[i-1] = arguments[i];
    for(j = listeners.length; j--;) {
      if(listeners[j]) listeners[j].apply(this, args);
    }
  }
};

/**
 * removes all listeners
 * @method removeAllListeners
 * @param {String} event (optional) removes all listeners of `event`. Omitting will remove everything.
 */

EventEmitter.prototype.removeAllListeners = function (event) {
  if (arguments.length === 1) {
    this.__events[event] = undefined;
  } else {
    this.__events = {};
  }
};

module.exports = EventEmitter;

},{"protoclass":16}],16:[function(require,module,exports){
function _copy (to, from) {

  for (var i = 0, n = from.length; i < n; i++) {

    var target = from[i];

    for (var property in target) {
      to[property] = target[property];
    }
  }

  return to;
}

function protoclass (parent, child) {

  var mixins = Array.prototype.slice.call(arguments, 2);

  if (typeof child !== "function") {
    if(child) mixins.unshift(child); // constructor is a mixin
    child   = parent;
    parent  = function() { };
  }

  _copy(child, parent); 

  function ctor () {
    this.constructor = child;
  }

  ctor.prototype  = parent.prototype;
  child.prototype = new ctor();
  child.__super__ = parent.prototype;
  child.parent    = child.superclass = parent;

  _copy(child.prototype, mixins);

  protoclass.setup(child);

  return child;
}

protoclass.setup = function (child) {


  if (!child.extend) {
    child.extend = function(constructor) {

      var args = Array.prototype.slice.call(arguments, 0);

      if (typeof constructor !== "function") {
        args.unshift(constructor = function () {
          constructor.parent.apply(this, arguments);
        });
      }

      return protoclass.apply(this, [this].concat(args));
    }

    child.mixin = function(proto) {
      _copy(this.prototype, arguments);
    }

    child.create = function () {
      var obj = Object.create(child.prototype);
      child.apply(obj, arguments);
      return obj;
    }
  }

  return child;
}


module.exports = protoclass;
},{}],17:[function(require,module,exports){
/**
 * Tween.js - Licensed under the MIT license
 * https://github.com/tweenjs/tween.js
 * ----------------------------------------------
 *
 * See https://github.com/tweenjs/tween.js/graphs/contributors for the full list of contributors.
 * Thank you all, you're awesome!
 */

// Include a performance.now polyfill
(function () {

	if ('performance' in window === false) {
		window.performance = {};
	}

	// IE 8
	Date.now = (Date.now || function () {
		return new Date().getTime();
	});

	if ('now' in window.performance === false) {
		var offset = window.performance.timing && window.performance.timing.navigationStart ? window.performance.timing.navigationStart
		                                                                                    : Date.now();

		window.performance.now = function () {
			return Date.now() - offset;
		};
	}

})();

var TWEEN = TWEEN || (function () {

	var _tweens = [];

	return {

		getAll: function () {

			return _tweens;

		},

		removeAll: function () {

			_tweens = [];

		},

		add: function (tween) {

			_tweens.push(tween);

		},

		remove: function (tween) {

			var i = _tweens.indexOf(tween);

			if (i !== -1) {
				_tweens.splice(i, 1);
			}

		},

		update: function (time) {

			if (_tweens.length === 0) {
				return false;
			}

			var i = 0;

			time = time !== undefined ? time : window.performance.now();

			while (i < _tweens.length) {

				if (_tweens[i].update(time)) {
					i++;
				} else {
					_tweens.splice(i, 1);
				}

			}

			return true;

		}
	};

})();

TWEEN.Tween = function (object) {

	var _object = object;
	var _valuesStart = {};
	var _valuesEnd = {};
	var _valuesStartRepeat = {};
	var _duration = 1000;
	var _repeat = 0;
	var _yoyo = false;
	var _isPlaying = false;
	var _reversed = false;
	var _delayTime = 0;
	var _startTime = null;
	var _easingFunction = TWEEN.Easing.Linear.None;
	var _interpolationFunction = TWEEN.Interpolation.Linear;
	var _chainedTweens = [];
	var _onStartCallback = null;
	var _onStartCallbackFired = false;
	var _onUpdateCallback = null;
	var _onCompleteCallback = null;
	var _onStopCallback = null;

	// Set all starting values present on the target object
	for (var field in object) {
		_valuesStart[field] = parseFloat(object[field], 10);
	}

	this.to = function (properties, duration) {

		if (duration !== undefined) {
			_duration = duration;
		}

		_valuesEnd = properties;

		return this;

	};

	this.start = function (time) {

		TWEEN.add(this);

		_isPlaying = true;

		_onStartCallbackFired = false;

		_startTime = time !== undefined ? time : window.performance.now();
		_startTime += _delayTime;

		for (var property in _valuesEnd) {

			// Check if an Array was provided as property value
			if (_valuesEnd[property] instanceof Array) {

				if (_valuesEnd[property].length === 0) {
					continue;
				}

				// Create a local copy of the Array with the start value at the front
				_valuesEnd[property] = [_object[property]].concat(_valuesEnd[property]);

			}

			_valuesStart[property] = _object[property];

			if ((_valuesStart[property] instanceof Array) === false) {
				_valuesStart[property] *= 1.0; // Ensures we're using numbers, not strings
			}

			_valuesStartRepeat[property] = _valuesStart[property] || 0;

		}

		return this;

	};

	this.stop = function () {

		if (!_isPlaying) {
			return this;
		}

		TWEEN.remove(this);
		_isPlaying = false;

		if (_onStopCallback !== null) {
			_onStopCallback.call(_object);
		}

		this.stopChainedTweens();
		return this;

	};

	this.stopChainedTweens = function () {

		for (var i = 0, numChainedTweens = _chainedTweens.length; i < numChainedTweens; i++) {
			_chainedTweens[i].stop();
		}

	};

	this.delay = function (amount) {

		_delayTime = amount;
		return this;

	};

	this.repeat = function (times) {

		_repeat = times;
		return this;

	};

	this.yoyo = function (yoyo) {

		_yoyo = yoyo;
		return this;

	};


	this.easing = function (easing) {

		_easingFunction = easing;
		return this;

	};

	this.interpolation = function (interpolation) {

		_interpolationFunction = interpolation;
		return this;

	};

	this.chain = function () {

		_chainedTweens = arguments;
		return this;

	};

	this.onStart = function (callback) {

		_onStartCallback = callback;
		return this;

	};

	this.onUpdate = function (callback) {

		_onUpdateCallback = callback;
		return this;

	};

	this.onComplete = function (callback) {

		_onCompleteCallback = callback;
		return this;

	};

	this.onStop = function (callback) {

		_onStopCallback = callback;
		return this;

	};

	this.update = function (time) {

		var property;
		var elapsed;
		var value;

		if (time < _startTime) {
			return true;
		}

		if (_onStartCallbackFired === false) {

			if (_onStartCallback !== null) {
				_onStartCallback.call(_object);
			}

			_onStartCallbackFired = true;

		}

		elapsed = (time - _startTime) / _duration;
		elapsed = elapsed > 1 ? 1 : elapsed;

		value = _easingFunction(elapsed);

		for (property in _valuesEnd) {

			var start = _valuesStart[property] || 0;
			var end = _valuesEnd[property];

			if (end instanceof Array) {

				_object[property] = _interpolationFunction(end, value);

			} else {

				// Parses relative end values with start as base (e.g.: +10, -3)
				if (typeof (end) === 'string') {
					end = start + parseFloat(end, 10);
				}

				// Protect against non numeric properties.
				if (typeof (end) === 'number') {
					_object[property] = start + (end - start) * value;
				}

			}

		}

		if (_onUpdateCallback !== null) {
			_onUpdateCallback.call(_object, value);
		}

		if (elapsed === 1) {

			if (_repeat > 0) {

				if (isFinite(_repeat)) {
					_repeat--;
				}

				// Reassign starting values, restart by making startTime = now
				for (property in _valuesStartRepeat) {

					if (typeof (_valuesEnd[property]) === 'string') {
						_valuesStartRepeat[property] = _valuesStartRepeat[property] + parseFloat(_valuesEnd[property], 10);
					}

					if (_yoyo) {
						var tmp = _valuesStartRepeat[property];

						_valuesStartRepeat[property] = _valuesEnd[property];
						_valuesEnd[property] = tmp;
					}

					_valuesStart[property] = _valuesStartRepeat[property];

				}

				if (_yoyo) {
					_reversed = !_reversed;
				}

				_startTime = time + _delayTime;

				return true;

			} else {

				if (_onCompleteCallback !== null) {
					_onCompleteCallback.call(_object);
				}

				for (var i = 0, numChainedTweens = _chainedTweens.length; i < numChainedTweens; i++) {
					// Make the chained tweens start exactly at the time they should,
					// even if the `update()` method was called way past the duration of the tween
					_chainedTweens[i].start(_startTime + _duration);
				}

				return false;

			}

		}

		return true;

	};

};


TWEEN.Easing = {

	Linear: {

		None: function (k) {

			return k;

		}

	},

	Quadratic: {

		In: function (k) {

			return k * k;

		},

		Out: function (k) {

			return k * (2 - k);

		},

		InOut: function (k) {

			if ((k *= 2) < 1) {
				return 0.5 * k * k;
			}

			return - 0.5 * (--k * (k - 2) - 1);

		}

	},

	Cubic: {

		In: function (k) {

			return k * k * k;

		},

		Out: function (k) {

			return --k * k * k + 1;

		},

		InOut: function (k) {

			if ((k *= 2) < 1) {
				return 0.5 * k * k * k;
			}

			return 0.5 * ((k -= 2) * k * k + 2);

		}

	},

	Quartic: {

		In: function (k) {

			return k * k * k * k;

		},

		Out: function (k) {

			return 1 - (--k * k * k * k);

		},

		InOut: function (k) {

			if ((k *= 2) < 1) {
				return 0.5 * k * k * k * k;
			}

			return - 0.5 * ((k -= 2) * k * k * k - 2);

		}

	},

	Quintic: {

		In: function (k) {

			return k * k * k * k * k;

		},

		Out: function (k) {

			return --k * k * k * k * k + 1;

		},

		InOut: function (k) {

			if ((k *= 2) < 1) {
				return 0.5 * k * k * k * k * k;
			}

			return 0.5 * ((k -= 2) * k * k * k * k + 2);

		}

	},

	Sinusoidal: {

		In: function (k) {

			return 1 - Math.cos(k * Math.PI / 2);

		},

		Out: function (k) {

			return Math.sin(k * Math.PI / 2);

		},

		InOut: function (k) {

			return 0.5 * (1 - Math.cos(Math.PI * k));

		}

	},

	Exponential: {

		In: function (k) {

			return k === 0 ? 0 : Math.pow(1024, k - 1);

		},

		Out: function (k) {

			return k === 1 ? 1 : 1 - Math.pow(2, - 10 * k);

		},

		InOut: function (k) {

			if (k === 0) {
				return 0;
			}

			if (k === 1) {
				return 1;
			}

			if ((k *= 2) < 1) {
				return 0.5 * Math.pow(1024, k - 1);
			}

			return 0.5 * (- Math.pow(2, - 10 * (k - 1)) + 2);

		}

	},

	Circular: {

		In: function (k) {

			return 1 - Math.sqrt(1 - k * k);

		},

		Out: function (k) {

			return Math.sqrt(1 - (--k * k));

		},

		InOut: function (k) {

			if ((k *= 2) < 1) {
				return - 0.5 * (Math.sqrt(1 - k * k) - 1);
			}

			return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);

		}

	},

	Elastic: {

		In: function (k) {

			var s;
			var a = 0.1;
			var p = 0.4;

			if (k === 0) {
				return 0;
			}

			if (k === 1) {
				return 1;
			}

			if (!a || a < 1) {
				a = 1;
				s = p / 4;
			} else {
				s = p * Math.asin(1 / a) / (2 * Math.PI);
			}

			return - (a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));

		},

		Out: function (k) {

			var s;
			var a = 0.1;
			var p = 0.4;

			if (k === 0) {
				return 0;
			}

			if (k === 1) {
				return 1;
			}

			if (!a || a < 1) {
				a = 1;
				s = p / 4;
			} else {
				s = p * Math.asin(1 / a) / (2 * Math.PI);
			}

			return (a * Math.pow(2, - 10 * k) * Math.sin((k - s) * (2 * Math.PI) / p) + 1);

		},

		InOut: function (k) {

			var s;
			var a = 0.1;
			var p = 0.4;

			if (k === 0) {
				return 0;
			}

			if (k === 1) {
				return 1;
			}

			if (!a || a < 1) {
				a = 1;
				s = p / 4;
			} else {
				s = p * Math.asin(1 / a) / (2 * Math.PI);
			}

			if ((k *= 2) < 1) {
				return - 0.5 * (a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
			}

			return a * Math.pow(2, -10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p) * 0.5 + 1;

		}

	},

	Back: {

		In: function (k) {

			var s = 1.70158;

			return k * k * ((s + 1) * k - s);

		},

		Out: function (k) {

			var s = 1.70158;

			return --k * k * ((s + 1) * k + s) + 1;

		},

		InOut: function (k) {

			var s = 1.70158 * 1.525;

			if ((k *= 2) < 1) {
				return 0.5 * (k * k * ((s + 1) * k - s));
			}

			return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);

		}

	},

	Bounce: {

		In: function (k) {

			return 1 - TWEEN.Easing.Bounce.Out(1 - k);

		},

		Out: function (k) {

			if (k < (1 / 2.75)) {
				return 7.5625 * k * k;
			} else if (k < (2 / 2.75)) {
				return 7.5625 * (k -= (1.5 / 2.75)) * k + 0.75;
			} else if (k < (2.5 / 2.75)) {
				return 7.5625 * (k -= (2.25 / 2.75)) * k + 0.9375;
			} else {
				return 7.5625 * (k -= (2.625 / 2.75)) * k + 0.984375;
			}

		},

		InOut: function (k) {

			if (k < 0.5) {
				return TWEEN.Easing.Bounce.In(k * 2) * 0.5;
			}

			return TWEEN.Easing.Bounce.Out(k * 2 - 1) * 0.5 + 0.5;

		}

	}

};

TWEEN.Interpolation = {

	Linear: function (v, k) {

		var m = v.length - 1;
		var f = m * k;
		var i = Math.floor(f);
		var fn = TWEEN.Interpolation.Utils.Linear;

		if (k < 0) {
			return fn(v[0], v[1], f);
		}

		if (k > 1) {
			return fn(v[m], v[m - 1], m - f);
		}

		return fn(v[i], v[i + 1 > m ? m : i + 1], f - i);

	},

	Bezier: function (v, k) {

		var b = 0;
		var n = v.length - 1;
		var pw = Math.pow;
		var bn = TWEEN.Interpolation.Utils.Bernstein;

		for (var i = 0; i <= n; i++) {
			b += pw(1 - k, n - i) * pw(k, i) * v[i] * bn(n, i);
		}

		return b;

	},

	CatmullRom: function (v, k) {

		var m = v.length - 1;
		var f = m * k;
		var i = Math.floor(f);
		var fn = TWEEN.Interpolation.Utils.CatmullRom;

		if (v[0] === v[m]) {

			if (k < 0) {
				i = Math.floor(f = m * (1 + k));
			}

			return fn(v[(i - 1 + m) % m], v[i], v[(i + 1) % m], v[(i + 2) % m], f - i);

		} else {

			if (k < 0) {
				return v[0] - (fn(v[0], v[0], v[1], v[1], -f) - v[0]);
			}

			if (k > 1) {
				return v[m] - (fn(v[m], v[m], v[m - 1], v[m - 1], f - m) - v[m]);
			}

			return fn(v[i ? i - 1 : 0], v[i], v[m < i + 1 ? m : i + 1], v[m < i + 2 ? m : i + 2], f - i);

		}

	},

	Utils: {

		Linear: function (p0, p1, t) {

			return (p1 - p0) * t + p0;

		},

		Bernstein: function (n, i) {

			var fc = TWEEN.Interpolation.Utils.Factorial;

			return fc(n) / fc(i) / fc(n - i);

		},

		Factorial: (function () {

			var a = [1];

			return function (n) {

				var s = 1;

				if (a[n]) {
					return a[n];
				}

				for (var i = n; i > 1; i--) {
					s *= i;
				}

				a[n] = s;
				return s;

			};

		})(),

		CatmullRom: function (p0, p1, p2, p3, t) {

			var v0 = (p2 - p0) * 0.5;
			var v1 = (p3 - p1) * 0.5;
			var t2 = t * t;
			var t3 = t * t2;

			return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (- 3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;

		}

	}

};

// UMD (Universal Module Definition)
(function (root) {

	if (typeof define === 'function' && define.amd) {

		// AMD
		define([], function () {
			return TWEEN;
		});

	} else if (typeof exports === 'object') {

		// Node.js
		module.exports = TWEEN;

	} else {

		// Global variable
		root.TWEEN = TWEEN;

	}

})(this);

},{}]},{},[10])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL2JyZWFrR2VvbWV0cnlJbnRvVmVybGV0RmFjZXMuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL2V4cGxvZGVEb21lLmpzIiwiL2hvbWUvYWRhL2dpdFdvcmtpbmdEaXIvdnItaHViL2FwcC9zY3JpcHRzL2xpYi9nb3RhcmdldHMuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL2xvYWRTY3JpcHQuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL3NreS5qcyIsIi9ob21lL2FkYS9naXRXb3JraW5nRGlyL3ZyLWh1Yi9hcHAvc2NyaXB0cy9saWIvdGV4dFNwcml0ZS5qcyIsIi9ob21lL2FkYS9naXRXb3JraW5nRGlyL3ZyLWh1Yi9hcHAvc2NyaXB0cy9saWIvdGhyZWUuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL3ZlcmxldHdyYXBwZXIuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL3ZydGFyZ2V0LmpzIiwiL2hvbWUvYWRhL2dpdFdvcmtpbmdEaXIvdnItaHViL2FwcC9zY3JpcHRzL21haW4uanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvZmFzdC1ldmVudC1lbWl0dGVyL2xpYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mYXN0LWV2ZW50LWVtaXR0ZXIvbm9kZV9tb2R1bGVzL3Byb3RvY2xhc3MvbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuLmpzL3NyYy9Ud2Vlbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNDQSxZQUFZLENBQUM7Ozs7OztBQUViLFNBQVMsNEJBQTRCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7O0FBRXZELFVBQVMsU0FBUyxDQUFDLFFBQVEsRUFBRTtBQUM1QixTQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDdEIsV0FBUSxFQUFFLFFBQVE7QUFDbEIsV0FBUSxFQUFFLEVBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUM7QUFDNUIsU0FBTSxFQUFFLENBQUM7QUFDVCxPQUFJLEVBQUUsSUFBSTtHQUNWLENBQUMsQ0FDRCxJQUFJLENBQUMsVUFBQSxDQUFDO1VBQUksQ0FBQyxDQUFDLEtBQUs7R0FBQSxDQUFDLENBQ2xCLElBQUksQ0FBQyxVQUFBLENBQUMsRUFBSTtBQUNWLE9BQU0sQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hFLElBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ2xCLFFBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEMsVUFBTyxDQUFDLENBQUM7R0FDVCxDQUFDLENBQUM7RUFDSDs7QUFFRCxVQUFTLFVBQVUsQ0FBQyxRQUFRLEVBQUU7QUFDN0Is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QTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKmdsb2JhbCBUSFJFRSovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGJyZWFrR2VvbWV0cnlJbnRvVmVybGV0RmFjZXMoZywgdGhyZWUsIHZlcmxldCkge1xuXG5cdGZ1bmN0aW9uIG1ha2VQb2ludChwb3NpdGlvbikge1xuXHRcdHJldHVybiB2ZXJsZXQuYWRkUG9pbnQoe1xuXHRcdFx0cG9zaXRpb246IHBvc2l0aW9uLFxuXHRcdFx0dmVsb2NpdHk6IHt4OiAwLCB5OiAwLCB6OiAwfSxcblx0XHRcdHJhZGl1czogMCxcblx0XHRcdG1hc3M6IDAuMDFcblx0XHR9KVxuXHRcdC50aGVuKHAgPT4gcC5wb2ludClcblx0XHQudGhlbihwID0+IHtcblx0XHRcdGNvbnN0IHYgPSBuZXcgVEhSRUUuVmVjdG9yMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KTtcblx0XHRcdHYudmVybGV0UG9pbnQgPSBwO1xuXHRcdFx0dGhyZWUuY29ubmVjdFBoeXNpY3NUb1RocmVlKHYsIHApO1xuXHRcdFx0cmV0dXJuIHY7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlQW5jaG9yKHBvc2l0aW9uKSB7XG5cdFx0cmV0dXJuIHZlcmxldC5hZGRQb2ludCh7XG5cdFx0XHRwb3NpdGlvbjogcG9zaXRpb24sXG5cdFx0XHR2ZWxvY2l0eToge3g6IDAsIHk6IDAsIHo6IDB9LFxuXHRcdFx0cmFkaXVzOiAwLFxuXHRcdFx0bWFzczogMFxuXHRcdH0pXG5cdFx0LnRoZW4ocCA9PiBwLnBvaW50KTtcblx0fVxuXG5cdGNvbnN0IG5ld0dlb20gPSBuZXcgVEhSRUUuR2VvbWV0cnkoKTtcblx0bmV3R2VvbS5keW5hbWljID0gdHJ1ZTtcblxuXHQvLyBMaXN0IG9mIGFsbCBjb25zdHJhaW50IGlkc1xuXHRuZXdHZW9tLnZlcnRleFZlcmxldElkcyA9IFtdO1xuXG5cdC8vIE1hcCBvZiBhbGwgY29uc3RyYWludCBwb3NpdGlvblxuXHRuZXdHZW9tLnZlcnRleFZlcmxldFBvc2l0aW9ucyA9IFtdO1xuXG5cdC8vIExpc3Qgb2YgYWxsIGNvbnN0cmFpbnQgaWRzXG5cdG5ld0dlb20ucG9zaXRpb25Db25zdHJhaW50SWRzID0gW107XG5cblxuXHRjb25zdCBjb25uZWN0aW9ucyA9IFtdO1xuXG5cdHJldHVybiBQcm9taXNlLmFsbChnLmZhY2VzLm1hcChmdW5jdGlvbiAoZmFjZSkge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRtYWtlUG9pbnQoZy52ZXJ0aWNlc1tmYWNlLmFdKSxcblx0XHRcdG1ha2VQb2ludChnLnZlcnRpY2VzW2ZhY2UuYl0pLFxuXHRcdFx0bWFrZVBvaW50KGcudmVydGljZXNbZmFjZS5jXSlcblx0XHRdKVxuXHRcdC50aGVuKGZ1bmN0aW9uKFthLCBiLCBjXSkge1xuXG5cdFx0XHRpZiAoIWNvbm5lY3Rpb25zW2ZhY2UuYV0pIGNvbm5lY3Rpb25zW2ZhY2UuYV0gPSBbXTtcblx0XHRcdGlmICghY29ubmVjdGlvbnNbZmFjZS5iXSkgY29ubmVjdGlvbnNbZmFjZS5iXSA9IFtdO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uc1tmYWNlLmNdKSBjb25uZWN0aW9uc1tmYWNlLmNdID0gW107XG5cblx0XHRcdGNvbm5lY3Rpb25zW2ZhY2UuYV0ucHVzaChhKTtcblx0XHRcdGNvbm5lY3Rpb25zW2ZhY2UuYl0ucHVzaChiKTtcblx0XHRcdGNvbm5lY3Rpb25zW2ZhY2UuY10ucHVzaChjKTtcblxuXHRcdFx0Y29uc3QgbmV3RmFjZSA9IG5ldyBUSFJFRS5GYWNlMyhcblx0XHRcdFx0bmV3R2VvbS52ZXJ0aWNlcy5wdXNoKGEpIC0gMSxcblx0XHRcdFx0bmV3R2VvbS52ZXJ0aWNlcy5wdXNoKGIpIC0gMSxcblx0XHRcdFx0bmV3R2VvbS52ZXJ0aWNlcy5wdXNoKGMpIC0gMVxuXHRcdFx0KTtcblxuXHRcdFx0bmV3RmFjZS5wb3NpdGlvbkNvbnN0cmFpbnRJZHMgPSBbXTtcblx0XHRcdG5ld0ZhY2UudmVydGV4VmVybGV0SWRzID0gW1xuXHRcdFx0XHRhLnZlcmxldFBvaW50LmlkLFxuXHRcdFx0XHRiLnZlcmxldFBvaW50LmlkLFxuXHRcdFx0XHRjLnZlcmxldFBvaW50LmlkXG5cdFx0XHRdO1xuXHRcdFx0bmV3RmFjZS5hZGphY2VudEZhY2VzID0gbmV3IFNldCgpO1xuXG5cdFx0XHRuZXdHZW9tLnZlcnRleFZlcmxldElkcy5wdXNoKC4uLm5ld0ZhY2UudmVydGV4VmVybGV0SWRzKTtcblx0XHRcdG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2EudmVybGV0UG9pbnQuaWRdID0gYS5jbG9uZSgpO1xuXHRcdFx0bmV3R2VvbS52ZXJ0ZXhWZXJsZXRQb3NpdGlvbnNbYi52ZXJsZXRQb2ludC5pZF0gPSBiLmNsb25lKCk7XG5cdFx0XHRuZXdHZW9tLnZlcnRleFZlcmxldFBvc2l0aW9uc1tjLnZlcmxldFBvaW50LmlkXSA9IGMuY2xvbmUoKTtcblxuXHRcdFx0bmV3R2VvbS5mYWNlcy5wdXNoKG5ld0ZhY2UpO1xuXG5cdFx0XHRhLmZhY2UgPSBuZXdGYWNlO1xuXHRcdFx0Yi5mYWNlID0gbmV3RmFjZTtcblx0XHRcdGMuZmFjZSA9IG5ld0ZhY2U7XG5cblx0XHRcdGNvbnN0IHN0aWZmbmVzcyA9IDAuNDtcblx0XHRcdHZlcmxldC5jb25uZWN0UG9pbnRzKGEudmVybGV0UG9pbnQsIGIudmVybGV0UG9pbnQsIHtcblx0XHRcdFx0c3RpZmZuZXNzLFxuXHRcdFx0XHRyZXN0aW5nRGlzdGFuY2U6IGEuZGlzdGFuY2VUbyhiKVxuXHRcdFx0fSk7XG5cdFx0XHR2ZXJsZXQuY29ubmVjdFBvaW50cyhiLnZlcmxldFBvaW50LCBjLnZlcmxldFBvaW50LCB7XG5cdFx0XHRcdHN0aWZmbmVzcyxcblx0XHRcdFx0cmVzdGluZ0Rpc3RhbmNlOiBiLmRpc3RhbmNlVG8oYylcblx0XHRcdH0pO1xuXHRcdFx0dmVybGV0LmNvbm5lY3RQb2ludHMoYy52ZXJsZXRQb2ludCwgYS52ZXJsZXRQb2ludCwge1xuXHRcdFx0XHRzdGlmZm5lc3MsXG5cdFx0XHRcdHJlc3RpbmdEaXN0YW5jZTogYy5kaXN0YW5jZVRvKGEpXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSkpXG5cdC50aGVuKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIEFsbCB0aGUgcG9pbnRzIHdoaWNoIGFyZSAndGhlIHNhbWUnIGxvb3NlbHkgY29ubmVjdCB0aGVtLlxuXHRcdHJldHVybiBQcm9taXNlLmFsbChjb25uZWN0aW9ucy5tYXAoKHBvaW50c1RvQ29ubmVjdCwgaSkgPT4ge1xuXG5cdFx0XHRyZXR1cm4gbWFrZUFuY2hvcihnLnZlcnRpY2VzW2ldKVxuXHRcdFx0LnRoZW4oYW5jaG9yID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHBvaW50c1RvQ29ubmVjdC5tYXAoKHAsIGkpID0+IHtcblx0XHRcdFx0XHRwb2ludHNUb0Nvbm5lY3QuZm9yRWFjaChvUCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAob1AuZmFjZSAhPT0gcC5mYWNlKSB7XG5cdFx0XHRcdFx0XHRcdHAuZmFjZS5hZGphY2VudEZhY2VzLmFkZChvUC5mYWNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gdmVybGV0LmNvbm5lY3RQb2ludHMocC52ZXJsZXRQb2ludCwgYW5jaG9yLCB7XG5cdFx0XHRcdFx0XHRzdGlmZm5lc3M6IDAuNixcblx0XHRcdFx0XHRcdHJlc3RpbmdEaXN0YW5jZTogMC4wMVxuXHRcdFx0XHRcdH0pLnRoZW4oYyA9PiB7XG5cdFx0XHRcdFx0XHRwLmZhY2UucG9zaXRpb25Db25zdHJhaW50SWRzLnB1c2goYy5jb25zdHJhaW50SWQpO1xuXHRcdFx0XHRcdFx0bmV3R2VvbS5wb3NpdGlvbkNvbnN0cmFpbnRJZHMucHVzaChjLmNvbnN0cmFpbnRJZCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fSlcblx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXG5cdFx0bmV3R2VvbS52ZXJ0aWNlc05lZWRVcGRhdGUgPSB0cnVlO1xuXHRcdG5ld0dlb20ubm9ybWFsc05lZWRVcGRhdGUgPSB0cnVlO1xuXG5cdFx0Ly8gQ29udmVydCBTZXQgaW50byBBcnJheVxuXHRcdG5ld0dlb20uZmFjZXMuZm9yRWFjaChmID0+IGYuYWRqYWNlbnRGYWNlcyA9IFsuLi5mLmFkamFjZW50RmFjZXNdKTtcblx0XHRyZXR1cm4gbmV3R2VvbTtcblx0fSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYnJlYWtHZW9tZXRyeUludG9WZXJsZXRGYWNlcztcbiIsIi8qZ2xvYmFsIFRIUkVFKi9cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXRVcEV4cGxvZGluZ0RvbWUoZG9tZSwgdGhyZWUsIHZlcmxldCkge1xuXG5cdHJldHVybiByZXF1aXJlKCcuL2JyZWFrR2VvbWV0cnlJbnRvVmVybGV0RmFjZXMnKShkb21lLmdlb21ldHJ5LCB0aHJlZSwgdmVybGV0KVxuXHQudGhlbihzZXRVcEZhbGxpbmdBbmRSZWNvbnN0cnVjdGlvbkNvbnRyb2xsZXIpO1xuXG5cblx0ZnVuY3Rpb24gc2V0VXBGYWxsaW5nQW5kUmVjb25zdHJ1Y3Rpb25Db250cm9sbGVyKG5ld0dlb20pIHtcblxuXHRcdGxldCBkZXN0cm95ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB0aW1lb3V0cyA9IFtdO1xuXHRcdGNvbnN0IGZhbGxSYXRlID0gNTAwO1xuXHRcdGNvbnN0IG5ld0RvbWUgPSBuZXcgVEhSRUUuTWVzaChcblx0XHRcdG5ld0dlb20sXG5cdFx0XHRkb21lLm1hdGVyaWFsXG5cdFx0KTtcblx0XHR0aHJlZS5zY2VuZS5hZGQobmV3RG9tZSk7XG5cblx0XHRuZXdHZW9tLm5vcm1hbHNOZWVkVXBkYXRlID0gdHJ1ZTtcblx0XHR0aHJlZS5vbigncHJlcmVuZGVyJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0bmV3R2VvbS52ZXJ0aWNlc05lZWRVcGRhdGUgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gZmFjZUZhbGwoZikge1xuXHRcdFx0aWYgKCFmKSByZXR1cm47XG5cdFx0XHRmb3IobGV0IGk9MDsgaSA8IDM7aSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnN0cmFpbnRJZCA9IGYucG9zaXRpb25Db25zdHJhaW50SWRzW2ldO1xuXHRcdFx0XHRjb25zdCB2ZXJsZXRJZCA9IGYudmVydGV4VmVybGV0SWRzW2ldO1xuXHRcdFx0XHR2ZXJsZXQudXBkYXRlQ29uc3RyYWludCh7XG5cdFx0XHRcdFx0Y29uc3RyYWludElkLFxuXHRcdFx0XHRcdHN0aWZmbmVzczogMFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dmVybGV0LnVwZGF0ZVBvaW50KHtcblx0XHRcdFx0XHRpZDogdmVybGV0SWQsXG5cdFx0XHRcdFx0bWFzczogMSxcblx0XHRcdFx0XHR2ZWxvY2l0eToge1xuXHRcdFx0XHRcdFx0eDogMC41ICogKE1hdGgucmFuZG9tKCkgLSAwLjUpLFxuXHRcdFx0XHRcdFx0eTogMC41ICogKE1hdGgucmFuZG9tKCkgLSAwLjUpLFxuXHRcdFx0XHRcdFx0ejogMC41ICogKE1hdGgucmFuZG9tKCkgLSAwLjUpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcmVjdXJzaXZlRmFsbChzdGFydEZhY2UpIHtcblx0XHRcdGZhY2VGYWxsKHN0YXJ0RmFjZSk7XG5cdFx0XHRjb25zdCBsID0gc3RhcnRGYWNlLmFkamFjZW50RmFjZXMubGVuZ3RoO1xuXHRcdFx0Zm9yIChsZXQgaT0wOyBpPGw7IGkrKykge1xuXHRcdFx0XHRjb25zdCBmID0gc3RhcnRGYWNlLmFkamFjZW50RmFjZXNbaV07XG5cdFx0XHRcdGlmICghZi5mYWxsaW5nKSB7XG5cdFx0XHRcdFx0Zi5mYWxsaW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR0aW1lb3V0cy5wdXNoKHNldFRpbWVvdXQocmVjdXJzaXZlRmFsbCwgZmFsbFJhdGUsIGYpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHJlc3RvcmUoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHdoaWxlKHRpbWVvdXRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0cy5wb3AoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV3R2VvbS5wb3NpdGlvbkNvbnN0cmFpbnRJZHMuZm9yRWFjaChjb25zdHJhaW50SWQgPT4gdmVybGV0LnVwZGF0ZUNvbnN0cmFpbnQoe2NvbnN0cmFpbnRJZCwgc3RpZmZuZXNzOiAwLjMgfSkpO1xuXHRcdFx0XHR0aW1lb3V0cy5wdXNoKHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdG5ld0dlb20ucG9zaXRpb25Db25zdHJhaW50SWRzLmZvckVhY2goY29uc3RyYWludElkID0+IHZlcmxldC51cGRhdGVDb25zdHJhaW50KHtjb25zdHJhaW50SWQsIHN0aWZmbmVzczogMC41IH0pKTtcblx0XHRcdFx0XHRuZXdHZW9tLnZlcnRleFZlcmxldElkcy5mb3JFYWNoKGlkID0+IHtcblx0XHRcdFx0XHRcdHZlcmxldC51cGRhdGVQb2ludCh7XG5cdFx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0XHRtYXNzOiAwLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdHg6IG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2lkXS54LFxuXHRcdFx0XHRcdFx0XHRcdHk6IG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2lkXS55LFxuXHRcdFx0XHRcdFx0XHRcdHo6IG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2lkXS56XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSgpLCBmYWxsUmF0ZSk7XG5cdFx0XHRcdH0sIGZhbGxSYXRlKSk7XG5cdFx0XHRcdG5ld0dlb20uZmFjZXMuZm9yRWFjaChmYWNlID0+IGZhY2UuZmFsbGluZyA9IGZhbHNlKTtcblx0XHRcdFx0ZGVzdHJveWVkID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBkZXN0cm95KCkge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCByYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKCk7XG5cdFx0XHRcdHJheWNhc3Rlci5zZXRGcm9tQ2FtZXJhKG5ldyBUSFJFRS5WZWN0b3IyKDAsMCksIHRocmVlLmNhbWVyYSk7XG5cdFx0XHRcdGNvbnN0IGhpdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyhbbmV3RG9tZV0pO1xuXHRcdFx0XHRpZiAoaGl0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZWN1cnNpdmVGYWxsKGhpdHNbMF0uZmFjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVzdHJveWVkID0gdHJ1ZTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlc3Ryb3ksXG5cdFx0XHRyZXN0b3JlLFxuXHRcdFx0dG9nZ2xlKCkge1xuXHRcdFx0XHQoZGVzdHJveWVkID8gcmVzdG9yZSA6IGRlc3Ryb3kpKCk7XG5cdFx0XHR9LFxuXHRcdFx0bWVzaDogbmV3RG9tZVxuXHRcdH07XG5cdH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5jb25zdCB0ZXh0U3ByaXRlID0gcmVxdWlyZSgnLi90ZXh0U3ByaXRlJyk7XG5jb25zdCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdmYXN0LWV2ZW50LWVtaXR0ZXInKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8qZ2xvYmFsIFRIUkVFKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBHb1RhcmdldENvbmZpZyh0aHJlZSkge1xuXG5cdGZ1bmN0aW9uIEdvVGFyZ2V0KG5vZGUpIHtcblxuXHRcdEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG5cdFx0dGhpcy5wb3NpdGlvbiA9IG5vZGUucG9zaXRpb247XG5cdFx0dGhpcy5oYXNIb3ZlciA9IGZhbHNlO1xuXHRcdHRoaXMuc3ByaXRlID0gbm9kZTtcblx0XHR0aGlzLnNwcml0ZS5tYXRlcmlhbC5vcGFjaXR5ID0gMC41O1xuXG5cdFx0dGhpcy5vbignaG92ZXInLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhhc0hvdmVyID0gdHJ1ZTtcblx0XHRcdHRoaXMuc3ByaXRlLm1hdGVyaWFsLm9wYWNpdHkgPSAxO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5vbignaG92ZXJPdXQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhhc0hvdmVyID0gZmFsc2U7XG5cdFx0XHR0aGlzLnNwcml0ZS5tYXRlcmlhbC5vcGFjaXR5ID0gMC41O1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5oaWRlID0gKCkgPT57XG5cdFx0XHR0aGlzLnNwcml0ZS52aXNpYmxlID0gZmFsc2U7XG5cdFx0fTtcblxuXHRcdHRoaXMuc2hvdyA9ICgpID0+e1xuXHRcdFx0dGhpcy5zcHJpdGUudmlzaWJsZSA9IHRydWU7XG5cdFx0fTtcblx0fVxuXHR1dGlsLmluaGVyaXRzKEdvVGFyZ2V0LCBFdmVudEVtaXR0ZXIpO1xuXG5cdHRoaXMudGFyZ2V0cyA9IG5ldyBNYXAoKTtcblxuXHR0aHJlZS5vbigncHJlcmVuZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKTtcblx0XHRyYXljYXN0ZXIuc2V0RnJvbUNhbWVyYShuZXcgVEhSRUUuVmVjdG9yMigwLDApLCB0aHJlZS5jYW1lcmEpO1xuXHRcdGNvbnN0IGhpdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyhcblx0XHRcdEFycmF5LmZyb20odGhpcy50YXJnZXRzLnZhbHVlcygpKVxuXHRcdFx0Lm1hcCh0YXJnZXQgPT4gdGFyZ2V0LnNwcml0ZSlcblx0XHRcdC5maWx0ZXIoc3ByaXRlID0+IHNwcml0ZS52aXNpYmxlKVxuXHRcdCk7XG5cblx0XHRsZXQgdGFyZ2V0ID0gZmFsc2U7XG5cblx0XHRpZiAoaGl0cy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gU2hvdyBoaWRkZW4gdGV4dCBzcHJpdGUgY2hpbGRcblx0XHRcdHRhcmdldCA9IHRoaXMudGFyZ2V0cy5nZXQoaGl0c1swXS5vYmplY3QpO1xuXHRcdFx0aWYgKHRhcmdldCkgdGFyZ2V0LmVtaXQoJ2hvdmVyJyk7XG5cdFx0fVxuXG5cdFx0Ly8gaWYgaXQgaXMgbm90IHRoZSBvbmUganVzdCBtYXJrZWQgZm9yIGhpZ2hsaWdodFxuXHRcdC8vIGFuZCBpdCB1c2VkIHRvIGJlIGhpZ2hsaWdodGVkIHVuIGhpZ2hsaWdodCBpdC5cblx0XHRBcnJheS5mcm9tKHRoaXMudGFyZ2V0cy52YWx1ZXMoKSlcblx0XHQuZmlsdGVyKGVhY2hUYXJnZXQgPT4gZWFjaFRhcmdldCAhPT0gdGFyZ2V0KVxuXHRcdC5mb3JFYWNoKGVhY2hOb3RIaXQgPT4ge1xuXHRcdFx0aWYgKGVhY2hOb3RIaXQuaGFzSG92ZXIpIGVhY2hOb3RIaXQuZW1pdCgnaG92ZXJPdXQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uc3QgaW50ZXJhY3QgPSAoZXZlbnQpID0+IHtcblx0XHRBcnJheS5mcm9tKHRoaXMudGFyZ2V0cy52YWx1ZXMoKSkuZm9yRWFjaCh0YXJnZXQgPT4ge1xuXHRcdFx0aWYgKHRhcmdldC5oYXNIb3Zlcikge1xuXHRcdFx0XHR0YXJnZXQuZW1pdChldmVudC50eXBlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fTtcblxuXHR0aHJlZS5kb21FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW50ZXJhY3QpO1xuXHR0aHJlZS5kb21FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGludGVyYWN0KTtcblx0dGhyZWUuZG9tRWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaW50ZXJhY3QpO1xuXHR0aHJlZS5kb21FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNodXAnLCBpbnRlcmFjdCk7XG5cdHRocmVlLmRvbUVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hkb3duJywgaW50ZXJhY3QpO1xuXHR0aHJlZS5kZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXJcblx0LmFkZEV2ZW50TGlzdGVuZXIoJ3VzZXJpbnRlcmFjdGlvbmVuZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRpbnRlcmFjdCh7dHlwZTogJ2NsaWNrJ30pO1xuXHR9KTtcblxuXHR0aGlzLm1ha2VUYXJnZXQgPSBub2RlID0+IHtcblx0XHRjb25zdCBuZXdUYXJnZXQgPSBuZXcgR29UYXJnZXQobm9kZSk7XG5cdFx0dGhpcy50YXJnZXRzLnNldChub2RlLCBuZXdUYXJnZXQpO1xuXHRcdHJldHVybiBuZXdUYXJnZXQ7XG5cdH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBhZGRTY3JpcHQodXJsKSB7XG5cdHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG5cdFx0dmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXHRcdHNjcmlwdC5zZXRBdHRyaWJ1dGUoJ3NyYycsIHVybCk7XG5cdFx0ZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzY3JpcHQpO1xuXHRcdHNjcmlwdC5vbmxvYWQgPSByZXNvbHZlO1xuXHRcdHNjcmlwdC5vbmVycm9yID0gcmVqZWN0O1xuXHR9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhZGRTY3JpcHQ7XG4iLCIvKmdsb2JhbCBUSFJFRSovXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5pdFNreSgpIHtcblxuXHQvLyBBZGQgU2t5IE1lc2hcblx0Y29uc3Qgc2t5ID0gbmV3IFRIUkVFLlNreSgpO1xuXG5cdHZhciBlZmZlY3RDb250cm9sbGVyICA9IHtcblx0XHR0dXJiaWRpdHk6IDEwLFxuXHRcdHJlaWxlaWdoOiAyLFxuXHRcdG1pZUNvZWZmaWNpZW50OiAwLjAwNSxcblx0XHRtaWVEaXJlY3Rpb25hbEc6IDAuOCxcblx0XHRsdW1pbmFuY2U6IDEsXG5cdFx0aW5jbGluYXRpb246IDAuNDksIC8vIGVsZXZhdGlvbiAvIGluY2xpbmF0aW9uXG5cdFx0YXppbXV0aDogMC4yNSwgLy8gRmFjaW5nIGZyb250LFxuXHR9O1xuXG5cdHZhciBkaXN0YW5jZSA9IDQwMDAwMDtcblxuXHRmdW5jdGlvbiBpbml0VW5pZm9ybXMoKSB7XG5cblx0XHRjb25zdCB1bmlmb3JtcyA9IHNreS51bmlmb3Jtcztcblx0XHRjb25zdCBzdW5Qb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXHRcdHVuaWZvcm1zLnR1cmJpZGl0eS52YWx1ZSA9IGVmZmVjdENvbnRyb2xsZXIudHVyYmlkaXR5O1xuXHRcdHVuaWZvcm1zLnJlaWxlaWdoLnZhbHVlID0gZWZmZWN0Q29udHJvbGxlci5yZWlsZWlnaDtcblx0XHR1bmlmb3Jtcy5sdW1pbmFuY2UudmFsdWUgPSBlZmZlY3RDb250cm9sbGVyLmx1bWluYW5jZTtcblx0XHR1bmlmb3Jtcy5taWVDb2VmZmljaWVudC52YWx1ZSA9IGVmZmVjdENvbnRyb2xsZXIubWllQ29lZmZpY2llbnQ7XG5cdFx0dW5pZm9ybXMubWllRGlyZWN0aW9uYWxHLnZhbHVlID0gZWZmZWN0Q29udHJvbGxlci5taWVEaXJlY3Rpb25hbEc7XG5cblx0XHR2YXIgdGhldGEgPSBNYXRoLlBJICogKCBlZmZlY3RDb250cm9sbGVyLmluY2xpbmF0aW9uIC0gMC41ICk7XG5cdFx0dmFyIHBoaSA9IDIgKiBNYXRoLlBJICogKCBlZmZlY3RDb250cm9sbGVyLmF6aW11dGggLSAwLjUgKTtcblxuXHRcdHN1blBvcy54ID0gZGlzdGFuY2UgKiBNYXRoLmNvcyggcGhpICk7XG5cdFx0c3VuUG9zLnkgPSBkaXN0YW5jZSAqIE1hdGguc2luKCBwaGkgKSAqIE1hdGguc2luKCB0aGV0YSApO1xuXHRcdHN1blBvcy56ID0gZGlzdGFuY2UgKiBNYXRoLnNpbiggcGhpICkgKiBNYXRoLmNvcyggdGhldGEgKTtcblxuXHRcdHNreS51bmlmb3Jtcy5zdW5Qb3NpdGlvbi52YWx1ZS5jb3B5KCBzdW5Qb3MgKTtcblxuXHR9XG5cdGluaXRVbmlmb3JtcygpO1xuXG5cdHJldHVybiBza3kubWVzaDtcbn07XG4iLCIvLyBGcm9tIGh0dHA6Ly9zdGVta29za2kuZ2l0aHViLmlvL1RocmVlLmpzL1Nwcml0ZS1UZXh0LUxhYmVscy5odG1sXG4vKmdsb2JhbCBUSFJFRSovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIG1ha2VUZXh0U3ByaXRlKCBtZXNzYWdlLCBwYXJhbWV0ZXJzICkge1xuXHRpZiAoIHBhcmFtZXRlcnMgPT09IHVuZGVmaW5lZCApIHBhcmFtZXRlcnMgPSB7fTtcblx0XG5cdGNvbnN0IGZvbnRmYWNlID0gcGFyYW1ldGVycy5oYXNPd25Qcm9wZXJ0eShcImZvbnRmYWNlXCIpID8gXG5cdFx0cGFyYW1ldGVyc1tcImZvbnRmYWNlXCJdIDogXCJBcmlhbFwiO1xuXHRcblx0Y29uc3QgYm9yZGVyVGhpY2tuZXNzID0gcGFyYW1ldGVycy5oYXNPd25Qcm9wZXJ0eShcImJvcmRlclRoaWNrbmVzc1wiKSA/IFxuXHRcdHBhcmFtZXRlcnNbXCJib3JkZXJUaGlja25lc3NcIl0gOiAyO1xuXG5cdC8vIG1heSB0d2Vha2VkIGxhdGVyIHRvIHNjYWxlIHRleHRcblx0bGV0IHNpemUgPSBwYXJhbWV0ZXJzLmhhc093blByb3BlcnR5KFwic2l6ZVwiKSA/IFxuXHRcdHBhcmFtZXRlcnNbXCJzaXplXCJdIDogMTtcblx0XHRcblx0Y29uc3QgY2FudmFzMSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRjb25zdCBjb250ZXh0MSA9IGNhbnZhczEuZ2V0Q29udGV4dCgnMmQnKTtcblx0Y29uc3QgaGVpZ2h0ID0gMjU2O1xuXG5cdGZ1bmN0aW9uIHNldFN0eWxlKGNvbnRleHQpIHtcblxuXHRcdGNvbnRleHQuZm9udCA9IFwiQm9sZCBcIiArIChoZWlnaHQgLSBib3JkZXJUaGlja25lc3MpICsgXCJweCBcIiArIGZvbnRmYWNlO1xuXHRcdGNvbnRleHQudGV4dEFsaWduID0gJ2NlbnRlcic7XG5cdFx0Y29udGV4dC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcblx0XHRcblx0XHRjb250ZXh0LmxpbmVXaWR0aCA9IGJvcmRlclRoaWNrbmVzcztcblxuXHRcdC8vIHRleHQgY29sb3Jcblx0XHRjb250ZXh0LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI1NSwgMjU1LCAyNTUsIDEuMClcIjtcblx0XHRjb250ZXh0LmZpbGxTdHlsZSA9IFwicmdiYSgwLCAwLCAwLCAxLjApXCI7XG5cdH1cblxuXHRzZXRTdHlsZShjb250ZXh0MSk7XG5cblx0Y29uc3QgY2FudmFzMiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXG5cdC8vIE1ha2UgdGhlIGNhbnZhcyB3aWR0aCBhIHBvd2VyIG9mIDIgbGFyZ2VyIHRoYW4gdGhlIHRleHQgd2lkdGhcblx0Y29uc3QgbWVhc3VyZSA9IGNvbnRleHQxLm1lYXN1cmVUZXh0KCBtZXNzYWdlICk7XG5cdGNhbnZhczIud2lkdGggPSBNYXRoLnBvdygyLCBNYXRoLmNlaWwoTWF0aC5sb2cyKCBtZWFzdXJlLndpZHRoICkpKTtcblx0Y2FudmFzMi5oZWlnaHQgPSBoZWlnaHQ7XG5cdGNvbnNvbGUubG9nKG1lYXN1cmUpO1xuXHRjb25zdCBjb250ZXh0MiA9IGNhbnZhczIuZ2V0Q29udGV4dCgnMmQnKTtcblxuXHRjb250ZXh0Mi5yZWN0KDAsIDAsIGNhbnZhczIud2lkdGgsIGNhbnZhczIuaGVpZ2h0KTtcblx0Y29udGV4dDIuZmlsbFN0eWxlPVwicmVkXCI7XG5cdGNvbnRleHQyLmZpbGwoKTtcblxuXHRzZXRTdHlsZShjb250ZXh0Mik7XG5cblx0Y29udGV4dDIuc3Ryb2tlVGV4dCggbWVzc2FnZSwgY2FudmFzMi53aWR0aC8yLCBjYW52YXMyLmhlaWdodC8yKTtcblx0Y29udGV4dDIuZmlsbFRleHQoIG1lc3NhZ2UsIGNhbnZhczIud2lkdGgvMiwgY2FudmFzMi5oZWlnaHQvMik7XG5cdFxuXHQvLyBjYW52YXMgY29udGVudHMgd2lsbCBiZSB1c2VkIGZvciBhIHRleHR1cmVcblx0Y29uc3QgdGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKGNhbnZhczIpIDtcblx0dGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XG5cblx0Y29uc3Qgc3ByaXRlTWF0ZXJpYWwgPSBuZXcgVEhSRUUuU3ByaXRlTWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUsIHRyYW5zcGFyZW50OiB0cnVlIH0pO1xuXHRjb25zdCBzcHJpdGUgPSBuZXcgVEhSRUUuU3ByaXRlKHNwcml0ZU1hdGVyaWFsKTtcblxuXHRjb25zdCBtYXhXaWR0aCA9IGhlaWdodCAqIDQ7XG5cblx0aWYgKGNhbnZhczIud2lkdGggPiBtYXhXaWR0aCkgc2l6ZSAqPSBtYXhXaWR0aC9jYW52YXMyLndpZHRoO1xuXHRjb25zb2xlLmxvZyhjYW52YXMyLndpZHRoLCBjYW52YXMyLmhlaWdodCk7XG4gICAgXG5cdC8vIGdldCBzaXplIGRhdGEgKGhlaWdodCBkZXBlbmRzIG9ubHkgb24gZm9udCBzaXplKVxuXHRzcHJpdGUuc2NhbGUuc2V0KHNpemUgKiBjYW52YXMyLndpZHRoL2NhbnZhczIuaGVpZ2h0LCBzaXplLCAxKTtcblx0cmV0dXJuIHNwcml0ZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBtYWtlVGV4dFNwcml0ZTtcbiIsIi8qIGdsb2JhbCBUSFJFRSwgRGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyICovXG4ndXNlIHN0cmljdCc7XG5jb25zdCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdmYXN0LWV2ZW50LWVtaXR0ZXInKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5jb25zdCBUV0VFTiA9IHJlcXVpcmUoJ3R3ZWVuLmpzJyk7XG5cbmNvbnN0IHBhdGggPSBcImltYWdlcy9cIjtcbmNvbnN0IGZvcm1hdCA9ICcuanBnJztcbmNvbnN0IHVybHMgPSBbXG5cdHBhdGggKyAncHgnICsgZm9ybWF0LCBwYXRoICsgJ254JyArIGZvcm1hdCxcblx0cGF0aCArICdweScgKyBmb3JtYXQsIHBhdGggKyAnbnknICsgZm9ybWF0LFxuXHRwYXRoICsgJ3B6JyArIGZvcm1hdCwgcGF0aCArICdueicgKyBmb3JtYXRcbl07XG5jb25zdCByZWZsZWN0aW9uQ3ViZSA9IFRIUkVFLkltYWdlVXRpbHMubG9hZFRleHR1cmVDdWJlKCB1cmxzICk7XG5yZWZsZWN0aW9uQ3ViZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG5cbmNvbnN0IG1hdGVyaWFscyA9IHtcblx0c2hpbnk6IG5ldyBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCggeyBjb2xvcjogMHg5OWZmOTksIHNwZWN1bGFyOiAweDQ0MDAwMCwgZW52TWFwOiByZWZsZWN0aW9uQ3ViZSwgY29tYmluZTogVEhSRUUuTWl4T3BlcmF0aW9uLCByZWZsZWN0aXZpdHk6IDAuMywgbWV0YWw6IHRydWV9ICksXG5cdGJvcmluZzI6IG5ldyBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCggeyBjb2xvcjogMHhDMEI5QkIsIHNwZWN1bGFyOiAwLCBzaGFkaW5nOiBUSFJFRS5GbGF0U2hhZGluZywgc2lkZTogVEhSRUUuRG91YmxlU2lkZSwgdHJhbnNwYXJlbnQ6IHRydWUsIG9wYWNpdHk6IDAuMiB9ICksXG5cdHdpcmVmcmFtZTogbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKCB7IGNvbG9yOiAweEZGRkZGRiwgd2lyZWZyYW1lOiB0cnVlIH0gKVxufTtcblxudmFyIGwgPSBuZXcgVEhSRUUuT2JqZWN0TG9hZGVyKCk7XG5jb25zdCBsb2FkU2NlbmUgPSAoaWQpID0+IG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcblx0bC5sb2FkKCdtb2RlbHMvJyArIGlkICsgJy5qc29uJywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpO1xufSk7XG5cbmZ1bmN0aW9uIG15VGhyZWVGcm9tSlNPTihpZCwgdGFyZ2V0KSB7XG5cdHJldHVybiBsb2FkU2NlbmUoaWQpLnRoZW4ocyA9PiBuZXcgTXlUaHJlZShzLCB0YXJnZXQpKTtcbn1cblxuZnVuY3Rpb24gTXlUaHJlZShzY2VuZSwgdGFyZ2V0ID0gZG9jdW1lbnQuYm9keSl7XG5cblx0RXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cblx0dGhpcy5zY2VuZSA9IHNjZW5lIHx8IG5ldyBUSFJFRS5TY2VuZSgpO1xuXG5cdGNvbnN0IGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSggNzUsIHRhcmdldC5zY3JvbGxXaWR0aCAvIHRhcmdldC5zY3JvbGxIZWlnaHQsIDAuNSwgMjAgKTtcblx0Y2FtZXJhLmhlaWdodCA9IDI7XG5cdGNhbWVyYS5wb3NpdGlvbi5zZXQoMCwgY2FtZXJhLmhlaWdodCwgMCk7XG5cdGNhbWVyYS5sb29rQXQobmV3IFRIUkVFLlZlY3RvcjMoMCwgY2FtZXJhLmhlaWdodCwgLTkpKTtcblx0Y2FtZXJhLnJvdGF0aW9uLnkgKz0gTWF0aC5QSTtcblx0dGhpcy5jYW1lcmEgPSBjYW1lcmE7XG5cblx0Y29uc3QgaHVkID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XG5cdGh1ZC5wb3NpdGlvbi5zZXQoMCwgMCwgLTIuMSk7XG5cdGh1ZC5zY2FsZS5zZXQoMC4yLCAwLjIsIDAuMik7XG5cdGNhbWVyYS5hZGQoaHVkKTtcblx0c2NlbmUuYWRkKGNhbWVyYSk7XG5cdHRoaXMuaHVkID0gaHVkO1xuXG5cdGNvbnN0IHJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoIHsgYW50aWFsaWFzOiBmYWxzZSwgYWxwaGE6IHRydWUgfSApO1xuXHRyZW5kZXJlci5zZXRQaXhlbFJhdGlvKCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyApO1xuXHRcblx0dGhpcy5yZW5kZXJNZXRob2QgPSByZW5kZXJlcjtcblx0XG5cdGNvbnN0IHNldEFzcGVjdCA9ICgpID0+IHtcblx0XHR0aGlzLnJlbmRlck1ldGhvZC5zZXRTaXplKCB0YXJnZXQuc2Nyb2xsV2lkdGgsIHRhcmdldC5zY3JvbGxIZWlnaHQgKTtcblx0XHRjYW1lcmEuYXNwZWN0ID0gdGFyZ2V0LnNjcm9sbFdpZHRoIC8gdGFyZ2V0LnNjcm9sbEhlaWdodDtcblx0XHRjYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuXHR9O1xuXHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgc2V0QXNwZWN0KTtcblx0c2V0QXNwZWN0KCk7XG5cblx0dGFyZ2V0LmFwcGVuZENoaWxkKHJlbmRlcmVyLmRvbUVsZW1lbnQpO1xuXHR0aGlzLmRvbUVsZW1lbnQgPSByZW5kZXJlci5kb21FbGVtZW50O1xuXHR0aGlzLmRvbUVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnZml4ZWQnO1xuXG5cdHRoaXMubWF0ZXJpYWxzID0gbWF0ZXJpYWxzO1xuXG5cdGNvbnN0IHBoeXNpY3NPYmplY3RzID0gW107XG5cdGNvbnN0IHRocmVlT2JqZWN0c0Nvbm5lY3RlZFRvUGh5c2ljcyA9IHt9O1xuXHR0aGlzLnVwZGF0ZU9iamVjdHMgPSBuZXdPYmplY3RzID0+IHtcblx0XHRwaHlzaWNzT2JqZWN0cy5zcGxpY2UoMCk7XG5cdFx0cGh5c2ljc09iamVjdHMucHVzaC5hcHBseShwaHlzaWNzT2JqZWN0cywgbmV3T2JqZWN0cyk7XG5cdH07XG5cblx0dGhpcy5vbigncHJlcmVuZGVyJywgZnVuY3Rpb24gdXBkYXRlUG9zaXRpb25zKCkge1xuXG5cdFx0Y29uc3QgbCA9IHBoeXNpY3NPYmplY3RzLmxlbmd0aDtcblxuXHRcdC8vIGl0ZXJhdGUgb3ZlciB0aGUgcGh5c2ljcyBwaHlzaWNzT2JqZWN0c1xuXHRcdGZvciAoIGxldCBpLGo9MDsgajxsO2orKyApIHtcblxuXHRcdFx0Y29uc3QgaSA9IHBoeXNpY3NPYmplY3RzW2pdO1xuXHRcdFx0aWYgKHRocmVlT2JqZWN0c0Nvbm5lY3RlZFRvUGh5c2ljc1tpLmlkXSkge1xuXG5cdFx0XHRcdGNvbnN0IG8gPSB0aHJlZU9iamVjdHNDb25uZWN0ZWRUb1BoeXNpY3NbaS5pZF07XG5cblx0XHRcdFx0Ly8gU3VwcG9ydCBtYW5pcGxhdGluZyBhIHNpbmdsZSB2ZXJ0ZXhcblx0XHRcdFx0aWYgKG8uY29uc3RydWN0b3IgPT09IFRIUkVFLlZlY3RvcjMpIHtcblx0XHRcdFx0XHRvLnNldChpLnBvc2l0aW9uLngsIGkucG9zaXRpb24ueSwgaS5wb3NpdGlvbi56KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG8ucG9zaXRpb24uc2V0KGkucG9zaXRpb24ueCwgaS5wb3NpdGlvbi55LCBpLnBvc2l0aW9uLnopO1xuXG5cdFx0XHRcdC8vIFJvdGF0aW9uXG5cdFx0XHRcdGlmIChpLnF1YXRlcm5pb24pIHtcblx0XHRcdFx0XHRvLnJvdGF0aW9uLnNldEZyb21RdWF0ZXJuaW9uKG5ldyBUSFJFRS5RdWF0ZXJuaW9uKGkucXVhdGVybmlvbi54LCBpLnF1YXRlcm5pb24ueSwgaS5xdWF0ZXJuaW9uLnosIGkucXVhdGVybmlvbi53KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHRoaXMub24oJ3ByZXJlbmRlcicsIFRXRUVOLnVwZGF0ZSk7XG5cblx0dGhpcy5jb25uZWN0UGh5c2ljc1RvVGhyZWUgPSAobWVzaCwgcGh5c2ljc01lc2gpID0+IHtcblx0XHR0aHJlZU9iamVjdHNDb25uZWN0ZWRUb1BoeXNpY3NbcGh5c2ljc01lc2guaWRdID0gbWVzaDtcblx0XHRpZiAobWVzaC5jb25zdHJ1Y3RvciA9PT0gVEhSRUUuVmVjdG9yMykgcmV0dXJuO1xuXHRcdHNjZW5lLmFkZChtZXNoKTtcblx0fTtcblxuXHQvLyBVc2VmdWwgZm9yIGRlYnVnZ2luZ1xuXHR0aGlzLmNyZWF0ZVNwaGVyZSA9IChyYWRpdXMpID0+IHtcblx0XHRjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeShyYWRpdXMgfHwgMSwgOCwgNSk7XG5cdFx0Y29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbHMud2lyZWZyYW1lKTtcblx0XHRyZXR1cm4gbWVzaDtcblx0fTtcblxuXHR0aGlzLndhbGtUbyA9IChkZXN0aW5hdGlvbikgPT4ge1xuXHRcdG5ldyBUV0VFTi5Ud2VlbiggY2FtZXJhLnBvc2l0aW9uIClcblx0XHRcdC50byggZGVzdGluYXRpb24sIDIwMDAgKVxuXHRcdFx0LmVhc2luZyggVFdFRU4uRWFzaW5nLlF1YWRyYXRpYy5PdXQgKVxuXHRcdFx0Lm9uVXBkYXRlKCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNhbWVyYS5wb3NpdGlvbi5zZXQodGhpcy54LCB0aGlzLnksIHRoaXMueik7XG5cdFx0XHR9KVxuXHRcdFx0LnN0YXJ0KCk7XG5cdH07XG5cblx0dGhpcy5nZXRDYW1lcmFQb3NpdGlvbkFib3ZlID0gZnVuY3Rpb24gKHBvaW50LCAuLi5vYmplY3RzKSB7XG5cdFx0Y29uc3QgcmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3Rlcihwb2ludCwgbmV3IFRIUkVFLlZlY3RvcjMoMCwgLTEsIDApLCAwLCAyMCk7XG5cdFx0Y29uc3QgaGl0cyA9IHJheWNhc3Rlci5pbnRlcnNlY3RPYmplY3RzKG9iamVjdHMpO1xuXHRcdGlmICghaGl0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoaXRzWzBdLnBvaW50LnkgKz0gY2FtZXJhLmhlaWdodDtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoaGl0c1swXS5wb2ludCk7XG5cdFx0fVxuXHR9O1xuXG5cdHRoaXMucGlja09iamVjdHMgPSBmdW5jdGlvbihyb290LCAuLi5uYW1lc0luKSB7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0ge307XG5cdFx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0KG5hbWVzSW4pO1xuXG5cdFx0KGZ1bmN0aW9uIHBpY2tPYmplY3RzKHJvb3QpIHtcblx0XHRcdGlmIChyb290LmNoaWxkcmVuKSB7XG5cdFx0XHRcdHJvb3QuY2hpbGRyZW4uZm9yRWFjaChub2RlID0+IHtcblx0XHRcdFx0XHRpZiAobmFtZXMuaGFzKG5vZGUubmFtZSkpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rpb25bbm9kZS5uYW1lXSA9IG5vZGU7XG5cdFx0XHRcdFx0XHRuYW1lcy5kZWxldGUobm9kZS5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG5hbWVzLnNpemUpIHtcblx0XHRcdFx0XHRcdHBpY2tPYmplY3RzKG5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkocm9vdCk7XG5cblx0XHRpZiAobmFtZXMuc2l6ZSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdOb3QgYWxsIG9iamVjdHMgZm91bmQ6ICcgKyBuYW1lcy52YWx1ZXMoKS5uZXh0KCkudmFsdWUgKyAnIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29sbGVjdGlvbjtcblx0fTtcblxuXG5cdHRoaXMudXNlQ2FyZGJvYXJkID0gKCkgPT4ge1xuXG5cdFx0Y29uc3QgZWZmZWN0ID0gbmV3IFRIUkVFLlN0ZXJlb0VmZmVjdChyZW5kZXJlcik7XG5cdFx0c2V0QXNwZWN0KCk7XG5cdFx0ZWZmZWN0LmV5ZVNlcGFyYXRpb24gPSAwLjAwODtcblx0XHRlZmZlY3QuZm9jYWxMZW5ndGggPSAwLjI1O1xuXHRcdGVmZmVjdC5zZXRTaXplKCB3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0ICk7XG5cdFx0dGhpcy5yZW5kZXJNZXRob2QgPSBlZmZlY3Q7XG5cdH07XG5cblx0dGhpcy51c2VTa3kgPSAoKSA9PiB7XG5cdFx0Y29uc3Qgc2t5Qm94ID0gcmVxdWlyZSgnLi9za3knKSgpO1xuXHRcdHRoaXMuc2t5Qm94ID0gc2t5Qm94O1xuXHRcdHNjZW5lLmFkZChza3lCb3gpO1xuXHRcdHNreUJveC5zY2FsZS5tdWx0aXBseVNjYWxhcigwLjAwMDA0KTtcblx0fTtcblxuXHR0aGlzLmRldmljZU9yaWVudGF0aW9uID0gKHttYW51YWxDb250cm9sfSkgPT4ge1xuXG5cdFx0Ly8gcHJvdmlkZSBkdW1teSBlbGVtZW50IHRvIHByZXZlbnQgdG91Y2gvY2xpY2sgaGlqYWNraW5nLlxuXHRcdGNvbnN0IGVsZW1lbnQgPSBtYW51YWxDb250cm9sID8gcmVuZGVyZXIuZG9tRWxlbWVudCA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJESVZcIik7XG5cblx0XHRpZiAodGhpcy5kZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMuZGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyLmRpc2Nvbm5lY3QoKTtcblx0XHRcdHRoaXMuZGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyLmVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0dGhpcy5kZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXIuY29ubmVjdCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRldmljZU9yaWVudGF0aW9uQ29udHJvbGxlciA9IG5ldyBEZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXIoY2FtZXJhLCBlbGVtZW50KTtcblx0XHRcdHRoaXMuZGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyLmNvbm5lY3QoKTtcblx0XHRcdHRoaXMub24oJ3ByZXJlbmRlcicsICgpID0+IHRoaXMuZGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyLnVwZGF0ZSgpKTtcblx0XHR9XG5cdH07XG5cblx0dGhpcy5yZW5kZXIgPSAoKSA9PiB7XG5cblx0XHQvLyBub3RlOiB0aHJlZS5qcyBpbmNsdWRlcyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgc2hpbVxuXHRcdHRoaXMuZW1pdCgncHJlcmVuZGVyJyk7XG5cdFx0dGhpcy5yZW5kZXJNZXRob2QucmVuZGVyKHNjZW5lLCBjYW1lcmEpO1xuXHR9O1xufVxudXRpbC5pbmhlcml0cyhNeVRocmVlLCBFdmVudEVtaXR0ZXIpO1xuXG5tb2R1bGUuZXhwb3J0cy5NeVRocmVlID0gTXlUaHJlZTtcbm1vZHVsZS5leHBvcnRzLm15VGhyZWVGcm9tSlNPTiA9IG15VGhyZWVGcm9tSlNPTjtcbiIsIid1c2Ugc3RyaWN0JztcblxuY29uc3QgbXlXb3JrZXIgPSBuZXcgV29ya2VyKFwiLi9zY3JpcHRzL3ZlcmxldHdvcmtlci5qc1wiKTtcbmNvbnN0IG1lc3NhZ2VRdWV1ZSA9IFtdO1xuXG5mdW5jdGlvbiB3b3JrZXJNZXNzYWdlKG1lc3NhZ2UpIHtcblxuXHRjb25zdCBpZCA9IERhdGUubm93KCkgKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuXHQvLyBUaGlzIHdyYXBzIHRoZSBtZXNzYWdlIHBvc3RpbmcvcmVzcG9uc2UgaW4gYSBwcm9taXNlLCB3aGljaCB3aWxsIHJlc29sdmUgaWYgdGhlIHJlc3BvbnNlIGRvZXNuJ3Rcblx0Ly8gY29udGFpbiBhbiBlcnJvciwgYW5kIHJlamVjdCB3aXRoIHRoZSBlcnJvciBpZiBpdCBkb2VzLiBJZiB5b3UnZCBwcmVmZXIsIGl0J3MgcG9zc2libGUgdG8gY2FsbFxuXHQvLyBjb250cm9sbGVyLnBvc3RNZXNzYWdlKCkgYW5kIHNldCB1cCB0aGUgb25tZXNzYWdlIGhhbmRsZXIgaW5kZXBlbmRlbnRseSBvZiBhIHByb21pc2UsIGJ1dCB0aGlzIGlzXG5cdC8vIGEgY29udmVuaWVudCB3cmFwcGVyLlxuXHRyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gd29ya2VyTWVzc2FnZVByb21pc2UocmVzb2x2ZSwgcmVqZWN0KSB7XG5cdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdGlkLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHJlc29sdmUsXG5cdFx0XHRyZWplY3Rcblx0XHR9O1xuXHRcdG1lc3NhZ2VRdWV1ZS5wdXNoKGRhdGEpO1xuXHR9KTtcbn1cblxuLy8gUHJvY2VzcyBtZXNzYWdlcyBvbmNlIHBlciBmcmFtZVx0XG5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZnVuY3Rpb24gcHJvY2VzcygpIHtcblx0aWYgKG1lc3NhZ2VRdWV1ZS5sZW5ndGgpIHtcblxuXHRcdGNvbnN0IGV4dHJhY3RlZE1lc3NhZ2VzID0gbWVzc2FnZVF1ZXVlLnNwbGljZSgwKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VUb1NlbmQgPSBKU09OLnN0cmluZ2lmeShleHRyYWN0ZWRNZXNzYWdlcy5tYXAoaSA9PiAoXG5cdFx0XHR7IG1lc3NhZ2U6IGkubWVzc2FnZSwgaWQ6IGkuaWQgfVxuXHRcdCkpKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VDaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG5cdFx0bWVzc2FnZUNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZnVuY3Rpb24gcmVzb2x2ZU1lc3NhZ2VQcm9taXNlKGV2ZW50KSB7XG5cdFx0XHRtZXNzYWdlQ2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIEl0ZXJhdGUgb3ZlciB0aGUgcmVzcG9uc2VzIGFuZCByZXNvbHZlL3JlamVjdCBhY2NvcmRpbmdseVxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuXHRcdFx0cmVzcG9uc2UuZm9yRWFjaCgoZCwgaSkgPT4ge1xuXHRcdFx0XHRpZiAoZXh0cmFjdGVkTWVzc2FnZXNbaV0uaWQgIT09IGQuaWQpIHtcblx0XHRcdFx0XHR0aHJvdyBFcnJvcignSUQgTWlzbWF0Y2ghISEnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWQuZXJyb3IpIHtcblx0XHRcdFx0XHRleHRyYWN0ZWRNZXNzYWdlc1tpXS5yZXNvbHZlKGQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGV4dHJhY3RlZE1lc3NhZ2VzW2ldLnJlamVjdChkLmVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRteVdvcmtlci5wb3N0TWVzc2FnZShtZXNzYWdlVG9TZW5kLCBbbWVzc2FnZUNoYW5uZWwucG9ydDJdKTtcblx0fVxuXHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUocHJvY2Vzcyk7XG59KTtcblxuY2xhc3MgVmVybGV0IHtcblx0aW5pdChvcHRpb25zKSB7XG5cdFx0cmV0dXJuIHdvcmtlck1lc3NhZ2Uoe2FjdGlvbjogJ2luaXQnLCBvcHRpb25zfSk7XG5cdH1cblxuXHRnZXRQb2ludHMoKSB7XG5cdFx0cmV0dXJuIHdvcmtlck1lc3NhZ2Uoe2FjdGlvbjogJ2dldFBvaW50cyd9KVxuXHRcdFx0LnRoZW4oZSA9PiBlLnBvaW50cyk7XG5cdH1cblxuXHRhZGRQb2ludChwb2ludE9wdGlvbnMpIHtcblx0XHRyZXR1cm4gd29ya2VyTWVzc2FnZSh7YWN0aW9uOiAnYWRkUG9pbnQnLCBwb2ludE9wdGlvbnN9KTtcblx0fVxuXG5cdHVwZGF0ZVBvaW50KHBvaW50T3B0aW9ucykge1xuXHRcdHJldHVybiB3b3JrZXJNZXNzYWdlKHthY3Rpb246ICd1cGRhdGVQb2ludCcsIHBvaW50T3B0aW9uc30pO1xuXHR9XG5cblx0Y29ubmVjdFBvaW50cyhwMSwgcDIsIGNvbnN0cmFpbnRPcHRpb25zKSB7XG5cdFx0cmV0dXJuIHdvcmtlck1lc3NhZ2Uoe2FjdGlvbjogJ2Nvbm5lY3RQb2ludHMnLCBvcHRpb25zOiB7cDEsIHAyLCBjb25zdHJhaW50T3B0aW9uc319KTtcblx0fVxuXG5cdHVwZGF0ZUNvbnN0cmFpbnQob3B0aW9ucykge1xuXHRcdHJldHVybiB3b3JrZXJNZXNzYWdlKHthY3Rpb246ICd1cGRhdGVDb25zdHJhaW50Jywgb3B0aW9ucyB9KTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHJldHVybiB3b3JrZXJNZXNzYWdlKHthY3Rpb246ICdyZXNldCd9KTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFZlcmxldDtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBWUlRhcmdldDtcblxuZnVuY3Rpb24gY3NzKG5vZGUsIHByb3BzKSB7XG5cdGZ1bmN0aW9uIHVuaXRzKHByb3AsIGkpIHtcblx0XHRpZiAodHlwZW9mIGkgPT09IFwibnVtYmVyXCIpIHtcblx0XHRcdGlmIChwcm9wLm1hdGNoKC93aWR0aHxoZWlnaHR8dG9wfGxlZnR8cmlnaHR8Ym90dG9tLykpIHtcblx0XHRcdFx0cmV0dXJuIGkgKyBcInB4XCI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpO1xuXHR9XG5cdGZvciAobGV0IG4gaW4gcHJvcHMpIHtcblx0XHRpZiAocHJvcHMuaGFzT3duUHJvcGVydHkobikpIHtcblx0XHRcdG5vZGUuc3R5bGVbbl0gPSB1bml0cyhuLCBwcm9wc1tuXSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBub2RlO1xufVxuXG5mdW5jdGlvbiBWUlRhcmdldChwYXJlbnQpIHtcblxuXHQvLyBDcmVhdGUgaWZyYW1lIGFuZCBhZGQgaXQgdG8gdGhlIGRvY1xuXHRjb25zdCBpZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcblx0Y3NzKGlmcmFtZSwge1xuXHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdGxlZnQ6IDAsXG5cdFx0cmlnaHQ6IDAsXG5cdFx0dG9wOiAwLFxuXHRcdGJvdHRvbTogMCxcblx0XHR3aWR0aDogJzEwMCUnLFxuXHRcdGhlaWdodDogJzEwMCUnLFxuXHRcdGJvcmRlcjogJ25vbmUnXG5cdH0pO1xuXHRpZnJhbWUuc2V0QXR0cmlidXRlKCdzZWFtbGVzcycsICdzZWFtbGVzcycpO1xuXHRpZnJhbWUuc2V0QXR0cmlidXRlKCdtb3picm93c2VyJywgJzEnKTtcblx0aWZyYW1lLnNldEF0dHJpYnV0ZSgnc2FuZGJveCcsICdhbGxvdy1zYW1lLW9yaWdpbiBhbGxvdy1zY3JpcHRzJyk7XG5cdHRoaXMuaWZyYW1lID0gaWZyYW1lO1xuXHR0aGlzLnBhcmVudCA9IHBhcmVudCB8fCBkb2N1bWVudC5ib2R5O1xuXHR0aGlzLnBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5pZnJhbWUsIHRoaXMucGFyZW50LmZpcnN0Q2hpbGQpO1xufVxuXG5WUlRhcmdldC5wcm90b3R5cGUubG9hZCA9IGZ1bmN0aW9uICh1cmwpIHtcblx0dGhpcy5pZnJhbWUuc3JjID0gdXJsO1xuXHRyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcblx0XHR0aGlzLmlmcmFtZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgcmVzb2x2ZSk7XG5cdH0uYmluZCh0aGlzKSk7XG59O1xuXG5WUlRhcmdldC5wcm90b3R5cGUudW5sb2FkID0gZnVuY3Rpb24gKHVybCkge1xuXHR0aGlzLmlmcmFtZS5zcmMgPSAnYWJvdXQ6YmxhbmsnO1xufTtcblxuXG5WUlRhcmdldC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICh1cmwpIHtcblx0dGhpcy5wYXJlbnQucmVtb3ZlQ2hpbGQodGhpcy5pZnJhbWUpO1xuXHR0aGlzLmlmcmFtZSA9IG51bGw7XG59O1xuIiwiLypnbG9iYWwgVEhSRUUqL1xuJ3VzZSBzdHJpY3QnO1xuY29uc3QgYWRkU2NyaXB0ID0gcmVxdWlyZSgnLi9saWIvbG9hZFNjcmlwdCcpOyAvLyBQcm9taXNlIHdyYXBwZXIgZm9yIHNjcmlwdCBsb2FkaW5nXG5jb25zdCBWZXJsZXRXcmFwcGVyID0gcmVxdWlyZSgnLi9saWIvdmVybGV0d3JhcHBlcicpOyAvLyBXcmFwcGVyIG9mIHRoZSB2ZXJsZXQgd29ya2VyXG5jb25zdCBWUlRhcmdldCA9IHJlcXVpcmUoJy4vbGliL3ZydGFyZ2V0Jyk7IC8vIEFwcGVuZCBpZnJhbWVzIHRvIHRoZSBwYWdlIGFuZCBwcm92aWRlIGEgY29udHJvbCBpbnRlcmZhY2VcbmNvbnN0IHRleHRTcHJpdGUgPSByZXF1aXJlKCcuL2xpYi90ZXh0U3ByaXRlJyk7IC8vIEdlbmVyYWxseSBzcHJpdGVzIGZyb20gY2FudmFzXG5jb25zdCBHb1RhcmdldFdvcmxkID0gcmVxdWlyZSgnLi9saWIvZ290YXJnZXRzLmpzJyk7IC8vIFRvb2wgZm9yIG1ha2luZyBpbnRlcmFjdGl2ZSBWUiBlbGVtZW50c1xuY29uc3QgVFdFRU4gPSByZXF1aXJlKCd0d2Vlbi5qcycpO1xuXG5jb25zdCBTVEFURV9QQVVTRUQgPSAwO1xuY29uc3QgU1RBVEVfUExBWUlORyA9IDE7XG5cbmNvbnN0IFNUQVRFX0hVQl9PUEVOID0gMDtcbmNvbnN0IFNUQVRFX0hVQl9DTE9TRUQgPSAxO1xuXG5sZXQgYW5pbVN0YXRlID0gU1RBVEVfUExBWUlORztcbmxldCBodWJTdGF0ZSA9IFNUQVRFX0hVQl9PUEVOO1xuXG4vLyBubyBoc3RzIHNvIGp1c3QgcmVkaXJlY3QgdG8gaHR0cHNcbmlmICh3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIgJiYgd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lICE9PSAnbG9jYWxob3N0Jykge1xuICAgd2luZG93LmxvY2F0aW9uLnByb3RvY29sID0gXCJodHRwczpcIjtcbn1cblxuZnVuY3Rpb24gc2VydmljZVdvcmtlcigpIHtcblxuXHRyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcblxuXHRcdC8vIFN0YXJ0IHNlcnZpY2Ugd29ya2VyXG5cdFx0aWYgKCdzZXJ2aWNlV29ya2VyJyBpbiBuYXZpZ2F0b3IpIHtcblxuXHRcdFx0aWYgKG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLmNvbnRyb2xsZXIpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ09mZmxpbmluZyBBdmFpbGJsZScpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5yZWdpc3RlcignLi9zdy5qcycpXG5cdFx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlZykge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKCdzdyByZWdpc3RlcmVkJywgcmVnKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0LnRoZW4ocmVzb2x2ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ05vIFNlcnZpY2UgV29ya2VyLCBhc3NldHMgbWF5IG5vdCBiZSBjYWNoZWQnKTtcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9XG5cdH0pO1xufVxuXG5zZXJ2aWNlV29ya2VyKClcbi50aGVuKCgpID0+IFByb21pc2UuYWxsKFtcblx0YWRkU2NyaXB0KCdodHRwczovL3BvbHlmaWxsLndlYnNlcnZpY2VzLmZ0LmNvbS92MS9wb2x5ZmlsbC5taW4uanM/ZmVhdHVyZXM9ZmV0Y2gsZGVmYXVsdCcpLFxuXHRhZGRTY3JpcHQoJ2h0dHBzOi8vY2RuanMuY2xvdWRmbGFyZS5jb20vYWpheC9saWJzL3RocmVlLmpzL3I3My90aHJlZS5taW4uanMnKVxuXSkpXG4udGhlbigoKSA9PiBQcm9taXNlLmFsbChbXG5cdGFkZFNjcmlwdCgnaHR0cHM6Ly9jZG4ucmF3Z2l0LmNvbS9tcmRvb2IvdGhyZWUuanMvbWFzdGVyL2V4YW1wbGVzL2pzL2VmZmVjdHMvU3RlcmVvRWZmZWN0LmpzJyksXG5cdGFkZFNjcmlwdCgnaHR0cHM6Ly9jZG4ucmF3Z2l0LmNvbS9tcmRvb2IvdGhyZWUuanMvbWFzdGVyL2V4YW1wbGVzL2pzL1NreVNoYWRlci5qcycpLFxuXHRhZGRTY3JpcHQoJ2h0dHBzOi8vY2RuLnJhd2dpdC5jb20vcmljaHRyL3RocmVlVlIvbWFzdGVyL2pzL0RldmljZU9yaWVudGF0aW9uQ29udHJvbGxlci5qcycpXG5dKSlcbi50aGVuKCgpID0+IHJlcXVpcmUoJy4vbGliL3RocmVlJykubXlUaHJlZUZyb21KU09OKCdodWInKSlcbi50aGVuKHRocmVlID0+IHtcblx0Y29uc29sZS5sb2coJ1JlYWR5Jyk7XG5cblx0Y29uc3QgZnJhbWUgPSBuZXcgVlJUYXJnZXQoKTsgLy8gU2V0dXAgaWZyYW1lIGZvciBsb2FkaW5nIHNpdGVzIGludG9cblxuXHR0aHJlZS5kZXZpY2VPcmllbnRhdGlvbih7bWFudWFsQ29udHJvbDogdHJ1ZX0pOyAvLyBBbGxvdyBjbGlja2luZyBhbmQgZHJhZ2dpbmdcblxuXHRjb25zdCBnb1RhcmdldFdvcmxkID0gbmV3IEdvVGFyZ2V0V29ybGQodGhyZWUpO1xuXG5cdHRocmVlLnVzZVNreSgpO1xuXHR0aHJlZS51c2VDYXJkYm9hcmQoKTtcblxuXHRjb25zdCBkb21lID0gdGhyZWUucGlja09iamVjdHModGhyZWUuc2NlbmUsICdkb21lJykuZG9tZTtcblx0ZG9tZS5tYXRlcmlhbCA9IHRocmVlLm1hdGVyaWFscy5ib3JpbmcyO1xuXHR0aHJlZS5zY2VuZS5yZW1vdmUoZG9tZSk7XG5cblx0Y29uc3QgZ3JpZCA9IG5ldyBUSFJFRS5HcmlkSGVscGVyKCAxMCwgMSApO1xuXHRncmlkLnNldENvbG9ycyggMHhmZjAwMDAsIDB4ZmZmZmZmICk7XG5cdHRocmVlLnNjZW5lLmFkZCggZ3JpZCApO1xuXG5cdC8vIEJyYW5kIGxpZ2h0c1xuXHRjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KCAweGMwYjliYiApO1xuXHR0aHJlZS5zY2VuZS5hZGQoIGFtYmllbnRMaWdodCApO1xuXG5cdGNvbnN0IHBMaWdodDAgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCggMHhDMEI5QkIsIDAuNSApO1xuXHRwTGlnaHQwLnBvc2l0aW9uLnNldCggMCwgMSwgMyApO1xuXHR0aHJlZS5zY2VuZS5hZGQoIHBMaWdodDAgKTtcblxuXHRjb25zdCBwTGlnaHQxID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoIDB4RjlDQ0ZGLCAwLjUgKTtcblx0cExpZ2h0MS5wb3NpdGlvbi5zZXQoIDgsIC0zLCAwICk7XG5cdHRocmVlLnNjZW5lLmFkZCggcExpZ2h0MSApO1xuXG5cdGNvbnN0IHBMaWdodDIgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCggMHhFM0ZGQUUsIDAuNSApO1xuXHRwTGlnaHQyLnBvc2l0aW9uLnNldCggLTgsIC0zLCAtMyApO1xuXHR0aHJlZS5zY2VuZS5hZGQoIHBMaWdodDIgKTtcblxuXHQvLyBSdW4gdGhlIHZlcmxldCBwaHlzaWNzXG5cdGNvbnN0IHZlcmxldCA9IG5ldyBWZXJsZXRXcmFwcGVyKCk7XG5cdHZlcmxldC5pbml0KHtcblx0XHRzaXplOiB7XG5cdFx0XHR4OiAyMCxcblx0XHRcdHk6IDIwLFxuXHRcdFx0ejogMjAsXG5cdFx0fSxcblx0XHRncmF2aXR5OiB0cnVlXG5cdH0pXG5cdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcblx0XHRsZXQgd2FpdGluZ0ZvclBvaW50cyA9IGZhbHNlO1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBhbmltYXRlKHRpbWUpIHtcblx0XHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcblx0XHRcdGlmIChhbmltU3RhdGUgIT09IFNUQVRFX1BMQVlJTkcpIHJldHVybjtcblx0XHRcdGlmICghd2FpdGluZ0ZvclBvaW50cykge1xuXHRcdFx0XHR2ZXJsZXQuZ2V0UG9pbnRzKCkudGhlbihwb2ludHMgPT4ge1xuXHRcdFx0XHRcdHRocmVlLnVwZGF0ZU9iamVjdHMocG9pbnRzKTtcblx0XHRcdFx0XHR3YWl0aW5nRm9yUG9pbnRzID0gZmFsc2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR3YWl0aW5nRm9yUG9pbnRzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRocmVlLnJlbmRlcigpO1xuXHRcdFx0VFdFRU4udXBkYXRlKHRpbWUpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWFwID0gVEhSRUUuSW1hZ2VVdGlscy5sb2FkVGV4dHVyZSggXCJpbWFnZXMvcmV0aWN1bGUucG5nXCIgKTtcblx0XHRjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5TcHJpdGVNYXRlcmlhbCggeyBtYXA6IG1hcCwgY29sb3I6IDB4ZmZmZmZmLCBmb2c6IGZhbHNlLCB0cmFuc3BhcmVudDogdHJ1ZSB9ICk7XG5cdFx0Y29uc3Qgc3ByaXRlID0gbmV3IFRIUkVFLlNwcml0ZShtYXRlcmlhbCk7XG5cdFx0dGhyZWUuaHVkLmFkZChzcHJpdGUpO1xuXG5cdFx0ZnVuY3Rpb24gbG9hZERvYyh1cmwpIHtcblxuXHRcdFx0Ly8gRGlzcGxheSB0aGUgbG9hZGluZyBncmFwaGljXG5cblx0XHRcdC8vIEdldCB0aGUgZnJhbWUgdG8gc2hvdyBcblx0XHRcdHJldHVybiBmcmFtZS5sb2FkKHVybClcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0Ly8gcmVtb3ZlIHRoZSBsb2FkaW5nIGdyYXBoaWNcblx0XHRcdFx0Y29uc29sZS5sb2coJ2xvYWRlZCAlcycsIHVybCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiByZW1vdmVEb2MoKSB7XG5cdFx0XHRmcmFtZS51bmxvYWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBhZGRCdXR0b24oc3RyKSB7XG5cdFx0XHRjb25zdCBzcHJpdGUgPSB0ZXh0U3ByaXRlKHN0ciwge1xuXHRcdFx0XHRmb250c2l6ZTogMTgsXG5cdFx0XHRcdGZvbnRmYWNlOiAnSWNlbGFuZCcsXG5cdFx0XHRcdGJvcmRlclRoaWNrbmVzczogMjBcblx0XHRcdH0pO1xuXHRcdFx0dGhyZWUuc2NlbmUuYWRkKHNwcml0ZSk7XG5cdFx0XHRzcHJpdGUucG9zaXRpb24uc2V0KDUsNSw1KTtcblx0XHRcdHNwcml0ZS5tYXRlcmlhbC50cmFuc3BhcmVudCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gZ29UYXJnZXRXb3JsZC5tYWtlVGFyZ2V0KHNwcml0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHVwIHRoZSBkb21lIGJyZWFraW5nIGRvd24gYW5kIGJ1aWxkaW5nIGJhY2tcblx0XHRyZXF1aXJlKCcuL2xpYi9leHBsb2RlRG9tZScpKGRvbWUsIHRocmVlLCB2ZXJsZXQpXG5cdFx0LnRoZW4oZG9tZUNvbnRyb2xsZXIgPT4ge1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RibGNsaWNrJywgKCkgPT4gZG9tZUNvbnRyb2xsZXIudG9nZ2xlKCkpO1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgKCkgPT4gZG9tZUNvbnRyb2xsZXIudG9nZ2xlKCkpO1xuXG5cdFx0XHRmdW5jdGlvbiB0d2VlbkRvbWVPcGFjaXR5KG9wYWNpdHksIHRpbWUgPSAxMDAwKSB7XG5cdFx0XHRcdGlmIChvcGFjaXR5ICE9PSB1bmRlZmluZWQgJiYgb3BhY2l0eSAhPT0gZG9tZS5tYXRlcmlhbC5vcGFjaXR5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gbmV3IFRXRUVOLlR3ZWVuKGRvbWUubWF0ZXJpYWwpXG5cdFx0XHRcdFx0ICAgIC50byh7IG9wYWNpdHkgfSwgdGltZSlcblx0XHRcdFx0XHQgICAgLmVhc2luZyhUV0VFTi5FYXNpbmcuQ3ViaWMuT3V0KVxuXHRcdFx0XHRcdCAgICAuc3RhcnQoKVxuXHRcdFx0XHRcdCAgICAub25Db21wbGV0ZShyZXNvbHZlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIHNob3dEb2N1bWVudCh1cmwpIHtcblx0XHRcdFx0aHViU3RhdGUgPSBTVEFURV9IVUJfQ0xPU0VEO1xuXHRcdFx0XHR0d2VlbkRvbWVPcGFjaXR5KDEpXG5cdFx0XHRcdC50aGVuKCgpID0+IHRocmVlLnNreUJveC52aXNpYmxlID0gZmFsc2UpXG5cdFx0XHRcdC50aGVuKCgpID0+IGxvYWREb2ModXJsKSlcblx0XHRcdFx0LnRoZW4oKCkgPT4gZG9tZUNvbnRyb2xsZXIuZGVzdHJveSgpKVxuXHRcdFx0XHQudGhlbigoKSA9PiB0d2VlbkRvbWVPcGFjaXR5KDAsIDQwMDApKVxuXHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGh1YlN0YXRlID09PSBTVEFURV9IVUJfQ0xPU0VEKSB7XG5cdFx0XHRcdFx0XHR0aHJlZS5kb21FbGVtZW50LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG5cdFx0XHRcdFx0XHRkb21lQ29udHJvbGxlci5tZXNoLnZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGFuaW1TdGF0ZSA9IFNUQVRFX1BBVVNFRDtcblx0XHRcdFx0XHRcdHRocmVlLnNjZW5lLnZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRocmVlLnJlbmRlcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGNsb3NlRG9jdW1lbnQoKSB7XG5cdFx0XHRcdHRocmVlLnNjZW5lLnZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRodWJTdGF0ZSA9IFNUQVRFX0hVQl9PUEVOO1xuXHRcdFx0XHRjb25zb2xlLmxvZyhhbmltU3RhdGUpO1xuXHRcdFx0XHRhbmltU3RhdGUgPSBTVEFURV9QTEFZSU5HO1xuXHRcdFx0XHRkb21lQ29udHJvbGxlci5tZXNoLnZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRQcm9taXNlLmFsbChbZG9tZUNvbnRyb2xsZXIucmVzdG9yZSgpLCB0d2VlbkRvbWVPcGFjaXR5KDEsIDIwMDApXSlcblx0XHRcdFx0LnRoZW4oKCkgPT4gcmVtb3ZlRG9jKCkpXG5cdFx0XHRcdC50aGVuKCgpID0+IHRocmVlLmRvbUVsZW1lbnQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdhdXRvJylcblx0XHRcdFx0LnRoZW4oKCkgPT4gdGhyZWUuc2t5Qm94LnZpc2libGUgPSB0cnVlKVxuXHRcdFx0XHQudGhlbigoKSA9PiB0d2VlbkRvbWVPcGFjaXR5KDAuMikpO1xuXHRcdFx0fVxuXG5cdFx0XHR3aW5kb3cuc2hvd0RvY3VtZW50ID0gc2hvd0RvY3VtZW50O1xuXHRcdFx0d2luZG93LmNsb3NlRG9jdW1lbnQgPSBjbG9zZURvY3VtZW50O1xuXHRcdFx0XG5cdFx0XHRjb25zdCBsaWdodEhvdXNlRGVtb0J1dHRvbiA9IGFkZEJ1dHRvbignTG9hZCBEZW1vJyk7XG5cdFx0XHRsaWdodEhvdXNlRGVtb0J1dHRvbi5vbignY2xpY2snLCAoKSA9PiBzaG93RG9jdW1lbnQoJ2h0dHBzOi8vYWRhcm9zZWVkd2FyZHMuZ2l0aHViLmlvL2NhcmRib2FyZDIvaW5kZXguaHRtbCN2cicpKTtcblxuXHRcdH0pO1x0XG5cblx0XHRmdW5jdGlvbiByZXNldCgpIHtcblx0XHRcdHRocmVlLmNhbWVyYS5wb3NpdGlvbi5zZXQoMCwgdGhyZWUuY2FtZXJhLmhlaWdodCwgMCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IGluaXRpYWwgcHJvcGVydGllc1xuXHRcdHJlc2V0KCk7XG5cdFx0d2luZG93LnRocmVlID0gdGhyZWU7XG5cdH0pO1xufSk7XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIGFyZyAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0J1xuICAgICYmIHR5cGVvZiBhcmcuY29weSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcuZmlsbCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcucmVhZFVJbnQ4ID09PSAnZnVuY3Rpb24nO1xufSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgZm9ybWF0UmVnRXhwID0gLyVbc2RqJV0vZztcbmV4cG9ydHMuZm9ybWF0ID0gZnVuY3Rpb24oZikge1xuICBpZiAoIWlzU3RyaW5nKGYpKSB7XG4gICAgdmFyIG9iamVjdHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgb2JqZWN0cy5wdXNoKGluc3BlY3QoYXJndW1lbnRzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcbiAgdmFyIHN0ciA9IFN0cmluZyhmKS5yZXBsYWNlKGZvcm1hdFJlZ0V4cCwgZnVuY3Rpb24oeCkge1xuICAgIGlmICh4ID09PSAnJSUnKSByZXR1cm4gJyUnO1xuICAgIGlmIChpID49IGxlbikgcmV0dXJuIHg7XG4gICAgc3dpdGNoICh4KSB7XG4gICAgICBjYXNlICclcyc6IHJldHVybiBTdHJpbmcoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVkJzogcmV0dXJuIE51bWJlcihhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWonOlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmdzW2krK10pO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICB9KTtcbiAgZm9yICh2YXIgeCA9IGFyZ3NbaV07IGkgPCBsZW47IHggPSBhcmdzWysraV0pIHtcbiAgICBpZiAoaXNOdWxsKHgpIHx8ICFpc09iamVjdCh4KSkge1xuICAgICAgc3RyICs9ICcgJyArIHg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciArPSAnICcgKyBpbnNwZWN0KHgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RyO1xufTtcblxuXG4vLyBNYXJrIHRoYXQgYSBtZXRob2Qgc2hvdWxkIG5vdCBiZSB1c2VkLlxuLy8gUmV0dXJucyBhIG1vZGlmaWVkIGZ1bmN0aW9uIHdoaWNoIHdhcm5zIG9uY2UgYnkgZGVmYXVsdC5cbi8vIElmIC0tbm8tZGVwcmVjYXRpb24gaXMgc2V0LCB0aGVuIGl0IGlzIGEgbm8tb3AuXG5leHBvcnRzLmRlcHJlY2F0ZSA9IGZ1bmN0aW9uKGZuLCBtc2cpIHtcbiAgLy8gQWxsb3cgZm9yIGRlcHJlY2F0aW5nIHRoaW5ncyBpbiB0aGUgcHJvY2VzcyBvZiBzdGFydGluZyB1cC5cbiAgaWYgKGlzVW5kZWZpbmVkKGdsb2JhbC5wcm9jZXNzKSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlcHJlY2F0ZShmbiwgbXNnKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuICBpZiAocHJvY2Vzcy5ub0RlcHJlY2F0aW9uID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuO1xuICB9XG5cbiAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBkZXByZWNhdGVkKCkge1xuICAgIGlmICghd2FybmVkKSB7XG4gICAgICBpZiAocHJvY2Vzcy50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLnRyYWNlRGVwcmVjYXRpb24pIHtcbiAgICAgICAgY29uc29sZS50cmFjZShtc2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihtc2cpO1xuICAgICAgfVxuICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICByZXR1cm4gZGVwcmVjYXRlZDtcbn07XG5cblxudmFyIGRlYnVncyA9IHt9O1xudmFyIGRlYnVnRW52aXJvbjtcbmV4cG9ydHMuZGVidWdsb2cgPSBmdW5jdGlvbihzZXQpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKGRlYnVnRW52aXJvbikpXG4gICAgZGVidWdFbnZpcm9uID0gcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyB8fCAnJztcbiAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gIGlmICghZGVidWdzW3NldF0pIHtcbiAgICBpZiAobmV3IFJlZ0V4cCgnXFxcXGInICsgc2V0ICsgJ1xcXFxiJywgJ2knKS50ZXN0KGRlYnVnRW52aXJvbikpIHtcbiAgICAgIHZhciBwaWQgPSBwcm9jZXNzLnBpZDtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtc2cgPSBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCclcyAlZDogJXMnLCBzZXQsIHBpZCwgbXNnKTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlYnVnc1tzZXRdO1xufTtcblxuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBPcHRpb25hbCBvcHRpb25zIG9iamVjdCB0aGF0IGFsdGVycyB0aGUgb3V0cHV0LlxuICovXG4vKiBsZWdhY3k6IG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycyovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgb3B0cykge1xuICAvLyBkZWZhdWx0IG9wdGlvbnNcbiAgdmFyIGN0eCA9IHtcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBzdHlsaXplTm9Db2xvclxuICB9O1xuICAvLyBsZWdhY3kuLi5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykgY3R4LmRlcHRoID0gYXJndW1lbnRzWzJdO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSA0KSBjdHguY29sb3JzID0gYXJndW1lbnRzWzNdO1xuICBpZiAoaXNCb29sZWFuKG9wdHMpKSB7XG4gICAgLy8gbGVnYWN5Li4uXG4gICAgY3R4LnNob3dIaWRkZW4gPSBvcHRzO1xuICB9IGVsc2UgaWYgKG9wdHMpIHtcbiAgICAvLyBnb3QgYW4gXCJvcHRpb25zXCIgb2JqZWN0XG4gICAgZXhwb3J0cy5fZXh0ZW5kKGN0eCwgb3B0cyk7XG4gIH1cbiAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LnNob3dIaWRkZW4pKSBjdHguc2hvd0hpZGRlbiA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmRlcHRoKSkgY3R4LmRlcHRoID0gMjtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jb2xvcnMpKSBjdHguY29sb3JzID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY3VzdG9tSW5zcGVjdCkpIGN0eC5jdXN0b21JbnNwZWN0ID0gdHJ1ZTtcbiAgaWYgKGN0eC5jb2xvcnMpIGN0eC5zdHlsaXplID0gc3R5bGl6ZVdpdGhDb2xvcjtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCBjdHguZGVwdGgpO1xufVxuZXhwb3J0cy5pbnNwZWN0ID0gaW5zcGVjdDtcblxuXG4vLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjZ3JhcGhpY3Ncbmluc3BlY3QuY29sb3JzID0ge1xuICAnYm9sZCcgOiBbMSwgMjJdLFxuICAnaXRhbGljJyA6IFszLCAyM10sXG4gICd1bmRlcmxpbmUnIDogWzQsIDI0XSxcbiAgJ2ludmVyc2UnIDogWzcsIDI3XSxcbiAgJ3doaXRlJyA6IFszNywgMzldLFxuICAnZ3JleScgOiBbOTAsIDM5XSxcbiAgJ2JsYWNrJyA6IFszMCwgMzldLFxuICAnYmx1ZScgOiBbMzQsIDM5XSxcbiAgJ2N5YW4nIDogWzM2LCAzOV0sXG4gICdncmVlbicgOiBbMzIsIDM5XSxcbiAgJ21hZ2VudGEnIDogWzM1LCAzOV0sXG4gICdyZWQnIDogWzMxLCAzOV0sXG4gICd5ZWxsb3cnIDogWzMzLCAzOV1cbn07XG5cbi8vIERvbid0IHVzZSAnYmx1ZScgbm90IHZpc2libGUgb24gY21kLmV4ZVxuaW5zcGVjdC5zdHlsZXMgPSB7XG4gICdzcGVjaWFsJzogJ2N5YW4nLFxuICAnbnVtYmVyJzogJ3llbGxvdycsXG4gICdib29sZWFuJzogJ3llbGxvdycsXG4gICd1bmRlZmluZWQnOiAnZ3JleScsXG4gICdudWxsJzogJ2JvbGQnLFxuICAnc3RyaW5nJzogJ2dyZWVuJyxcbiAgJ2RhdGUnOiAnbWFnZW50YScsXG4gIC8vIFwibmFtZVwiOiBpbnRlbnRpb25hbGx5IG5vdCBzdHlsaW5nXG4gICdyZWdleHAnOiAncmVkJ1xufTtcblxuXG5mdW5jdGlvbiBzdHlsaXplV2l0aENvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHZhciBzdHlsZSA9IGluc3BlY3Quc3R5bGVzW3N0eWxlVHlwZV07XG5cbiAgaWYgKHN0eWxlKSB7XG4gICAgcmV0dXJuICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMF0gKyAnbScgKyBzdHIgK1xuICAgICAgICAgICAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzFdICsgJ20nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBzdHlsaXplTm9Db2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICByZXR1cm4gc3RyO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5KSB7XG4gIHZhciBoYXNoID0ge307XG5cbiAgYXJyYXkuZm9yRWFjaChmdW5jdGlvbih2YWwsIGlkeCkge1xuICAgIGhhc2hbdmFsXSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiBoYXNoO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAoY3R4LmN1c3RvbUluc3BlY3QgJiZcbiAgICAgIHZhbHVlICYmXG4gICAgICBpc0Z1bmN0aW9uKHZhbHVlLmluc3BlY3QpICYmXG4gICAgICAvLyBGaWx0ZXIgb3V0IHRoZSB1dGlsIG1vZHVsZSwgaXQncyBpbnNwZWN0IGZ1bmN0aW9uIGlzIHNwZWNpYWxcbiAgICAgIHZhbHVlLmluc3BlY3QgIT09IGV4cG9ydHMuaW5zcGVjdCAmJlxuICAgICAgLy8gQWxzbyBmaWx0ZXIgb3V0IGFueSBwcm90b3R5cGUgb2JqZWN0cyB1c2luZyB0aGUgY2lyY3VsYXIgY2hlY2suXG4gICAgICAhKHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLnByb3RvdHlwZSA9PT0gdmFsdWUpKSB7XG4gICAgdmFyIHJldCA9IHZhbHVlLmluc3BlY3QocmVjdXJzZVRpbWVzLCBjdHgpO1xuICAgIGlmICghaXNTdHJpbmcocmV0KSkge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIExvb2sgdXAgdGhlIGtleXMgb2YgdGhlIG9iamVjdC5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIHZhciB2aXNpYmxlS2V5cyA9IGFycmF5VG9IYXNoKGtleXMpO1xuXG4gIGlmIChjdHguc2hvd0hpZGRlbikge1xuICAgIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gIH1cblxuICAvLyBJRSBkb2Vzbid0IG1ha2UgZXJyb3IgZmllbGRzIG5vbi1lbnVtZXJhYmxlXG4gIC8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9pZS9kd3c1MnNidCh2PXZzLjk0KS5hc3B4XG4gIGlmIChpc0Vycm9yKHZhbHVlKVxuICAgICAgJiYgKGtleXMuaW5kZXhPZignbWVzc2FnZScpID49IDAgfHwga2V5cy5pbmRleE9mKCdkZXNjcmlwdGlvbicpID49IDApKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICB2YXIgbmFtZSA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbRnVuY3Rpb24nICsgbmFtZSArICddJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9XG4gICAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShEYXRlLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ2RhdGUnKTtcbiAgICB9XG4gICAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBiYXNlID0gJycsIGFycmF5ID0gZmFsc2UsIGJyYWNlcyA9IFsneycsICd9J107XG5cbiAgLy8gTWFrZSBBcnJheSBzYXkgdGhhdCB0aGV5IGFyZSBBcnJheVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBhcnJheSA9IHRydWU7XG4gICAgYnJhY2VzID0gWydbJywgJ10nXTtcbiAgfVxuXG4gIC8vIE1ha2UgZnVuY3Rpb25zIHNheSB0aGF0IHRoZXkgYXJlIGZ1bmN0aW9uc1xuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICB2YXIgbiA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgIGJhc2UgPSAnIFtGdW5jdGlvbicgKyBuICsgJ10nO1xuICB9XG5cbiAgLy8gTWFrZSBSZWdFeHBzIHNheSB0aGF0IHRoZXkgYXJlIFJlZ0V4cHNcbiAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBkYXRlcyB3aXRoIHByb3BlcnRpZXMgZmlyc3Qgc2F5IHRoZSBkYXRlXG4gIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBlcnJvciB3aXRoIG1lc3NhZ2UgZmlyc3Qgc2F5IHRoZSBlcnJvclxuICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwICYmICghYXJyYXkgfHwgdmFsdWUubGVuZ3RoID09IDApKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyBicmFjZXNbMV07XG4gIH1cblxuICBpZiAocmVjdXJzZVRpbWVzIDwgMCkge1xuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW09iamVjdF0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuXG4gIGN0eC5zZWVuLnB1c2godmFsdWUpO1xuXG4gIHZhciBvdXRwdXQ7XG4gIGlmIChhcnJheSkge1xuICAgIG91dHB1dCA9IGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpO1xuICB9IGVsc2Uge1xuICAgIG91dHB1dCA9IGtleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpO1xuICAgIH0pO1xuICB9XG5cbiAgY3R4LnNlZW4ucG9wKCk7XG5cbiAgcmV0dXJuIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSkge1xuICBpZiAoaXNVbmRlZmluZWQodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpICsgJ1xcJyc7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuICB9XG4gIGlmIChpc051bWJlcih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdudW1iZXInKTtcbiAgaWYgKGlzQm9vbGVhbih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdib29sZWFuJyk7XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKGlzTnVsbCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eSh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyLCBkZXNjO1xuICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih2YWx1ZSwga2V5KSB8fCB7IHZhbHVlOiB2YWx1ZVtrZXldIH07XG4gIGlmIChkZXNjLmdldCkge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tTZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFoYXNPd25Qcm9wZXJ0eSh2aXNpYmxlS2V5cywga2V5KSkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZihkZXNjLnZhbHVlKSA8IDApIHtcbiAgICAgIGlmIChpc051bGwocmVjdXJzZVRpbWVzKSkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmIChpc1VuZGVmaW5lZChuYW1lKSkge1xuICAgIGlmIChhcnJheSAmJiBrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgICBuYW1lID0gSlNPTi5zdHJpbmdpZnkoJycgKyBrZXkpO1xuICAgIGlmIChuYW1lLm1hdGNoKC9eXCIoW2EtekEtWl9dW2EtekEtWl8wLTldKilcIiQvKSkge1xuICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyKDEsIG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ25hbWUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyheXCJ8XCIkKS9nLCBcIidcIik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ3N0cmluZycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuYW1lICsgJzogJyArIHN0cjtcbn1cblxuXG5mdW5jdGlvbiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcykge1xuICB2YXIgbnVtTGluZXNFc3QgPSAwO1xuICB2YXIgbGVuZ3RoID0gb3V0cHV0LnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXIpIHtcbiAgICBudW1MaW5lc0VzdCsrO1xuICAgIGlmIChjdXIuaW5kZXhPZignXFxuJykgPj0gMCkgbnVtTGluZXNFc3QrKztcbiAgICByZXR1cm4gcHJldiArIGN1ci5yZXBsYWNlKC9cXHUwMDFiXFxbXFxkXFxkP20vZywgJycpLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuXG4vLyBOT1RFOiBUaGVzZSB0eXBlIGNoZWNraW5nIGZ1bmN0aW9ucyBpbnRlbnRpb25hbGx5IGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcbi8vIGJlY2F1c2UgaXQgaXMgZnJhZ2lsZSBhbmQgY2FuIGJlIGVhc2lseSBmYWtlZCB3aXRoIGBPYmplY3QuY3JlYXRlKClgLlxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcik7XG59XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBpc0Jvb2xlYW4oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnYm9vbGVhbic7XG59XG5leHBvcnRzLmlzQm9vbGVhbiA9IGlzQm9vbGVhbjtcblxuZnVuY3Rpb24gaXNOdWxsKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGwgPSBpc051bGw7XG5cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbE9yVW5kZWZpbmVkID0gaXNOdWxsT3JVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLmlzTnVtYmVyID0gaXNOdW1iZXI7XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZyc7XG59XG5leHBvcnRzLmlzU3RyaW5nID0gaXNTdHJpbmc7XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCc7XG59XG5leHBvcnRzLmlzU3ltYm9sID0gaXNTeW1ib2w7XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG5leHBvcnRzLmlzVW5kZWZpbmVkID0gaXNVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiBpc09iamVjdChyZSkgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cbmV4cG9ydHMuaXNSZWdFeHAgPSBpc1JlZ0V4cDtcblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5leHBvcnRzLmlzT2JqZWN0ID0gaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiBpc09iamVjdChkKSAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuZXhwb3J0cy5pc0RhdGUgPSBpc0RhdGU7XG5cbmZ1bmN0aW9uIGlzRXJyb3IoZSkge1xuICByZXR1cm4gaXNPYmplY3QoZSkgJiZcbiAgICAgIChvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB8fCBlIGluc3RhbmNlb2YgRXJyb3IpO1xufVxuZXhwb3J0cy5pc0Vycm9yID0gaXNFcnJvcjtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBpc1ByaW1pdGl2ZShhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbCB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnIHx8ICAvLyBFUzYgc3ltYm9sXG4gICAgICAgICB0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJztcbn1cbmV4cG9ydHMuaXNQcmltaXRpdmUgPSBpc1ByaW1pdGl2ZTtcblxuZXhwb3J0cy5pc0J1ZmZlciA9IHJlcXVpcmUoJy4vc3VwcG9ydC9pc0J1ZmZlcicpO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cblxuZnVuY3Rpb24gcGFkKG4pIHtcbiAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4udG9TdHJpbmcoMTApIDogbi50b1N0cmluZygxMCk7XG59XG5cblxudmFyIG1vbnRocyA9IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLFxuICAgICAgICAgICAgICAnT2N0JywgJ05vdicsICdEZWMnXTtcblxuLy8gMjYgRmViIDE2OjE5OjM0XG5mdW5jdGlvbiB0aW1lc3RhbXAoKSB7XG4gIHZhciBkID0gbmV3IERhdGUoKTtcbiAgdmFyIHRpbWUgPSBbcGFkKGQuZ2V0SG91cnMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldE1pbnV0ZXMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldFNlY29uZHMoKSldLmpvaW4oJzonKTtcbiAgcmV0dXJuIFtkLmdldERhdGUoKSwgbW9udGhzW2QuZ2V0TW9udGgoKV0sIHRpbWVdLmpvaW4oJyAnKTtcbn1cblxuXG4vLyBsb2cgaXMganVzdCBhIHRoaW4gd3JhcHBlciB0byBjb25zb2xlLmxvZyB0aGF0IHByZXBlbmRzIGEgdGltZXN0YW1wXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnJXMgLSAlcycsIHRpbWVzdGFtcCgpLCBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpKTtcbn07XG5cblxuLyoqXG4gKiBJbmhlcml0IHRoZSBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIG9uZSBjb25zdHJ1Y3RvciBpbnRvIGFub3RoZXIuXG4gKlxuICogVGhlIEZ1bmN0aW9uLnByb3RvdHlwZS5pbmhlcml0cyBmcm9tIGxhbmcuanMgcmV3cml0dGVuIGFzIGEgc3RhbmRhbG9uZVxuICogZnVuY3Rpb24gKG5vdCBvbiBGdW5jdGlvbi5wcm90b3R5cGUpLiBOT1RFOiBJZiB0aGlzIGZpbGUgaXMgdG8gYmUgbG9hZGVkXG4gKiBkdXJpbmcgYm9vdHN0cmFwcGluZyB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB1c2luZyBzb21lIG5hdGl2ZVxuICogZnVuY3Rpb25zIGFzIHByb3RvdHlwZSBzZXR1cCB1c2luZyBub3JtYWwgSmF2YVNjcmlwdCBkb2VzIG5vdCB3b3JrIGFzXG4gKiBleHBlY3RlZCBkdXJpbmcgYm9vdHN0cmFwcGluZyAoc2VlIG1pcnJvci5qcyBpbiByMTE0OTAzKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHdoaWNoIG5lZWRzIHRvIGluaGVyaXQgdGhlXG4gKiAgICAgcHJvdG90eXBlLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gc3VwZXJDdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIGluaGVyaXQgcHJvdG90eXBlIGZyb20uXG4gKi9cbmV4cG9ydHMuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLl9leHRlbmQgPSBmdW5jdGlvbihvcmlnaW4sIGFkZCkge1xuICAvLyBEb24ndCBkbyBhbnl0aGluZyBpZiBhZGQgaXNuJ3QgYW4gb2JqZWN0XG4gIGlmICghYWRkIHx8ICFpc09iamVjdChhZGQpKSByZXR1cm4gb3JpZ2luO1xuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoYWRkKTtcbiAgdmFyIGkgPSBrZXlzLmxlbmd0aDtcbiAgd2hpbGUgKGktLSkge1xuICAgIG9yaWdpbltrZXlzW2ldXSA9IGFkZFtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gb3JpZ2luO1xufTtcblxuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHByb3RvY2xhc3MgPSByZXF1aXJlKFwicHJvdG9jbGFzc1wiKTtcblxuLyoqXG4gKiBAbW9kdWxlIG1vam9cbiAqIEBzdWJtb2R1bGUgbW9qby1jb3JlXG4gKi9cblxuLyoqXG4gKiBAY2xhc3MgRXZlbnRFbWl0dGVyXG4gKi9cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyICgpIHtcbiAgdGhpcy5fX2V2ZW50cyA9IHt9O1xufVxuXG4vKipcbiAqIGFkZHMgYSBsaXN0ZW5lciBvbiB0aGUgZXZlbnQgZW1pdHRlclxuICpcbiAqIEBtZXRob2Qgb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBldmVudCB0byBsaXN0ZW4gb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIHRvIGNhbGxiYWNrIHdoZW4gYGV2ZW50YCBpcyBlbWl0dGVkLlxuICogQHJldHVybnMge0Rpc3Bvc2FibGV9XG4gKi9cblxuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKGV2ZW50LCBsaXN0ZW5lcikge1xuXG4gIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgIHRocm93IG5ldyBFcnJvcihcImxpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbiBmb3IgZXZlbnQgJ1wiK2V2ZW50K1wiJ1wiKTtcbiAgfVxuXG4gIHZhciBsaXN0ZW5lcnM7XG4gIGlmICghKGxpc3RlbmVycyA9IHRoaXMuX19ldmVudHNbZXZlbnRdKSkge1xuICAgIHRoaXMuX19ldmVudHNbZXZlbnRdID0gbGlzdGVuZXI7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGxpc3RlbmVycyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgdGhpcy5fX2V2ZW50c1tldmVudF0gPSBbbGlzdGVuZXJzLCBsaXN0ZW5lcl07XG4gIH0gZWxzZSB7XG4gICAgbGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xuICB9XG5cbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHJldHVybiB7XG4gICAgZGlzcG9zZTogZnVuY3Rpb24oKSB7XG4gICAgICBzZWxmLm9mZihldmVudCwgbGlzdGVuZXIpO1xuICAgIH1cbiAgfTtcbn07XG5cbi8qKlxuICogcmVtb3ZlcyBhbiBldmVudCBlbWl0dGVyXG4gKiBAbWV0aG9kIG9mZlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IHRvIHJlbW92ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgdG8gcmVtb3ZlXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbiAoZXZlbnQsIGxpc3RlbmVyKSB7XG5cbiAgdmFyIGxpc3RlbmVycztcblxuICBpZighKGxpc3RlbmVycyA9IHRoaXMuX19ldmVudHNbZXZlbnRdKSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0eXBlb2YgbGlzdGVuZXJzID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB0aGlzLl9fZXZlbnRzW2V2ZW50XSA9IHVuZGVmaW5lZDtcbiAgfSBlbHNlIHtcbiAgICB2YXIgaSA9IGxpc3RlbmVycy5pbmRleE9mKGxpc3RlbmVyKTtcbiAgICBpZiAofmkpIGxpc3RlbmVycy5zcGxpY2UoaSwgMSk7XG4gICAgaWYgKCFsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICB0aGlzLl9fZXZlbnRzW2V2ZW50XSA9IHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogYWRkcyBhIGxpc3RlbmVyIG9uIHRoZSBldmVudCBlbWl0dGVyXG4gKiBAbWV0aG9kIG9uY2VcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCBldmVudCB0byBsaXN0ZW4gb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIHRvIGNhbGxiYWNrIHdoZW4gYGV2ZW50YCBpcyBlbWl0dGVkLlxuICogQHJldHVybnMge0Rpc3Bvc2FibGV9XG4gKi9cblxuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbiAoZXZlbnQsIGxpc3RlbmVyKSB7XG5cbiAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwibGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uIGZvciBldmVudCAnXCIrZXZlbnQrXCInXCIpO1xuICB9XG5cbiAgZnVuY3Rpb24gbGlzdGVuZXIyICgpIHtcbiAgICBkaXNwLmRpc3Bvc2UoKTtcbiAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgdmFyIGRpc3AgPSB0aGlzLm9uKGV2ZW50LCBsaXN0ZW5lcjIpO1xuICBkaXNwLnRhcmdldCA9IHRoaXM7XG4gIHJldHVybiBkaXNwO1xufTtcblxuLyoqXG4gKiBlbWl0cyBhbiBldmVudFxuICogQG1ldGhvZCBlbWl0XG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7U3RyaW5nfSwgYGRhdGEuLi5gIGRhdGEgdG8gZW1pdFxuICovXG5cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cbiAgaWYgKHRoaXMuX19ldmVudHNbZXZlbnRdID09PSB1bmRlZmluZWQpIHJldHVybjtcblxuICB2YXIgbGlzdGVuZXJzID0gdGhpcy5fX2V2ZW50c1tldmVudF0sXG4gIG4gPSBhcmd1bWVudHMubGVuZ3RoLFxuICBhcmdzLFxuICBpLFxuICBqO1xuXG4gIGlmICh0eXBlb2YgbGlzdGVuZXJzID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBpZiAobiA9PT0gMSkge1xuICAgICAgbGlzdGVuZXJzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN3aXRjaChuKSB7XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgICBsaXN0ZW5lcnMoYXJndW1lbnRzWzFdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIGxpc3RlbmVycyhhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNDpcbiAgICAgICAgICBsaXN0ZW5lcnMoYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0sIGFyZ3VtZW50c1szXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgYXJncyA9IG5ldyBBcnJheShuIC0gMSk7XG4gICAgICAgICAgZm9yKGkgPSAxOyBpIDwgbjsgaSsrKSBhcmdzW2ktMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgICAgbGlzdGVuZXJzLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfVxuICB9IGVsc2Uge1xuICAgIGFyZ3MgPSBuZXcgQXJyYXkobiAtIDEpO1xuICAgIGZvcihpID0gMTsgaSA8IG47IGkrKykgYXJnc1tpLTFdID0gYXJndW1lbnRzW2ldO1xuICAgIGZvcihqID0gbGlzdGVuZXJzLmxlbmd0aDsgai0tOykge1xuICAgICAgaWYobGlzdGVuZXJzW2pdKSBsaXN0ZW5lcnNbal0uYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIHJlbW92ZXMgYWxsIGxpc3RlbmVyc1xuICogQG1ldGhvZCByZW1vdmVBbGxMaXN0ZW5lcnNcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAob3B0aW9uYWwpIHJlbW92ZXMgYWxsIGxpc3RlbmVycyBvZiBgZXZlbnRgLiBPbWl0dGluZyB3aWxsIHJlbW92ZSBldmVyeXRoaW5nLlxuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgdGhpcy5fX2V2ZW50c1tldmVudF0gPSB1bmRlZmluZWQ7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5fX2V2ZW50cyA9IHt9O1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcbiIsImZ1bmN0aW9uIF9jb3B5ICh0bywgZnJvbSkge1xuXG4gIGZvciAodmFyIGkgPSAwLCBuID0gZnJvbS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcblxuICAgIHZhciB0YXJnZXQgPSBmcm9tW2ldO1xuXG4gICAgZm9yICh2YXIgcHJvcGVydHkgaW4gdGFyZ2V0KSB7XG4gICAgICB0b1twcm9wZXJ0eV0gPSB0YXJnZXRbcHJvcGVydHldO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0bztcbn1cblxuZnVuY3Rpb24gcHJvdG9jbGFzcyAocGFyZW50LCBjaGlsZCkge1xuXG4gIHZhciBtaXhpbnMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuXG4gIGlmICh0eXBlb2YgY2hpbGQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgIGlmKGNoaWxkKSBtaXhpbnMudW5zaGlmdChjaGlsZCk7IC8vIGNvbnN0cnVjdG9yIGlzIGEgbWl4aW5cbiAgICBjaGlsZCAgID0gcGFyZW50O1xuICAgIHBhcmVudCAgPSBmdW5jdGlvbigpIHsgfTtcbiAgfVxuXG4gIF9jb3B5KGNoaWxkLCBwYXJlbnQpOyBcblxuICBmdW5jdGlvbiBjdG9yICgpIHtcbiAgICB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7XG4gIH1cblxuICBjdG9yLnByb3RvdHlwZSAgPSBwYXJlbnQucHJvdG90eXBlO1xuICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgY3RvcigpO1xuICBjaGlsZC5fX3N1cGVyX18gPSBwYXJlbnQucHJvdG90eXBlO1xuICBjaGlsZC5wYXJlbnQgICAgPSBjaGlsZC5zdXBlcmNsYXNzID0gcGFyZW50O1xuXG4gIF9jb3B5KGNoaWxkLnByb3RvdHlwZSwgbWl4aW5zKTtcblxuICBwcm90b2NsYXNzLnNldHVwKGNoaWxkKTtcblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbnByb3RvY2xhc3Muc2V0dXAgPSBmdW5jdGlvbiAoY2hpbGQpIHtcblxuXG4gIGlmICghY2hpbGQuZXh0ZW5kKSB7XG4gICAgY2hpbGQuZXh0ZW5kID0gZnVuY3Rpb24oY29uc3RydWN0b3IpIHtcblxuICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuXG4gICAgICBpZiAodHlwZW9mIGNvbnN0cnVjdG9yICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgYXJncy51bnNoaWZ0KGNvbnN0cnVjdG9yID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGNvbnN0cnVjdG9yLnBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHByb3RvY2xhc3MuYXBwbHkodGhpcywgW3RoaXNdLmNvbmNhdChhcmdzKSk7XG4gICAgfVxuXG4gICAgY2hpbGQubWl4aW4gPSBmdW5jdGlvbihwcm90bykge1xuICAgICAgX2NvcHkodGhpcy5wcm90b3R5cGUsIGFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgY2hpbGQuY3JlYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG9iaiA9IE9iamVjdC5jcmVhdGUoY2hpbGQucHJvdG90eXBlKTtcbiAgICAgIGNoaWxkLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGNoaWxkO1xufVxuXG5cbm1vZHVsZS5leHBvcnRzID0gcHJvdG9jbGFzczsiLCIvKipcbiAqIFR3ZWVuLmpzIC0gTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKiBodHRwczovL2dpdGh1Yi5jb20vdHdlZW5qcy90d2Vlbi5qc1xuICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vdHdlZW5qcy90d2Vlbi5qcy9ncmFwaHMvY29udHJpYnV0b3JzIGZvciB0aGUgZnVsbCBsaXN0IG9mIGNvbnRyaWJ1dG9ycy5cbiAqIFRoYW5rIHlvdSBhbGwsIHlvdSdyZSBhd2Vzb21lIVxuICovXG5cbi8vIEluY2x1ZGUgYSBwZXJmb3JtYW5jZS5ub3cgcG9seWZpbGxcbihmdW5jdGlvbiAoKSB7XG5cblx0aWYgKCdwZXJmb3JtYW5jZScgaW4gd2luZG93ID09PSBmYWxzZSkge1xuXHRcdHdpbmRvdy5wZXJmb3JtYW5jZSA9IHt9O1xuXHR9XG5cblx0Ly8gSUUgOFxuXHREYXRlLm5vdyA9IChEYXRlLm5vdyB8fCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHR9KTtcblxuXHRpZiAoJ25vdycgaW4gd2luZG93LnBlcmZvcm1hbmNlID09PSBmYWxzZSkge1xuXHRcdHZhciBvZmZzZXQgPSB3aW5kb3cucGVyZm9ybWFuY2UudGltaW5nICYmIHdpbmRvdy5wZXJmb3JtYW5jZS50aW1pbmcubmF2aWdhdGlvblN0YXJ0ID8gd2luZG93LnBlcmZvcm1hbmNlLnRpbWluZy5uYXZpZ2F0aW9uU3RhcnRcblx0XHQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IERhdGUubm93KCk7XG5cblx0XHR3aW5kb3cucGVyZm9ybWFuY2Uubm93ID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIERhdGUubm93KCkgLSBvZmZzZXQ7XG5cdFx0fTtcblx0fVxuXG59KSgpO1xuXG52YXIgVFdFRU4gPSBUV0VFTiB8fCAoZnVuY3Rpb24gKCkge1xuXG5cdHZhciBfdHdlZW5zID0gW107XG5cblx0cmV0dXJuIHtcblxuXHRcdGdldEFsbDogZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRyZXR1cm4gX3R3ZWVucztcblxuXHRcdH0sXG5cblx0XHRyZW1vdmVBbGw6IGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0X3R3ZWVucyA9IFtdO1xuXG5cdFx0fSxcblxuXHRcdGFkZDogZnVuY3Rpb24gKHR3ZWVuKSB7XG5cblx0XHRcdF90d2VlbnMucHVzaCh0d2Vlbik7XG5cblx0XHR9LFxuXG5cdFx0cmVtb3ZlOiBmdW5jdGlvbiAodHdlZW4pIHtcblxuXHRcdFx0dmFyIGkgPSBfdHdlZW5zLmluZGV4T2YodHdlZW4pO1xuXG5cdFx0XHRpZiAoaSAhPT0gLTEpIHtcblx0XHRcdFx0X3R3ZWVucy5zcGxpY2UoaSwgMSk7XG5cdFx0XHR9XG5cblx0XHR9LFxuXG5cdFx0dXBkYXRlOiBmdW5jdGlvbiAodGltZSkge1xuXG5cdFx0XHRpZiAoX3R3ZWVucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgaSA9IDA7XG5cblx0XHRcdHRpbWUgPSB0aW1lICE9PSB1bmRlZmluZWQgPyB0aW1lIDogd2luZG93LnBlcmZvcm1hbmNlLm5vdygpO1xuXG5cdFx0XHR3aGlsZSAoaSA8IF90d2VlbnMubGVuZ3RoKSB7XG5cblx0XHRcdFx0aWYgKF90d2VlbnNbaV0udXBkYXRlKHRpbWUpKSB7XG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF90d2VlbnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cblx0XHR9XG5cdH07XG5cbn0pKCk7XG5cblRXRUVOLlR3ZWVuID0gZnVuY3Rpb24gKG9iamVjdCkge1xuXG5cdHZhciBfb2JqZWN0ID0gb2JqZWN0O1xuXHR2YXIgX3ZhbHVlc1N0YXJ0ID0ge307XG5cdHZhciBfdmFsdWVzRW5kID0ge307XG5cdHZhciBfdmFsdWVzU3RhcnRSZXBlYXQgPSB7fTtcblx0dmFyIF9kdXJhdGlvbiA9IDEwMDA7XG5cdHZhciBfcmVwZWF0ID0gMDtcblx0dmFyIF95b3lvID0gZmFsc2U7XG5cdHZhciBfaXNQbGF5aW5nID0gZmFsc2U7XG5cdHZhciBfcmV2ZXJzZWQgPSBmYWxzZTtcblx0dmFyIF9kZWxheVRpbWUgPSAwO1xuXHR2YXIgX3N0YXJ0VGltZSA9IG51bGw7XG5cdHZhciBfZWFzaW5nRnVuY3Rpb24gPSBUV0VFTi5FYXNpbmcuTGluZWFyLk5vbmU7XG5cdHZhciBfaW50ZXJwb2xhdGlvbkZ1bmN0aW9uID0gVFdFRU4uSW50ZXJwb2xhdGlvbi5MaW5lYXI7XG5cdHZhciBfY2hhaW5lZFR3ZWVucyA9IFtdO1xuXHR2YXIgX29uU3RhcnRDYWxsYmFjayA9IG51bGw7XG5cdHZhciBfb25TdGFydENhbGxiYWNrRmlyZWQgPSBmYWxzZTtcblx0dmFyIF9vblVwZGF0ZUNhbGxiYWNrID0gbnVsbDtcblx0dmFyIF9vbkNvbXBsZXRlQ2FsbGJhY2sgPSBudWxsO1xuXHR2YXIgX29uU3RvcENhbGxiYWNrID0gbnVsbDtcblxuXHQvLyBTZXQgYWxsIHN0YXJ0aW5nIHZhbHVlcyBwcmVzZW50IG9uIHRoZSB0YXJnZXQgb2JqZWN0XG5cdGZvciAodmFyIGZpZWxkIGluIG9iamVjdCkge1xuXHRcdF92YWx1ZXNTdGFydFtmaWVsZF0gPSBwYXJzZUZsb2F0KG9iamVjdFtmaWVsZF0sIDEwKTtcblx0fVxuXG5cdHRoaXMudG8gPSBmdW5jdGlvbiAocHJvcGVydGllcywgZHVyYXRpb24pIHtcblxuXHRcdGlmIChkdXJhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRfZHVyYXRpb24gPSBkdXJhdGlvbjtcblx0XHR9XG5cblx0XHRfdmFsdWVzRW5kID0gcHJvcGVydGllcztcblxuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5zdGFydCA9IGZ1bmN0aW9uICh0aW1lKSB7XG5cblx0XHRUV0VFTi5hZGQodGhpcyk7XG5cblx0XHRfaXNQbGF5aW5nID0gdHJ1ZTtcblxuXHRcdF9vblN0YXJ0Q2FsbGJhY2tGaXJlZCA9IGZhbHNlO1xuXG5cdFx0X3N0YXJ0VGltZSA9IHRpbWUgIT09IHVuZGVmaW5lZCA/IHRpbWUgOiB3aW5kb3cucGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0X3N0YXJ0VGltZSArPSBfZGVsYXlUaW1lO1xuXG5cdFx0Zm9yICh2YXIgcHJvcGVydHkgaW4gX3ZhbHVlc0VuZCkge1xuXG5cdFx0XHQvLyBDaGVjayBpZiBhbiBBcnJheSB3YXMgcHJvdmlkZWQgYXMgcHJvcGVydHkgdmFsdWVcblx0XHRcdGlmIChfdmFsdWVzRW5kW3Byb3BlcnR5XSBpbnN0YW5jZW9mIEFycmF5KSB7XG5cblx0XHRcdFx0aWYgKF92YWx1ZXNFbmRbcHJvcGVydHldLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ3JlYXRlIGEgbG9jYWwgY29weSBvZiB0aGUgQXJyYXkgd2l0aCB0aGUgc3RhcnQgdmFsdWUgYXQgdGhlIGZyb250XG5cdFx0XHRcdF92YWx1ZXNFbmRbcHJvcGVydHldID0gW19vYmplY3RbcHJvcGVydHldXS5jb25jYXQoX3ZhbHVlc0VuZFtwcm9wZXJ0eV0pO1xuXG5cdFx0XHR9XG5cblx0XHRcdF92YWx1ZXNTdGFydFtwcm9wZXJ0eV0gPSBfb2JqZWN0W3Byb3BlcnR5XTtcblxuXHRcdFx0aWYgKChfdmFsdWVzU3RhcnRbcHJvcGVydHldIGluc3RhbmNlb2YgQXJyYXkpID09PSBmYWxzZSkge1xuXHRcdFx0XHRfdmFsdWVzU3RhcnRbcHJvcGVydHldICo9IDEuMDsgLy8gRW5zdXJlcyB3ZSdyZSB1c2luZyBudW1iZXJzLCBub3Qgc3RyaW5nc1xuXHRcdFx0fVxuXG5cdFx0XHRfdmFsdWVzU3RhcnRSZXBlYXRbcHJvcGVydHldID0gX3ZhbHVlc1N0YXJ0W3Byb3BlcnR5XSB8fCAwO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG5cblx0XHRpZiAoIV9pc1BsYXlpbmcpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdFRXRUVOLnJlbW92ZSh0aGlzKTtcblx0XHRfaXNQbGF5aW5nID0gZmFsc2U7XG5cblx0XHRpZiAoX29uU3RvcENhbGxiYWNrICE9PSBudWxsKSB7XG5cdFx0XHRfb25TdG9wQ2FsbGJhY2suY2FsbChfb2JqZWN0KTtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3BDaGFpbmVkVHdlZW5zKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLnN0b3BDaGFpbmVkVHdlZW5zID0gZnVuY3Rpb24gKCkge1xuXG5cdFx0Zm9yICh2YXIgaSA9IDAsIG51bUNoYWluZWRUd2VlbnMgPSBfY2hhaW5lZFR3ZWVucy5sZW5ndGg7IGkgPCBudW1DaGFpbmVkVHdlZW5zOyBpKyspIHtcblx0XHRcdF9jaGFpbmVkVHdlZW5zW2ldLnN0b3AoKTtcblx0XHR9XG5cblx0fTtcblxuXHR0aGlzLmRlbGF5ID0gZnVuY3Rpb24gKGFtb3VudCkge1xuXG5cdFx0X2RlbGF5VGltZSA9IGFtb3VudDtcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMucmVwZWF0ID0gZnVuY3Rpb24gKHRpbWVzKSB7XG5cblx0XHRfcmVwZWF0ID0gdGltZXM7XG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLnlveW8gPSBmdW5jdGlvbiAoeW95bykge1xuXG5cdFx0X3lveW8gPSB5b3lvO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblxuXHR0aGlzLmVhc2luZyA9IGZ1bmN0aW9uIChlYXNpbmcpIHtcblxuXHRcdF9lYXNpbmdGdW5jdGlvbiA9IGVhc2luZztcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMuaW50ZXJwb2xhdGlvbiA9IGZ1bmN0aW9uIChpbnRlcnBvbGF0aW9uKSB7XG5cblx0XHRfaW50ZXJwb2xhdGlvbkZ1bmN0aW9uID0gaW50ZXJwb2xhdGlvbjtcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMuY2hhaW4gPSBmdW5jdGlvbiAoKSB7XG5cblx0XHRfY2hhaW5lZFR3ZWVucyA9IGFyZ3VtZW50cztcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMub25TdGFydCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXG5cdFx0X29uU3RhcnRDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5vblVwZGF0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXG5cdFx0X29uVXBkYXRlQ2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMub25Db21wbGV0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXG5cdFx0X29uQ29tcGxldGVDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5vblN0b3AgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcblxuXHRcdF9vblN0b3BDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy51cGRhdGUgPSBmdW5jdGlvbiAodGltZSkge1xuXG5cdFx0dmFyIHByb3BlcnR5O1xuXHRcdHZhciBlbGFwc2VkO1xuXHRcdHZhciB2YWx1ZTtcblxuXHRcdGlmICh0aW1lIDwgX3N0YXJ0VGltZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKF9vblN0YXJ0Q2FsbGJhY2tGaXJlZCA9PT0gZmFsc2UpIHtcblxuXHRcdFx0aWYgKF9vblN0YXJ0Q2FsbGJhY2sgIT09IG51bGwpIHtcblx0XHRcdFx0X29uU3RhcnRDYWxsYmFjay5jYWxsKF9vYmplY3QpO1xuXHRcdFx0fVxuXG5cdFx0XHRfb25TdGFydENhbGxiYWNrRmlyZWQgPSB0cnVlO1xuXG5cdFx0fVxuXG5cdFx0ZWxhcHNlZCA9ICh0aW1lIC0gX3N0YXJ0VGltZSkgLyBfZHVyYXRpb247XG5cdFx0ZWxhcHNlZCA9IGVsYXBzZWQgPiAxID8gMSA6IGVsYXBzZWQ7XG5cblx0XHR2YWx1ZSA9IF9lYXNpbmdGdW5jdGlvbihlbGFwc2VkKTtcblxuXHRcdGZvciAocHJvcGVydHkgaW4gX3ZhbHVlc0VuZCkge1xuXG5cdFx0XHR2YXIgc3RhcnQgPSBfdmFsdWVzU3RhcnRbcHJvcGVydHldIHx8IDA7XG5cdFx0XHR2YXIgZW5kID0gX3ZhbHVlc0VuZFtwcm9wZXJ0eV07XG5cblx0XHRcdGlmIChlbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuXG5cdFx0XHRcdF9vYmplY3RbcHJvcGVydHldID0gX2ludGVycG9sYXRpb25GdW5jdGlvbihlbmQsIHZhbHVlKTtcblxuXHRcdFx0fSBlbHNlIHtcblxuXHRcdFx0XHQvLyBQYXJzZXMgcmVsYXRpdmUgZW5kIHZhbHVlcyB3aXRoIHN0YXJ0IGFzIGJhc2UgKGUuZy46ICsxMCwgLTMpXG5cdFx0XHRcdGlmICh0eXBlb2YgKGVuZCkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0ZW5kID0gc3RhcnQgKyBwYXJzZUZsb2F0KGVuZCwgMTApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUHJvdGVjdCBhZ2FpbnN0IG5vbiBudW1lcmljIHByb3BlcnRpZXMuXG5cdFx0XHRcdGlmICh0eXBlb2YgKGVuZCkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0X29iamVjdFtwcm9wZXJ0eV0gPSBzdGFydCArIChlbmQgLSBzdGFydCkgKiB2YWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRpZiAoX29uVXBkYXRlQ2FsbGJhY2sgIT09IG51bGwpIHtcblx0XHRcdF9vblVwZGF0ZUNhbGxiYWNrLmNhbGwoX29iamVjdCwgdmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmIChlbGFwc2VkID09PSAxKSB7XG5cblx0XHRcdGlmIChfcmVwZWF0ID4gMCkge1xuXG5cdFx0XHRcdGlmIChpc0Zpbml0ZShfcmVwZWF0KSkge1xuXHRcdFx0XHRcdF9yZXBlYXQtLTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlYXNzaWduIHN0YXJ0aW5nIHZhbHVlcywgcmVzdGFydCBieSBtYWtpbmcgc3RhcnRUaW1lID0gbm93XG5cdFx0XHRcdGZvciAocHJvcGVydHkgaW4gX3ZhbHVlc1N0YXJ0UmVwZWF0KSB7XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIChfdmFsdWVzRW5kW3Byb3BlcnR5XSkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRfdmFsdWVzU3RhcnRSZXBlYXRbcHJvcGVydHldID0gX3ZhbHVlc1N0YXJ0UmVwZWF0W3Byb3BlcnR5XSArIHBhcnNlRmxvYXQoX3ZhbHVlc0VuZFtwcm9wZXJ0eV0sIDEwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoX3lveW8pIHtcblx0XHRcdFx0XHRcdHZhciB0bXAgPSBfdmFsdWVzU3RhcnRSZXBlYXRbcHJvcGVydHldO1xuXG5cdFx0XHRcdFx0XHRfdmFsdWVzU3RhcnRSZXBlYXRbcHJvcGVydHldID0gX3ZhbHVlc0VuZFtwcm9wZXJ0eV07XG5cdFx0XHRcdFx0XHRfdmFsdWVzRW5kW3Byb3BlcnR5XSA9IHRtcDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRfdmFsdWVzU3RhcnRbcHJvcGVydHldID0gX3ZhbHVlc1N0YXJ0UmVwZWF0W3Byb3BlcnR5XTtcblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKF95b3lvKSB7XG5cdFx0XHRcdFx0X3JldmVyc2VkID0gIV9yZXZlcnNlZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdF9zdGFydFRpbWUgPSB0aW1lICsgX2RlbGF5VGltZTtcblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdFx0fSBlbHNlIHtcblxuXHRcdFx0XHRpZiAoX29uQ29tcGxldGVDYWxsYmFjayAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdF9vbkNvbXBsZXRlQ2FsbGJhY2suY2FsbChfb2JqZWN0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAodmFyIGkgPSAwLCBudW1DaGFpbmVkVHdlZW5zID0gX2NoYWluZWRUd2VlbnMubGVuZ3RoOyBpIDwgbnVtQ2hhaW5lZFR3ZWVuczsgaSsrKSB7XG5cdFx0XHRcdFx0Ly8gTWFrZSB0aGUgY2hhaW5lZCB0d2VlbnMgc3RhcnQgZXhhY3RseSBhdCB0aGUgdGltZSB0aGV5IHNob3VsZCxcblx0XHRcdFx0XHQvLyBldmVuIGlmIHRoZSBgdXBkYXRlKClgIG1ldGhvZCB3YXMgY2FsbGVkIHdheSBwYXN0IHRoZSBkdXJhdGlvbiBvZiB0aGUgdHdlZW5cblx0XHRcdFx0XHRfY2hhaW5lZFR3ZWVuc1tpXS5zdGFydChfc3RhcnRUaW1lICsgX2R1cmF0aW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cblx0fTtcblxufTtcblxuXG5UV0VFTi5FYXNpbmcgPSB7XG5cblx0TGluZWFyOiB7XG5cblx0XHROb25lOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gaztcblxuXHRcdH1cblxuXHR9LFxuXG5cdFF1YWRyYXRpYzoge1xuXG5cdFx0SW46IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBrICogaztcblxuXHRcdH0sXG5cblx0XHRPdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBrICogKDIgLSBrKTtcblxuXHRcdH0sXG5cblx0XHRJbk91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0aWYgKChrICo9IDIpIDwgMSkge1xuXHRcdFx0XHRyZXR1cm4gMC41ICogayAqIGs7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAtIDAuNSAqICgtLWsgKiAoayAtIDIpIC0gMSk7XG5cblx0XHR9XG5cblx0fSxcblxuXHRDdWJpYzoge1xuXG5cdFx0SW46IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBrICogayAqIGs7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gLS1rICogayAqIGsgKyAxO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoKGsgKj0gMikgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAwLjUgKiBrICogayAqIGs7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAwLjUgKiAoKGsgLT0gMikgKiBrICogayArIDIpO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0UXVhcnRpYzoge1xuXG5cdFx0SW46IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBrICogayAqIGsgKiBrO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIDEgLSAoLS1rICogayAqIGsgKiBrKTtcblxuXHRcdH0sXG5cblx0XHRJbk91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0aWYgKChrICo9IDIpIDwgMSkge1xuXHRcdFx0XHRyZXR1cm4gMC41ICogayAqIGsgKiBrICogaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIC0gMC41ICogKChrIC09IDIpICogayAqIGsgKiBrIC0gMik7XG5cblx0XHR9XG5cblx0fSxcblxuXHRRdWludGljOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgKiBrICogayAqIGsgKiBrO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIC0tayAqIGsgKiBrICogayAqIGsgKyAxO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoKGsgKj0gMikgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAwLjUgKiBrICogayAqIGsgKiBrICogaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDAuNSAqICgoayAtPSAyKSAqIGsgKiBrICogayAqIGsgKyAyKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdFNpbnVzb2lkYWw6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gMSAtIE1hdGguY29zKGsgKiBNYXRoLlBJIC8gMik7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gTWF0aC5zaW4oayAqIE1hdGguUEkgLyAyKTtcblxuXHRcdH0sXG5cblx0XHRJbk91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIDAuNSAqICgxIC0gTWF0aC5jb3MoTWF0aC5QSSAqIGspKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdEV4cG9uZW50aWFsOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgPT09IDAgPyAwIDogTWF0aC5wb3coMTAyNCwgayAtIDEpO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgPT09IDEgPyAxIDogMSAtIE1hdGgucG93KDIsIC0gMTAgKiBrKTtcblxuXHRcdH0sXG5cblx0XHRJbk91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0aWYgKGsgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChrID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKGsgKj0gMikgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAwLjUgKiBNYXRoLnBvdygxMDI0LCBrIC0gMSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAwLjUgKiAoLSBNYXRoLnBvdygyLCAtIDEwICogKGsgLSAxKSkgKyAyKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdENpcmN1bGFyOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIDEgLSBNYXRoLnNxcnQoMSAtIGsgKiBrKTtcblxuXHRcdH0sXG5cblx0XHRPdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBNYXRoLnNxcnQoMSAtICgtLWsgKiBrKSk7XG5cblx0XHR9LFxuXG5cdFx0SW5PdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdGlmICgoayAqPSAyKSA8IDEpIHtcblx0XHRcdFx0cmV0dXJuIC0gMC41ICogKE1hdGguc3FydCgxIC0gayAqIGspIC0gMSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAwLjUgKiAoTWF0aC5zcXJ0KDEgLSAoayAtPSAyKSAqIGspICsgMSk7XG5cblx0XHR9XG5cblx0fSxcblxuXHRFbGFzdGljOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0dmFyIHM7XG5cdFx0XHR2YXIgYSA9IDAuMTtcblx0XHRcdHZhciBwID0gMC40O1xuXG5cdFx0XHRpZiAoayA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGsgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYSB8fCBhIDwgMSkge1xuXHRcdFx0XHRhID0gMTtcblx0XHRcdFx0cyA9IHAgLyA0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cyA9IHAgKiBNYXRoLmFzaW4oMSAvIGEpIC8gKDIgKiBNYXRoLlBJKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIC0gKGEgKiBNYXRoLnBvdygyLCAxMCAqIChrIC09IDEpKSAqIE1hdGguc2luKChrIC0gcykgKiAoMiAqIE1hdGguUEkpIC8gcCkpO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0dmFyIHM7XG5cdFx0XHR2YXIgYSA9IDAuMTtcblx0XHRcdHZhciBwID0gMC40O1xuXG5cdFx0XHRpZiAoayA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGsgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYSB8fCBhIDwgMSkge1xuXHRcdFx0XHRhID0gMTtcblx0XHRcdFx0cyA9IHAgLyA0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cyA9IHAgKiBNYXRoLmFzaW4oMSAvIGEpIC8gKDIgKiBNYXRoLlBJKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIChhICogTWF0aC5wb3coMiwgLSAxMCAqIGspICogTWF0aC5zaW4oKGsgLSBzKSAqICgyICogTWF0aC5QSSkgLyBwKSArIDEpO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHR2YXIgcztcblx0XHRcdHZhciBhID0gMC4xO1xuXHRcdFx0dmFyIHAgPSAwLjQ7XG5cblx0XHRcdGlmIChrID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoayA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhIHx8IGEgPCAxKSB7XG5cdFx0XHRcdGEgPSAxO1xuXHRcdFx0XHRzID0gcCAvIDQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzID0gcCAqIE1hdGguYXNpbigxIC8gYSkgLyAoMiAqIE1hdGguUEkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKGsgKj0gMikgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAtIDAuNSAqIChhICogTWF0aC5wb3coMiwgMTAgKiAoayAtPSAxKSkgKiBNYXRoLnNpbigoayAtIHMpICogKDIgKiBNYXRoLlBJKSAvIHApKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGEgKiBNYXRoLnBvdygyLCAtMTAgKiAoayAtPSAxKSkgKiBNYXRoLnNpbigoayAtIHMpICogKDIgKiBNYXRoLlBJKSAvIHApICogMC41ICsgMTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdEJhY2s6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHR2YXIgcyA9IDEuNzAxNTg7XG5cblx0XHRcdHJldHVybiBrICogayAqICgocyArIDEpICogayAtIHMpO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0dmFyIHMgPSAxLjcwMTU4O1xuXG5cdFx0XHRyZXR1cm4gLS1rICogayAqICgocyArIDEpICogayArIHMpICsgMTtcblxuXHRcdH0sXG5cblx0XHRJbk91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0dmFyIHMgPSAxLjcwMTU4ICogMS41MjU7XG5cblx0XHRcdGlmICgoayAqPSAyKSA8IDEpIHtcblx0XHRcdFx0cmV0dXJuIDAuNSAqIChrICogayAqICgocyArIDEpICogayAtIHMpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDAuNSAqICgoayAtPSAyKSAqIGsgKiAoKHMgKyAxKSAqIGsgKyBzKSArIDIpO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0Qm91bmNlOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIDEgLSBUV0VFTi5FYXNpbmcuQm91bmNlLk91dCgxIC0gayk7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoayA8ICgxIC8gMi43NSkpIHtcblx0XHRcdFx0cmV0dXJuIDcuNTYyNSAqIGsgKiBrO1xuXHRcdFx0fSBlbHNlIGlmIChrIDwgKDIgLyAyLjc1KSkge1xuXHRcdFx0XHRyZXR1cm4gNy41NjI1ICogKGsgLT0gKDEuNSAvIDIuNzUpKSAqIGsgKyAwLjc1O1xuXHRcdFx0fSBlbHNlIGlmIChrIDwgKDIuNSAvIDIuNzUpKSB7XG5cdFx0XHRcdHJldHVybiA3LjU2MjUgKiAoayAtPSAoMi4yNSAvIDIuNzUpKSAqIGsgKyAwLjkzNzU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gNy41NjI1ICogKGsgLT0gKDIuNjI1IC8gMi43NSkpICogayArIDAuOTg0Mzc1O1xuXHRcdFx0fVxuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoayA8IDAuNSkge1xuXHRcdFx0XHRyZXR1cm4gVFdFRU4uRWFzaW5nLkJvdW5jZS5JbihrICogMikgKiAwLjU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBUV0VFTi5FYXNpbmcuQm91bmNlLk91dChrICogMiAtIDEpICogMC41ICsgMC41O1xuXG5cdFx0fVxuXG5cdH1cblxufTtcblxuVFdFRU4uSW50ZXJwb2xhdGlvbiA9IHtcblxuXHRMaW5lYXI6IGZ1bmN0aW9uICh2LCBrKSB7XG5cblx0XHR2YXIgbSA9IHYubGVuZ3RoIC0gMTtcblx0XHR2YXIgZiA9IG0gKiBrO1xuXHRcdHZhciBpID0gTWF0aC5mbG9vcihmKTtcblx0XHR2YXIgZm4gPSBUV0VFTi5JbnRlcnBvbGF0aW9uLlV0aWxzLkxpbmVhcjtcblxuXHRcdGlmIChrIDwgMCkge1xuXHRcdFx0cmV0dXJuIGZuKHZbMF0sIHZbMV0sIGYpO1xuXHRcdH1cblxuXHRcdGlmIChrID4gMSkge1xuXHRcdFx0cmV0dXJuIGZuKHZbbV0sIHZbbSAtIDFdLCBtIC0gZik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZuKHZbaV0sIHZbaSArIDEgPiBtID8gbSA6IGkgKyAxXSwgZiAtIGkpO1xuXG5cdH0sXG5cblx0QmV6aWVyOiBmdW5jdGlvbiAodiwgaykge1xuXG5cdFx0dmFyIGIgPSAwO1xuXHRcdHZhciBuID0gdi5sZW5ndGggLSAxO1xuXHRcdHZhciBwdyA9IE1hdGgucG93O1xuXHRcdHZhciBibiA9IFRXRUVOLkludGVycG9sYXRpb24uVXRpbHMuQmVybnN0ZWluO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPD0gbjsgaSsrKSB7XG5cdFx0XHRiICs9IHB3KDEgLSBrLCBuIC0gaSkgKiBwdyhrLCBpKSAqIHZbaV0gKiBibihuLCBpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYjtcblxuXHR9LFxuXG5cdENhdG11bGxSb206IGZ1bmN0aW9uICh2LCBrKSB7XG5cblx0XHR2YXIgbSA9IHYubGVuZ3RoIC0gMTtcblx0XHR2YXIgZiA9IG0gKiBrO1xuXHRcdHZhciBpID0gTWF0aC5mbG9vcihmKTtcblx0XHR2YXIgZm4gPSBUV0VFTi5JbnRlcnBvbGF0aW9uLlV0aWxzLkNhdG11bGxSb207XG5cblx0XHRpZiAodlswXSA9PT0gdlttXSkge1xuXG5cdFx0XHRpZiAoayA8IDApIHtcblx0XHRcdFx0aSA9IE1hdGguZmxvb3IoZiA9IG0gKiAoMSArIGspKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZuKHZbKGkgLSAxICsgbSkgJSBtXSwgdltpXSwgdlsoaSArIDEpICUgbV0sIHZbKGkgKyAyKSAlIG1dLCBmIC0gaSk7XG5cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRpZiAoayA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHZbMF0gLSAoZm4odlswXSwgdlswXSwgdlsxXSwgdlsxXSwgLWYpIC0gdlswXSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChrID4gMSkge1xuXHRcdFx0XHRyZXR1cm4gdlttXSAtIChmbih2W21dLCB2W21dLCB2W20gLSAxXSwgdlttIC0gMV0sIGYgLSBtKSAtIHZbbV0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZm4odltpID8gaSAtIDEgOiAwXSwgdltpXSwgdlttIDwgaSArIDEgPyBtIDogaSArIDFdLCB2W20gPCBpICsgMiA/IG0gOiBpICsgMl0sIGYgLSBpKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdFV0aWxzOiB7XG5cblx0XHRMaW5lYXI6IGZ1bmN0aW9uIChwMCwgcDEsIHQpIHtcblxuXHRcdFx0cmV0dXJuIChwMSAtIHAwKSAqIHQgKyBwMDtcblxuXHRcdH0sXG5cblx0XHRCZXJuc3RlaW46IGZ1bmN0aW9uIChuLCBpKSB7XG5cblx0XHRcdHZhciBmYyA9IFRXRUVOLkludGVycG9sYXRpb24uVXRpbHMuRmFjdG9yaWFsO1xuXG5cdFx0XHRyZXR1cm4gZmMobikgLyBmYyhpKSAvIGZjKG4gLSBpKTtcblxuXHRcdH0sXG5cblx0XHRGYWN0b3JpYWw6IChmdW5jdGlvbiAoKSB7XG5cblx0XHRcdHZhciBhID0gWzFdO1xuXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24gKG4pIHtcblxuXHRcdFx0XHR2YXIgcyA9IDE7XG5cblx0XHRcdFx0aWYgKGFbbl0pIHtcblx0XHRcdFx0XHRyZXR1cm4gYVtuXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAodmFyIGkgPSBuOyBpID4gMTsgaS0tKSB7XG5cdFx0XHRcdFx0cyAqPSBpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YVtuXSA9IHM7XG5cdFx0XHRcdHJldHVybiBzO1xuXG5cdFx0XHR9O1xuXG5cdFx0fSkoKSxcblxuXHRcdENhdG11bGxSb206IGZ1bmN0aW9uIChwMCwgcDEsIHAyLCBwMywgdCkge1xuXG5cdFx0XHR2YXIgdjAgPSAocDIgLSBwMCkgKiAwLjU7XG5cdFx0XHR2YXIgdjEgPSAocDMgLSBwMSkgKiAwLjU7XG5cdFx0XHR2YXIgdDIgPSB0ICogdDtcblx0XHRcdHZhciB0MyA9IHQgKiB0MjtcblxuXHRcdFx0cmV0dXJuICgyICogcDEgLSAyICogcDIgKyB2MCArIHYxKSAqIHQzICsgKC0gMyAqIHAxICsgMyAqIHAyIC0gMiAqIHYwIC0gdjEpICogdDIgKyB2MCAqIHQgKyBwMTtcblxuXHRcdH1cblxuXHR9XG5cbn07XG5cbi8vIFVNRCAoVW5pdmVyc2FsIE1vZHVsZSBEZWZpbml0aW9uKVxuKGZ1bmN0aW9uIChyb290KSB7XG5cblx0aWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuXG5cdFx0Ly8gQU1EXG5cdFx0ZGVmaW5lKFtdLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gVFdFRU47XG5cdFx0fSk7XG5cblx0fSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcblxuXHRcdC8vIE5vZGUuanNcblx0XHRtb2R1bGUuZXhwb3J0cyA9IFRXRUVOO1xuXG5cdH0gZWxzZSB7XG5cblx0XHQvLyBHbG9iYWwgdmFyaWFibGVcblx0XHRyb290LlRXRUVOID0gVFdFRU47XG5cblx0fVxuXG59KSh0aGlzKTtcbiJdfQ==
