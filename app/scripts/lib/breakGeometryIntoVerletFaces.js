/*global THREE*/
'use strict';

function breakGeometryIntoVerletFaces(g, three, verlet) {

	function makePoint(position) {
		return verlet.addPoint({
			position: position,
			velocity: {x: 0, y: 0, z: 0},
			radius: 0,
			mass: 0.01
		})
		.then(p => p.point)
		.then(p => {
			const v = new THREE.Vector3(position.x, position.y, position.z);
			v.verletPoint = p;
			three.connectPhysicsToThree(v, p);
			return v;
		});
	}

	function makeAnchor(position) {
		return verlet.addPoint({
			position: position,
			velocity: {x: 0, y: 0, z: 0},
			radius: 0,
			mass: 0
		})
		.then(p => p.point);
	}

	const newGeom = new THREE.Geometry();
	newGeom.dynamic = true;

	// List of all constraint ids
	newGeom.vertexVerletIds = [];

	// Map of all constraint position
	newGeom.vertexVerletPositions = [];

	// List of all constraint ids
	newGeom.positionConstraintIds = [];


	const connections = [];

	return Promise.all(g.faces.map(function (face) {
		return Promise.all([
			makePoint(g.vertices[face.a]),
			makePoint(g.vertices[face.b]),
			makePoint(g.vertices[face.c])
		])
		.then(function([a, b, c]) {

			if (!connections[face.a]) connections[face.a] = [];
			if (!connections[face.b]) connections[face.b] = [];
			if (!connections[face.c]) connections[face.c] = [];

			connections[face.a].push(a);
			connections[face.b].push(b);
			connections[face.c].push(c);

			const newFace = new THREE.Face3(
				newGeom.vertices.push(a) - 1,
				newGeom.vertices.push(b) - 1,
				newGeom.vertices.push(c) - 1
			);

			newFace.positionConstraintIds = [];
			newFace.vertexVerletIds = [
				a.verletPoint.id,
				b.verletPoint.id,
				c.verletPoint.id
			];
			newFace.adjacentFaces = new Set();

			newGeom.vertexVerletIds.push(...newFace.vertexVerletIds);
			newGeom.vertexVerletPositions[a.verletPoint.id] = a.clone();
			newGeom.vertexVerletPositions[b.verletPoint.id] = b.clone();
			newGeom.vertexVerletPositions[c.verletPoint.id] = c.clone();

			newGeom.faces.push(newFace);

			a.face = newFace;
			b.face = newFace;
			c.face = newFace;

			const stiffness = 0.4;
			verlet.connectPoints(a.verletPoint, b.verletPoint, {
				stiffness,
				restingDistance: a.distanceTo(b)
			});
			verlet.connectPoints(b.verletPoint, c.verletPoint, {
				stiffness,
				restingDistance: b.distanceTo(c)
			});
			verlet.connectPoints(c.verletPoint, a.verletPoint, {
				stiffness,
				restingDistance: c.distanceTo(a)
			});
		});
	}))
	.then(function () {

		// All the points which are 'the same' loosely connect them.
		connections.forEach((pointsToConnect, i) => {

			makeAnchor(g.vertices[i]).then(anchor => {
				pointsToConnect.forEach((p, i) => {
					verlet.connectPoints(p.verletPoint, anchor, {
						stiffness: 0.6,
						restingDistance: 0.01
					}).then(c => {
						p.face.positionConstraintIds.push(c.constraintId);
						newGeom.positionConstraintIds.push(c.constraintId);
					});
					pointsToConnect.forEach(oP => {
						if (oP.face !== p.face) {
							p.face.adjacentFaces.add(oP.face);
						}
					});
				});
			});
		});
		newGeom.verticesNeedUpdate = true;
		newGeom.normalsNeedUpdate = true;
		return newGeom;
	});
}

module.exports = breakGeometryIntoVerletFaces;
