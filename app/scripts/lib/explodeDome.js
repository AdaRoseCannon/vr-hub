/*global THREE*/
'use strict';

module.exports = function setUpExplodingDome(dome, three, verlet) {

	return require('./breakGeometryIntoVerletFaces')(dome.geometry, three, verlet)
	.then(setUpFallingAndReconstructionController);


	function setUpFallingAndReconstructionController(newGeom) {

		let destroyed = false;
		const timeouts = [];
		const fallRate = 500;
		const newDome = new THREE.Mesh(
			newGeom,
			dome.material
		);
		three.scene.add(newDome);

		newGeom.normalsNeedUpdate = true;
		three.on('prerender', function () {
			newGeom.verticesNeedUpdate = true;
		});

		function faceFall(f) {
			if (!f) return;
			for(let i=0; i < 3;i++) {
				const constraintId = f.positionConstraintIds[i];
				const verletId = f.vertexVerletIds[i];
				verlet.updateConstraint({
					constraintId,
					stiffness: 0
				});
				verlet.updatePoint({
					id: verletId,
					mass: 1,
					velocity: {
						x: 0.5 * (Math.random() - 0.5),
						y: 0.5 * (Math.random() - 0.5),
						z: 0.5 * (Math.random() - 0.5),
					}
				});
			}
		}

		function recursiveFall(startFace) {
			faceFall(startFace);
			const l = startFace.adjacentFaces.length;
			for (let i=0; i<l; i++) {
				const f = startFace.adjacentFaces[i];
				if (!f.falling) {
					f.falling = true;
					timeouts.push(setTimeout(recursiveFall, fallRate, f));
				}
			}
		}

		function restore() {
			return new Promise(resolve => {
				while(timeouts.length) {
					clearTimeout(timeouts.pop());
				}
				newGeom.positionConstraintIds.forEach(constraintId => verlet.updateConstraint({constraintId, stiffness: 0.3 }));
				timeouts.push(setTimeout(() => {
					newGeom.positionConstraintIds.forEach(constraintId => verlet.updateConstraint({constraintId, stiffness: 0.5 }));
					newGeom.vertexVerletIds.forEach(id => {
						verlet.updatePoint({
							id,
							mass: 0,
							position: {
								x: newGeom.vertexVerletPositions[id].x,
								y: newGeom.vertexVerletPositions[id].y,
								z: newGeom.vertexVerletPositions[id].z
							}
						});
					});
					setTimeout(() => resolve(), fallRate);
				}, fallRate));
				newGeom.faces.forEach(face => face.falling = false);
				destroyed = false;
			});
		}

		function destroy() {
			return new Promise(resolve => {
				const raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(new THREE.Vector2(0,0), three.camera);
				const hits = raycaster.intersectObjects([newDome]);
				if (hits.length) {
					recursiveFall(hits[0].face);
				}
				destroyed = true;
				resolve();
			});
		}

		return {
			destroy,
			restore,
			toggle() {
				(destroyed ? restore : destroy)();
			},
			mesh: newDome
		};
	}
};
