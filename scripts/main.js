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
/**
 * Sets up an enviroment for detecting that 
 * the camera is looking at objects.
 */

'use strict';
var EventEmitter = require('fast-event-emitter');
var util = require('util');

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
	var _this2 = this;

	function InteractivityTarget(node) {
		var _this = this;

		EventEmitter.call(this);

		this.position = node.position;
		this.hasHover = false;
		this.object3d = node;

		this.on('hover', function () {
			if (!_this.hasHover) {
				_this.emit('hoverStart');
			}
			_this.hasHover = true;
		});

		this.on('hoverOut', function () {
			_this.hasHover = false;
		});

		this.hide = function () {
			_this.object3d.visible = false;
		};

		this.show = function () {
			_this.object3d.visible = true;
		};
	}
	util.inherits(InteractivityTarget, EventEmitter);

	this.targets = new Map();

	this.detectInteractions = function (camera) {

		var raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
		var hits = raycaster.intersectObjects(Array.from(this.targets.values()).map(function (target) {
			return target.object3d;
		}).filter(function (object3d) {
			return object3d.visible;
		}));

		var target = false;

		if (hits.length) {

			// Show hidden text object3d child
			target = this.targets.get(hits[0].object);
			if (target) target.emit('hover');
		}

		// if it is not the one just marked for highlight
		// and it used to be highlighted un highlight it.
		Array.from(this.targets.values()).filter(function (eachTarget) {
			return eachTarget !== target;
		}).forEach(function (eachNotHit) {
			if (eachNotHit.hasHover) eachNotHit.emit('hoverOut');
		});
	};

	var interact = function interact(event) {
		Array.from(_this2.targets.values()).forEach(function (target) {
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

	this.makeTarget = function (node) {
		var newTarget = new InteractivityTarget(node);
		_this2.targets.set(node, newTarget);
		return newTarget;
	};
};

},{"fast-event-emitter":15,"util":14}],3:[function(require,module,exports){
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

},{"./breakGeometryIntoVerletFaces":1}],4:[function(require,module,exports){
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

	// context2.rect(0, 0, canvas2.width, canvas2.height);
	// context2.fillStyle="red";
	// context2.fill();

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

/**
 * Use the json loader to load json files from the default location
 */

var l = new THREE.ObjectLoader();
var loadScene = function loadScene(id) {
	return new Promise(function (resolve, reject) {
		l.load('models/' + id + '.json', resolve, undefined, reject);
	});
};

/**
 * Helper for picking objects from a scene
 * @param  {Object3d}    root    root Object3d e.g. a scene or a mesh
 * @param  {...string} namesIn list of namesd to find e.g. 'Camera' or 'Floor'
 * @return {Object map}          map of names to objects {'Camera': (THREE.Camera with name Camera), 'Floor': (THREE.Mesh with name Floor)}
 */
function pickObjectsHelper(root) {

	var collection = {};

	for (var _len = arguments.length, namesIn = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
		namesIn[_key - 1] = arguments[_key];
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
}

/**
 * Load the scene with file name id and return the helper
 */
function myThreeFromJSON(id) {
	var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

	return loadScene(id).then(function (scene) {
		options.scene = scene;
		return new MyThreeHelper(options);
	});
}

/**
 * Helper object with some useful three functions
 * @param options
 *        scene: scene to use for default
 *        target: where in the dom to put the renderer
 *        camera: name of camera to use in the scene
 */
function MyThreeHelper(options) {
	var _this = this;

	EventEmitter.call(this);

	options.target = options.target || document.body;

	var renderer = new THREE.WebGLRenderer({ antialias: false });
	renderer.setPixelRatio(window.devicePixelRatio);

	options.target.appendChild(renderer.domElement);
	this.domElement = renderer.domElement;

	/**
  * Set up stereo effect renderer
  */

	var effect = new THREE.StereoEffect(renderer);
	effect.eyeSeparation = 0.008;
	effect.focalLength = 0.25;
	effect.setSize(window.innerWidth, window.innerHeight);
	this.renderMethod = effect;

	/**
  * Set up the scene to be rendered or create a new one
  */

	this.scene = options.scene || new THREE.Scene();

	/**
  * Set up camera either one from the scene or make a new one
  */

	var camera = options.camera ? pickObjectsHelper(this.scene, options.camera)[options.camera] : undefined;

	if (!camera) {
		console.log(camera);
		camera = new THREE.PerspectiveCamera(75, options.target.scrollWidth / options.target.scrollHeight, 0.5, 100);
		camera.position.set(0, 2, 0);
		camera.lookAt(new THREE.Vector3(0, camera.height, -9));
		camera.rotation.y += Math.PI;
	}
	camera.height = camera.position.y; // reference value for how high the camera should be
	// above the ground to maintain the illusion of presence
	camera.fov = 75;

	this.camera = camera;

	/**
  * Handle window resizes/rotations
  */

	var setAspect = function setAspect() {
		_this.renderMethod.setSize(options.target.clientWidth, options.target.clientHeight);
		_this.camera.aspect = options.target.scrollWidth / options.target.scrollHeight;
		_this.camera.updateProjectionMatrix();
	};
	window.addEventListener('resize', setAspect);
	setAspect();

	/**
  * Set up head tracking
  */

	// provide dummy element to prevent touch/click hijacking.
	var element = location.hostname !== 'localhost' ? document.createElement("DIV") : undefined;
	this.deviceOrientationController = new DeviceOrientationController(this.camera, element);
	this.deviceOrientationController.connect();
	this.on('prerender', function () {
		return _this.deviceOrientationController.update();
	});

	/**
  * This should be called in the main animation loop
  */

	this.render = function () {
		_this.emit('prerender');
		_this.renderMethod.render(_this.scene, camera);
		_this.emit('postrender');
	};

	/**
  * Heads up Display
  * 
  * Add a heads up display object to the camera
  * Meshes and Sprites can be added to this to appear to be close to the user.
  */

	var hud = new THREE.Object3D();
	hud.position.set(0, 0, -2.1);
	hud.scale.set(0.2, 0.2, 0.2);
	camera.add(hud);
	this.scene.add(this.camera); // add the camera to the scene so that the hud is rendered
	this.hud = hud;

	/**
  * ANIMATION
  * 
  * A map of physics object id to three.js object 3d so we can update all the positions
  */

	var threeObjectsConnectedToPhysics = {};
	this.updateObjects = function (physicsObjects) {
		var l = physicsObjects.length;

		// iterate over the physics physicsObjects
		for (var j = 0; j < l; j++) {

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
	};

	this.connectPhysicsToThree = function (mesh, physicsMesh) {
		threeObjectsConnectedToPhysics[physicsMesh.id] = mesh;
		if (mesh.constructor === THREE.Vector3) return;
		_this.scene.add(mesh);
	};

	/**
  * A function for going fullscreen
  */

	this.fullscreen = function () {
		if (options.target.requestFullscreen) {
			options.target.requestFullscreen();
		} else if (options.target.msRequestFullscreen) {
			options.target.msRequestFullscreen();
		} else if (options.target.mozRequestFullScreen) {
			options.target.mozRequestFullScreen();
		} else if (options.target.webkitRequestFullscreen) {
			options.target.webkitRequestFullscreen();
		}
	};

	/**
  * Make the object picker available on this object
  */

	this.pickObjectsHelper = pickObjectsHelper;
}
util.inherits(MyThreeHelper, EventEmitter);

module.exports.MyThreeHelper = MyThreeHelper;
module.exports.myThreeFromJSON = myThreeFromJSON;

},{"fast-event-emitter":15,"util":14}],8:[function(require,module,exports){
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
		border: 'none',
		pointerEvents: 'none'
	});
	iframe.setAttribute('seamless', 'seamless');
	iframe.setAttribute('mozbrowser', '1');
	iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
	this.iframe = iframe;
	this.parent = parent || document.body;
	this.parent.insertBefore(this.iframe, this.parent.firstChild);
}

VRTarget.prototype.load = function (url) {
	var _this = this;

	this.iframe.src = url;
	return new Promise((function (resolve) {
		this.iframe.addEventListener('load', resolve);
	}).bind(this)).then(function () {
		css(_this.iframe, {
			pointerEvents: 'auto'
		});
	});
};

VRTarget.prototype.unload = function (url) {
	this.iframe.src = 'about:blank';
	css(this.iframe, {
		pointerEvents: 'none'
	});
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
var CameraInteractions = require('./lib/camerainteractions'); // Tool for making interactive VR elements
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
	return require('./lib/threeHelper').myThreeFromJSON('hub');
}).then(function (threeHelper) {
	console.log('Ready');

	/**
  * Setup Click listener for fullscreen
  */
	threeHelper.domElement.addEventListener('click', threeHelper.fullscreen);

	var frame = new VRTarget(); // Setup iframe for loading sites into

	/**
  * Set up interactivity from the camera.
  */

	var cameraInteractivityWorld = new CameraInteractions(threeHelper.domElement);

	threeHelper.deviceOrientationController.addEventListener('userinteractionend', function () {
		cameraInteractivityWorld.interact({ type: 'click' });
	});

	var skyBox = require('./lib/sky')();
	threeHelper.scene.add(skyBox);
	skyBox.scale.multiplyScalar(0.00004);

	var dome = threeHelper.pickObjectsHelper(threeHelper.scene, 'dome').dome;
	dome.material = new THREE.MeshPhongMaterial({ color: 0xC0B9BB, specular: 0, shading: THREE.FlatShading, side: THREE.DoubleSide, transparent: true, opacity: 0.2 });
	threeHelper.scene.remove(dome);

	var grid = new THREE.GridHelper(10, 1);
	grid.setColors(0xff0000, 0xffffff);
	threeHelper.scene.add(grid);

	// Brand lights
	var ambientLight = new THREE.AmbientLight(0xc0b9bb);
	threeHelper.scene.add(ambientLight);

	var pLight0 = new THREE.DirectionalLight(0xC0B9BB, 0.5);
	pLight0.position.set(0, 1, 3);
	threeHelper.scene.add(pLight0);

	var pLight1 = new THREE.DirectionalLight(0xF9CCFF, 0.5);
	pLight1.position.set(8, -3, 0);
	threeHelper.scene.add(pLight1);

	var pLight2 = new THREE.DirectionalLight(0xE3FFAE, 0.5);
	pLight2.position.set(-8, -3, -3);
	threeHelper.scene.add(pLight2);

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
					threeHelper.updateObjects(points);
					waitingForPoints = false;
				});
				waitingForPoints = true;
			}
			cameraInteractivityWorld.detectInteractions(threeHelper.camera);
			threeHelper.render();
			TWEEN.update(time);
		});

		var map = THREE.ImageUtils.loadTexture("images/reticule.png");
		var material = new THREE.SpriteMaterial({ map: map, color: 0xffffff, fog: false, transparent: true });
		var sprite = new THREE.Sprite(material);
		threeHelper.hud.add(sprite);

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

		var i = 0;
		function addButton(str) {
			i++;
			var rows = 5;
			var sprite = textSprite(str, {
				fontsize: 18,
				fontface: 'Iceland',
				borderThickness: 20
			});
			threeHelper.scene.add(sprite);
			sprite.position.set(5 + Math.floor(i / rows), 5 - i % rows, 5);
			sprite.material.transparent = true;
			return cameraInteractivityWorld.makeTarget(sprite);
		}

		// Set up the dome breaking down and building back
		require('./lib/explodeDome')(dome, threeHelper, verlet).then(function (domeController) {
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
					return skyBox.visible = false;
				}).then(function () {
					return loadDoc(url);
				}).then(function () {
					return domeController.destroy();
				}).then(function () {
					return tweenDomeOpacity(0, 4000);
				}).then(function () {
					if (hubState === STATE_HUB_CLOSED) {
						threeHelper.domElement.style.pointerEvents = 'none';
						domeController.mesh.visible = false;
						animState = STATE_PAUSED;
						threeHelper.scene.visible = false;
						threeHelper.render();
					}
				});
			}

			function closeDocument() {
				threeHelper.scene.visible = true;
				hubState = STATE_HUB_OPEN;
				console.log(animState);
				animState = STATE_PLAYING;
				domeController.mesh.visible = true;
				Promise.all([domeController.restore(), tweenDomeOpacity(1, 2000)]).then(function () {
					return removeDoc();
				}).then(function () {
					return threeHelper.domElement.style.pointerEvents = 'auto';
				}).then(function () {
					return skyBox.visible = true;
				}).then(function () {
					return tweenDomeOpacity(0.2);
				});
			}

			window.showDocument = showDocument;
			window.closeDocument = closeDocument;

			var lightHouseDemoButton = addButton('Load Desert Demo');
			lightHouseDemoButton.on('click', function () {
				return showDocument('https://adaroseedwards.github.io/cardboard2/index.html#vr');
			});
			var kitchenDemoButton = addButton('Load Kitchen Demo');
			kitchenDemoButton.on('click', function () {
				return showDocument('https://adaroseedwards.github.io/vr-lick-the-whisk/');
			});
		});

		function reset() {
			threeHelper.camera.position.set(0, threeHelper.camera.height, 0);
		}

		// Set initial properties
		reset();
		window.threeHelper = threeHelper;
	});
});

},{"./lib/camerainteractions":2,"./lib/explodeDome":3,"./lib/loadScript":4,"./lib/sky":5,"./lib/textSprite":6,"./lib/threeHelper":7,"./lib/verletwrapper":8,"./lib/vrtarget":9,"tween.js":17}],11:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL2JyZWFrR2VvbWV0cnlJbnRvVmVybGV0RmFjZXMuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL2NhbWVyYWludGVyYWN0aW9ucy5qcyIsIi9ob21lL2FkYS9naXRXb3JraW5nRGlyL3ZyLWh1Yi9hcHAvc2NyaXB0cy9saWIvZXhwbG9kZURvbWUuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL2xvYWRTY3JpcHQuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL3NreS5qcyIsIi9ob21lL2FkYS9naXRXb3JraW5nRGlyL3ZyLWh1Yi9hcHAvc2NyaXB0cy9saWIvdGV4dFNwcml0ZS5qcyIsIi9ob21lL2FkYS9naXRXb3JraW5nRGlyL3ZyLWh1Yi9hcHAvc2NyaXB0cy9saWIvdGhyZWVIZWxwZXIuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL3ZlcmxldHdyYXBwZXIuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvbGliL3ZydGFyZ2V0LmpzIiwiL2hvbWUvYWRhL2dpdFdvcmtpbmdEaXIvdnItaHViL2FwcC9zY3JpcHRzL21haW4uanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiLCJub2RlX21vZHVsZXMvZmFzdC1ldmVudC1lbWl0dGVyL2xpYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mYXN0LWV2ZW50LWVtaXR0ZXIvbm9kZV9tb2R1bGVzL3Byb3RvY2xhc3MvbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3R3ZWVuLmpzL3NyYy9Ud2Vlbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNDQSxZQUFZLENBQUM7Ozs7OztBQUViLFNBQVMsNEJBQTRCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7O0FBRXZELFVBQVMsU0FBUyxDQUFDLFFBQVEsRUFBRTtBQUM1QixTQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDdEIsV0FBUSxFQUFFLFFBQVE7QUFDbEIsV0FBUSxFQUFFLEVBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUM7QUFDNUIsU0FBTSxFQUFFLENBQUM7QUFDVCxPQUFJLEVBQUUsSUFBSTtHQUNWLENBQUMsQ0FDRCxJQUFJLENBQUMsVUFBQSxDQUFDO1VBQUksQ0FBQyxDQUFDLEtBQUs7R0FBQSxDQUFDLENBQ2xCLElBQUksQ0FBQyxVQUFBLENBQUMsRUFBSTtBQUNWLE9BQU0sQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hFLElBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ2xCLFFBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEMsVUFBTyxDQUFDLENBQUM7R0FDVCxDQUFDLENBQUM7RUFDSDs7QUFFRCxVQUFTLFVBQVUsQ0FBQyxR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QXFELENBQUM7SUFBQSxDQUFDLENBQUM7R0FFekcsQ0FBQyxDQUFDOztBQUVILFdBQVMsS0FBSyxHQUFHO0FBQ2hCLGNBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7R0FDakU7OztBQUdELE9BQUssRUFBRSxDQUFDO0FBQ1IsUUFBTSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7RUFDakMsQ0FBQyxDQUFDO0NBQ0gsQ0FBQyxDQUFDOzs7QUNwUEg7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxa0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKmdsb2JhbCBUSFJFRSovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGJyZWFrR2VvbWV0cnlJbnRvVmVybGV0RmFjZXMoZywgdGhyZWUsIHZlcmxldCkge1xuXG5cdGZ1bmN0aW9uIG1ha2VQb2ludChwb3NpdGlvbikge1xuXHRcdHJldHVybiB2ZXJsZXQuYWRkUG9pbnQoe1xuXHRcdFx0cG9zaXRpb246IHBvc2l0aW9uLFxuXHRcdFx0dmVsb2NpdHk6IHt4OiAwLCB5OiAwLCB6OiAwfSxcblx0XHRcdHJhZGl1czogMCxcblx0XHRcdG1hc3M6IDAuMDFcblx0XHR9KVxuXHRcdC50aGVuKHAgPT4gcC5wb2ludClcblx0XHQudGhlbihwID0+IHtcblx0XHRcdGNvbnN0IHYgPSBuZXcgVEhSRUUuVmVjdG9yMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KTtcblx0XHRcdHYudmVybGV0UG9pbnQgPSBwO1xuXHRcdFx0dGhyZWUuY29ubmVjdFBoeXNpY3NUb1RocmVlKHYsIHApO1xuXHRcdFx0cmV0dXJuIHY7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlQW5jaG9yKHBvc2l0aW9uKSB7XG5cdFx0cmV0dXJuIHZlcmxldC5hZGRQb2ludCh7XG5cdFx0XHRwb3NpdGlvbjogcG9zaXRpb24sXG5cdFx0XHR2ZWxvY2l0eToge3g6IDAsIHk6IDAsIHo6IDB9LFxuXHRcdFx0cmFkaXVzOiAwLFxuXHRcdFx0bWFzczogMFxuXHRcdH0pXG5cdFx0LnRoZW4ocCA9PiBwLnBvaW50KTtcblx0fVxuXG5cdGNvbnN0IG5ld0dlb20gPSBuZXcgVEhSRUUuR2VvbWV0cnkoKTtcblx0bmV3R2VvbS5keW5hbWljID0gdHJ1ZTtcblxuXHQvLyBMaXN0IG9mIGFsbCBjb25zdHJhaW50IGlkc1xuXHRuZXdHZW9tLnZlcnRleFZlcmxldElkcyA9IFtdO1xuXG5cdC8vIE1hcCBvZiBhbGwgY29uc3RyYWludCBwb3NpdGlvblxuXHRuZXdHZW9tLnZlcnRleFZlcmxldFBvc2l0aW9ucyA9IFtdO1xuXG5cdC8vIExpc3Qgb2YgYWxsIGNvbnN0cmFpbnQgaWRzXG5cdG5ld0dlb20ucG9zaXRpb25Db25zdHJhaW50SWRzID0gW107XG5cblxuXHRjb25zdCBjb25uZWN0aW9ucyA9IFtdO1xuXG5cdHJldHVybiBQcm9taXNlLmFsbChnLmZhY2VzLm1hcChmdW5jdGlvbiAoZmFjZSkge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRtYWtlUG9pbnQoZy52ZXJ0aWNlc1tmYWNlLmFdKSxcblx0XHRcdG1ha2VQb2ludChnLnZlcnRpY2VzW2ZhY2UuYl0pLFxuXHRcdFx0bWFrZVBvaW50KGcudmVydGljZXNbZmFjZS5jXSlcblx0XHRdKVxuXHRcdC50aGVuKGZ1bmN0aW9uKFthLCBiLCBjXSkge1xuXG5cdFx0XHRpZiAoIWNvbm5lY3Rpb25zW2ZhY2UuYV0pIGNvbm5lY3Rpb25zW2ZhY2UuYV0gPSBbXTtcblx0XHRcdGlmICghY29ubmVjdGlvbnNbZmFjZS5iXSkgY29ubmVjdGlvbnNbZmFjZS5iXSA9IFtdO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uc1tmYWNlLmNdKSBjb25uZWN0aW9uc1tmYWNlLmNdID0gW107XG5cblx0XHRcdGNvbm5lY3Rpb25zW2ZhY2UuYV0ucHVzaChhKTtcblx0XHRcdGNvbm5lY3Rpb25zW2ZhY2UuYl0ucHVzaChiKTtcblx0XHRcdGNvbm5lY3Rpb25zW2ZhY2UuY10ucHVzaChjKTtcblxuXHRcdFx0Y29uc3QgbmV3RmFjZSA9IG5ldyBUSFJFRS5GYWNlMyhcblx0XHRcdFx0bmV3R2VvbS52ZXJ0aWNlcy5wdXNoKGEpIC0gMSxcblx0XHRcdFx0bmV3R2VvbS52ZXJ0aWNlcy5wdXNoKGIpIC0gMSxcblx0XHRcdFx0bmV3R2VvbS52ZXJ0aWNlcy5wdXNoKGMpIC0gMVxuXHRcdFx0KTtcblxuXHRcdFx0bmV3RmFjZS5wb3NpdGlvbkNvbnN0cmFpbnRJZHMgPSBbXTtcblx0XHRcdG5ld0ZhY2UudmVydGV4VmVybGV0SWRzID0gW1xuXHRcdFx0XHRhLnZlcmxldFBvaW50LmlkLFxuXHRcdFx0XHRiLnZlcmxldFBvaW50LmlkLFxuXHRcdFx0XHRjLnZlcmxldFBvaW50LmlkXG5cdFx0XHRdO1xuXHRcdFx0bmV3RmFjZS5hZGphY2VudEZhY2VzID0gbmV3IFNldCgpO1xuXG5cdFx0XHRuZXdHZW9tLnZlcnRleFZlcmxldElkcy5wdXNoKC4uLm5ld0ZhY2UudmVydGV4VmVybGV0SWRzKTtcblx0XHRcdG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2EudmVybGV0UG9pbnQuaWRdID0gYS5jbG9uZSgpO1xuXHRcdFx0bmV3R2VvbS52ZXJ0ZXhWZXJsZXRQb3NpdGlvbnNbYi52ZXJsZXRQb2ludC5pZF0gPSBiLmNsb25lKCk7XG5cdFx0XHRuZXdHZW9tLnZlcnRleFZlcmxldFBvc2l0aW9uc1tjLnZlcmxldFBvaW50LmlkXSA9IGMuY2xvbmUoKTtcblxuXHRcdFx0bmV3R2VvbS5mYWNlcy5wdXNoKG5ld0ZhY2UpO1xuXG5cdFx0XHRhLmZhY2UgPSBuZXdGYWNlO1xuXHRcdFx0Yi5mYWNlID0gbmV3RmFjZTtcblx0XHRcdGMuZmFjZSA9IG5ld0ZhY2U7XG5cblx0XHRcdGNvbnN0IHN0aWZmbmVzcyA9IDAuNDtcblx0XHRcdHZlcmxldC5jb25uZWN0UG9pbnRzKGEudmVybGV0UG9pbnQsIGIudmVybGV0UG9pbnQsIHtcblx0XHRcdFx0c3RpZmZuZXNzLFxuXHRcdFx0XHRyZXN0aW5nRGlzdGFuY2U6IGEuZGlzdGFuY2VUbyhiKVxuXHRcdFx0fSk7XG5cdFx0XHR2ZXJsZXQuY29ubmVjdFBvaW50cyhiLnZlcmxldFBvaW50LCBjLnZlcmxldFBvaW50LCB7XG5cdFx0XHRcdHN0aWZmbmVzcyxcblx0XHRcdFx0cmVzdGluZ0Rpc3RhbmNlOiBiLmRpc3RhbmNlVG8oYylcblx0XHRcdH0pO1xuXHRcdFx0dmVybGV0LmNvbm5lY3RQb2ludHMoYy52ZXJsZXRQb2ludCwgYS52ZXJsZXRQb2ludCwge1xuXHRcdFx0XHRzdGlmZm5lc3MsXG5cdFx0XHRcdHJlc3RpbmdEaXN0YW5jZTogYy5kaXN0YW5jZVRvKGEpXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSkpXG5cdC50aGVuKGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIEFsbCB0aGUgcG9pbnRzIHdoaWNoIGFyZSAndGhlIHNhbWUnIGxvb3NlbHkgY29ubmVjdCB0aGVtLlxuXHRcdHJldHVybiBQcm9taXNlLmFsbChjb25uZWN0aW9ucy5tYXAoKHBvaW50c1RvQ29ubmVjdCwgaSkgPT4ge1xuXG5cdFx0XHRyZXR1cm4gbWFrZUFuY2hvcihnLnZlcnRpY2VzW2ldKVxuXHRcdFx0LnRoZW4oYW5jaG9yID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHBvaW50c1RvQ29ubmVjdC5tYXAoKHAsIGkpID0+IHtcblx0XHRcdFx0XHRwb2ludHNUb0Nvbm5lY3QuZm9yRWFjaChvUCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAob1AuZmFjZSAhPT0gcC5mYWNlKSB7XG5cdFx0XHRcdFx0XHRcdHAuZmFjZS5hZGphY2VudEZhY2VzLmFkZChvUC5mYWNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gdmVybGV0LmNvbm5lY3RQb2ludHMocC52ZXJsZXRQb2ludCwgYW5jaG9yLCB7XG5cdFx0XHRcdFx0XHRzdGlmZm5lc3M6IDAuNixcblx0XHRcdFx0XHRcdHJlc3RpbmdEaXN0YW5jZTogMC4wMVxuXHRcdFx0XHRcdH0pLnRoZW4oYyA9PiB7XG5cdFx0XHRcdFx0XHRwLmZhY2UucG9zaXRpb25Db25zdHJhaW50SWRzLnB1c2goYy5jb25zdHJhaW50SWQpO1xuXHRcdFx0XHRcdFx0bmV3R2VvbS5wb3NpdGlvbkNvbnN0cmFpbnRJZHMucHVzaChjLmNvbnN0cmFpbnRJZCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fSlcblx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXG5cdFx0bmV3R2VvbS52ZXJ0aWNlc05lZWRVcGRhdGUgPSB0cnVlO1xuXHRcdG5ld0dlb20ubm9ybWFsc05lZWRVcGRhdGUgPSB0cnVlO1xuXG5cdFx0Ly8gQ29udmVydCBTZXQgaW50byBBcnJheVxuXHRcdG5ld0dlb20uZmFjZXMuZm9yRWFjaChmID0+IGYuYWRqYWNlbnRGYWNlcyA9IFsuLi5mLmFkamFjZW50RmFjZXNdKTtcblx0XHRyZXR1cm4gbmV3R2VvbTtcblx0fSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYnJlYWtHZW9tZXRyeUludG9WZXJsZXRGYWNlcztcbiIsIi8qKlxuICogU2V0cyB1cCBhbiBlbnZpcm9tZW50IGZvciBkZXRlY3RpbmcgdGhhdCBcbiAqIHRoZSBjYW1lcmEgaXMgbG9va2luZyBhdCBvYmplY3RzLlxuICovXG5cbid1c2Ugc3RyaWN0JztcbmNvbnN0IEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Zhc3QtZXZlbnQtZW1pdHRlcicpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLypnbG9iYWwgVEhSRUUqL1xuLyoqXG4gKiBLZWVwcyB0cmFjayBvZiBpbnRlcmFjdGl2ZSAzRCBlbGVtZW50cyBhbmQgXG4gKiBjYW4gYmUgdXNlZCB0byB0cmlnZ2VyIGV2ZW50cyBvbiB0aGVtLlxuICpcbiAqIFRoZSBkb21FbGVtZW50IGlzIHRvIHBpY2sgdXAgdG91Y2ggaW5lcmFjdGlvbnNcbiAqIFxuICogQHBhcmFtICB7W3R5cGVdfSBkb21FbGVtZW50IFtkZXNjcmlwdGlvbl1cbiAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgICBbZGVzY3JpcHRpb25dXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gQ2FtZXJhSW50ZXJhY3Rpdml0eVdvcmxkKGRvbUVsZW1lbnQpIHtcblxuXHRmdW5jdGlvbiBJbnRlcmFjdGl2aXR5VGFyZ2V0KG5vZGUpIHtcblxuXHRcdEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG5cdFx0dGhpcy5wb3NpdGlvbiA9IG5vZGUucG9zaXRpb247XG5cdFx0dGhpcy5oYXNIb3ZlciA9IGZhbHNlO1xuXHRcdHRoaXMub2JqZWN0M2QgPSBub2RlO1xuXG5cdFx0dGhpcy5vbignaG92ZXInLCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaGFzSG92ZXIpIHtcblx0XHRcdFx0dGhpcy5lbWl0KCdob3ZlclN0YXJ0Jyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmhhc0hvdmVyID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRoaXMub24oJ2hvdmVyT3V0JywgKCkgPT4ge1xuXHRcdFx0dGhpcy5oYXNIb3ZlciA9IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5oaWRlID0gKCkgPT57XG5cdFx0XHR0aGlzLm9iamVjdDNkLnZpc2libGUgPSBmYWxzZTtcblx0XHR9O1xuXG5cdFx0dGhpcy5zaG93ID0gKCkgPT57XG5cdFx0XHR0aGlzLm9iamVjdDNkLnZpc2libGUgPSB0cnVlO1xuXHRcdH07XG5cdH1cblx0dXRpbC5pbmhlcml0cyhJbnRlcmFjdGl2aXR5VGFyZ2V0LCBFdmVudEVtaXR0ZXIpO1xuXG5cdHRoaXMudGFyZ2V0cyA9IG5ldyBNYXAoKTtcblxuXHR0aGlzLmRldGVjdEludGVyYWN0aW9ucyA9IGZ1bmN0aW9uIChjYW1lcmEpIHtcblxuXHRcdGNvbnN0IHJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKTtcblx0XHRyYXljYXN0ZXIuc2V0RnJvbUNhbWVyYShuZXcgVEhSRUUuVmVjdG9yMigwLDApLCBjYW1lcmEpO1xuXHRcdGNvbnN0IGhpdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyhcblx0XHRcdEFycmF5LmZyb20odGhpcy50YXJnZXRzLnZhbHVlcygpKVxuXHRcdFx0Lm1hcCh0YXJnZXQgPT4gdGFyZ2V0Lm9iamVjdDNkKVxuXHRcdFx0LmZpbHRlcihvYmplY3QzZCA9PiBvYmplY3QzZC52aXNpYmxlKVxuXHRcdCk7XG5cblx0XHRsZXQgdGFyZ2V0ID0gZmFsc2U7XG5cblx0XHRpZiAoaGl0cy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gU2hvdyBoaWRkZW4gdGV4dCBvYmplY3QzZCBjaGlsZFxuXHRcdFx0dGFyZ2V0ID0gdGhpcy50YXJnZXRzLmdldChoaXRzWzBdLm9iamVjdCk7XG5cdFx0XHRpZiAodGFyZ2V0KSB0YXJnZXQuZW1pdCgnaG92ZXInKTtcblx0XHR9XG5cblx0XHQvLyBpZiBpdCBpcyBub3QgdGhlIG9uZSBqdXN0IG1hcmtlZCBmb3IgaGlnaGxpZ2h0XG5cdFx0Ly8gYW5kIGl0IHVzZWQgdG8gYmUgaGlnaGxpZ2h0ZWQgdW4gaGlnaGxpZ2h0IGl0LlxuXHRcdEFycmF5LmZyb20odGhpcy50YXJnZXRzLnZhbHVlcygpKVxuXHRcdC5maWx0ZXIoZWFjaFRhcmdldCA9PiBlYWNoVGFyZ2V0ICE9PSB0YXJnZXQpXG5cdFx0LmZvckVhY2goZWFjaE5vdEhpdCA9PiB7XG5cdFx0XHRpZiAoZWFjaE5vdEhpdC5oYXNIb3ZlcikgZWFjaE5vdEhpdC5lbWl0KCdob3Zlck91dCcpO1xuXHRcdH0pO1xuXHR9O1xuXG5cdGNvbnN0IGludGVyYWN0ID0gKGV2ZW50KSA9PiB7XG5cdFx0QXJyYXkuZnJvbSh0aGlzLnRhcmdldHMudmFsdWVzKCkpLmZvckVhY2godGFyZ2V0ID0+IHtcblx0XHRcdGlmICh0YXJnZXQuaGFzSG92ZXIpIHtcblx0XHRcdFx0dGFyZ2V0LmVtaXQoZXZlbnQudHlwZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH07XG5cdHRoaXMuaW50ZXJhY3QgPSBpbnRlcmFjdDtcblxuXHRkb21FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW50ZXJhY3QpO1xuXHRkb21FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGludGVyYWN0KTtcblx0ZG9tRWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaW50ZXJhY3QpO1xuXHRkb21FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNodXAnLCBpbnRlcmFjdCk7XG5cdGRvbUVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hkb3duJywgaW50ZXJhY3QpO1xuXG5cdHRoaXMubWFrZVRhcmdldCA9IG5vZGUgPT4ge1xuXHRcdGNvbnN0IG5ld1RhcmdldCA9IG5ldyBJbnRlcmFjdGl2aXR5VGFyZ2V0KG5vZGUpO1xuXHRcdHRoaXMudGFyZ2V0cy5zZXQobm9kZSwgbmV3VGFyZ2V0KTtcblx0XHRyZXR1cm4gbmV3VGFyZ2V0O1xuXHR9O1xufTtcbiIsIi8qZ2xvYmFsIFRIUkVFKi9cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzZXRVcEV4cGxvZGluZ0RvbWUoZG9tZSwgdGhyZWUsIHZlcmxldCkge1xuXG5cdHJldHVybiByZXF1aXJlKCcuL2JyZWFrR2VvbWV0cnlJbnRvVmVybGV0RmFjZXMnKShkb21lLmdlb21ldHJ5LCB0aHJlZSwgdmVybGV0KVxuXHQudGhlbihzZXRVcEZhbGxpbmdBbmRSZWNvbnN0cnVjdGlvbkNvbnRyb2xsZXIpO1xuXG5cblx0ZnVuY3Rpb24gc2V0VXBGYWxsaW5nQW5kUmVjb25zdHJ1Y3Rpb25Db250cm9sbGVyKG5ld0dlb20pIHtcblxuXHRcdGxldCBkZXN0cm95ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB0aW1lb3V0cyA9IFtdO1xuXHRcdGNvbnN0IGZhbGxSYXRlID0gNTAwO1xuXHRcdGNvbnN0IG5ld0RvbWUgPSBuZXcgVEhSRUUuTWVzaChcblx0XHRcdG5ld0dlb20sXG5cdFx0XHRkb21lLm1hdGVyaWFsXG5cdFx0KTtcblx0XHR0aHJlZS5zY2VuZS5hZGQobmV3RG9tZSk7XG5cblx0XHRuZXdHZW9tLm5vcm1hbHNOZWVkVXBkYXRlID0gdHJ1ZTtcblx0XHR0aHJlZS5vbigncHJlcmVuZGVyJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0bmV3R2VvbS52ZXJ0aWNlc05lZWRVcGRhdGUgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gZmFjZUZhbGwoZikge1xuXHRcdFx0aWYgKCFmKSByZXR1cm47XG5cdFx0XHRmb3IobGV0IGk9MDsgaSA8IDM7aSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnN0cmFpbnRJZCA9IGYucG9zaXRpb25Db25zdHJhaW50SWRzW2ldO1xuXHRcdFx0XHRjb25zdCB2ZXJsZXRJZCA9IGYudmVydGV4VmVybGV0SWRzW2ldO1xuXHRcdFx0XHR2ZXJsZXQudXBkYXRlQ29uc3RyYWludCh7XG5cdFx0XHRcdFx0Y29uc3RyYWludElkLFxuXHRcdFx0XHRcdHN0aWZmbmVzczogMFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dmVybGV0LnVwZGF0ZVBvaW50KHtcblx0XHRcdFx0XHRpZDogdmVybGV0SWQsXG5cdFx0XHRcdFx0bWFzczogMSxcblx0XHRcdFx0XHR2ZWxvY2l0eToge1xuXHRcdFx0XHRcdFx0eDogMC41ICogKE1hdGgucmFuZG9tKCkgLSAwLjUpLFxuXHRcdFx0XHRcdFx0eTogMC41ICogKE1hdGgucmFuZG9tKCkgLSAwLjUpLFxuXHRcdFx0XHRcdFx0ejogMC41ICogKE1hdGgucmFuZG9tKCkgLSAwLjUpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcmVjdXJzaXZlRmFsbChzdGFydEZhY2UpIHtcblx0XHRcdGZhY2VGYWxsKHN0YXJ0RmFjZSk7XG5cdFx0XHRjb25zdCBsID0gc3RhcnRGYWNlLmFkamFjZW50RmFjZXMubGVuZ3RoO1xuXHRcdFx0Zm9yIChsZXQgaT0wOyBpPGw7IGkrKykge1xuXHRcdFx0XHRjb25zdCBmID0gc3RhcnRGYWNlLmFkamFjZW50RmFjZXNbaV07XG5cdFx0XHRcdGlmICghZi5mYWxsaW5nKSB7XG5cdFx0XHRcdFx0Zi5mYWxsaW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR0aW1lb3V0cy5wdXNoKHNldFRpbWVvdXQocmVjdXJzaXZlRmFsbCwgZmFsbFJhdGUsIGYpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHJlc3RvcmUoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHdoaWxlKHRpbWVvdXRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0cy5wb3AoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV3R2VvbS5wb3NpdGlvbkNvbnN0cmFpbnRJZHMuZm9yRWFjaChjb25zdHJhaW50SWQgPT4gdmVybGV0LnVwZGF0ZUNvbnN0cmFpbnQoe2NvbnN0cmFpbnRJZCwgc3RpZmZuZXNzOiAwLjMgfSkpO1xuXHRcdFx0XHR0aW1lb3V0cy5wdXNoKHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdG5ld0dlb20ucG9zaXRpb25Db25zdHJhaW50SWRzLmZvckVhY2goY29uc3RyYWludElkID0+IHZlcmxldC51cGRhdGVDb25zdHJhaW50KHtjb25zdHJhaW50SWQsIHN0aWZmbmVzczogMC41IH0pKTtcblx0XHRcdFx0XHRuZXdHZW9tLnZlcnRleFZlcmxldElkcy5mb3JFYWNoKGlkID0+IHtcblx0XHRcdFx0XHRcdHZlcmxldC51cGRhdGVQb2ludCh7XG5cdFx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0XHRtYXNzOiAwLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdHg6IG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2lkXS54LFxuXHRcdFx0XHRcdFx0XHRcdHk6IG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2lkXS55LFxuXHRcdFx0XHRcdFx0XHRcdHo6IG5ld0dlb20udmVydGV4VmVybGV0UG9zaXRpb25zW2lkXS56XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSgpLCBmYWxsUmF0ZSk7XG5cdFx0XHRcdH0sIGZhbGxSYXRlKSk7XG5cdFx0XHRcdG5ld0dlb20uZmFjZXMuZm9yRWFjaChmYWNlID0+IGZhY2UuZmFsbGluZyA9IGZhbHNlKTtcblx0XHRcdFx0ZGVzdHJveWVkID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBkZXN0cm95KCkge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCByYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKCk7XG5cdFx0XHRcdHJheWNhc3Rlci5zZXRGcm9tQ2FtZXJhKG5ldyBUSFJFRS5WZWN0b3IyKDAsMCksIHRocmVlLmNhbWVyYSk7XG5cdFx0XHRcdGNvbnN0IGhpdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyhbbmV3RG9tZV0pO1xuXHRcdFx0XHRpZiAoaGl0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZWN1cnNpdmVGYWxsKGhpdHNbMF0uZmFjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVzdHJveWVkID0gdHJ1ZTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlc3Ryb3ksXG5cdFx0XHRyZXN0b3JlLFxuXHRcdFx0dG9nZ2xlKCkge1xuXHRcdFx0XHQoZGVzdHJveWVkID8gcmVzdG9yZSA6IGRlc3Ryb3kpKCk7XG5cdFx0XHR9LFxuXHRcdFx0bWVzaDogbmV3RG9tZVxuXHRcdH07XG5cdH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGFkZFNjcmlwdCh1cmwpIHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcblx0XHR2YXIgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG5cdFx0c2NyaXB0LnNldEF0dHJpYnV0ZSgnc3JjJywgdXJsKTtcblx0XHRkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG5cdFx0c2NyaXB0Lm9ubG9hZCA9IHJlc29sdmU7XG5cdFx0c2NyaXB0Lm9uZXJyb3IgPSByZWplY3Q7XG5cdH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFkZFNjcmlwdDtcbiIsIi8qZ2xvYmFsIFRIUkVFKi9cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbml0U2t5KCkge1xuXG5cdC8vIEFkZCBTa3kgTWVzaFxuXHRjb25zdCBza3kgPSBuZXcgVEhSRUUuU2t5KCk7XG5cblx0dmFyIGVmZmVjdENvbnRyb2xsZXIgID0ge1xuXHRcdHR1cmJpZGl0eTogMTAsXG5cdFx0cmVpbGVpZ2g6IDIsXG5cdFx0bWllQ29lZmZpY2llbnQ6IDAuMDA1LFxuXHRcdG1pZURpcmVjdGlvbmFsRzogMC44LFxuXHRcdGx1bWluYW5jZTogMSxcblx0XHRpbmNsaW5hdGlvbjogMC40OSwgLy8gZWxldmF0aW9uIC8gaW5jbGluYXRpb25cblx0XHRhemltdXRoOiAwLjI1LCAvLyBGYWNpbmcgZnJvbnQsXG5cdH07XG5cblx0dmFyIGRpc3RhbmNlID0gNDAwMDAwO1xuXG5cdGZ1bmN0aW9uIGluaXRVbmlmb3JtcygpIHtcblxuXHRcdGNvbnN0IHVuaWZvcm1zID0gc2t5LnVuaWZvcm1zO1xuXHRcdGNvbnN0IHN1blBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cdFx0dW5pZm9ybXMudHVyYmlkaXR5LnZhbHVlID0gZWZmZWN0Q29udHJvbGxlci50dXJiaWRpdHk7XG5cdFx0dW5pZm9ybXMucmVpbGVpZ2gudmFsdWUgPSBlZmZlY3RDb250cm9sbGVyLnJlaWxlaWdoO1xuXHRcdHVuaWZvcm1zLmx1bWluYW5jZS52YWx1ZSA9IGVmZmVjdENvbnRyb2xsZXIubHVtaW5hbmNlO1xuXHRcdHVuaWZvcm1zLm1pZUNvZWZmaWNpZW50LnZhbHVlID0gZWZmZWN0Q29udHJvbGxlci5taWVDb2VmZmljaWVudDtcblx0XHR1bmlmb3Jtcy5taWVEaXJlY3Rpb25hbEcudmFsdWUgPSBlZmZlY3RDb250cm9sbGVyLm1pZURpcmVjdGlvbmFsRztcblxuXHRcdHZhciB0aGV0YSA9IE1hdGguUEkgKiAoIGVmZmVjdENvbnRyb2xsZXIuaW5jbGluYXRpb24gLSAwLjUgKTtcblx0XHR2YXIgcGhpID0gMiAqIE1hdGguUEkgKiAoIGVmZmVjdENvbnRyb2xsZXIuYXppbXV0aCAtIDAuNSApO1xuXG5cdFx0c3VuUG9zLnggPSBkaXN0YW5jZSAqIE1hdGguY29zKCBwaGkgKTtcblx0XHRzdW5Qb3MueSA9IGRpc3RhbmNlICogTWF0aC5zaW4oIHBoaSApICogTWF0aC5zaW4oIHRoZXRhICk7XG5cdFx0c3VuUG9zLnogPSBkaXN0YW5jZSAqIE1hdGguc2luKCBwaGkgKSAqIE1hdGguY29zKCB0aGV0YSApO1xuXG5cdFx0c2t5LnVuaWZvcm1zLnN1blBvc2l0aW9uLnZhbHVlLmNvcHkoIHN1blBvcyApO1xuXG5cdH1cblx0aW5pdFVuaWZvcm1zKCk7XG5cblx0cmV0dXJuIHNreS5tZXNoO1xufTtcbiIsIi8vIEZyb20gaHR0cDovL3N0ZW1rb3NraS5naXRodWIuaW8vVGhyZWUuanMvU3ByaXRlLVRleHQtTGFiZWxzLmh0bWxcbi8qZ2xvYmFsIFRIUkVFKi9cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gbWFrZVRleHRTcHJpdGUoIG1lc3NhZ2UsIHBhcmFtZXRlcnMgKSB7XG5cdGlmICggcGFyYW1ldGVycyA9PT0gdW5kZWZpbmVkICkgcGFyYW1ldGVycyA9IHt9O1xuXHRcblx0Y29uc3QgZm9udGZhY2UgPSBwYXJhbWV0ZXJzLmhhc093blByb3BlcnR5KFwiZm9udGZhY2VcIikgPyBcblx0XHRwYXJhbWV0ZXJzW1wiZm9udGZhY2VcIl0gOiBcIkFyaWFsXCI7XG5cdFxuXHRjb25zdCBib3JkZXJUaGlja25lc3MgPSBwYXJhbWV0ZXJzLmhhc093blByb3BlcnR5KFwiYm9yZGVyVGhpY2tuZXNzXCIpID8gXG5cdFx0cGFyYW1ldGVyc1tcImJvcmRlclRoaWNrbmVzc1wiXSA6IDI7XG5cblx0Ly8gbWF5IHR3ZWFrZWQgbGF0ZXIgdG8gc2NhbGUgdGV4dFxuXHRsZXQgc2l6ZSA9IHBhcmFtZXRlcnMuaGFzT3duUHJvcGVydHkoXCJzaXplXCIpID8gXG5cdFx0cGFyYW1ldGVyc1tcInNpemVcIl0gOiAxO1xuXHRcdFxuXHRjb25zdCBjYW52YXMxID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdGNvbnN0IGNvbnRleHQxID0gY2FudmFzMS5nZXRDb250ZXh0KCcyZCcpO1xuXHRjb25zdCBoZWlnaHQgPSAyNTY7XG5cblx0ZnVuY3Rpb24gc2V0U3R5bGUoY29udGV4dCkge1xuXG5cdFx0Y29udGV4dC5mb250ID0gXCJCb2xkIFwiICsgKGhlaWdodCAtIGJvcmRlclRoaWNrbmVzcykgKyBcInB4IFwiICsgZm9udGZhY2U7XG5cdFx0Y29udGV4dC50ZXh0QWxpZ24gPSAnY2VudGVyJztcblx0XHRjb250ZXh0LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xuXHRcdFxuXHRcdGNvbnRleHQubGluZVdpZHRoID0gYm9yZGVyVGhpY2tuZXNzO1xuXG5cdFx0Ly8gdGV4dCBjb2xvclxuXHRcdGNvbnRleHQuc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjU1LCAyNTUsIDI1NSwgMS4wKVwiO1xuXHRcdGNvbnRleHQuZmlsbFN0eWxlID0gXCJyZ2JhKDAsIDAsIDAsIDEuMClcIjtcblx0fVxuXG5cdHNldFN0eWxlKGNvbnRleHQxKTtcblxuXHRjb25zdCBjYW52YXMyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cblx0Ly8gTWFrZSB0aGUgY2FudmFzIHdpZHRoIGEgcG93ZXIgb2YgMiBsYXJnZXIgdGhhbiB0aGUgdGV4dCB3aWR0aFxuXHRjb25zdCBtZWFzdXJlID0gY29udGV4dDEubWVhc3VyZVRleHQoIG1lc3NhZ2UgKTtcblx0Y2FudmFzMi53aWR0aCA9IE1hdGgucG93KDIsIE1hdGguY2VpbChNYXRoLmxvZzIoIG1lYXN1cmUud2lkdGggKSkpO1xuXHRjYW52YXMyLmhlaWdodCA9IGhlaWdodDtcblx0Y29uc29sZS5sb2cobWVhc3VyZSk7XG5cdGNvbnN0IGNvbnRleHQyID0gY2FudmFzMi5nZXRDb250ZXh0KCcyZCcpO1xuXG5cdC8vIGNvbnRleHQyLnJlY3QoMCwgMCwgY2FudmFzMi53aWR0aCwgY2FudmFzMi5oZWlnaHQpO1xuXHQvLyBjb250ZXh0Mi5maWxsU3R5bGU9XCJyZWRcIjtcblx0Ly8gY29udGV4dDIuZmlsbCgpO1xuXG5cdHNldFN0eWxlKGNvbnRleHQyKTtcblxuXHRjb250ZXh0Mi5zdHJva2VUZXh0KCBtZXNzYWdlLCBjYW52YXMyLndpZHRoLzIsIGNhbnZhczIuaGVpZ2h0LzIpO1xuXHRjb250ZXh0Mi5maWxsVGV4dCggbWVzc2FnZSwgY2FudmFzMi53aWR0aC8yLCBjYW52YXMyLmhlaWdodC8yKTtcblx0XG5cdC8vIGNhbnZhcyBjb250ZW50cyB3aWxsIGJlIHVzZWQgZm9yIGEgdGV4dHVyZVxuXHRjb25zdCB0ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoY2FudmFzMikgO1xuXHR0ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcblxuXHRjb25zdCBzcHJpdGVNYXRlcmlhbCA9IG5ldyBUSFJFRS5TcHJpdGVNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSwgdHJhbnNwYXJlbnQ6IHRydWUgfSk7XG5cdGNvbnN0IHNwcml0ZSA9IG5ldyBUSFJFRS5TcHJpdGUoc3ByaXRlTWF0ZXJpYWwpO1xuXG5cdGNvbnN0IG1heFdpZHRoID0gaGVpZ2h0ICogNDtcblxuXHRpZiAoY2FudmFzMi53aWR0aCA+IG1heFdpZHRoKSBzaXplICo9IG1heFdpZHRoL2NhbnZhczIud2lkdGg7XG5cdGNvbnNvbGUubG9nKGNhbnZhczIud2lkdGgsIGNhbnZhczIuaGVpZ2h0KTtcbiAgICBcblx0Ly8gZ2V0IHNpemUgZGF0YSAoaGVpZ2h0IGRlcGVuZHMgb25seSBvbiBmb250IHNpemUpXG5cdHNwcml0ZS5zY2FsZS5zZXQoc2l6ZSAqIGNhbnZhczIud2lkdGgvY2FudmFzMi5oZWlnaHQsIHNpemUsIDEpO1xuXHRyZXR1cm4gc3ByaXRlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1ha2VUZXh0U3ByaXRlO1xuIiwiLyogZ2xvYmFsIFRIUkVFLCBEZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXIgKi9cbid1c2Ugc3RyaWN0JztcbmNvbnN0IEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Zhc3QtZXZlbnQtZW1pdHRlcicpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuXG5cbi8qKlxuICogVXNlIHRoZSBqc29uIGxvYWRlciB0byBsb2FkIGpzb24gZmlsZXMgZnJvbSB0aGUgZGVmYXVsdCBsb2NhdGlvblxuICovXG5cbnZhciBsID0gbmV3IFRIUkVFLk9iamVjdExvYWRlcigpO1xuY29uc3QgbG9hZFNjZW5lID0gKGlkKSA9PiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG5cdGwubG9hZCgnbW9kZWxzLycgKyBpZCArICcuanNvbicsIHJlc29sdmUsIHVuZGVmaW5lZCwgcmVqZWN0KTtcbn0pO1xuXG4vKipcbiAqIEhlbHBlciBmb3IgcGlja2luZyBvYmplY3RzIGZyb20gYSBzY2VuZVxuICogQHBhcmFtICB7T2JqZWN0M2R9ICAgIHJvb3QgICAgcm9vdCBPYmplY3QzZCBlLmcuIGEgc2NlbmUgb3IgYSBtZXNoXG4gKiBAcGFyYW0gIHsuLi5zdHJpbmd9IG5hbWVzSW4gbGlzdCBvZiBuYW1lc2QgdG8gZmluZCBlLmcuICdDYW1lcmEnIG9yICdGbG9vcidcbiAqIEByZXR1cm4ge09iamVjdCBtYXB9ICAgICAgICAgIG1hcCBvZiBuYW1lcyB0byBvYmplY3RzIHsnQ2FtZXJhJzogKFRIUkVFLkNhbWVyYSB3aXRoIG5hbWUgQ2FtZXJhKSwgJ0Zsb29yJzogKFRIUkVFLk1lc2ggd2l0aCBuYW1lIEZsb29yKX1cbiAqL1xuZnVuY3Rpb24gcGlja09iamVjdHNIZWxwZXIocm9vdCwgLi4ubmFtZXNJbikge1xuXG5cdGNvbnN0IGNvbGxlY3Rpb24gPSB7fTtcblx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0KG5hbWVzSW4pO1xuXG5cdChmdW5jdGlvbiBwaWNrT2JqZWN0cyhyb290KSB7XG5cdFx0aWYgKHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdHJvb3QuY2hpbGRyZW4uZm9yRWFjaChub2RlID0+IHtcblx0XHRcdFx0aWYgKG5hbWVzLmhhcyhub2RlLm5hbWUpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdGlvbltub2RlLm5hbWVdID0gbm9kZTtcblx0XHRcdFx0XHRuYW1lcy5kZWxldGUobm9kZS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmFtZXMuc2l6ZSkge1xuXHRcdFx0XHRcdHBpY2tPYmplY3RzKG5vZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pKHJvb3QpO1xuXG5cdGlmIChuYW1lcy5zaXplKSB7XG5cdFx0Y29uc29sZS53YXJuKCdOb3QgYWxsIG9iamVjdHMgZm91bmQ6ICcgKyBuYW1lcy52YWx1ZXMoKS5uZXh0KCkudmFsdWUgKyAnIG1pc3NpbmcnKTtcblx0fVxuXG5cdHJldHVybiBjb2xsZWN0aW9uO1xufVxuXG4vKipcbiAqIExvYWQgdGhlIHNjZW5lIHdpdGggZmlsZSBuYW1lIGlkIGFuZCByZXR1cm4gdGhlIGhlbHBlclxuICovXG5mdW5jdGlvbiBteVRocmVlRnJvbUpTT04oaWQsIG9wdGlvbnM9e30pIHtcblx0cmV0dXJuIGxvYWRTY2VuZShpZCkudGhlbihzY2VuZSA9PiB7XG5cdFx0b3B0aW9ucy5zY2VuZSA9IHNjZW5lO1xuXHRcdHJldHVybiBuZXcgTXlUaHJlZUhlbHBlcihvcHRpb25zKTtcblx0fSk7XG59XG5cbi8qKlxuICogSGVscGVyIG9iamVjdCB3aXRoIHNvbWUgdXNlZnVsIHRocmVlIGZ1bmN0aW9uc1xuICogQHBhcmFtIG9wdGlvbnNcbiAqICAgICAgICBzY2VuZTogc2NlbmUgdG8gdXNlIGZvciBkZWZhdWx0XG4gKiAgICAgICAgdGFyZ2V0OiB3aGVyZSBpbiB0aGUgZG9tIHRvIHB1dCB0aGUgcmVuZGVyZXJcbiAqICAgICAgICBjYW1lcmE6IG5hbWUgb2YgY2FtZXJhIHRvIHVzZSBpbiB0aGUgc2NlbmVcbiAqL1xuZnVuY3Rpb24gTXlUaHJlZUhlbHBlcihvcHRpb25zKXtcblxuXHRFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKTtcblxuXHRvcHRpb25zLnRhcmdldCA9IG9wdGlvbnMudGFyZ2V0IHx8IGRvY3VtZW50LmJvZHk7XG5cblx0Y29uc3QgcmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlciggeyBhbnRpYWxpYXM6IGZhbHNlIH0gKTtcblx0cmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyggd2luZG93LmRldmljZVBpeGVsUmF0aW8gKTtcblxuXHRvcHRpb25zLnRhcmdldC5hcHBlbmRDaGlsZChyZW5kZXJlci5kb21FbGVtZW50KTtcblx0dGhpcy5kb21FbGVtZW50ID0gcmVuZGVyZXIuZG9tRWxlbWVudDtcblxuXG5cblx0LyoqXG5cdCAqIFNldCB1cCBzdGVyZW8gZWZmZWN0IHJlbmRlcmVyXG5cdCAqL1xuXG5cdGNvbnN0IGVmZmVjdCA9IG5ldyBUSFJFRS5TdGVyZW9FZmZlY3QocmVuZGVyZXIpO1xuXHRlZmZlY3QuZXllU2VwYXJhdGlvbiA9IDAuMDA4O1xuXHRlZmZlY3QuZm9jYWxMZW5ndGggPSAwLjI1O1xuXHRlZmZlY3Quc2V0U2l6ZSggd2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCApO1xuXHR0aGlzLnJlbmRlck1ldGhvZCA9IGVmZmVjdDtcblxuXG5cblx0LyoqXG5cdCAqIFNldCB1cCB0aGUgc2NlbmUgdG8gYmUgcmVuZGVyZWQgb3IgY3JlYXRlIGEgbmV3IG9uZVxuXHQgKi9cblxuXHR0aGlzLnNjZW5lID0gb3B0aW9ucy5zY2VuZSB8fCBuZXcgVEhSRUUuU2NlbmUoKTtcblxuXG5cblx0LyoqXG5cdCAqIFNldCB1cCBjYW1lcmEgZWl0aGVyIG9uZSBmcm9tIHRoZSBzY2VuZSBvciBtYWtlIGEgbmV3IG9uZVxuXHQgKi9cblx0XG5cdGxldCBjYW1lcmEgPSBvcHRpb25zLmNhbWVyYSA/IHBpY2tPYmplY3RzSGVscGVyKHRoaXMuc2NlbmUsIG9wdGlvbnMuY2FtZXJhKVtvcHRpb25zLmNhbWVyYV0gOiB1bmRlZmluZWQ7XG5cblx0aWYgKCFjYW1lcmEpIHtcblx0XHRjb25zb2xlLmxvZyhjYW1lcmEpO1xuXHRcdGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSggNzUsIG9wdGlvbnMudGFyZ2V0LnNjcm9sbFdpZHRoIC8gb3B0aW9ucy50YXJnZXQuc2Nyb2xsSGVpZ2h0LCAwLjUsIDEwMCApO1xuXHRcdGNhbWVyYS5wb3NpdGlvbi5zZXQoMCwgMiwgMCk7XG5cdFx0Y2FtZXJhLmxvb2tBdChuZXcgVEhSRUUuVmVjdG9yMygwLCBjYW1lcmEuaGVpZ2h0LCAtOSkpO1xuXHRcdGNhbWVyYS5yb3RhdGlvbi55ICs9IE1hdGguUEk7XG5cdH1cblx0Y2FtZXJhLmhlaWdodCA9IGNhbWVyYS5wb3NpdGlvbi55OyAvLyByZWZlcmVuY2UgdmFsdWUgZm9yIGhvdyBoaWdoIHRoZSBjYW1lcmEgc2hvdWxkIGJlXG5cdFx0XHRcdFx0XHRcdFx0XHQgICAvLyBhYm92ZSB0aGUgZ3JvdW5kIHRvIG1haW50YWluIHRoZSBpbGx1c2lvbiBvZiBwcmVzZW5jZVxuXHRjYW1lcmEuZm92ID0gNzU7XG5cblx0dGhpcy5jYW1lcmEgPSBjYW1lcmE7XG5cblxuXG5cdC8qKlxuXHQgKiBIYW5kbGUgd2luZG93IHJlc2l6ZXMvcm90YXRpb25zXG5cdCAqL1xuXG5cdGNvbnN0IHNldEFzcGVjdCA9ICgpID0+IHtcblx0XHR0aGlzLnJlbmRlck1ldGhvZC5zZXRTaXplKCBvcHRpb25zLnRhcmdldC5jbGllbnRXaWR0aCwgb3B0aW9ucy50YXJnZXQuY2xpZW50SGVpZ2h0ICk7XG5cdFx0dGhpcy5jYW1lcmEuYXNwZWN0ID0gb3B0aW9ucy50YXJnZXQuc2Nyb2xsV2lkdGggLyBvcHRpb25zLnRhcmdldC5zY3JvbGxIZWlnaHQ7XG5cdFx0dGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuXHR9O1xuXHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgc2V0QXNwZWN0KTtcblx0c2V0QXNwZWN0KCk7XG5cblxuXG5cdC8qKlxuXHQgKiBTZXQgdXAgaGVhZCB0cmFja2luZ1xuXHQgKi9cblxuXHQgLy8gcHJvdmlkZSBkdW1teSBlbGVtZW50IHRvIHByZXZlbnQgdG91Y2gvY2xpY2sgaGlqYWNraW5nLlxuXHRjb25zdCBlbGVtZW50ID0gbG9jYXRpb24uaG9zdG5hbWUgIT09ICdsb2NhbGhvc3QnID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIkRJVlwiKSA6IHVuZGVmaW5lZDtcblx0dGhpcy5kZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXIgPSBuZXcgRGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyKHRoaXMuY2FtZXJhLCBlbGVtZW50KTtcblx0dGhpcy5kZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXIuY29ubmVjdCgpO1xuXHR0aGlzLm9uKCdwcmVyZW5kZXInLCAoKSA9PiB0aGlzLmRldmljZU9yaWVudGF0aW9uQ29udHJvbGxlci51cGRhdGUoKSk7XG5cblxuXG5cdC8qKlxuXHQgKiBUaGlzIHNob3VsZCBiZSBjYWxsZWQgaW4gdGhlIG1haW4gYW5pbWF0aW9uIGxvb3Bcblx0ICovXG5cblx0dGhpcy5yZW5kZXIgPSAoKSA9PiB7XG5cdFx0dGhpcy5lbWl0KCdwcmVyZW5kZXInKTtcblx0XHR0aGlzLnJlbmRlck1ldGhvZC5yZW5kZXIodGhpcy5zY2VuZSwgY2FtZXJhKTtcblx0XHR0aGlzLmVtaXQoJ3Bvc3RyZW5kZXInKTtcblx0fTtcblxuXG5cblx0LyoqXG5cdCAqIEhlYWRzIHVwIERpc3BsYXlcblx0ICogXG5cdCAqIEFkZCBhIGhlYWRzIHVwIGRpc3BsYXkgb2JqZWN0IHRvIHRoZSBjYW1lcmFcblx0ICogTWVzaGVzIGFuZCBTcHJpdGVzIGNhbiBiZSBhZGRlZCB0byB0aGlzIHRvIGFwcGVhciB0byBiZSBjbG9zZSB0byB0aGUgdXNlci5cblx0ICovXG5cblx0Y29uc3QgaHVkID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XG5cdGh1ZC5wb3NpdGlvbi5zZXQoMCwgMCwgLTIuMSk7XG5cdGh1ZC5zY2FsZS5zZXQoMC4yLCAwLjIsIDAuMik7XG5cdGNhbWVyYS5hZGQoaHVkKTtcblx0dGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmEpOyAvLyBhZGQgdGhlIGNhbWVyYSB0byB0aGUgc2NlbmUgc28gdGhhdCB0aGUgaHVkIGlzIHJlbmRlcmVkXG5cdHRoaXMuaHVkID0gaHVkO1xuXG5cblxuXG5cdC8qKlxuXHQgKiBBTklNQVRJT05cblx0ICogXG5cdCAqIEEgbWFwIG9mIHBoeXNpY3Mgb2JqZWN0IGlkIHRvIHRocmVlLmpzIG9iamVjdCAzZCBzbyB3ZSBjYW4gdXBkYXRlIGFsbCB0aGUgcG9zaXRpb25zXG5cdCAqL1xuXG5cdGNvbnN0IHRocmVlT2JqZWN0c0Nvbm5lY3RlZFRvUGh5c2ljcyA9IHt9O1xuXHR0aGlzLnVwZGF0ZU9iamVjdHMgPSBwaHlzaWNzT2JqZWN0cyA9PiB7XG5cdFx0Y29uc3QgbCA9IHBoeXNpY3NPYmplY3RzLmxlbmd0aDtcblxuXHRcdC8vIGl0ZXJhdGUgb3ZlciB0aGUgcGh5c2ljcyBwaHlzaWNzT2JqZWN0c1xuXHRcdGZvciAoIGxldCBqPTA7IGo8bDtqKysgKSB7XG5cblx0XHRcdGNvbnN0IGkgPSBwaHlzaWNzT2JqZWN0c1tqXTtcblx0XHRcdGlmICh0aHJlZU9iamVjdHNDb25uZWN0ZWRUb1BoeXNpY3NbaS5pZF0pIHtcblxuXHRcdFx0XHRjb25zdCBvID0gdGhyZWVPYmplY3RzQ29ubmVjdGVkVG9QaHlzaWNzW2kuaWRdO1xuXG5cdFx0XHRcdC8vIFN1cHBvcnQgbWFuaXBsYXRpbmcgYSBzaW5nbGUgdmVydGV4XG5cdFx0XHRcdGlmIChvLmNvbnN0cnVjdG9yID09PSBUSFJFRS5WZWN0b3IzKSB7XG5cdFx0XHRcdFx0by5zZXQoaS5wb3NpdGlvbi54LCBpLnBvc2l0aW9uLnksIGkucG9zaXRpb24ueik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvLnBvc2l0aW9uLnNldChpLnBvc2l0aW9uLngsIGkucG9zaXRpb24ueSwgaS5wb3NpdGlvbi56KTtcblxuXHRcdFx0XHQvLyBSb3RhdGlvblxuXHRcdFx0XHRpZiAoaS5xdWF0ZXJuaW9uKSB7XG5cdFx0XHRcdFx0by5yb3RhdGlvbi5zZXRGcm9tUXVhdGVybmlvbihuZXcgVEhSRUUuUXVhdGVybmlvbihpLnF1YXRlcm5pb24ueCwgaS5xdWF0ZXJuaW9uLnksIGkucXVhdGVybmlvbi56LCBpLnF1YXRlcm5pb24udykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdHRoaXMuY29ubmVjdFBoeXNpY3NUb1RocmVlID0gKG1lc2gsIHBoeXNpY3NNZXNoKSA9PiB7XG5cdFx0dGhyZWVPYmplY3RzQ29ubmVjdGVkVG9QaHlzaWNzW3BoeXNpY3NNZXNoLmlkXSA9IG1lc2g7XG5cdFx0aWYgKG1lc2guY29uc3RydWN0b3IgPT09IFRIUkVFLlZlY3RvcjMpIHJldHVybjtcblx0XHR0aGlzLnNjZW5lLmFkZChtZXNoKTtcblx0fTtcblxuXHQvKipcblx0ICogQSBmdW5jdGlvbiBmb3IgZ29pbmcgZnVsbHNjcmVlblxuXHQgKi9cblx0XG5cdHRoaXMuZnVsbHNjcmVlbiA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAob3B0aW9ucy50YXJnZXQucmVxdWVzdEZ1bGxzY3JlZW4pIHtcblx0XHRcdG9wdGlvbnMudGFyZ2V0LnJlcXVlc3RGdWxsc2NyZWVuKCk7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zLnRhcmdldC5tc1JlcXVlc3RGdWxsc2NyZWVuKSB7XG5cdFx0XHRvcHRpb25zLnRhcmdldC5tc1JlcXVlc3RGdWxsc2NyZWVuKCk7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zLnRhcmdldC5tb3pSZXF1ZXN0RnVsbFNjcmVlbikge1xuXHRcdFx0b3B0aW9ucy50YXJnZXQubW96UmVxdWVzdEZ1bGxTY3JlZW4oKTtcblx0XHR9IGVsc2UgaWYgKG9wdGlvbnMudGFyZ2V0LndlYmtpdFJlcXVlc3RGdWxsc2NyZWVuKSB7XG5cdFx0XHRvcHRpb25zLnRhcmdldC53ZWJraXRSZXF1ZXN0RnVsbHNjcmVlbigpO1xuXHRcdH1cblx0fTtcblxuXG5cdC8qKlxuXHQgKiBNYWtlIHRoZSBvYmplY3QgcGlja2VyIGF2YWlsYWJsZSBvbiB0aGlzIG9iamVjdFxuXHQgKi9cblxuXHR0aGlzLnBpY2tPYmplY3RzSGVscGVyID0gcGlja09iamVjdHNIZWxwZXI7XG59XG51dGlsLmluaGVyaXRzKE15VGhyZWVIZWxwZXIsIEV2ZW50RW1pdHRlcik7XG5cbm1vZHVsZS5leHBvcnRzLk15VGhyZWVIZWxwZXIgPSBNeVRocmVlSGVscGVyO1xubW9kdWxlLmV4cG9ydHMubXlUaHJlZUZyb21KU09OID0gbXlUaHJlZUZyb21KU09OO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBteVdvcmtlciA9IG5ldyBXb3JrZXIoXCIuL3NjcmlwdHMvdmVybGV0d29ya2VyLmpzXCIpO1xuY29uc3QgbWVzc2FnZVF1ZXVlID0gW107XG5cbmZ1bmN0aW9uIHdvcmtlck1lc3NhZ2UobWVzc2FnZSkge1xuXG5cdGNvbnN0IGlkID0gRGF0ZS5ub3coKSArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG5cdC8vIFRoaXMgd3JhcHMgdGhlIG1lc3NhZ2UgcG9zdGluZy9yZXNwb25zZSBpbiBhIHByb21pc2UsIHdoaWNoIHdpbGwgcmVzb2x2ZSBpZiB0aGUgcmVzcG9uc2UgZG9lc24ndFxuXHQvLyBjb250YWluIGFuIGVycm9yLCBhbmQgcmVqZWN0IHdpdGggdGhlIGVycm9yIGlmIGl0IGRvZXMuIElmIHlvdSdkIHByZWZlciwgaXQncyBwb3NzaWJsZSB0byBjYWxsXG5cdC8vIGNvbnRyb2xsZXIucG9zdE1lc3NhZ2UoKSBhbmQgc2V0IHVwIHRoZSBvbm1lc3NhZ2UgaGFuZGxlciBpbmRlcGVuZGVudGx5IG9mIGEgcHJvbWlzZSwgYnV0IHRoaXMgaXNcblx0Ly8gYSBjb252ZW5pZW50IHdyYXBwZXIuXG5cdHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiB3b3JrZXJNZXNzYWdlUHJvbWlzZShyZXNvbHZlLCByZWplY3QpIHtcblx0XHRjb25zdCBkYXRhID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0cmVzb2x2ZSxcblx0XHRcdHJlamVjdFxuXHRcdH07XG5cdFx0bWVzc2FnZVF1ZXVlLnB1c2goZGF0YSk7XG5cdH0pO1xufVxuXG4vLyBQcm9jZXNzIG1lc3NhZ2VzIG9uY2UgcGVyIGZyYW1lXHRcbnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBwcm9jZXNzKCkge1xuXHRpZiAobWVzc2FnZVF1ZXVlLmxlbmd0aCkge1xuXG5cdFx0Y29uc3QgZXh0cmFjdGVkTWVzc2FnZXMgPSBtZXNzYWdlUXVldWUuc3BsaWNlKDApO1xuXG5cdFx0Y29uc3QgbWVzc2FnZVRvU2VuZCA9IEpTT04uc3RyaW5naWZ5KGV4dHJhY3RlZE1lc3NhZ2VzLm1hcChpID0+IChcblx0XHRcdHsgbWVzc2FnZTogaS5tZXNzYWdlLCBpZDogaS5pZCB9XG5cdFx0KSkpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZUNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcblx0XHRtZXNzYWdlQ2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBmdW5jdGlvbiByZXNvbHZlTWVzc2FnZVByb21pc2UoZXZlbnQpIHtcblx0XHRcdG1lc3NhZ2VDaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gSXRlcmF0ZSBvdmVyIHRoZSByZXNwb25zZXMgYW5kIHJlc29sdmUvcmVqZWN0IGFjY29yZGluZ2x5XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IEpTT04ucGFyc2UoZXZlbnQuZGF0YSk7XG5cdFx0XHRyZXNwb25zZS5mb3JFYWNoKChkLCBpKSA9PiB7XG5cdFx0XHRcdGlmIChleHRyYWN0ZWRNZXNzYWdlc1tpXS5pZCAhPT0gZC5pZCkge1xuXHRcdFx0XHRcdHRocm93IEVycm9yKCdJRCBNaXNtYXRjaCEhIScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZC5lcnJvcikge1xuXHRcdFx0XHRcdGV4dHJhY3RlZE1lc3NhZ2VzW2ldLnJlc29sdmUoZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXh0cmFjdGVkTWVzc2FnZXNbaV0ucmVqZWN0KGQuZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdG15V29ya2VyLnBvc3RNZXNzYWdlKG1lc3NhZ2VUb1NlbmQsIFttZXNzYWdlQ2hhbm5lbC5wb3J0Ml0pO1xuXHR9XG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShwcm9jZXNzKTtcbn0pO1xuXG5jbGFzcyBWZXJsZXQge1xuXHRpbml0KG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gd29ya2VyTWVzc2FnZSh7YWN0aW9uOiAnaW5pdCcsIG9wdGlvbnN9KTtcblx0fVxuXG5cdGdldFBvaW50cygpIHtcblx0XHRyZXR1cm4gd29ya2VyTWVzc2FnZSh7YWN0aW9uOiAnZ2V0UG9pbnRzJ30pXG5cdFx0XHQudGhlbihlID0+IGUucG9pbnRzKTtcblx0fVxuXG5cdGFkZFBvaW50KHBvaW50T3B0aW9ucykge1xuXHRcdHJldHVybiB3b3JrZXJNZXNzYWdlKHthY3Rpb246ICdhZGRQb2ludCcsIHBvaW50T3B0aW9uc30pO1xuXHR9XG5cblx0dXBkYXRlUG9pbnQocG9pbnRPcHRpb25zKSB7XG5cdFx0cmV0dXJuIHdvcmtlck1lc3NhZ2Uoe2FjdGlvbjogJ3VwZGF0ZVBvaW50JywgcG9pbnRPcHRpb25zfSk7XG5cdH1cblxuXHRjb25uZWN0UG9pbnRzKHAxLCBwMiwgY29uc3RyYWludE9wdGlvbnMpIHtcblx0XHRyZXR1cm4gd29ya2VyTWVzc2FnZSh7YWN0aW9uOiAnY29ubmVjdFBvaW50cycsIG9wdGlvbnM6IHtwMSwgcDIsIGNvbnN0cmFpbnRPcHRpb25zfX0pO1xuXHR9XG5cblx0dXBkYXRlQ29uc3RyYWludChvcHRpb25zKSB7XG5cdFx0cmV0dXJuIHdvcmtlck1lc3NhZ2Uoe2FjdGlvbjogJ3VwZGF0ZUNvbnN0cmFpbnQnLCBvcHRpb25zIH0pO1xuXHR9XG5cblx0cmVzZXQoKSB7XG5cdFx0cmV0dXJuIHdvcmtlck1lc3NhZ2Uoe2FjdGlvbjogJ3Jlc2V0J30pO1xuXHR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVmVybGV0O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFZSVGFyZ2V0O1xuXG5mdW5jdGlvbiBjc3Mobm9kZSwgcHJvcHMpIHtcblx0ZnVuY3Rpb24gdW5pdHMocHJvcCwgaSkge1xuXHRcdGlmICh0eXBlb2YgaSA9PT0gXCJudW1iZXJcIikge1xuXHRcdFx0aWYgKHByb3AubWF0Y2goL3dpZHRofGhlaWdodHx0b3B8bGVmdHxyaWdodHxib3R0b20vKSkge1xuXHRcdFx0XHRyZXR1cm4gaSArIFwicHhcIjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGk7XG5cdH1cblx0Zm9yIChsZXQgbiBpbiBwcm9wcykge1xuXHRcdGlmIChwcm9wcy5oYXNPd25Qcm9wZXJ0eShuKSkge1xuXHRcdFx0bm9kZS5zdHlsZVtuXSA9IHVuaXRzKG4sIHByb3BzW25dKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG5vZGU7XG59XG5cbmZ1bmN0aW9uIFZSVGFyZ2V0KHBhcmVudCkge1xuXG5cdC8vIENyZWF0ZSBpZnJhbWUgYW5kIGFkZCBpdCB0byB0aGUgZG9jXG5cdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRjc3MoaWZyYW1lLCB7XG5cdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0bGVmdDogMCxcblx0XHRyaWdodDogMCxcblx0XHR0b3A6IDAsXG5cdFx0Ym90dG9tOiAwLFxuXHRcdHdpZHRoOiAnMTAwJScsXG5cdFx0aGVpZ2h0OiAnMTAwJScsXG5cdFx0Ym9yZGVyOiAnbm9uZScsXG5cdFx0cG9pbnRlckV2ZW50czogJ25vbmUnXG5cdH0pO1xuXHRpZnJhbWUuc2V0QXR0cmlidXRlKCdzZWFtbGVzcycsICdzZWFtbGVzcycpO1xuXHRpZnJhbWUuc2V0QXR0cmlidXRlKCdtb3picm93c2VyJywgJzEnKTtcblx0aWZyYW1lLnNldEF0dHJpYnV0ZSgnc2FuZGJveCcsICdhbGxvdy1zYW1lLW9yaWdpbiBhbGxvdy1zY3JpcHRzJyk7XG5cdHRoaXMuaWZyYW1lID0gaWZyYW1lO1xuXHR0aGlzLnBhcmVudCA9IHBhcmVudCB8fCBkb2N1bWVudC5ib2R5O1xuXHR0aGlzLnBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5pZnJhbWUsIHRoaXMucGFyZW50LmZpcnN0Q2hpbGQpO1xufVxuXG5WUlRhcmdldC5wcm90b3R5cGUubG9hZCA9IGZ1bmN0aW9uICh1cmwpIHtcblx0dGhpcy5pZnJhbWUuc3JjID0gdXJsO1xuXHRyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcblx0XHR0aGlzLmlmcmFtZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgcmVzb2x2ZSk7XG5cdH0uYmluZCh0aGlzKSlcblx0LnRoZW4oKCkgPT4ge1xuXHRcdGNzcyh0aGlzLmlmcmFtZSwge1xuXHRcdFx0cG9pbnRlckV2ZW50czogJ2F1dG8nXG5cdFx0fSk7XG5cdH0pO1xufTtcblxuVlJUYXJnZXQucHJvdG90eXBlLnVubG9hZCA9IGZ1bmN0aW9uICh1cmwpIHtcblx0dGhpcy5pZnJhbWUuc3JjID0gJ2Fib3V0OmJsYW5rJztcblx0Y3NzKHRoaXMuaWZyYW1lLCB7XG5cdFx0cG9pbnRlckV2ZW50czogJ25vbmUnXG5cdH0pO1xufTtcblxuXG5WUlRhcmdldC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICh1cmwpIHtcblx0dGhpcy5wYXJlbnQucmVtb3ZlQ2hpbGQodGhpcy5pZnJhbWUpO1xuXHR0aGlzLmlmcmFtZSA9IG51bGw7XG59O1xuIiwiLypnbG9iYWwgVEhSRUUqL1xuJ3VzZSBzdHJpY3QnO1xuY29uc3QgYWRkU2NyaXB0ID0gcmVxdWlyZSgnLi9saWIvbG9hZFNjcmlwdCcpOyAvLyBQcm9taXNlIHdyYXBwZXIgZm9yIHNjcmlwdCBsb2FkaW5nXG5jb25zdCBWZXJsZXRXcmFwcGVyID0gcmVxdWlyZSgnLi9saWIvdmVybGV0d3JhcHBlcicpOyAvLyBXcmFwcGVyIG9mIHRoZSB2ZXJsZXQgd29ya2VyXG5jb25zdCBWUlRhcmdldCA9IHJlcXVpcmUoJy4vbGliL3ZydGFyZ2V0Jyk7IC8vIEFwcGVuZCBpZnJhbWVzIHRvIHRoZSBwYWdlIGFuZCBwcm92aWRlIGEgY29udHJvbCBpbnRlcmZhY2VcbmNvbnN0IHRleHRTcHJpdGUgPSByZXF1aXJlKCcuL2xpYi90ZXh0U3ByaXRlJyk7IC8vIEdlbmVyYWxseSBzcHJpdGVzIGZyb20gY2FudmFzXG5jb25zdCBDYW1lcmFJbnRlcmFjdGlvbnMgPSByZXF1aXJlKCcuL2xpYi9jYW1lcmFpbnRlcmFjdGlvbnMnKTsgLy8gVG9vbCBmb3IgbWFraW5nIGludGVyYWN0aXZlIFZSIGVsZW1lbnRzXG5jb25zdCBUV0VFTiA9IHJlcXVpcmUoJ3R3ZWVuLmpzJyk7XG5cbmNvbnN0IFNUQVRFX1BBVVNFRCA9IDA7XG5jb25zdCBTVEFURV9QTEFZSU5HID0gMTtcblxuY29uc3QgU1RBVEVfSFVCX09QRU4gPSAwO1xuY29uc3QgU1RBVEVfSFVCX0NMT1NFRCA9IDE7XG5cbmxldCBhbmltU3RhdGUgPSBTVEFURV9QTEFZSU5HO1xubGV0IGh1YlN0YXRlID0gU1RBVEVfSFVCX09QRU47XG5cbi8vIG5vIGhzdHMgc28ganVzdCByZWRpcmVjdCB0byBodHRwc1xuaWYgKHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCAhPT0gXCJodHRwczpcIiAmJiB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUgIT09ICdsb2NhbGhvc3QnKSB7XG4gICB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPSBcImh0dHBzOlwiO1xufVxuXG5mdW5jdGlvbiBzZXJ2aWNlV29ya2VyKCkge1xuXG5cdHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSkge1xuXG5cdFx0Ly8gU3RhcnQgc2VydmljZSB3b3JrZXJcblx0XHRpZiAoJ3NlcnZpY2VXb3JrZXInIGluIG5hdmlnYXRvcikge1xuXG5cdFx0XHRpZiAobmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIuY29udHJvbGxlcikge1xuXHRcdFx0XHRjb25zb2xlLmxvZygnT2ZmbGluaW5nIEF2YWlsYmxlJyk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlZ2lzdGVyKCcuL3N3LmpzJylcblx0XHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVnKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ3N3IHJlZ2lzdGVyZWQnLCByZWcpO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQudGhlbihyZXNvbHZlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5lcnJvcignTm8gU2VydmljZSBXb3JrZXIsIGFzc2V0cyBtYXkgbm90IGJlIGNhY2hlZCcpO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH1cblx0fSk7XG59XG5cbnNlcnZpY2VXb3JrZXIoKVxuLnRoZW4oKCkgPT4gUHJvbWlzZS5hbGwoW1xuXHRhZGRTY3JpcHQoJ2h0dHBzOi8vcG9seWZpbGwud2Vic2VydmljZXMuZnQuY29tL3YxL3BvbHlmaWxsLm1pbi5qcz9mZWF0dXJlcz1mZXRjaCxkZWZhdWx0JyksXG5cdGFkZFNjcmlwdCgnaHR0cHM6Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvdGhyZWUuanMvcjczL3RocmVlLm1pbi5qcycpXG5dKSlcbi50aGVuKCgpID0+IFByb21pc2UuYWxsKFtcblx0YWRkU2NyaXB0KCdodHRwczovL2Nkbi5yYXdnaXQuY29tL21yZG9vYi90aHJlZS5qcy9tYXN0ZXIvZXhhbXBsZXMvanMvZWZmZWN0cy9TdGVyZW9FZmZlY3QuanMnKSxcblx0YWRkU2NyaXB0KCdodHRwczovL2Nkbi5yYXdnaXQuY29tL21yZG9vYi90aHJlZS5qcy9tYXN0ZXIvZXhhbXBsZXMvanMvU2t5U2hhZGVyLmpzJyksXG5cdGFkZFNjcmlwdCgnaHR0cHM6Ly9jZG4ucmF3Z2l0LmNvbS9yaWNodHIvdGhyZWVWUi9tYXN0ZXIvanMvRGV2aWNlT3JpZW50YXRpb25Db250cm9sbGVyLmpzJylcbl0pKVxuLnRoZW4oKCkgPT4gcmVxdWlyZSgnLi9saWIvdGhyZWVIZWxwZXInKS5teVRocmVlRnJvbUpTT04oJ2h1YicpKVxuLnRoZW4odGhyZWVIZWxwZXIgPT4ge1xuXHRjb25zb2xlLmxvZygnUmVhZHknKTtcblxuXHQvKipcblx0ICogU2V0dXAgQ2xpY2sgbGlzdGVuZXIgZm9yIGZ1bGxzY3JlZW5cblx0ICovXG5cdHRocmVlSGVscGVyLmRvbUVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aHJlZUhlbHBlci5mdWxsc2NyZWVuKTtcblxuXHRjb25zdCBmcmFtZSA9IG5ldyBWUlRhcmdldCgpOyAvLyBTZXR1cCBpZnJhbWUgZm9yIGxvYWRpbmcgc2l0ZXMgaW50b1xuXG5cblx0LyoqXG5cdCAqIFNldCB1cCBpbnRlcmFjdGl2aXR5IGZyb20gdGhlIGNhbWVyYS5cblx0ICovXG5cblx0Y29uc3QgY2FtZXJhSW50ZXJhY3Rpdml0eVdvcmxkID0gbmV3IENhbWVyYUludGVyYWN0aW9ucyh0aHJlZUhlbHBlci5kb21FbGVtZW50KTtcblxuXHR0aHJlZUhlbHBlci5kZXZpY2VPcmllbnRhdGlvbkNvbnRyb2xsZXJcblx0LmFkZEV2ZW50TGlzdGVuZXIoJ3VzZXJpbnRlcmFjdGlvbmVuZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjYW1lcmFJbnRlcmFjdGl2aXR5V29ybGQuaW50ZXJhY3Qoe3R5cGU6ICdjbGljayd9KTtcblx0fSk7XG5cblx0Y29uc3Qgc2t5Qm94ID0gcmVxdWlyZSgnLi9saWIvc2t5JykoKTtcblx0dGhyZWVIZWxwZXIuc2NlbmUuYWRkKHNreUJveCk7XG5cdHNreUJveC5zY2FsZS5tdWx0aXBseVNjYWxhcigwLjAwMDA0KTtcblxuXHRjb25zdCBkb21lID0gdGhyZWVIZWxwZXIucGlja09iamVjdHNIZWxwZXIodGhyZWVIZWxwZXIuc2NlbmUsICdkb21lJykuZG9tZTtcblx0ZG9tZS5tYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCggeyBjb2xvcjogMHhDMEI5QkIsIHNwZWN1bGFyOiAwLCBzaGFkaW5nOiBUSFJFRS5GbGF0U2hhZGluZywgc2lkZTogVEhSRUUuRG91YmxlU2lkZSwgdHJhbnNwYXJlbnQ6IHRydWUsIG9wYWNpdHk6IDAuMiB9ICk7XG5cdHRocmVlSGVscGVyLnNjZW5lLnJlbW92ZShkb21lKTtcblxuXHRjb25zdCBncmlkID0gbmV3IFRIUkVFLkdyaWRIZWxwZXIoIDEwLCAxICk7XG5cdGdyaWQuc2V0Q29sb3JzKCAweGZmMDAwMCwgMHhmZmZmZmYgKTtcblx0dGhyZWVIZWxwZXIuc2NlbmUuYWRkKCBncmlkICk7XG5cblx0Ly8gQnJhbmQgbGlnaHRzXG5cdGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoIDB4YzBiOWJiICk7XG5cdHRocmVlSGVscGVyLnNjZW5lLmFkZCggYW1iaWVudExpZ2h0ICk7XG5cblx0Y29uc3QgcExpZ2h0MCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KCAweEMwQjlCQiwgMC41ICk7XG5cdHBMaWdodDAucG9zaXRpb24uc2V0KCAwLCAxLCAzICk7XG5cdHRocmVlSGVscGVyLnNjZW5lLmFkZCggcExpZ2h0MCApO1xuXG5cdGNvbnN0IHBMaWdodDEgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCggMHhGOUNDRkYsIDAuNSApO1xuXHRwTGlnaHQxLnBvc2l0aW9uLnNldCggOCwgLTMsIDAgKTtcblx0dGhyZWVIZWxwZXIuc2NlbmUuYWRkKCBwTGlnaHQxICk7XG5cblx0Y29uc3QgcExpZ2h0MiA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KCAweEUzRkZBRSwgMC41ICk7XG5cdHBMaWdodDIucG9zaXRpb24uc2V0KCAtOCwgLTMsIC0zICk7XG5cdHRocmVlSGVscGVyLnNjZW5lLmFkZCggcExpZ2h0MiApO1xuXG5cdC8vIFJ1biB0aGUgdmVybGV0IHBoeXNpY3Ncblx0Y29uc3QgdmVybGV0ID0gbmV3IFZlcmxldFdyYXBwZXIoKTtcblx0dmVybGV0LmluaXQoe1xuXHRcdHNpemU6IHtcblx0XHRcdHg6IDIwLFxuXHRcdFx0eTogMjAsXG5cdFx0XHR6OiAyMCxcblx0XHR9LFxuXHRcdGdyYXZpdHk6IHRydWVcblx0fSlcblx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFxuXHRcdGxldCB3YWl0aW5nRm9yUG9pbnRzID0gZmFsc2U7XG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uIGFuaW1hdGUodGltZSkge1xuXHRcdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xuXHRcdFx0aWYgKGFuaW1TdGF0ZSAhPT0gU1RBVEVfUExBWUlORykgcmV0dXJuO1xuXHRcdFx0aWYgKCF3YWl0aW5nRm9yUG9pbnRzKSB7XG5cdFx0XHRcdHZlcmxldC5nZXRQb2ludHMoKS50aGVuKHBvaW50cyA9PiB7XG5cdFx0XHRcdFx0dGhyZWVIZWxwZXIudXBkYXRlT2JqZWN0cyhwb2ludHMpO1xuXHRcdFx0XHRcdHdhaXRpbmdGb3JQb2ludHMgPSBmYWxzZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHdhaXRpbmdGb3JQb2ludHMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FtZXJhSW50ZXJhY3Rpdml0eVdvcmxkLmRldGVjdEludGVyYWN0aW9ucyh0aHJlZUhlbHBlci5jYW1lcmEpO1xuXHRcdFx0dGhyZWVIZWxwZXIucmVuZGVyKCk7XG5cdFx0XHRUV0VFTi51cGRhdGUodGltZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYXAgPSBUSFJFRS5JbWFnZVV0aWxzLmxvYWRUZXh0dXJlKCBcImltYWdlcy9yZXRpY3VsZS5wbmdcIiApO1xuXHRcdGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLlNwcml0ZU1hdGVyaWFsKCB7IG1hcDogbWFwLCBjb2xvcjogMHhmZmZmZmYsIGZvZzogZmFsc2UsIHRyYW5zcGFyZW50OiB0cnVlIH0gKTtcblx0XHRjb25zdCBzcHJpdGUgPSBuZXcgVEhSRUUuU3ByaXRlKG1hdGVyaWFsKTtcblx0XHR0aHJlZUhlbHBlci5odWQuYWRkKHNwcml0ZSk7XG5cblx0XHRmdW5jdGlvbiBsb2FkRG9jKHVybCkge1xuXG5cdFx0XHQvLyBEaXNwbGF5IHRoZSBsb2FkaW5nIGdyYXBoaWNcblxuXHRcdFx0Ly8gR2V0IHRoZSBmcmFtZSB0byBzaG93IFxuXHRcdFx0cmV0dXJuIGZyYW1lLmxvYWQodXJsKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHQvLyByZW1vdmUgdGhlIGxvYWRpbmcgZ3JhcGhpY1xuXHRcdFx0XHRjb25zb2xlLmxvZygnbG9hZGVkICVzJywgdXJsKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHJlbW92ZURvYygpIHtcblx0XHRcdGZyYW1lLnVubG9hZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpID0gMDtcblx0XHRmdW5jdGlvbiBhZGRCdXR0b24oc3RyKSB7XG5cdFx0XHRpKys7XG5cdFx0XHRjb25zdCByb3dzID0gNTtcblx0XHRcdGNvbnN0IHNwcml0ZSA9IHRleHRTcHJpdGUoc3RyLCB7XG5cdFx0XHRcdGZvbnRzaXplOiAxOCxcblx0XHRcdFx0Zm9udGZhY2U6ICdJY2VsYW5kJyxcblx0XHRcdFx0Ym9yZGVyVGhpY2tuZXNzOiAyMFxuXHRcdFx0fSk7XG5cdFx0XHR0aHJlZUhlbHBlci5zY2VuZS5hZGQoc3ByaXRlKTtcblx0XHRcdHNwcml0ZS5wb3NpdGlvbi5zZXQoXG5cdFx0XHRcdDUgKyBNYXRoLmZsb29yKGkgLyByb3dzKSxcblx0XHRcdFx0NSAtIChpICUgcm93cyksXG5cdFx0XHRcdDVcblx0XHRcdCk7XG5cdFx0XHRzcHJpdGUubWF0ZXJpYWwudHJhbnNwYXJlbnQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIGNhbWVyYUludGVyYWN0aXZpdHlXb3JsZC5tYWtlVGFyZ2V0KHNwcml0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHVwIHRoZSBkb21lIGJyZWFraW5nIGRvd24gYW5kIGJ1aWxkaW5nIGJhY2tcblx0XHRyZXF1aXJlKCcuL2xpYi9leHBsb2RlRG9tZScpKGRvbWUsIHRocmVlSGVscGVyLCB2ZXJsZXQpXG5cdFx0LnRoZW4oZG9tZUNvbnRyb2xsZXIgPT4ge1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RibGNsaWNrJywgKCkgPT4gZG9tZUNvbnRyb2xsZXIudG9nZ2xlKCkpO1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgKCkgPT4gZG9tZUNvbnRyb2xsZXIudG9nZ2xlKCkpO1xuXG5cdFx0XHRmdW5jdGlvbiB0d2VlbkRvbWVPcGFjaXR5KG9wYWNpdHksIHRpbWUgPSAxMDAwKSB7XG5cdFx0XHRcdGlmIChvcGFjaXR5ICE9PSB1bmRlZmluZWQgJiYgb3BhY2l0eSAhPT0gZG9tZS5tYXRlcmlhbC5vcGFjaXR5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gbmV3IFRXRUVOLlR3ZWVuKGRvbWUubWF0ZXJpYWwpXG5cdFx0XHRcdFx0ICAgIC50byh7IG9wYWNpdHkgfSwgdGltZSlcblx0XHRcdFx0XHQgICAgLmVhc2luZyhUV0VFTi5FYXNpbmcuQ3ViaWMuT3V0KVxuXHRcdFx0XHRcdCAgICAuc3RhcnQoKVxuXHRcdFx0XHRcdCAgICAub25Db21wbGV0ZShyZXNvbHZlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIHNob3dEb2N1bWVudCh1cmwpIHtcblx0XHRcdFx0aHViU3RhdGUgPSBTVEFURV9IVUJfQ0xPU0VEO1xuXHRcdFx0XHR0d2VlbkRvbWVPcGFjaXR5KDEpXG5cdFx0XHRcdC50aGVuKCgpID0+IHNreUJveC52aXNpYmxlID0gZmFsc2UpXG5cdFx0XHRcdC50aGVuKCgpID0+IGxvYWREb2ModXJsKSlcblx0XHRcdFx0LnRoZW4oKCkgPT4gZG9tZUNvbnRyb2xsZXIuZGVzdHJveSgpKVxuXHRcdFx0XHQudGhlbigoKSA9PiB0d2VlbkRvbWVPcGFjaXR5KDAsIDQwMDApKVxuXHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGh1YlN0YXRlID09PSBTVEFURV9IVUJfQ0xPU0VEKSB7XG5cdFx0XHRcdFx0XHR0aHJlZUhlbHBlci5kb21FbGVtZW50LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG5cdFx0XHRcdFx0XHRkb21lQ29udHJvbGxlci5tZXNoLnZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGFuaW1TdGF0ZSA9IFNUQVRFX1BBVVNFRDtcblx0XHRcdFx0XHRcdHRocmVlSGVscGVyLnNjZW5lLnZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRocmVlSGVscGVyLnJlbmRlcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGNsb3NlRG9jdW1lbnQoKSB7XG5cdFx0XHRcdHRocmVlSGVscGVyLnNjZW5lLnZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRodWJTdGF0ZSA9IFNUQVRFX0hVQl9PUEVOO1xuXHRcdFx0XHRjb25zb2xlLmxvZyhhbmltU3RhdGUpO1xuXHRcdFx0XHRhbmltU3RhdGUgPSBTVEFURV9QTEFZSU5HO1xuXHRcdFx0XHRkb21lQ29udHJvbGxlci5tZXNoLnZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRQcm9taXNlLmFsbChbZG9tZUNvbnRyb2xsZXIucmVzdG9yZSgpLCB0d2VlbkRvbWVPcGFjaXR5KDEsIDIwMDApXSlcblx0XHRcdFx0LnRoZW4oKCkgPT4gcmVtb3ZlRG9jKCkpXG5cdFx0XHRcdC50aGVuKCgpID0+IHRocmVlSGVscGVyLmRvbUVsZW1lbnQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdhdXRvJylcblx0XHRcdFx0LnRoZW4oKCkgPT4gc2t5Qm94LnZpc2libGUgPSB0cnVlKVxuXHRcdFx0XHQudGhlbigoKSA9PiB0d2VlbkRvbWVPcGFjaXR5KDAuMikpO1xuXHRcdFx0fVxuXG5cdFx0XHR3aW5kb3cuc2hvd0RvY3VtZW50ID0gc2hvd0RvY3VtZW50O1xuXHRcdFx0d2luZG93LmNsb3NlRG9jdW1lbnQgPSBjbG9zZURvY3VtZW50O1xuXHRcdFx0XG5cdFx0XHRjb25zdCBsaWdodEhvdXNlRGVtb0J1dHRvbiA9IGFkZEJ1dHRvbignTG9hZCBEZXNlcnQgRGVtbycpO1xuXHRcdFx0bGlnaHRIb3VzZURlbW9CdXR0b24ub24oJ2NsaWNrJywgKCkgPT4gc2hvd0RvY3VtZW50KCdodHRwczovL2FkYXJvc2VlZHdhcmRzLmdpdGh1Yi5pby9jYXJkYm9hcmQyL2luZGV4Lmh0bWwjdnInKSk7XG5cdFx0XHRjb25zdCBraXRjaGVuRGVtb0J1dHRvbiA9IGFkZEJ1dHRvbignTG9hZCBLaXRjaGVuIERlbW8nKTtcblx0XHRcdGtpdGNoZW5EZW1vQnV0dG9uLm9uKCdjbGljaycsICgpID0+IHNob3dEb2N1bWVudCgnaHR0cHM6Ly9hZGFyb3NlZWR3YXJkcy5naXRodWIuaW8vdnItbGljay10aGUtd2hpc2svJykpO1xuXG5cdFx0fSk7XHRcblxuXHRcdGZ1bmN0aW9uIHJlc2V0KCkge1xuXHRcdFx0dGhyZWVIZWxwZXIuY2FtZXJhLnBvc2l0aW9uLnNldCgwLCB0aHJlZUhlbHBlci5jYW1lcmEuaGVpZ2h0LCAwKTtcblx0XHR9XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBwcm9wZXJ0aWVzXG5cdFx0cmVzZXQoKTtcblx0XHR3aW5kb3cudGhyZWVIZWxwZXIgPSB0aHJlZUhlbHBlcjtcblx0fSk7XG59KTtcbiIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgcHJvdG9jbGFzcyA9IHJlcXVpcmUoXCJwcm90b2NsYXNzXCIpO1xuXG4vKipcbiAqIEBtb2R1bGUgbW9qb1xuICogQHN1Ym1vZHVsZSBtb2pvLWNvcmVcbiAqL1xuXG4vKipcbiAqIEBjbGFzcyBFdmVudEVtaXR0ZXJcbiAqL1xuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIgKCkge1xuICB0aGlzLl9fZXZlbnRzID0ge307XG59XG5cbi8qKlxuICogYWRkcyBhIGxpc3RlbmVyIG9uIHRoZSBldmVudCBlbWl0dGVyXG4gKlxuICogQG1ldGhvZCBvblxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IGV2ZW50IHRvIGxpc3RlbiBvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgdG8gY2FsbGJhY2sgd2hlbiBgZXZlbnRgIGlzIGVtaXR0ZWQuXG4gKiBAcmV0dXJucyB7RGlzcG9zYWJsZX1cbiAqL1xuXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBmdW5jdGlvbiAoZXZlbnQsIGxpc3RlbmVyKSB7XG5cbiAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwibGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uIGZvciBldmVudCAnXCIrZXZlbnQrXCInXCIpO1xuICB9XG5cbiAgdmFyIGxpc3RlbmVycztcbiAgaWYgKCEobGlzdGVuZXJzID0gdGhpcy5fX2V2ZW50c1tldmVudF0pKSB7XG4gICAgdGhpcy5fX2V2ZW50c1tldmVudF0gPSBsaXN0ZW5lcjtcbiAgfSBlbHNlIGlmICh0eXBlb2YgbGlzdGVuZXJzID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB0aGlzLl9fZXZlbnRzW2V2ZW50XSA9IFtsaXN0ZW5lcnMsIGxpc3RlbmVyXTtcbiAgfSBlbHNlIHtcbiAgICBsaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XG4gIH1cblxuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgcmV0dXJuIHtcbiAgICBkaXNwb3NlOiBmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYub2ZmKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgfVxuICB9O1xufTtcblxuLyoqXG4gKiByZW1vdmVzIGFuIGV2ZW50IGVtaXR0ZXJcbiAqIEBtZXRob2Qgb2ZmXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgdG8gcmVtb3ZlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciB0byByZW1vdmVcbiAqL1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uIChldmVudCwgbGlzdGVuZXIpIHtcblxuICB2YXIgbGlzdGVuZXJzO1xuXG4gIGlmKCEobGlzdGVuZXJzID0gdGhpcy5fX2V2ZW50c1tldmVudF0pKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBsaXN0ZW5lcnMgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHRoaXMuX19ldmVudHNbZXZlbnRdID0gdW5kZWZpbmVkO1xuICB9IGVsc2Uge1xuICAgIHZhciBpID0gbGlzdGVuZXJzLmluZGV4T2YobGlzdGVuZXIpO1xuICAgIGlmICh+aSkgbGlzdGVuZXJzLnNwbGljZShpLCAxKTtcbiAgICBpZiAoIWxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgIHRoaXMuX19ldmVudHNbZXZlbnRdID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBhZGRzIGEgbGlzdGVuZXIgb24gdGhlIGV2ZW50IGVtaXR0ZXJcbiAqIEBtZXRob2Qgb25jZVxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IGV2ZW50IHRvIGxpc3RlbiBvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgdG8gY2FsbGJhY2sgd2hlbiBgZXZlbnRgIGlzIGVtaXR0ZWQuXG4gKiBAcmV0dXJucyB7RGlzcG9zYWJsZX1cbiAqL1xuXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uIChldmVudCwgbGlzdGVuZXIpIHtcblxuICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24gZm9yIGV2ZW50ICdcIitldmVudCtcIidcIik7XG4gIH1cblxuICBmdW5jdGlvbiBsaXN0ZW5lcjIgKCkge1xuICAgIGRpc3AuZGlzcG9zZSgpO1xuICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICB2YXIgZGlzcCA9IHRoaXMub24oZXZlbnQsIGxpc3RlbmVyMik7XG4gIGRpc3AudGFyZ2V0ID0gdGhpcztcbiAgcmV0dXJuIGRpc3A7XG59O1xuXG4vKipcbiAqIGVtaXRzIGFuIGV2ZW50XG4gKiBAbWV0aG9kIGVtaXRcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtTdHJpbmd9LCBgZGF0YS4uLmAgZGF0YSB0byBlbWl0XG4gKi9cblxuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcblxuICBpZiAodGhpcy5fX2V2ZW50c1tldmVudF0gPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuXG4gIHZhciBsaXN0ZW5lcnMgPSB0aGlzLl9fZXZlbnRzW2V2ZW50XSxcbiAgbiA9IGFyZ3VtZW50cy5sZW5ndGgsXG4gIGFyZ3MsXG4gIGksXG4gIGo7XG5cbiAgaWYgKHR5cGVvZiBsaXN0ZW5lcnMgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIGlmIChuID09PSAxKSB7XG4gICAgICBsaXN0ZW5lcnMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3dpdGNoKG4pIHtcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIGxpc3RlbmVycyhhcmd1bWVudHNbMV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgbGlzdGVuZXJzKGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgIGxpc3RlbmVycyhhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSwgYXJndW1lbnRzWzNdKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBhcmdzID0gbmV3IEFycmF5KG4gLSAxKTtcbiAgICAgICAgICBmb3IoaSA9IDE7IGkgPCBuOyBpKyspIGFyZ3NbaS0xXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgICBsaXN0ZW5lcnMuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9XG4gIH0gZWxzZSB7XG4gICAgYXJncyA9IG5ldyBBcnJheShuIC0gMSk7XG4gICAgZm9yKGkgPSAxOyBpIDwgbjsgaSsrKSBhcmdzW2ktMV0gPSBhcmd1bWVudHNbaV07XG4gICAgZm9yKGogPSBsaXN0ZW5lcnMubGVuZ3RoOyBqLS07KSB7XG4gICAgICBpZihsaXN0ZW5lcnNbal0pIGxpc3RlbmVyc1tqXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogcmVtb3ZlcyBhbGwgbGlzdGVuZXJzXG4gKiBAbWV0aG9kIHJlbW92ZUFsbExpc3RlbmVyc1xuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IChvcHRpb25hbCkgcmVtb3ZlcyBhbGwgbGlzdGVuZXJzIG9mIGBldmVudGAuIE9taXR0aW5nIHdpbGwgcmVtb3ZlIGV2ZXJ5dGhpbmcuXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICB0aGlzLl9fZXZlbnRzW2V2ZW50XSA9IHVuZGVmaW5lZDtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9fZXZlbnRzID0ge307XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuIiwiZnVuY3Rpb24gX2NvcHkgKHRvLCBmcm9tKSB7XG5cbiAgZm9yICh2YXIgaSA9IDAsIG4gPSBmcm9tLmxlbmd0aDsgaSA8IG47IGkrKykge1xuXG4gICAgdmFyIHRhcmdldCA9IGZyb21baV07XG5cbiAgICBmb3IgKHZhciBwcm9wZXJ0eSBpbiB0YXJnZXQpIHtcbiAgICAgIHRvW3Byb3BlcnR5XSA9IHRhcmdldFtwcm9wZXJ0eV07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRvO1xufVxuXG5mdW5jdGlvbiBwcm90b2NsYXNzIChwYXJlbnQsIGNoaWxkKSB7XG5cbiAgdmFyIG1peGlucyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG5cbiAgaWYgKHR5cGVvZiBjaGlsZCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgaWYoY2hpbGQpIG1peGlucy51bnNoaWZ0KGNoaWxkKTsgLy8gY29uc3RydWN0b3IgaXMgYSBtaXhpblxuICAgIGNoaWxkICAgPSBwYXJlbnQ7XG4gICAgcGFyZW50ICA9IGZ1bmN0aW9uKCkgeyB9O1xuICB9XG5cbiAgX2NvcHkoY2hpbGQsIHBhcmVudCk7IFxuXG4gIGZ1bmN0aW9uIGN0b3IgKCkge1xuICAgIHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDtcbiAgfVxuXG4gIGN0b3IucHJvdG90eXBlICA9IHBhcmVudC5wcm90b3R5cGU7XG4gIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBjdG9yKCk7XG4gIGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG4gIGNoaWxkLnBhcmVudCAgICA9IGNoaWxkLnN1cGVyY2xhc3MgPSBwYXJlbnQ7XG5cbiAgX2NvcHkoY2hpbGQucHJvdG90eXBlLCBtaXhpbnMpO1xuXG4gIHByb3RvY2xhc3Muc2V0dXAoY2hpbGQpO1xuXG4gIHJldHVybiBjaGlsZDtcbn1cblxucHJvdG9jbGFzcy5zZXR1cCA9IGZ1bmN0aW9uIChjaGlsZCkge1xuXG5cbiAgaWYgKCFjaGlsZC5leHRlbmQpIHtcbiAgICBjaGlsZC5leHRlbmQgPSBmdW5jdGlvbihjb25zdHJ1Y3Rvcikge1xuXG4gICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG5cbiAgICAgIGlmICh0eXBlb2YgY29uc3RydWN0b3IgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICBhcmdzLnVuc2hpZnQoY29uc3RydWN0b3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgY29uc3RydWN0b3IucGFyZW50LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcHJvdG9jbGFzcy5hcHBseSh0aGlzLCBbdGhpc10uY29uY2F0KGFyZ3MpKTtcbiAgICB9XG5cbiAgICBjaGlsZC5taXhpbiA9IGZ1bmN0aW9uKHByb3RvKSB7XG4gICAgICBfY29weSh0aGlzLnByb3RvdHlwZSwgYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBjaGlsZC5jcmVhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgb2JqID0gT2JqZWN0LmNyZWF0ZShjaGlsZC5wcm90b3R5cGUpO1xuICAgICAgY2hpbGQuYXBwbHkob2JqLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gY2hpbGQ7XG59XG5cblxubW9kdWxlLmV4cG9ydHMgPSBwcm90b2NsYXNzOyIsIi8qKlxuICogVHdlZW4uanMgLSBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS90d2VlbmpzL3R3ZWVuLmpzXG4gKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS90d2VlbmpzL3R3ZWVuLmpzL2dyYXBocy9jb250cmlidXRvcnMgZm9yIHRoZSBmdWxsIGxpc3Qgb2YgY29udHJpYnV0b3JzLlxuICogVGhhbmsgeW91IGFsbCwgeW91J3JlIGF3ZXNvbWUhXG4gKi9cblxuLy8gSW5jbHVkZSBhIHBlcmZvcm1hbmNlLm5vdyBwb2x5ZmlsbFxuKGZ1bmN0aW9uICgpIHtcblxuXHRpZiAoJ3BlcmZvcm1hbmNlJyBpbiB3aW5kb3cgPT09IGZhbHNlKSB7XG5cdFx0d2luZG93LnBlcmZvcm1hbmNlID0ge307XG5cdH1cblxuXHQvLyBJRSA4XG5cdERhdGUubm93ID0gKERhdGUubm93IHx8IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdH0pO1xuXG5cdGlmICgnbm93JyBpbiB3aW5kb3cucGVyZm9ybWFuY2UgPT09IGZhbHNlKSB7XG5cdFx0dmFyIG9mZnNldCA9IHdpbmRvdy5wZXJmb3JtYW5jZS50aW1pbmcgJiYgd2luZG93LnBlcmZvcm1hbmNlLnRpbWluZy5uYXZpZ2F0aW9uU3RhcnQgPyB3aW5kb3cucGVyZm9ybWFuY2UudGltaW5nLm5hdmlnYXRpb25TdGFydFxuXHRcdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogRGF0ZS5ub3coKTtcblxuXHRcdHdpbmRvdy5wZXJmb3JtYW5jZS5ub3cgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gRGF0ZS5ub3coKSAtIG9mZnNldDtcblx0XHR9O1xuXHR9XG5cbn0pKCk7XG5cbnZhciBUV0VFTiA9IFRXRUVOIHx8IChmdW5jdGlvbiAoKSB7XG5cblx0dmFyIF90d2VlbnMgPSBbXTtcblxuXHRyZXR1cm4ge1xuXG5cdFx0Z2V0QWxsOiBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdHJldHVybiBfdHdlZW5zO1xuXG5cdFx0fSxcblxuXHRcdHJlbW92ZUFsbDogZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRfdHdlZW5zID0gW107XG5cblx0XHR9LFxuXG5cdFx0YWRkOiBmdW5jdGlvbiAodHdlZW4pIHtcblxuXHRcdFx0X3R3ZWVucy5wdXNoKHR3ZWVuKTtcblxuXHRcdH0sXG5cblx0XHRyZW1vdmU6IGZ1bmN0aW9uICh0d2Vlbikge1xuXG5cdFx0XHR2YXIgaSA9IF90d2VlbnMuaW5kZXhPZih0d2Vlbik7XG5cblx0XHRcdGlmIChpICE9PSAtMSkge1xuXHRcdFx0XHRfdHdlZW5zLnNwbGljZShpLCAxKTtcblx0XHRcdH1cblxuXHRcdH0sXG5cblx0XHR1cGRhdGU6IGZ1bmN0aW9uICh0aW1lKSB7XG5cblx0XHRcdGlmIChfdHdlZW5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBpID0gMDtcblxuXHRcdFx0dGltZSA9IHRpbWUgIT09IHVuZGVmaW5lZCA/IHRpbWUgOiB3aW5kb3cucGVyZm9ybWFuY2Uubm93KCk7XG5cblx0XHRcdHdoaWxlIChpIDwgX3R3ZWVucy5sZW5ndGgpIHtcblxuXHRcdFx0XHRpZiAoX3R3ZWVuc1tpXS51cGRhdGUodGltZSkpIHtcblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0X3R3ZWVucy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdH1cblx0fTtcblxufSkoKTtcblxuVFdFRU4uVHdlZW4gPSBmdW5jdGlvbiAob2JqZWN0KSB7XG5cblx0dmFyIF9vYmplY3QgPSBvYmplY3Q7XG5cdHZhciBfdmFsdWVzU3RhcnQgPSB7fTtcblx0dmFyIF92YWx1ZXNFbmQgPSB7fTtcblx0dmFyIF92YWx1ZXNTdGFydFJlcGVhdCA9IHt9O1xuXHR2YXIgX2R1cmF0aW9uID0gMTAwMDtcblx0dmFyIF9yZXBlYXQgPSAwO1xuXHR2YXIgX3lveW8gPSBmYWxzZTtcblx0dmFyIF9pc1BsYXlpbmcgPSBmYWxzZTtcblx0dmFyIF9yZXZlcnNlZCA9IGZhbHNlO1xuXHR2YXIgX2RlbGF5VGltZSA9IDA7XG5cdHZhciBfc3RhcnRUaW1lID0gbnVsbDtcblx0dmFyIF9lYXNpbmdGdW5jdGlvbiA9IFRXRUVOLkVhc2luZy5MaW5lYXIuTm9uZTtcblx0dmFyIF9pbnRlcnBvbGF0aW9uRnVuY3Rpb24gPSBUV0VFTi5JbnRlcnBvbGF0aW9uLkxpbmVhcjtcblx0dmFyIF9jaGFpbmVkVHdlZW5zID0gW107XG5cdHZhciBfb25TdGFydENhbGxiYWNrID0gbnVsbDtcblx0dmFyIF9vblN0YXJ0Q2FsbGJhY2tGaXJlZCA9IGZhbHNlO1xuXHR2YXIgX29uVXBkYXRlQ2FsbGJhY2sgPSBudWxsO1xuXHR2YXIgX29uQ29tcGxldGVDYWxsYmFjayA9IG51bGw7XG5cdHZhciBfb25TdG9wQ2FsbGJhY2sgPSBudWxsO1xuXG5cdC8vIFNldCBhbGwgc3RhcnRpbmcgdmFsdWVzIHByZXNlbnQgb24gdGhlIHRhcmdldCBvYmplY3Rcblx0Zm9yICh2YXIgZmllbGQgaW4gb2JqZWN0KSB7XG5cdFx0X3ZhbHVlc1N0YXJ0W2ZpZWxkXSA9IHBhcnNlRmxvYXQob2JqZWN0W2ZpZWxkXSwgMTApO1xuXHR9XG5cblx0dGhpcy50byA9IGZ1bmN0aW9uIChwcm9wZXJ0aWVzLCBkdXJhdGlvbikge1xuXG5cdFx0aWYgKGR1cmF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdF9kdXJhdGlvbiA9IGR1cmF0aW9uO1xuXHRcdH1cblxuXHRcdF92YWx1ZXNFbmQgPSBwcm9wZXJ0aWVzO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLnN0YXJ0ID0gZnVuY3Rpb24gKHRpbWUpIHtcblxuXHRcdFRXRUVOLmFkZCh0aGlzKTtcblxuXHRcdF9pc1BsYXlpbmcgPSB0cnVlO1xuXG5cdFx0X29uU3RhcnRDYWxsYmFja0ZpcmVkID0gZmFsc2U7XG5cblx0XHRfc3RhcnRUaW1lID0gdGltZSAhPT0gdW5kZWZpbmVkID8gdGltZSA6IHdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKTtcblx0XHRfc3RhcnRUaW1lICs9IF9kZWxheVRpbWU7XG5cblx0XHRmb3IgKHZhciBwcm9wZXJ0eSBpbiBfdmFsdWVzRW5kKSB7XG5cblx0XHRcdC8vIENoZWNrIGlmIGFuIEFycmF5IHdhcyBwcm92aWRlZCBhcyBwcm9wZXJ0eSB2YWx1ZVxuXHRcdFx0aWYgKF92YWx1ZXNFbmRbcHJvcGVydHldIGluc3RhbmNlb2YgQXJyYXkpIHtcblxuXHRcdFx0XHRpZiAoX3ZhbHVlc0VuZFtwcm9wZXJ0eV0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDcmVhdGUgYSBsb2NhbCBjb3B5IG9mIHRoZSBBcnJheSB3aXRoIHRoZSBzdGFydCB2YWx1ZSBhdCB0aGUgZnJvbnRcblx0XHRcdFx0X3ZhbHVlc0VuZFtwcm9wZXJ0eV0gPSBbX29iamVjdFtwcm9wZXJ0eV1dLmNvbmNhdChfdmFsdWVzRW5kW3Byb3BlcnR5XSk7XG5cblx0XHRcdH1cblxuXHRcdFx0X3ZhbHVlc1N0YXJ0W3Byb3BlcnR5XSA9IF9vYmplY3RbcHJvcGVydHldO1xuXG5cdFx0XHRpZiAoKF92YWx1ZXNTdGFydFtwcm9wZXJ0eV0gaW5zdGFuY2VvZiBBcnJheSkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdF92YWx1ZXNTdGFydFtwcm9wZXJ0eV0gKj0gMS4wOyAvLyBFbnN1cmVzIHdlJ3JlIHVzaW5nIG51bWJlcnMsIG5vdCBzdHJpbmdzXG5cdFx0XHR9XG5cblx0XHRcdF92YWx1ZXNTdGFydFJlcGVhdFtwcm9wZXJ0eV0gPSBfdmFsdWVzU3RhcnRbcHJvcGVydHldIHx8IDA7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblxuXHRcdGlmICghX2lzUGxheWluZykge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0VFdFRU4ucmVtb3ZlKHRoaXMpO1xuXHRcdF9pc1BsYXlpbmcgPSBmYWxzZTtcblxuXHRcdGlmIChfb25TdG9wQ2FsbGJhY2sgIT09IG51bGwpIHtcblx0XHRcdF9vblN0b3BDYWxsYmFjay5jYWxsKF9vYmplY3QpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RvcENoYWluZWRUd2VlbnMoKTtcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMuc3RvcENoYWluZWRUd2VlbnMgPSBmdW5jdGlvbiAoKSB7XG5cblx0XHRmb3IgKHZhciBpID0gMCwgbnVtQ2hhaW5lZFR3ZWVucyA9IF9jaGFpbmVkVHdlZW5zLmxlbmd0aDsgaSA8IG51bUNoYWluZWRUd2VlbnM7IGkrKykge1xuXHRcdFx0X2NoYWluZWRUd2VlbnNbaV0uc3RvcCgpO1xuXHRcdH1cblxuXHR9O1xuXG5cdHRoaXMuZGVsYXkgPSBmdW5jdGlvbiAoYW1vdW50KSB7XG5cblx0XHRfZGVsYXlUaW1lID0gYW1vdW50O1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5yZXBlYXQgPSBmdW5jdGlvbiAodGltZXMpIHtcblxuXHRcdF9yZXBlYXQgPSB0aW1lcztcblx0XHRyZXR1cm4gdGhpcztcblxuXHR9O1xuXG5cdHRoaXMueW95byA9IGZ1bmN0aW9uICh5b3lvKSB7XG5cblx0XHRfeW95byA9IHlveW87XG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXG5cdHRoaXMuZWFzaW5nID0gZnVuY3Rpb24gKGVhc2luZykge1xuXG5cdFx0X2Vhc2luZ0Z1bmN0aW9uID0gZWFzaW5nO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5pbnRlcnBvbGF0aW9uID0gZnVuY3Rpb24gKGludGVycG9sYXRpb24pIHtcblxuXHRcdF9pbnRlcnBvbGF0aW9uRnVuY3Rpb24gPSBpbnRlcnBvbGF0aW9uO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5jaGFpbiA9IGZ1bmN0aW9uICgpIHtcblxuXHRcdF9jaGFpbmVkVHdlZW5zID0gYXJndW1lbnRzO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5vblN0YXJ0ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cblx0XHRfb25TdGFydENhbGxiYWNrID0gY2FsbGJhY2s7XG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLm9uVXBkYXRlID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cblx0XHRfb25VcGRhdGVDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzO1xuXG5cdH07XG5cblx0dGhpcy5vbkNvbXBsZXRlID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cblx0XHRfb25Db21wbGV0ZUNhbGxiYWNrID0gY2FsbGJhY2s7XG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLm9uU3RvcCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXG5cdFx0X29uU3RvcENhbGxiYWNrID0gY2FsbGJhY2s7XG5cdFx0cmV0dXJuIHRoaXM7XG5cblx0fTtcblxuXHR0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uICh0aW1lKSB7XG5cblx0XHR2YXIgcHJvcGVydHk7XG5cdFx0dmFyIGVsYXBzZWQ7XG5cdFx0dmFyIHZhbHVlO1xuXG5cdFx0aWYgKHRpbWUgPCBfc3RhcnRUaW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoX29uU3RhcnRDYWxsYmFja0ZpcmVkID09PSBmYWxzZSkge1xuXG5cdFx0XHRpZiAoX29uU3RhcnRDYWxsYmFjayAhPT0gbnVsbCkge1xuXHRcdFx0XHRfb25TdGFydENhbGxiYWNrLmNhbGwoX29iamVjdCk7XG5cdFx0XHR9XG5cblx0XHRcdF9vblN0YXJ0Q2FsbGJhY2tGaXJlZCA9IHRydWU7XG5cblx0XHR9XG5cblx0XHRlbGFwc2VkID0gKHRpbWUgLSBfc3RhcnRUaW1lKSAvIF9kdXJhdGlvbjtcblx0XHRlbGFwc2VkID0gZWxhcHNlZCA+IDEgPyAxIDogZWxhcHNlZDtcblxuXHRcdHZhbHVlID0gX2Vhc2luZ0Z1bmN0aW9uKGVsYXBzZWQpO1xuXG5cdFx0Zm9yIChwcm9wZXJ0eSBpbiBfdmFsdWVzRW5kKSB7XG5cblx0XHRcdHZhciBzdGFydCA9IF92YWx1ZXNTdGFydFtwcm9wZXJ0eV0gfHwgMDtcblx0XHRcdHZhciBlbmQgPSBfdmFsdWVzRW5kW3Byb3BlcnR5XTtcblxuXHRcdFx0aWYgKGVuZCBpbnN0YW5jZW9mIEFycmF5KSB7XG5cblx0XHRcdFx0X29iamVjdFtwcm9wZXJ0eV0gPSBfaW50ZXJwb2xhdGlvbkZ1bmN0aW9uKGVuZCwgdmFsdWUpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdC8vIFBhcnNlcyByZWxhdGl2ZSBlbmQgdmFsdWVzIHdpdGggc3RhcnQgYXMgYmFzZSAoZS5nLjogKzEwLCAtMylcblx0XHRcdFx0aWYgKHR5cGVvZiAoZW5kKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRlbmQgPSBzdGFydCArIHBhcnNlRmxvYXQoZW5kLCAxMCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBQcm90ZWN0IGFnYWluc3Qgbm9uIG51bWVyaWMgcHJvcGVydGllcy5cblx0XHRcdFx0aWYgKHR5cGVvZiAoZW5kKSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRfb2JqZWN0W3Byb3BlcnR5XSA9IHN0YXJ0ICsgKGVuZCAtIHN0YXJ0KSAqIHZhbHVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdGlmIChfb25VcGRhdGVDYWxsYmFjayAhPT0gbnVsbCkge1xuXHRcdFx0X29uVXBkYXRlQ2FsbGJhY2suY2FsbChfb2JqZWN0LCB2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsYXBzZWQgPT09IDEpIHtcblxuXHRcdFx0aWYgKF9yZXBlYXQgPiAwKSB7XG5cblx0XHRcdFx0aWYgKGlzRmluaXRlKF9yZXBlYXQpKSB7XG5cdFx0XHRcdFx0X3JlcGVhdC0tO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVhc3NpZ24gc3RhcnRpbmcgdmFsdWVzLCByZXN0YXJ0IGJ5IG1ha2luZyBzdGFydFRpbWUgPSBub3dcblx0XHRcdFx0Zm9yIChwcm9wZXJ0eSBpbiBfdmFsdWVzU3RhcnRSZXBlYXQpIHtcblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgKF92YWx1ZXNFbmRbcHJvcGVydHldKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdF92YWx1ZXNTdGFydFJlcGVhdFtwcm9wZXJ0eV0gPSBfdmFsdWVzU3RhcnRSZXBlYXRbcHJvcGVydHldICsgcGFyc2VGbG9hdChfdmFsdWVzRW5kW3Byb3BlcnR5XSwgMTApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChfeW95bykge1xuXHRcdFx0XHRcdFx0dmFyIHRtcCA9IF92YWx1ZXNTdGFydFJlcGVhdFtwcm9wZXJ0eV07XG5cblx0XHRcdFx0XHRcdF92YWx1ZXNTdGFydFJlcGVhdFtwcm9wZXJ0eV0gPSBfdmFsdWVzRW5kW3Byb3BlcnR5XTtcblx0XHRcdFx0XHRcdF92YWx1ZXNFbmRbcHJvcGVydHldID0gdG1wO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdF92YWx1ZXNTdGFydFtwcm9wZXJ0eV0gPSBfdmFsdWVzU3RhcnRSZXBlYXRbcHJvcGVydHldO1xuXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoX3lveW8pIHtcblx0XHRcdFx0XHRfcmV2ZXJzZWQgPSAhX3JldmVyc2VkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0X3N0YXJ0VGltZSA9IHRpbWUgKyBfZGVsYXlUaW1lO1xuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXG5cdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdGlmIChfb25Db21wbGV0ZUNhbGxiYWNrICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0X29uQ29tcGxldGVDYWxsYmFjay5jYWxsKF9vYmplY3QpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yICh2YXIgaSA9IDAsIG51bUNoYWluZWRUd2VlbnMgPSBfY2hhaW5lZFR3ZWVucy5sZW5ndGg7IGkgPCBudW1DaGFpbmVkVHdlZW5zOyBpKyspIHtcblx0XHRcdFx0XHQvLyBNYWtlIHRoZSBjaGFpbmVkIHR3ZWVucyBzdGFydCBleGFjdGx5IGF0IHRoZSB0aW1lIHRoZXkgc2hvdWxkLFxuXHRcdFx0XHRcdC8vIGV2ZW4gaWYgdGhlIGB1cGRhdGUoKWAgbWV0aG9kIHdhcyBjYWxsZWQgd2F5IHBhc3QgdGhlIGR1cmF0aW9uIG9mIHRoZSB0d2VlblxuXHRcdFx0XHRcdF9jaGFpbmVkVHdlZW5zW2ldLnN0YXJ0KF9zdGFydFRpbWUgKyBfZHVyYXRpb24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblxuXHR9O1xuXG59O1xuXG5cblRXRUVOLkVhc2luZyA9IHtcblxuXHRMaW5lYXI6IHtcblxuXHRcdE5vbmU6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBrO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0UXVhZHJhdGljOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgKiBrO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgKiAoMiAtIGspO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoKGsgKj0gMikgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAwLjUgKiBrICogaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIC0gMC41ICogKC0tayAqIChrIC0gMikgLSAxKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdEN1YmljOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgKiBrICogaztcblxuXHRcdH0sXG5cblx0XHRPdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiAtLWsgKiBrICogayArIDE7XG5cblx0XHR9LFxuXG5cdFx0SW5PdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdGlmICgoayAqPSAyKSA8IDEpIHtcblx0XHRcdFx0cmV0dXJuIDAuNSAqIGsgKiBrICogaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDAuNSAqICgoayAtPSAyKSAqIGsgKiBrICsgMik7XG5cblx0XHR9XG5cblx0fSxcblxuXHRRdWFydGljOiB7XG5cblx0XHRJbjogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIGsgKiBrICogayAqIGs7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gMSAtICgtLWsgKiBrICogayAqIGspO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoKGsgKj0gMikgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAwLjUgKiBrICogayAqIGsgKiBrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gLSAwLjUgKiAoKGsgLT0gMikgKiBrICogayAqIGsgLSAyKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdFF1aW50aWM6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gayAqIGsgKiBrICogayAqIGs7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gLS1rICogayAqIGsgKiBrICogayArIDE7XG5cblx0XHR9LFxuXG5cdFx0SW5PdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdGlmICgoayAqPSAyKSA8IDEpIHtcblx0XHRcdFx0cmV0dXJuIDAuNSAqIGsgKiBrICogayAqIGsgKiBrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gMC41ICogKChrIC09IDIpICogayAqIGsgKiBrICogayArIDIpO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0U2ludXNvaWRhbDoge1xuXG5cdFx0SW46IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiAxIC0gTWF0aC5jb3MoayAqIE1hdGguUEkgLyAyKTtcblxuXHRcdH0sXG5cblx0XHRPdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHJldHVybiBNYXRoLnNpbihrICogTWF0aC5QSSAvIDIpO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gMC41ICogKDEgLSBNYXRoLmNvcyhNYXRoLlBJICogaykpO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0RXhwb25lbnRpYWw6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gayA9PT0gMCA/IDAgOiBNYXRoLnBvdygxMDI0LCBrIC0gMSk7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gayA9PT0gMSA/IDEgOiAxIC0gTWF0aC5wb3coMiwgLSAxMCAqIGspO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRpZiAoayA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGsgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmICgoayAqPSAyKSA8IDEpIHtcblx0XHRcdFx0cmV0dXJuIDAuNSAqIE1hdGgucG93KDEwMjQsIGsgLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDAuNSAqICgtIE1hdGgucG93KDIsIC0gMTAgKiAoayAtIDEpKSArIDIpO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0Q2lyY3VsYXI6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gMSAtIE1hdGguc3FydCgxIC0gayAqIGspO1xuXG5cdFx0fSxcblxuXHRcdE91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0cmV0dXJuIE1hdGguc3FydCgxIC0gKC0tayAqIGspKTtcblxuXHRcdH0sXG5cblx0XHRJbk91dDogZnVuY3Rpb24gKGspIHtcblxuXHRcdFx0aWYgKChrICo9IDIpIDwgMSkge1xuXHRcdFx0XHRyZXR1cm4gLSAwLjUgKiAoTWF0aC5zcXJ0KDEgLSBrICogaykgLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDAuNSAqIChNYXRoLnNxcnQoMSAtIChrIC09IDIpICogaykgKyAxKTtcblxuXHRcdH1cblxuXHR9LFxuXG5cdEVsYXN0aWM6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHR2YXIgcztcblx0XHRcdHZhciBhID0gMC4xO1xuXHRcdFx0dmFyIHAgPSAwLjQ7XG5cblx0XHRcdGlmIChrID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoayA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhIHx8IGEgPCAxKSB7XG5cdFx0XHRcdGEgPSAxO1xuXHRcdFx0XHRzID0gcCAvIDQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzID0gcCAqIE1hdGguYXNpbigxIC8gYSkgLyAoMiAqIE1hdGguUEkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gLSAoYSAqIE1hdGgucG93KDIsIDEwICogKGsgLT0gMSkpICogTWF0aC5zaW4oKGsgLSBzKSAqICgyICogTWF0aC5QSSkgLyBwKSk7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHR2YXIgcztcblx0XHRcdHZhciBhID0gMC4xO1xuXHRcdFx0dmFyIHAgPSAwLjQ7XG5cblx0XHRcdGlmIChrID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoayA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhIHx8IGEgPCAxKSB7XG5cdFx0XHRcdGEgPSAxO1xuXHRcdFx0XHRzID0gcCAvIDQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzID0gcCAqIE1hdGguYXNpbigxIC8gYSkgLyAoMiAqIE1hdGguUEkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gKGEgKiBNYXRoLnBvdygyLCAtIDEwICogaykgKiBNYXRoLnNpbigoayAtIHMpICogKDIgKiBNYXRoLlBJKSAvIHApICsgMSk7XG5cblx0XHR9LFxuXG5cdFx0SW5PdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHZhciBzO1xuXHRcdFx0dmFyIGEgPSAwLjE7XG5cdFx0XHR2YXIgcCA9IDAuNDtcblxuXHRcdFx0aWYgKGsgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChrID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWEgfHwgYSA8IDEpIHtcblx0XHRcdFx0YSA9IDE7XG5cdFx0XHRcdHMgPSBwIC8gNDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHMgPSBwICogTWF0aC5hc2luKDEgLyBhKSAvICgyICogTWF0aC5QSSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICgoayAqPSAyKSA8IDEpIHtcblx0XHRcdFx0cmV0dXJuIC0gMC41ICogKGEgKiBNYXRoLnBvdygyLCAxMCAqIChrIC09IDEpKSAqIE1hdGguc2luKChrIC0gcykgKiAoMiAqIE1hdGguUEkpIC8gcCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYSAqIE1hdGgucG93KDIsIC0xMCAqIChrIC09IDEpKSAqIE1hdGguc2luKChrIC0gcykgKiAoMiAqIE1hdGguUEkpIC8gcCkgKiAwLjUgKyAxO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0QmFjazoge1xuXG5cdFx0SW46IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdHZhciBzID0gMS43MDE1ODtcblxuXHRcdFx0cmV0dXJuIGsgKiBrICogKChzICsgMSkgKiBrIC0gcyk7XG5cblx0XHR9LFxuXG5cdFx0T3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHR2YXIgcyA9IDEuNzAxNTg7XG5cblx0XHRcdHJldHVybiAtLWsgKiBrICogKChzICsgMSkgKiBrICsgcykgKyAxO1xuXG5cdFx0fSxcblxuXHRcdEluT3V0OiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHR2YXIgcyA9IDEuNzAxNTggKiAxLjUyNTtcblxuXHRcdFx0aWYgKChrICo9IDIpIDwgMSkge1xuXHRcdFx0XHRyZXR1cm4gMC41ICogKGsgKiBrICogKChzICsgMSkgKiBrIC0gcykpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gMC41ICogKChrIC09IDIpICogayAqICgocyArIDEpICogayArIHMpICsgMik7XG5cblx0XHR9XG5cblx0fSxcblxuXHRCb3VuY2U6IHtcblxuXHRcdEluOiBmdW5jdGlvbiAoaykge1xuXG5cdFx0XHRyZXR1cm4gMSAtIFRXRUVOLkVhc2luZy5Cb3VuY2UuT3V0KDEgLSBrKTtcblxuXHRcdH0sXG5cblx0XHRPdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdGlmIChrIDwgKDEgLyAyLjc1KSkge1xuXHRcdFx0XHRyZXR1cm4gNy41NjI1ICogayAqIGs7XG5cdFx0XHR9IGVsc2UgaWYgKGsgPCAoMiAvIDIuNzUpKSB7XG5cdFx0XHRcdHJldHVybiA3LjU2MjUgKiAoayAtPSAoMS41IC8gMi43NSkpICogayArIDAuNzU7XG5cdFx0XHR9IGVsc2UgaWYgKGsgPCAoMi41IC8gMi43NSkpIHtcblx0XHRcdFx0cmV0dXJuIDcuNTYyNSAqIChrIC09ICgyLjI1IC8gMi43NSkpICogayArIDAuOTM3NTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiA3LjU2MjUgKiAoayAtPSAoMi42MjUgLyAyLjc1KSkgKiBrICsgMC45ODQzNzU7XG5cdFx0XHR9XG5cblx0XHR9LFxuXG5cdFx0SW5PdXQ6IGZ1bmN0aW9uIChrKSB7XG5cblx0XHRcdGlmIChrIDwgMC41KSB7XG5cdFx0XHRcdHJldHVybiBUV0VFTi5FYXNpbmcuQm91bmNlLkluKGsgKiAyKSAqIDAuNTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFRXRUVOLkVhc2luZy5Cb3VuY2UuT3V0KGsgKiAyIC0gMSkgKiAwLjUgKyAwLjU7XG5cblx0XHR9XG5cblx0fVxuXG59O1xuXG5UV0VFTi5JbnRlcnBvbGF0aW9uID0ge1xuXG5cdExpbmVhcjogZnVuY3Rpb24gKHYsIGspIHtcblxuXHRcdHZhciBtID0gdi5sZW5ndGggLSAxO1xuXHRcdHZhciBmID0gbSAqIGs7XG5cdFx0dmFyIGkgPSBNYXRoLmZsb29yKGYpO1xuXHRcdHZhciBmbiA9IFRXRUVOLkludGVycG9sYXRpb24uVXRpbHMuTGluZWFyO1xuXG5cdFx0aWYgKGsgPCAwKSB7XG5cdFx0XHRyZXR1cm4gZm4odlswXSwgdlsxXSwgZik7XG5cdFx0fVxuXG5cdFx0aWYgKGsgPiAxKSB7XG5cdFx0XHRyZXR1cm4gZm4odlttXSwgdlttIC0gMV0sIG0gLSBmKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZm4odltpXSwgdltpICsgMSA+IG0gPyBtIDogaSArIDFdLCBmIC0gaSk7XG5cblx0fSxcblxuXHRCZXppZXI6IGZ1bmN0aW9uICh2LCBrKSB7XG5cblx0XHR2YXIgYiA9IDA7XG5cdFx0dmFyIG4gPSB2Lmxlbmd0aCAtIDE7XG5cdFx0dmFyIHB3ID0gTWF0aC5wb3c7XG5cdFx0dmFyIGJuID0gVFdFRU4uSW50ZXJwb2xhdGlvbi5VdGlscy5CZXJuc3RlaW47XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8PSBuOyBpKyspIHtcblx0XHRcdGIgKz0gcHcoMSAtIGssIG4gLSBpKSAqIHB3KGssIGkpICogdltpXSAqIGJuKG4sIGkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBiO1xuXG5cdH0sXG5cblx0Q2F0bXVsbFJvbTogZnVuY3Rpb24gKHYsIGspIHtcblxuXHRcdHZhciBtID0gdi5sZW5ndGggLSAxO1xuXHRcdHZhciBmID0gbSAqIGs7XG5cdFx0dmFyIGkgPSBNYXRoLmZsb29yKGYpO1xuXHRcdHZhciBmbiA9IFRXRUVOLkludGVycG9sYXRpb24uVXRpbHMuQ2F0bXVsbFJvbTtcblxuXHRcdGlmICh2WzBdID09PSB2W21dKSB7XG5cblx0XHRcdGlmIChrIDwgMCkge1xuXHRcdFx0XHRpID0gTWF0aC5mbG9vcihmID0gbSAqICgxICsgaykpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZm4odlsoaSAtIDEgKyBtKSAlIG1dLCB2W2ldLCB2WyhpICsgMSkgJSBtXSwgdlsoaSArIDIpICUgbV0sIGYgLSBpKTtcblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdGlmIChrIDwgMCkge1xuXHRcdFx0XHRyZXR1cm4gdlswXSAtIChmbih2WzBdLCB2WzBdLCB2WzFdLCB2WzFdLCAtZikgLSB2WzBdKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGsgPiAxKSB7XG5cdFx0XHRcdHJldHVybiB2W21dIC0gKGZuKHZbbV0sIHZbbV0sIHZbbSAtIDFdLCB2W20gLSAxXSwgZiAtIG0pIC0gdlttXSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmbih2W2kgPyBpIC0gMSA6IDBdLCB2W2ldLCB2W20gPCBpICsgMSA/IG0gOiBpICsgMV0sIHZbbSA8IGkgKyAyID8gbSA6IGkgKyAyXSwgZiAtIGkpO1xuXG5cdFx0fVxuXG5cdH0sXG5cblx0VXRpbHM6IHtcblxuXHRcdExpbmVhcjogZnVuY3Rpb24gKHAwLCBwMSwgdCkge1xuXG5cdFx0XHRyZXR1cm4gKHAxIC0gcDApICogdCArIHAwO1xuXG5cdFx0fSxcblxuXHRcdEJlcm5zdGVpbjogZnVuY3Rpb24gKG4sIGkpIHtcblxuXHRcdFx0dmFyIGZjID0gVFdFRU4uSW50ZXJwb2xhdGlvbi5VdGlscy5GYWN0b3JpYWw7XG5cblx0XHRcdHJldHVybiBmYyhuKSAvIGZjKGkpIC8gZmMobiAtIGkpO1xuXG5cdFx0fSxcblxuXHRcdEZhY3RvcmlhbDogKGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0dmFyIGEgPSBbMV07XG5cblx0XHRcdHJldHVybiBmdW5jdGlvbiAobikge1xuXG5cdFx0XHRcdHZhciBzID0gMTtcblxuXHRcdFx0XHRpZiAoYVtuXSkge1xuXHRcdFx0XHRcdHJldHVybiBhW25dO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yICh2YXIgaSA9IG47IGkgPiAxOyBpLS0pIHtcblx0XHRcdFx0XHRzICo9IGk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhW25dID0gcztcblx0XHRcdFx0cmV0dXJuIHM7XG5cblx0XHRcdH07XG5cblx0XHR9KSgpLFxuXG5cdFx0Q2F0bXVsbFJvbTogZnVuY3Rpb24gKHAwLCBwMSwgcDIsIHAzLCB0KSB7XG5cblx0XHRcdHZhciB2MCA9IChwMiAtIHAwKSAqIDAuNTtcblx0XHRcdHZhciB2MSA9IChwMyAtIHAxKSAqIDAuNTtcblx0XHRcdHZhciB0MiA9IHQgKiB0O1xuXHRcdFx0dmFyIHQzID0gdCAqIHQyO1xuXG5cdFx0XHRyZXR1cm4gKDIgKiBwMSAtIDIgKiBwMiArIHYwICsgdjEpICogdDMgKyAoLSAzICogcDEgKyAzICogcDIgLSAyICogdjAgLSB2MSkgKiB0MiArIHYwICogdCArIHAxO1xuXG5cdFx0fVxuXG5cdH1cblxufTtcblxuLy8gVU1EIChVbml2ZXJzYWwgTW9kdWxlIERlZmluaXRpb24pXG4oZnVuY3Rpb24gKHJvb3QpIHtcblxuXHRpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG5cblx0XHQvLyBBTURcblx0XHRkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBUV0VFTjtcblx0XHR9KTtcblxuXHR9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuXG5cdFx0Ly8gTm9kZS5qc1xuXHRcdG1vZHVsZS5leHBvcnRzID0gVFdFRU47XG5cblx0fSBlbHNlIHtcblxuXHRcdC8vIEdsb2JhbCB2YXJpYWJsZVxuXHRcdHJvb3QuVFdFRU4gPSBUV0VFTjtcblxuXHR9XG5cbn0pKHRoaXMpO1xuIl19
