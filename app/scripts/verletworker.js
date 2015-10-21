/*jshint worker:true*/
'use strict';

const World3D = require('verlet-system/3d');
const Constraint3D = require('verlet-constraint/3d'); 
const Point3D = require('verlet-point/3d');
const timeFactor = 1;
const vec3 = {
    create: require('gl-vec3/create'),
    add: require('gl-vec3/add'),
    // dot: require('gl-vec3/dot'),
    subtract: require('gl-vec3/subtract'),
    scale: require('gl-vec3/scale'),
    distance: require('gl-vec3/distance'),
    length: require('gl-vec3/length')
};

const p3DPrototype = (new Point3D()).constructor.prototype;
p3DPrototype.intersects = function (p) { return vec3.distance(this.position, p.position) <= this.radius + p.radius; };
p3DPrototype.distanceFrom = function (p) { return vec3.distance(this.position, p.position); };

function MyVerlet(options) {

	class VerletThreePoint {
		constructor({
			position,
			radius,
			mass,
			attraction,
			velocity
		}) {
			this.initialRadius = radius;
			this.initialMass = mass;
			this.attraction = attraction;

			this.verletPoint = new Point3D({
				position: [ position.x, position.y, position.z ],
				mass,
				radius,
				attraction
			}).addForce([ velocity.x, velocity.y, velocity.z ]);
		}
	}

	this.points = [];
	this.constraints = [];

	this.addPoint = options => {
		const p = new VerletThreePoint(options);
		p.id = this.points.push(p) - 1;

		// if a point is attractive add a pulling force
		this.points.forEach(p0 => {
			if (p.attraction || p0.attraction && p !== p0) {
				this.connect(p, p0, {
					stiffness: (p.attraction || 0) + (p0.attraction || 0),
					restingDistance: p.radius + p0.radius
				});
			}
		});

		return p;
	};

	this.connect = (p1, p2, options) => {
		if (!options) options = {
			stiffness: 0.05,
			restingDistance: p1.radius + p2.radius
		};

		const c = new Constraint3D([p1.verletPoint, p2.verletPoint], options);
		this.constraints.push(c);
		return this.constraints.indexOf(c);
	};

	this.size = options.size;

	this.world = new World3D({ 
		gravity: options.gravity ? [0, -9.8, 0] : undefined,
		min: [-this.size.x/2, -this.size.y/2, -this.size.z/2],
		max: [this.size.x/2, this.size.y/2, this.size.z/2],
		friction: 0.99
	});

	let oldT = 0;

	this.animate = function animate() {
		const t = Date.now();
		const dT = Math.min(0.032, (t - oldT) / 1000);
		const vP = this.points.map(p => p.verletPoint);

		this.constraints.forEach(c => c.solve());

		this.world.integrate(vP, dT * timeFactor);
		oldT = t;
	};

}


let verlet;

// Recieve messages from the client and reply back onthe same port
self.addEventListener('message', function(event) {
		
		const data = JSON.parse(event.data);
		Promise.all(data.map(({message, id}) => new Promise(
			function (resolve, reject) {
				const i = message;

				switch(i.action) {
					case 'init':
						verlet = new MyVerlet(i.options);
						return resolve();

					case 'getPoints':
						verlet.animate();
						return resolve({
								points: verlet.points.map(p => ({
									radius: p.radius,
									position: {
										x: p.verletPoint.position[0].toPrecision(3),
										y: p.verletPoint.position[1].toPrecision(3),
										z: p.verletPoint.position[2].toPrecision(3)
									},
									id: p.id
								}))
							});

					case 'connectPoints':
						const p1 = verlet.points[i.options.p1.id];
						const p2 = verlet.points[i.options.p2.id];
						return resolve({
							constraintId: verlet.connect(p1, p2, i.options.constraintOptions)
						});

					case 'updateConstraint':
						const c = verlet.constraints[i.options.constraintId];
						if (i.options.stiffness !== undefined) c.stiffness = i.options.stiffness;
						if (i.options.restingDistance !== undefined) c.restingDistance = i.options.restingDistance;
						return resolve();

					case 'addPoint':
						return resolve({
							point: verlet.addPoint(i.pointOptions)
						});

					case 'updatePoint':
						const d = i.pointOptions;
						const p3 = verlet.points[d.id];
						if (d.position !== undefined) p3.verletPoint.place([d.position.x, d.position.y, d.position.z]);
						if (d.velocity !== undefined) p3.verletPoint.addForce([d.velocity.x, d.velocity.y, d.velocity.z]);
						if (d.mass !== undefined) p3.verletPoint.mass = d.mass;
						return resolve();

					case 'reset':
						verlet.points.splice(0);
						return resolve();

					default:
						throw Error('Invalid Action');
				}
			})
			.then(function (o = {}) {
				o.id = id;
				return o;
			}, function (err) {
				console.log(err);
				const o = {};
				if (err) {
					o.error = err.message ? err.message : err;
				}
				return o;
			})
		))
		.then(function (response) {
			event.ports[0].postMessage(JSON.stringify(response));
		});
});

