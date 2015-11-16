/*global THREE*/
'use strict';
const addScript = require('./lib/loadScript'); // Promise wrapper for script loading
const VerletWrapper = require('./lib/verletwrapper'); // Wrapper of the verlet worker
const VRTarget = require('./lib/vrtarget'); // Append iframes to the page and provide a control interface
const textSprite = require('./lib/textSprite'); // Generally sprites from canvas
const CameraInteractions = require('./lib/camerainteractions'); // Tool for making interactive VR elements
const TWEEN = require('tween.js');

const STATE_PAUSED = 0;
const STATE_PLAYING = 1;

const STATE_HUB_OPEN = 0;
const STATE_HUB_CLOSED = 1;

let animState = STATE_PLAYING;
let hubState = STATE_HUB_OPEN;

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
				navigator.serviceWorker.register('./sw.js')
				.then(function(reg) {
					console.log('sw registered', reg);
				})
				.then(resolve);
			}
		} else {
			console.error('No Service Worker, assets may not be cached');
			resolve();
		}
	});
}

serviceWorker()
.then(() => Promise.all([
	addScript('https://polyfill.webservices.ft.com/v1/polyfill.min.js?features=fetch,default'),
	addScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r73/three.min.js')
]))
.then(() => Promise.all([
	addScript('https://cdn.rawgit.com/mrdoob/three.js/master/examples/js/effects/StereoEffect.js'),
	addScript('https://cdn.rawgit.com/mrdoob/three.js/master/examples/js/SkyShader.js'),
	addScript('https://cdn.rawgit.com/richtr/threeVR/master/js/DeviceOrientationController.js')
]))
.then(() => require('./lib/threeHelper').myThreeFromJSON('hub'))
.then(threeHelper => {
	console.log('Ready');

	/**
	 * Setup Click listener for fullscreen
	 */
	threeHelper.domElement.addEventListener('click', threeHelper.fullscreen);

	const frame = new VRTarget(); // Setup iframe for loading sites into


	/**
	 * Set up interactivity from the camera.
	 */

	const cameraInteractivityWorld = new CameraInteractions(threeHelper.domElement);

	threeHelper.deviceOrientationController
	.addEventListener('userinteractionend', function () {
		cameraInteractivityWorld.interact({type: 'click'});
	});

	const skyBox = require('./lib/sky')();
	threeHelper.scene.add(skyBox);
	skyBox.scale.multiplyScalar(0.00004);

	const dome = threeHelper.pickObjectsHelper(threeHelper.scene, 'dome').dome;
	dome.material = new THREE.MeshPhongMaterial( { color: 0xC0B9BB, specular: 0, shading: THREE.FlatShading, side: THREE.DoubleSide, transparent: true, opacity: 0.2 } );
	threeHelper.scene.remove(dome);

	const grid = new THREE.GridHelper( 10, 1 );
	grid.setColors( 0xff0000, 0xffffff );
	threeHelper.scene.add( grid );

	// Brand lights
	const ambientLight = new THREE.AmbientLight( 0xc0b9bb );
	threeHelper.scene.add( ambientLight );

	const pLight0 = new THREE.DirectionalLight( 0xC0B9BB, 0.5 );
	pLight0.position.set( 0, 1, 3 );
	threeHelper.scene.add( pLight0 );

	const pLight1 = new THREE.DirectionalLight( 0xF9CCFF, 0.5 );
	pLight1.position.set( 8, -3, 0 );
	threeHelper.scene.add( pLight1 );

	const pLight2 = new THREE.DirectionalLight( 0xE3FFAE, 0.5 );
	pLight2.position.set( -8, -3, -3 );
	threeHelper.scene.add( pLight2 );

	// Run the verlet physics
	const verlet = new VerletWrapper();
	verlet.init({
		size: {
			x: 20,
			y: 20,
			z: 20,
		},
		gravity: true
	})
	.then(function () {
		
		let waitingForPoints = false;
		requestAnimationFrame(function animate(time) {
			requestAnimationFrame(animate);
			if (animState !== STATE_PLAYING) return;
			if (!waitingForPoints) {
				verlet.getPoints().then(points => {
					threeHelper.updateObjects(points);
					waitingForPoints = false;
				});
				waitingForPoints = true;
			}
			cameraInteractivityWorld.detectInteractions(threeHelper.camera);
			threeHelper.render();
			TWEEN.update(time);
		});

		const map = THREE.ImageUtils.loadTexture( "images/reticule.png" );
		const material = new THREE.SpriteMaterial( { map: map, color: 0xffffff, fog: false, transparent: true } );
		const sprite = new THREE.Sprite(material);
		threeHelper.hud.add(sprite);

		function loadDoc(url) {

			// Display the loading graphic

			// Get the frame to show 
			return frame.load(url)
			.then(() => {
				// remove the loading graphic
				console.log('loaded %s', url);
			});
		}

		function removeDoc() {
			frame.unload();
			return;
		}

		let i = 0;
		function addButton(str) {
			i++;
			const rows = 5;
			const sprite = textSprite(str, {
				fontsize: 18,
				fontface: 'Iceland',
				borderThickness: 20
			});
			threeHelper.scene.add(sprite);
			sprite.position.set(
				5 + Math.floor(i / rows),
				5 - (i % rows),
				5
			);
			sprite.material.transparent = true;
			return cameraInteractivityWorld.makeTarget(sprite);
		}

		// Set up the dome breaking down and building back
		require('./lib/explodeDome')(dome, threeHelper, verlet)
		.then(domeController => {
			window.addEventListener('dblclick', () => domeController.toggle());
			window.addEventListener('touchend', () => domeController.toggle());

			function tweenDomeOpacity(opacity, time = 1000) {
				if (opacity !== undefined && opacity !== dome.material.opacity) {
					return new Promise(resolve => new TWEEN.Tween(dome.material)
					    .to({ opacity }, time)
					    .easing(TWEEN.Easing.Cubic.Out)
					    .start()
					    .onComplete(resolve));
				} else {
					return Promise.resolve();
				}
			}

			function showDocument(url) {
				hubState = STATE_HUB_CLOSED;
				tweenDomeOpacity(1)
				.then(() => skyBox.visible = false)
				.then(() => loadDoc(url))
				.then(() => domeController.destroy())
				.then(() => tweenDomeOpacity(0, 4000))
				.then(() => {
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
				Promise.all([domeController.restore(), tweenDomeOpacity(1, 2000)])
				.then(() => removeDoc())
				.then(() => threeHelper.domElement.style.pointerEvents = 'auto')
				.then(() => skyBox.visible = true)
				.then(() => tweenDomeOpacity(0.2));
			}

			window.showDocument = showDocument;
			window.closeDocument = closeDocument;
			
			const lightHouseDemoButton = addButton('Load Desert Demo');
			lightHouseDemoButton.on('click', () => showDocument('https://adaroseedwards.github.io/cardboard2/index.html#vr'));
			const kitchenDemoButton = addButton('Load Kitchen Demo');
			kitchenDemoButton.on('click', () => showDocument('https://adaroseedwards.github.io/vr-lick-the-whisk/'));

		});	

		function reset() {
			threeHelper.camera.position.set(0, threeHelper.camera.height, 0);
		}

		// Set initial properties
		reset();
		window.threeHelper = threeHelper;
	});
});
