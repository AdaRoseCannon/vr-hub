/*global THREE*/
'use strict';
const addScript = require('./lib/loadScript'); // Promise wrapper for script loading
const VerletWrapper = require('./lib/verletwrapper'); // Wrapper of the verlet worker
const VRTarget = require('./lib/vrtarget'); // Append iframes to the page and provide a control interface
const textSprite = require('./lib/textSprite'); // Generally sprites from canvas
const GoTargetWorld = require('./lib/gotargets.js'); // Tool for making interactive VR elements
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
.then(() => require('./lib/three').myThreeFromJSON('hub'))
.then(three => {
	console.log('Ready');

	const frame = new VRTarget(); // Setup iframe for loading sites into

	three.deviceOrientation({manualControl: true}); // Allow clicking and dragging

	const goTargetWorld = new GoTargetWorld(three);

	three.useSky();
	three.useCardboard();

	const dome = three.pickObjects(three.scene, 'dome').dome;
	dome.material = three.materials.boring2;
	three.scene.remove(dome);

	const grid = new THREE.GridHelper( 10, 1 );
	grid.setColors( 0xff0000, 0xffffff );
	three.scene.add( grid );

	// Brand lights
	const ambientLight = new THREE.AmbientLight( 0xc0b9bb );
	three.scene.add( ambientLight );

	const pLight0 = new THREE.DirectionalLight( 0xC0B9BB, 0.5 );
	pLight0.position.set( 0, 1, 3 );
	three.scene.add( pLight0 );

	const pLight1 = new THREE.DirectionalLight( 0xF9CCFF, 0.5 );
	pLight1.position.set( 8, -3, 0 );
	three.scene.add( pLight1 );

	const pLight2 = new THREE.DirectionalLight( 0xE3FFAE, 0.5 );
	pLight2.position.set( -8, -3, -3 );
	three.scene.add( pLight2 );

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
					three.updateObjects(points);
					waitingForPoints = false;
				});
				waitingForPoints = true;
			}
			three.render();
			TWEEN.update(time);
		});

		const map = THREE.ImageUtils.loadTexture( "images/reticule.png" );
		const material = new THREE.SpriteMaterial( { map: map, color: 0xffffff, fog: false, transparent: true } );
		const sprite = new THREE.Sprite(material);
		three.hud.add(sprite);

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

		function addButton(str) {
			const sprite = textSprite(str, {
				fontsize: 18,
				fontface: 'Iceland',
				borderThickness: 20
			});
			three.scene.add(sprite);
			sprite.position.set(5,5,5);
			sprite.material.transparent = true;
			return goTargetWorld.makeTarget(sprite);
		}

		// Set up the dome breaking down and building back
		require('./lib/explodeDome')(dome, three, verlet)
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
				.then(() => three.skyBox.visible = false)
				.then(() => loadDoc(url))
				.then(() => domeController.destroy())
				.then(() => tweenDomeOpacity(0, 4000))
				.then(() => {
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
				Promise.all([domeController.restore(), tweenDomeOpacity(1, 2000)])
				.then(() => removeDoc())
				.then(() => three.domElement.style.pointerEvents = 'auto')
				.then(() => three.skyBox.visible = true)
				.then(() => tweenDomeOpacity(0.2));
			}

			window.showDocument = showDocument;
			window.closeDocument = closeDocument;
			
			const lightHouseDemoButton = addButton('Load Demo');
			lightHouseDemoButton.on('click', () => showDocument('https://adaroseedwards.github.io/cardboard2/index.html#vr'));

		});	

		function reset() {
			three.camera.position.set(0, three.camera.height, 0);
		}

		// Set initial properties
		reset();
		window.three = three;
	});
});
