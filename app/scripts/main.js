/*global THREE*/
'use strict';
const addScript = require('./lib/loadScript');
const VerletWrapper = require('./lib/verletwrapper');

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
	addScript('https://cdn.rawgit.com/richtr/threeVR/master/js/DeviceOrientationController.js')
]))
.then(() => require('./lib/three').myThreeFromJSON('hub'))
.then(three => {
	console.log('Ready');

	const dome = three.pickObjects(three.scene, 'dome').dome;
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

	dome.material = three.materials.boring2;

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
			
		requestAnimationFrame(function animate() {
			verlet.getPoints().then(points => {
				three.updateObjects(points);
				three.animate();
			});
			requestAnimationFrame(animate);
		});

		const map = THREE.ImageUtils.loadTexture( "images/reticule.png" );
		const material = new THREE.SpriteMaterial( { map: map, color: 0xffffff, fog: false, transparent: true } );
		const sprite = new THREE.Sprite(material);
		three.hud.add(sprite);

		window.dome = dome.geometry;
		require('./lib/breakGeometryIntoVerletFaces')(dome.geometry, three, verlet, 0.5, 0.8)
		.then(function (newGeom) {

			const timeouts = [];
			const fallRate = 500;
			const newDome = new THREE.Mesh(
				newGeom,
				three.materials.boring2
			);
			three.scene.add(newDome);

			three.on('prerender', function () {
				newGeom.verticesNeedUpdate = true;
				newGeom.normalsNeedUpdate = true;
			});

			function faceFall(f) {
				f.positionConstraintIds.forEach(constraintId => {
					timeouts.push(setTimeout(() => verlet.updateConstraint({
						constraintId,
						stiffness: 0
					}), Math.random() * fallRate * 0.5));
				});
				f.vertexVerletIds.forEach(id => {
					timeouts.push(setTimeout(() => verlet.updatePoint({
						id,
						mass: 1,
						velocity: {
							x: 0.5 * (Math.random() - 0.5),
							y: 0.5 * (Math.random() - 0.5),
							z: 0.5 * (Math.random() - 0.5),
						}
					}), Math.random() * fallRate * 0.5));
				});
			}

			function recursiveFall(startFace) {
				faceFall(startFace);
				startFace.adjacentFaces.forEach(f => {
					if (!f.falling) {
						f.falling = true;
						timeouts.push(setTimeout(() => recursiveFall(f), fallRate));
					}
				});
			}

			window.addEventListener('dblclick', function () {
				while(timeouts.length) {
					clearTimeout(timeouts.pop());
				}
				newGeom.positionConstraintIds.forEach(constraintId => {
					verlet.updateConstraint({constraintId, stiffness: 0.3 });
					timeouts.push(setTimeout(() => verlet.updateConstraint({constraintId, stiffness: 0.4 }), 1000));
					timeouts.push(setTimeout(() => verlet.updateConstraint({constraintId, stiffness: 0.5 }), 2000));
				});
				newGeom.vertexVerletIds.forEach(id => {
					timeouts.push(setTimeout(() => verlet.updatePoint({
						id,
						mass: 0,
						position: {
							x: newGeom.vertexVerletPositions[id].x,
							y: newGeom.vertexVerletPositions[id].y,
							z: newGeom.vertexVerletPositions[id].z
						}
					}), 2000 * Math.random()));
				});
				newGeom.faces.forEach(face => face.falling = false);
			});

			window.addEventListener('click', function () {
				const raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(new THREE.Vector2(0,0), three.camera);
				const hits = raycaster.intersectObjects([newDome]);
				if (hits.length) {
					recursiveFall(hits[0].face);
				}
			});
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
