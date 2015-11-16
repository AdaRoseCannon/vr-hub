/* global THREE, DeviceOrientationController */
'use strict';
const EventEmitter = require('fast-event-emitter');
const util = require('util');



/**
 * Use the json loader to load json files from the default location
 */

var l = new THREE.ObjectLoader();
const loadScene = (id) => new Promise(function (resolve, reject) {
	l.load('models/' + id + '.json', resolve, undefined, reject);
});

/**
 * Helper for picking objects from a scene
 * @param  {Object3d}    root    root Object3d e.g. a scene or a mesh
 * @param  {...string} namesIn list of namesd to find e.g. 'Camera' or 'Floor'
 * @return {Object map}          map of names to objects {'Camera': (THREE.Camera with name Camera), 'Floor': (THREE.Mesh with name Floor)}
 */
function pickObjectsHelper(root, ...namesIn) {

	const collection = {};
	const names = new Set(namesIn);

	(function pickObjects(root) {
		if (root.children) {
			root.children.forEach(node => {
				if (names.has(node.name)) {
					collection[node.name] = node;
					names.delete(node.name);
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
function myThreeFromJSON(id, options={}) {
	return loadScene(id).then(scene => {
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
function MyThreeHelper(options){

	EventEmitter.call(this);

	options.target = options.target || document.body;

	const renderer = new THREE.WebGLRenderer( { antialias: false } );
	renderer.setPixelRatio( window.devicePixelRatio );

	options.target.appendChild(renderer.domElement);
	this.domElement = renderer.domElement;



	/**
	 * Set up stereo effect renderer
	 */

	const effect = new THREE.StereoEffect(renderer);
	effect.eyeSeparation = 0.008;
	effect.focalLength = 0.25;
	effect.setSize( window.innerWidth, window.innerHeight );
	this.renderMethod = effect;



	/**
	 * Set up the scene to be rendered or create a new one
	 */

	this.scene = options.scene || new THREE.Scene();



	/**
	 * Set up camera either one from the scene or make a new one
	 */
	
	let camera = options.camera ? pickObjectsHelper(this.scene, options.camera)[options.camera] : undefined;

	if (!camera) {
		console.log(camera);
		camera = new THREE.PerspectiveCamera( 75, options.target.scrollWidth / options.target.scrollHeight, 0.5, 100 );
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

	const setAspect = () => {
		this.renderMethod.setSize( options.target.clientWidth, options.target.clientHeight );
		this.camera.aspect = options.target.scrollWidth / options.target.scrollHeight;
		this.camera.updateProjectionMatrix();
	};
	window.addEventListener('resize', setAspect);
	setAspect();



	/**
	 * Set up head tracking
	 */

	 // provide dummy element to prevent touch/click hijacking.
	const element = location.hostname !== 'localhost' ? document.createElement("DIV") : undefined;
	this.deviceOrientationController = new DeviceOrientationController(this.camera, element);
	this.deviceOrientationController.connect();
	this.on('prerender', () => this.deviceOrientationController.update());



	/**
	 * This should be called in the main animation loop
	 */

	this.render = () => {
		this.emit('prerender');
		this.renderMethod.render(this.scene, camera);
		this.emit('postrender');
	};



	/**
	 * Heads up Display
	 * 
	 * Add a heads up display object to the camera
	 * Meshes and Sprites can be added to this to appear to be close to the user.
	 */

	const hud = new THREE.Object3D();
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

	const threeObjectsConnectedToPhysics = {};
	this.updateObjects = physicsObjects => {
		const l = physicsObjects.length;

		// iterate over the physics physicsObjects
		for ( let j=0; j<l;j++ ) {

			const i = physicsObjects[j];
			if (threeObjectsConnectedToPhysics[i.id]) {

				const o = threeObjectsConnectedToPhysics[i.id];

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

	this.connectPhysicsToThree = (mesh, physicsMesh) => {
		threeObjectsConnectedToPhysics[physicsMesh.id] = mesh;
		if (mesh.constructor === THREE.Vector3) return;
		this.scene.add(mesh);
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
