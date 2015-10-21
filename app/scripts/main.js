/*global THREE*/
'use strict';
const addScript = require('./lib/loadScript');
const VerletWrapper = require('./lib/verletwrapper');
const TWEEN = require('tween.js');

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

	three.useSky();

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

	three.deviceOrientation({manualControl: true});

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
			if (!waitingForPoints) {
				verlet.getPoints().then(points => {
					three.updateObjects(points);
					waitingForPoints = false;
				});
				waitingForPoints = true;
			}
			three.animate();
			TWEEN.update(time);
			requestAnimationFrame(animate);
		});

		const map = THREE.ImageUtils.loadTexture( "images/reticule.png" );
		const material = new THREE.SpriteMaterial( { map: map, color: 0xffffff, fog: false, transparent: true } );
		const sprite = new THREE.Sprite(material);
		three.hud.add(sprite);

		function loadDoc(url) {
			return new Promise(resolve => {
				setTimeout(() => resolve(url), 3000);
			});
		}

		function removeDoc() {
			return;
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
				tweenDomeOpacity(1)
				.then(() => three.skyBox.visible = false)
				.then(() => loadDoc(url))
				.then(() => domeController.destroy())
				.then(() => tweenDomeOpacity(0, 4000))
				.then(() => domeController.mesh.visible = false);
			}

			function closeDocument() {
				domeController.mesh.visible = true;
				tweenDomeOpacity(1)
				.then(() => domeController.restore())
				.then(() => removeDoc())
				.then(() => three.skyBox.visible = true)
				.then(() => tweenDomeOpacity(0.2));
			}

			window.showDocument = showDocument;
			window.closeDocument = closeDocument;
		});	

		function reset() {
			three.camera.position.set(0, three.camera.height, 0);
		}

		// Set initial properties
		reset();

		// Add a buton to put it into cardboard mode
		require('./lib/cardboardButton')(three);

		window.three = three;
	});
});
