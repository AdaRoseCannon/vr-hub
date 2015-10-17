/*global THREE*/
'use strict';

module.exports = function setUpExplodingDome(dome, three, verlet) {

	require('./breakGeometryIntoVerletFaces')(dome.geometry, three, verlet)
	.then(setUpFallingAndReconstruction);


	function setUpFallingAndReconstruction(newGeom) {

		const timeouts = [];
		const fallRate = 500;
		const newDome = new THREE.Mesh(
			newGeom,
			three.materials.boring2
		);
		three.scene.add(newDome);

		newGeom.normalsNeedUpdate = true;
		three.on('prerender', function () {
			newGeom.verticesNeedUpdate = true;
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
	}
};
