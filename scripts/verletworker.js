(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*jshint worker:true*/
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var World3D = require('verlet-system/3d');
var Constraint3D = require('verlet-constraint/3d');
var Point3D = require('verlet-point/3d');
var timeFactor = 1;
var vec3 = {
	create: require('gl-vec3/create'),
	add: require('gl-vec3/add'),
	// dot: require('gl-vec3/dot'),
	subtract: require('gl-vec3/subtract'),
	scale: require('gl-vec3/scale'),
	distance: require('gl-vec3/distance'),
	length: require('gl-vec3/length')
};

var p3DPrototype = new Point3D().constructor.prototype;
p3DPrototype.intersects = function (p) {
	return vec3.distance(this.position, p.position) <= this.radius + p.radius;
};
p3DPrototype.distanceFrom = function (p) {
	return vec3.distance(this.position, p.position);
};

function MyVerlet(options) {
	var _this = this;

	var VerletThreePoint = function VerletThreePoint(_ref) {
		var position = _ref.position;
		var radius = _ref.radius;
		var mass = _ref.mass;
		var attraction = _ref.attraction;
		var velocity = _ref.velocity;

		_classCallCheck(this, VerletThreePoint);

		this.initialRadius = radius;
		this.initialMass = mass;
		this.attraction = attraction;

		this.verletPoint = new Point3D({
			position: [position.x, position.y, position.z],
			mass: mass,
			radius: radius,
			attraction: attraction
		}).addForce([velocity.x, velocity.y, velocity.z]);
	};

	this.points = [];
	this.constraints = [];

	this.addPoint = function (options) {
		var p = new VerletThreePoint(options);
		p.id = _this.points.push(p) - 1;

		// if a point is attractive add a pulling force
		_this.points.forEach(function (p0) {
			if (p.attraction || p0.attraction && p !== p0) {
				_this.connect(p, p0, {
					stiffness: (p.attraction || 0) + (p0.attraction || 0),
					restingDistance: p.radius + p0.radius
				});
			}
		});

		return p;
	};

	this.connect = function (p1, p2, options) {
		if (!options) options = {
			stiffness: 0.05,
			restingDistance: p1.radius + p2.radius
		};

		var c = new Constraint3D([p1.verletPoint, p2.verletPoint], options);
		_this.constraints.push(c);
		return _this.constraints.indexOf(c);
	};

	this.size = options.size;

	this.world = new World3D({
		gravity: options.gravity ? [0, -9.8, 0] : undefined,
		min: [-this.size.x / 2, -this.size.y / 2, -this.size.z / 2],
		max: [this.size.x / 2, this.size.y / 2, this.size.z / 2],
		friction: 0.99
	});

	var oldT = 0;

	this.animate = function animate() {
		var t = Date.now();
		var dT = Math.min(0.032, (t - oldT) / 1000);
		var vP = this.points.map(function (p) {
			return p.verletPoint;
		});

		this.constraints.forEach(function (c) {
			return c.solve();
		});

		this.world.integrate(vP, dT * timeFactor);
		oldT = t;
	};
}

var verlet = undefined;

// Recieve messages from the client and reply back onthe same port
self.addEventListener('message', function (event) {

	var data = JSON.parse(event.data);
	Promise.all(data.map(function (_ref2) {
		var message = _ref2.message;
		var id = _ref2.id;
		return new Promise(function (resolve, reject) {
			var i = message;

			switch (i.action) {
				case 'init':
					verlet = new MyVerlet(i.options);
					return resolve();

				case 'getPoints':
					verlet.animate();
					return resolve({
						points: verlet.points.map(function (p) {
							return {
								radius: p.radius,
								position: {
									x: p.verletPoint.position[0].toPrecision(3),
									y: p.verletPoint.position[1].toPrecision(3),
									z: p.verletPoint.position[2].toPrecision(3)
								},
								id: p.id
							};
						})
					});

				case 'connectPoints':
					var p1 = verlet.points[i.options.p1.id];
					var p2 = verlet.points[i.options.p2.id];
					return resolve({
						constraintId: verlet.connect(p1, p2, i.options.constraintOptions)
					});

				case 'updateConstraint':
					var c = verlet.constraints[i.options.constraintId];
					if (i.options.stiffness !== undefined) c.stiffness = i.options.stiffness;
					if (i.options.restingDistance !== undefined) c.restingDistance = i.options.restingDistance;
					return resolve();

				case 'addPoint':
					return resolve({
						point: verlet.addPoint(i.pointOptions)
					});

				case 'updatePoint':
					var d = i.pointOptions;
					var p3 = verlet.points[d.id];
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
		}).then(function () {
			var o = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

			o.id = id;
			return o;
		}, function (err) {
			console.log(err);
			var o = {};
			if (err) {
				o.error = err.message ? err.message : err;
			}
			return o;
		});
	})).then(function (response) {
		event.ports[0].postMessage(JSON.stringify(response));
	});
});

},{"gl-vec3/add":2,"gl-vec3/create":4,"gl-vec3/distance":5,"gl-vec3/length":8,"gl-vec3/scale":10,"gl-vec3/subtract":12,"verlet-constraint/3d":13,"verlet-point/3d":15,"verlet-system/3d":17}],2:[function(require,module,exports){
module.exports = add;

/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function add(out, a, b) {
    out[0] = a[0] + b[0]
    out[1] = a[1] + b[1]
    out[2] = a[2] + b[2]
    return out
}
},{}],3:[function(require,module,exports){
module.exports = copy;

/**
 * Copy the values from one vec3 to another
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the source vector
 * @returns {vec3} out
 */
function copy(out, a) {
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    return out
}
},{}],4:[function(require,module,exports){
module.exports = create;

/**
 * Creates a new, empty vec3
 *
 * @returns {vec3} a new 3D vector
 */
function create() {
    var out = new Float32Array(3)
    out[0] = 0
    out[1] = 0
    out[2] = 0
    return out
}
},{}],5:[function(require,module,exports){
module.exports = distance;

/**
 * Calculates the euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} distance between a and b
 */
function distance(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2]
    return Math.sqrt(x*x + y*y + z*z)
}
},{}],6:[function(require,module,exports){
module.exports = dot;

/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
},{}],7:[function(require,module,exports){
module.exports = fromValues;

/**
 * Creates a new vec3 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} a new 3D vector
 */
function fromValues(x, y, z) {
    var out = new Float32Array(3)
    out[0] = x
    out[1] = y
    out[2] = z
    return out
}
},{}],8:[function(require,module,exports){
module.exports = length;

/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */
function length(a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    return Math.sqrt(x*x + y*y + z*z)
}
},{}],9:[function(require,module,exports){
module.exports = multiply;

/**
 * Multiplies two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function multiply(out, a, b) {
    out[0] = a[0] * b[0]
    out[1] = a[1] * b[1]
    out[2] = a[2] * b[2]
    return out
}
},{}],10:[function(require,module,exports){
module.exports = scale;

/**
 * Scales a vec3 by a scalar number
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec3} out
 */
function scale(out, a, b) {
    out[0] = a[0] * b
    out[1] = a[1] * b
    out[2] = a[2] * b
    return out
}
},{}],11:[function(require,module,exports){
module.exports = squaredLength;

/**
 * Calculates the squared length of a vec3
 *
 * @param {vec3} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
function squaredLength(a) {
    var x = a[0],
        y = a[1],
        z = a[2]
    return x*x + y*y + z*z
}
},{}],12:[function(require,module,exports){
module.exports = subtract;

/**
 * Subtracts vector b from vector a
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function subtract(out, a, b) {
    out[0] = a[0] - b[0]
    out[1] = a[1] - b[1]
    out[2] = a[2] - b[2]
    return out
}
},{}],13:[function(require,module,exports){
var vec3 = {
    create: require('gl-vec3/create'),
    add: require('gl-vec3/add'),
    dot: require('gl-vec3/dot'),
    sub: require('gl-vec3/subtract'),
    scale: require('gl-vec3/scale'),
    distance: require('gl-vec3/distance')
}
module.exports = require('./lib/build')(vec3)
},{"./lib/build":14,"gl-vec3/add":2,"gl-vec3/create":4,"gl-vec3/distance":5,"gl-vec3/dot":6,"gl-vec3/scale":10,"gl-vec3/subtract":12}],14:[function(require,module,exports){
module.exports = function(vec) {
    var delta = vec.create()
    var scaled = vec.create()

    function Constraint(points, opt) {
        if (!points || points.length !== 2)
            throw new Error('two points must be specified for the constraint')
        if (!points[0].position || !points[1].position)
            throw new Error('must specify verlet-point or similar, with { position }')
        this.points = points
        this.stiffness = 1.0
        if (opt && typeof opt.stiffness === 'number')
            this.stiffness = opt.stiffness

        if (opt && typeof opt.restingDistance === 'number')
            this.restingDistance = opt.restingDistance
        else
            this.restingDistance = vec.distance(this.points[0].position, this.points[1].position)
    }

    Constraint.prototype.solve = function() {
        //distance formula
        var p1 = this.points[0],
            p2 = this.points[1],
            p1vec = p1.position,
            p2vec = p2.position,
            p1mass = typeof p1.mass === 'number' ? p1.mass : 1,
            p2mass = typeof p2.mass === 'number' ? p2.mass : 1

        vec.sub(delta, p1vec, p2vec)
        var d = Math.sqrt(vec.dot(delta, delta))

        //ratio for resting distance
        var restingRatio = d===0 ? this.restingDistance : (this.restingDistance - d) / d
        var scalarP1, 
            scalarP2

        //handle zero mass a little differently
        if (p1mass===0||p2mass===0) {
            scalarP1 = this.stiffness
            scalarP2 = this.stiffness
        } else {
            //invert mass quantities
            var im1 = 1.0 / p1mass
            var im2 = 1.0 / p2mass
            scalarP1 = (im1 / (im1 + im2)) * this.stiffness
            scalarP2 = this.stiffness - scalarP1
        }
        
        //push/pull based on mass
        vec.scale(scaled, delta, scalarP1 * restingRatio)
        vec.add(p1vec, p1vec, scaled)
        
        vec.scale(scaled, delta, scalarP2 * restingRatio)
        vec.sub(p2vec, p2vec, scaled)

        return d
    }

    return function(p1, p2, opt) {
        return new Constraint(p1, p2, opt)
    }
}
},{}],15:[function(require,module,exports){
var vec3 = {
    create: require('gl-vec3/create'),
    sub: require('gl-vec3/subtract'),
    copy: require('gl-vec3/copy')
}
module.exports = require('./lib/build')(vec3)
},{"./lib/build":16,"gl-vec3/copy":3,"gl-vec3/create":4,"gl-vec3/subtract":12}],16:[function(require,module,exports){
module.exports = function(vec) {
    function Point(opt) {
        this.position = vec.create()
        this.previous = vec.create()
        this.acceleration = vec.create()
        this.mass = 1.0
        this.radius = 0

        if (opt && typeof opt.mass === 'number')
            this.mass = opt.mass
        if (opt && typeof opt.radius === 'number')
            this.radius = opt.radius

        if (opt && opt.position) 
            vec.copy(this.position, opt.position)
        
        if (opt && (opt.previous||opt.position)) 
            vec.copy(this.previous, opt.previous || opt.position)
        
        if (opt && opt.acceleration)
            vec.copy(this.acceleration, opt.acceleration)
    }

    Point.prototype.addForce = function(v) {
        vec.sub(this.previous, this.previous, v)
        return this
    }

    Point.prototype.place = function(v) {
        vec.copy(this.position, v)
        vec.copy(this.previous, v)
        return this
    }

    return function(opt) {
        return new Point(opt)
    }
}
},{}],17:[function(require,module,exports){
var vec3 = {
    create: require('gl-vec3/create'),
    add: require('gl-vec3/add'),
    multiply: require('gl-vec3/multiply'),
    sub: require('gl-vec3/subtract'),
    scale: require('gl-vec3/scale'),
    copy: require('gl-vec3/copy'),
    sqrLen: require('gl-vec3/squaredLength'),
    fromValues: require('gl-vec3/fromValues'),
}
module.exports = require('./lib/build')(vec3)
},{"./lib/build":19,"gl-vec3/add":2,"gl-vec3/copy":3,"gl-vec3/create":4,"gl-vec3/fromValues":7,"gl-vec3/multiply":9,"gl-vec3/scale":10,"gl-vec3/squaredLength":11,"gl-vec3/subtract":12}],18:[function(require,module,exports){
module.exports = function(vec) {
    var negInfinity = vec.fromValues(-Infinity, -Infinity, -Infinity)
    var posInfinity = vec.fromValues(Infinity, Infinity, Infinity)
    var ones = vec.fromValues(1, 1, 1)
    var reflect = vec.create()
    var EPSILON = 0.000001

    return function collider(p, velocity, min, max, friction) {
        if (!min && !max)
            return
            
        //reset reflection 
        vec.copy(reflect, ones)

        min = min || negInfinity
        max = max || posInfinity

        var i = 0,
            n = p.position.length,
            hit = false,
            radius = p.radius || 0

        //bounce and clamp
        for (i=0; i<n; i++)
            if (typeof min[i] === 'number' && p.position[i]-radius < min[i]) {
                reflect[i] = -1
                p.position[i] = min[i]+radius
                hit = true
            }
        for (i=0; i<n; i++)
            if (typeof max[i] === 'number' && p.position[i]+radius > max[i]) {
                reflect[i] = -1
                p.position[i] = max[i]-radius
                hit = true
            }

        //no bounce
        var len2 = vec.sqrLen(velocity)
        if (!hit || len2 <= EPSILON)
            return

        var m = Math.sqrt(len2)
        if (m !== 0) 
            vec.scale(velocity, velocity, 1/m)

        //scale bounce by friction
        vec.scale(reflect, reflect, m * friction)

        //bounce back
        vec.multiply(velocity, velocity, reflect)
    }
}
},{}],19:[function(require,module,exports){
var number = require('as-number')
var clamp = require('clamp')
var createCollider = require('./box-collision')

module.exports = function create(vec) {
    
    var collide = createCollider(vec)

    var velocity = vec.create()
    var tmp = vec.create()
    var zero = vec.create()
    
    function VerletSystem(opt) {
        if (!(this instanceof VerletSystem))
            return new VerletSystem(opt)
        
        opt = opt||{}

        this.gravity = opt.gravity || vec.create()
        this.friction = number(opt.friction, 0.98)
        this.min = opt.min
        this.max = opt.max
        this.bounce = number(opt.bounce, 1)
    }
    
    VerletSystem.prototype.collision = function(p, velocity) {
        collide(p, velocity, this.min, this.max, this.bounce)
    }

    VerletSystem.prototype.integratePoint = function(point, delta) {
        var mass = typeof point.mass === 'number' ? point.mass : 1

        //if mass is zero, assume body is static / unmovable
        if (mass === 0) {
            this.collision(point, zero)
            vec.copy(point.acceleration, zero)
            return
        }

        vec.add(point.acceleration, point.acceleration, this.gravity)
        vec.scale(point.acceleration, point.acceleration, mass)
            
        //difference in positions
        vec.sub(velocity, point.position, point.previous)

        //dampen velocity
        vec.scale(velocity, velocity, this.friction)

        //handle custom collisions in 2D or 3D space
        this.collision(point, velocity)

        //set last position
        vec.copy(point.previous, point.position)
        var tSqr = delta * delta
            
        //integrate
        vec.scale(tmp, point.acceleration, 0.5 * tSqr)
        vec.add(point.position, point.position, velocity)
        vec.add(point.position, point.position, tmp)

        //reset acceleration
        vec.copy(point.acceleration, zero)
    }

    VerletSystem.prototype.integrate = function(points, delta) {
        for (var i=0; i<points.length; i++) {
            this.integratePoint(points[i], delta)
        }
    }

    return VerletSystem
}
},{"./box-collision":18,"as-number":20,"clamp":21}],20:[function(require,module,exports){
module.exports = function numtype(num, def) {
	return typeof num === 'number'
		? num 
		: (typeof def === 'number' ? def : 0)
}
},{}],21:[function(require,module,exports){
module.exports = clamp

function clamp(value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value)
}

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvaG9tZS9hZGEvZ2l0V29ya2luZ0Rpci92ci1odWIvYXBwL3NjcmlwdHMvdmVybGV0d29ya2VyLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzMvYWRkLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzMvY29weS5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMzL2NyZWF0ZS5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMzL2Rpc3RhbmNlLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzMvZG90LmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzMvZnJvbVZhbHVlcy5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMzL2xlbmd0aC5qcyIsIm5vZGVfbW9kdWxlcy9nbC12ZWMzL211bHRpcGx5LmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzMvc2NhbGUuanMiLCJub2RlX21vZHVsZXMvZ2wtdmVjMy9zcXVhcmVkTGVuZ3RoLmpzIiwibm9kZV9tb2R1bGVzL2dsLXZlYzMvc3VidHJhY3QuanMiLCJub2RlX21vZHVsZXMvdmVybGV0LWNvbnN0cmFpbnQvM2QuanMiLCJub2RlX21vZHVsZXMvdmVybGV0LWNvbnN0cmFpbnQvbGliL2J1aWxkLmpzIiwibm9kZV9tb2R1bGVzL3ZlcmxldC1wb2ludC8zZC5qcyIsIm5vZGVfbW9kdWxlcy92ZXJsZXQtcG9pbnQvbGliL2J1aWxkLmpzIiwibm9kZV9tb2R1bGVzL3ZlcmxldC1zeXN0ZW0vM2QuanMiLCJub2RlX21vZHVsZXMvdmVybGV0LXN5c3RlbS9saWIvYm94LWNvbGxpc2lvbi5qcyIsIm5vZGVfbW9kdWxlcy92ZXJsZXQtc3lzdGVtL2xpYi9idWlsZC5qcyIsIm5vZGVfbW9kdWxlcy92ZXJsZXQtc3lzdGVtL25vZGVfbW9kdWxlcy9hcy1udW1iZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdmVybGV0LXN5c3RlbS9ub2Rl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QUFPLENBQUMsQ0FBQztHQUNULENBQUM7RUFBQSxDQUNGLENBQUMsQ0FDRCxJQUFJLENBQUMsVUFBVSxRQUFRLEVBQUU7QUFDekIsT0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0VBQ3JELENBQUMsQ0FBQztDQUNKLENBQUMsQ0FBQzs7O0FDbExIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKmpzaGludCB3b3JrZXI6dHJ1ZSovXG4ndXNlIHN0cmljdCc7XG5cbmNvbnN0IFdvcmxkM0QgPSByZXF1aXJlKCd2ZXJsZXQtc3lzdGVtLzNkJyk7XG5jb25zdCBDb25zdHJhaW50M0QgPSByZXF1aXJlKCd2ZXJsZXQtY29uc3RyYWludC8zZCcpOyBcbmNvbnN0IFBvaW50M0QgPSByZXF1aXJlKCd2ZXJsZXQtcG9pbnQvM2QnKTtcbmNvbnN0IHRpbWVGYWN0b3IgPSAxO1xuY29uc3QgdmVjMyA9IHtcbiAgICBjcmVhdGU6IHJlcXVpcmUoJ2dsLXZlYzMvY3JlYXRlJyksXG4gICAgYWRkOiByZXF1aXJlKCdnbC12ZWMzL2FkZCcpLFxuICAgIC8vIGRvdDogcmVxdWlyZSgnZ2wtdmVjMy9kb3QnKSxcbiAgICBzdWJ0cmFjdDogcmVxdWlyZSgnZ2wtdmVjMy9zdWJ0cmFjdCcpLFxuICAgIHNjYWxlOiByZXF1aXJlKCdnbC12ZWMzL3NjYWxlJyksXG4gICAgZGlzdGFuY2U6IHJlcXVpcmUoJ2dsLXZlYzMvZGlzdGFuY2UnKSxcbiAgICBsZW5ndGg6IHJlcXVpcmUoJ2dsLXZlYzMvbGVuZ3RoJylcbn07XG5cbmNvbnN0IHAzRFByb3RvdHlwZSA9IChuZXcgUG9pbnQzRCgpKS5jb25zdHJ1Y3Rvci5wcm90b3R5cGU7XG5wM0RQcm90b3R5cGUuaW50ZXJzZWN0cyA9IGZ1bmN0aW9uIChwKSB7IHJldHVybiB2ZWMzLmRpc3RhbmNlKHRoaXMucG9zaXRpb24sIHAucG9zaXRpb24pIDw9IHRoaXMucmFkaXVzICsgcC5yYWRpdXM7IH07XG5wM0RQcm90b3R5cGUuZGlzdGFuY2VGcm9tID0gZnVuY3Rpb24gKHApIHsgcmV0dXJuIHZlYzMuZGlzdGFuY2UodGhpcy5wb3NpdGlvbiwgcC5wb3NpdGlvbik7IH07XG5cbmZ1bmN0aW9uIE15VmVybGV0KG9wdGlvbnMpIHtcblxuXHRjbGFzcyBWZXJsZXRUaHJlZVBvaW50IHtcblx0XHRjb25zdHJ1Y3Rvcih7XG5cdFx0XHRwb3NpdGlvbixcblx0XHRcdHJhZGl1cyxcblx0XHRcdG1hc3MsXG5cdFx0XHRhdHRyYWN0aW9uLFxuXHRcdFx0dmVsb2NpdHlcblx0XHR9KSB7XG5cdFx0XHR0aGlzLmluaXRpYWxSYWRpdXMgPSByYWRpdXM7XG5cdFx0XHR0aGlzLmluaXRpYWxNYXNzID0gbWFzcztcblx0XHRcdHRoaXMuYXR0cmFjdGlvbiA9IGF0dHJhY3Rpb247XG5cblx0XHRcdHRoaXMudmVybGV0UG9pbnQgPSBuZXcgUG9pbnQzRCh7XG5cdFx0XHRcdHBvc2l0aW9uOiBbIHBvc2l0aW9uLngsIHBvc2l0aW9uLnksIHBvc2l0aW9uLnogXSxcblx0XHRcdFx0bWFzcyxcblx0XHRcdFx0cmFkaXVzLFxuXHRcdFx0XHRhdHRyYWN0aW9uXG5cdFx0XHR9KS5hZGRGb3JjZShbIHZlbG9jaXR5LngsIHZlbG9jaXR5LnksIHZlbG9jaXR5LnogXSk7XG5cdFx0fVxuXHR9XG5cblx0dGhpcy5wb2ludHMgPSBbXTtcblx0dGhpcy5jb25zdHJhaW50cyA9IFtdO1xuXG5cdHRoaXMuYWRkUG9pbnQgPSBvcHRpb25zID0+IHtcblx0XHRjb25zdCBwID0gbmV3IFZlcmxldFRocmVlUG9pbnQob3B0aW9ucyk7XG5cdFx0cC5pZCA9IHRoaXMucG9pbnRzLnB1c2gocCkgLSAxO1xuXG5cdFx0Ly8gaWYgYSBwb2ludCBpcyBhdHRyYWN0aXZlIGFkZCBhIHB1bGxpbmcgZm9yY2Vcblx0XHR0aGlzLnBvaW50cy5mb3JFYWNoKHAwID0+IHtcblx0XHRcdGlmIChwLmF0dHJhY3Rpb24gfHwgcDAuYXR0cmFjdGlvbiAmJiBwICE9PSBwMCkge1xuXHRcdFx0XHR0aGlzLmNvbm5lY3QocCwgcDAsIHtcblx0XHRcdFx0XHRzdGlmZm5lc3M6IChwLmF0dHJhY3Rpb24gfHwgMCkgKyAocDAuYXR0cmFjdGlvbiB8fCAwKSxcblx0XHRcdFx0XHRyZXN0aW5nRGlzdGFuY2U6IHAucmFkaXVzICsgcDAucmFkaXVzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHA7XG5cdH07XG5cblx0dGhpcy5jb25uZWN0ID0gKHAxLCBwMiwgb3B0aW9ucykgPT4ge1xuXHRcdGlmICghb3B0aW9ucykgb3B0aW9ucyA9IHtcblx0XHRcdHN0aWZmbmVzczogMC4wNSxcblx0XHRcdHJlc3RpbmdEaXN0YW5jZTogcDEucmFkaXVzICsgcDIucmFkaXVzXG5cdFx0fTtcblxuXHRcdGNvbnN0IGMgPSBuZXcgQ29uc3RyYWludDNEKFtwMS52ZXJsZXRQb2ludCwgcDIudmVybGV0UG9pbnRdLCBvcHRpb25zKTtcblx0XHR0aGlzLmNvbnN0cmFpbnRzLnB1c2goYyk7XG5cdFx0cmV0dXJuIHRoaXMuY29uc3RyYWludHMuaW5kZXhPZihjKTtcblx0fTtcblxuXHR0aGlzLnNpemUgPSBvcHRpb25zLnNpemU7XG5cblx0dGhpcy53b3JsZCA9IG5ldyBXb3JsZDNEKHsgXG5cdFx0Z3Jhdml0eTogb3B0aW9ucy5ncmF2aXR5ID8gWzAsIC05LjgsIDBdIDogdW5kZWZpbmVkLFxuXHRcdG1pbjogWy10aGlzLnNpemUueC8yLCAtdGhpcy5zaXplLnkvMiwgLXRoaXMuc2l6ZS56LzJdLFxuXHRcdG1heDogW3RoaXMuc2l6ZS54LzIsIHRoaXMuc2l6ZS55LzIsIHRoaXMuc2l6ZS56LzJdLFxuXHRcdGZyaWN0aW9uOiAwLjk5XG5cdH0pO1xuXG5cdGxldCBvbGRUID0gMDtcblxuXHR0aGlzLmFuaW1hdGUgPSBmdW5jdGlvbiBhbmltYXRlKCkge1xuXHRcdGNvbnN0IHQgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IGRUID0gTWF0aC5taW4oMC4wMzIsICh0IC0gb2xkVCkgLyAxMDAwKTtcblx0XHRjb25zdCB2UCA9IHRoaXMucG9pbnRzLm1hcChwID0+IHAudmVybGV0UG9pbnQpO1xuXG5cdFx0dGhpcy5jb25zdHJhaW50cy5mb3JFYWNoKGMgPT4gYy5zb2x2ZSgpKTtcblxuXHRcdHRoaXMud29ybGQuaW50ZWdyYXRlKHZQLCBkVCAqIHRpbWVGYWN0b3IpO1xuXHRcdG9sZFQgPSB0O1xuXHR9O1xuXG59XG5cblxubGV0IHZlcmxldDtcblxuLy8gUmVjaWV2ZSBtZXNzYWdlcyBmcm9tIHRoZSBjbGllbnQgYW5kIHJlcGx5IGJhY2sgb250aGUgc2FtZSBwb3J0XG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihldmVudCkge1xuXHRcdFxuXHRcdGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuXHRcdFByb21pc2UuYWxsKGRhdGEubWFwKCh7bWVzc2FnZSwgaWR9KSA9PiBuZXcgUHJvbWlzZShcblx0XHRcdGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcblx0XHRcdFx0Y29uc3QgaSA9IG1lc3NhZ2U7XG5cblx0XHRcdFx0c3dpdGNoKGkuYWN0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSAnaW5pdCc6XG5cdFx0XHRcdFx0XHR2ZXJsZXQgPSBuZXcgTXlWZXJsZXQoaS5vcHRpb25zKTtcblx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlKCk7XG5cblx0XHRcdFx0XHRjYXNlICdnZXRQb2ludHMnOlxuXHRcdFx0XHRcdFx0dmVybGV0LmFuaW1hdGUoKTtcblx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlKHtcblx0XHRcdFx0XHRcdFx0XHRwb2ludHM6IHZlcmxldC5wb2ludHMubWFwKHAgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHRcdHJhZGl1czogcC5yYWRpdXMsXG5cdFx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR4OiBwLnZlcmxldFBvaW50LnBvc2l0aW9uWzBdLnRvUHJlY2lzaW9uKDMpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR5OiBwLnZlcmxldFBvaW50LnBvc2l0aW9uWzFdLnRvUHJlY2lzaW9uKDMpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR6OiBwLnZlcmxldFBvaW50LnBvc2l0aW9uWzJdLnRvUHJlY2lzaW9uKDMpXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IHAuaWRcblx0XHRcdFx0XHRcdFx0XHR9KSlcblx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRjYXNlICdjb25uZWN0UG9pbnRzJzpcblx0XHRcdFx0XHRcdGNvbnN0IHAxID0gdmVybGV0LnBvaW50c1tpLm9wdGlvbnMucDEuaWRdO1xuXHRcdFx0XHRcdFx0Y29uc3QgcDIgPSB2ZXJsZXQucG9pbnRzW2kub3B0aW9ucy5wMi5pZF07XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRcdGNvbnN0cmFpbnRJZDogdmVybGV0LmNvbm5lY3QocDEsIHAyLCBpLm9wdGlvbnMuY29uc3RyYWludE9wdGlvbnMpXG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNhc2UgJ3VwZGF0ZUNvbnN0cmFpbnQnOlxuXHRcdFx0XHRcdFx0Y29uc3QgYyA9IHZlcmxldC5jb25zdHJhaW50c1tpLm9wdGlvbnMuY29uc3RyYWludElkXTtcblx0XHRcdFx0XHRcdGlmIChpLm9wdGlvbnMuc3RpZmZuZXNzICE9PSB1bmRlZmluZWQpIGMuc3RpZmZuZXNzID0gaS5vcHRpb25zLnN0aWZmbmVzcztcblx0XHRcdFx0XHRcdGlmIChpLm9wdGlvbnMucmVzdGluZ0Rpc3RhbmNlICE9PSB1bmRlZmluZWQpIGMucmVzdGluZ0Rpc3RhbmNlID0gaS5vcHRpb25zLnJlc3RpbmdEaXN0YW5jZTtcblx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlKCk7XG5cblx0XHRcdFx0XHRjYXNlICdhZGRQb2ludCc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRcdHBvaW50OiB2ZXJsZXQuYWRkUG9pbnQoaS5wb2ludE9wdGlvbnMpXG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNhc2UgJ3VwZGF0ZVBvaW50Jzpcblx0XHRcdFx0XHRcdGNvbnN0IGQgPSBpLnBvaW50T3B0aW9ucztcblx0XHRcdFx0XHRcdGNvbnN0IHAzID0gdmVybGV0LnBvaW50c1tkLmlkXTtcblx0XHRcdFx0XHRcdGlmIChkLnBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHAzLnZlcmxldFBvaW50LnBsYWNlKFtkLnBvc2l0aW9uLngsIGQucG9zaXRpb24ueSwgZC5wb3NpdGlvbi56XSk7XG5cdFx0XHRcdFx0XHRpZiAoZC52ZWxvY2l0eSAhPT0gdW5kZWZpbmVkKSBwMy52ZXJsZXRQb2ludC5hZGRGb3JjZShbZC52ZWxvY2l0eS54LCBkLnZlbG9jaXR5LnksIGQudmVsb2NpdHkuel0pO1xuXHRcdFx0XHRcdFx0aWYgKGQubWFzcyAhPT0gdW5kZWZpbmVkKSBwMy52ZXJsZXRQb2ludC5tYXNzID0gZC5tYXNzO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoKTtcblxuXHRcdFx0XHRcdGNhc2UgJ3Jlc2V0Jzpcblx0XHRcdFx0XHRcdHZlcmxldC5wb2ludHMuc3BsaWNlKDApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoKTtcblxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aHJvdyBFcnJvcignSW52YWxpZCBBY3Rpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChvID0ge30pIHtcblx0XHRcdFx0by5pZCA9IGlkO1xuXHRcdFx0XHRyZXR1cm4gbztcblx0XHRcdH0sIGZ1bmN0aW9uIChlcnIpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coZXJyKTtcblx0XHRcdFx0Y29uc3QgbyA9IHt9O1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0by5lcnJvciA9IGVyci5tZXNzYWdlID8gZXJyLm1lc3NhZ2UgOiBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG87XG5cdFx0XHR9KVxuXHRcdCkpXG5cdFx0LnRoZW4oZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG5cdFx0XHRldmVudC5wb3J0c1swXS5wb3N0TWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXNwb25zZSkpO1xuXHRcdH0pO1xufSk7XG5cbiIsIm1vZHVsZS5leHBvcnRzID0gYWRkO1xuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gYWRkKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKyBiWzBdXG4gICAgb3V0WzFdID0gYVsxXSArIGJbMV1cbiAgICBvdXRbMl0gPSBhWzJdICsgYlsyXVxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGNvcHk7XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIHZlYzMgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIHNvdXJjZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gY29weShvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdXG4gICAgb3V0WzFdID0gYVsxXVxuICAgIG91dFsyXSA9IGFbMl1cbiAgICByZXR1cm4gb3V0XG59IiwibW9kdWxlLmV4cG9ydHMgPSBjcmVhdGU7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldywgZW1wdHkgdmVjM1xuICpcbiAqIEByZXR1cm5zIHt2ZWMzfSBhIG5ldyAzRCB2ZWN0b3JcbiAqL1xuZnVuY3Rpb24gY3JlYXRlKCkge1xuICAgIHZhciBvdXQgPSBuZXcgRmxvYXQzMkFycmF5KDMpXG4gICAgb3V0WzBdID0gMFxuICAgIG91dFsxXSA9IDBcbiAgICBvdXRbMl0gPSAwXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gZGlzdGFuY2U7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZXVjbGlkaWFuIGRpc3RhbmNlIGJldHdlZW4gdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gZGlzdGFuY2UgYmV0d2VlbiBhIGFuZCBiXG4gKi9cbmZ1bmN0aW9uIGRpc3RhbmNlKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV0sXG4gICAgICAgIHogPSBiWzJdIC0gYVsyXVxuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5ICsgeip6KVxufSIsIm1vZHVsZS5leHBvcnRzID0gZG90O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRvdCBwcm9kdWN0IG9mIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRvdCBwcm9kdWN0IG9mIGEgYW5kIGJcbiAqL1xuZnVuY3Rpb24gZG90KGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXSArIGFbMl0gKiBiWzJdXG59IiwibW9kdWxlLmV4cG9ydHMgPSBmcm9tVmFsdWVzO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgdmVjMyBpbml0aWFsaXplZCB3aXRoIHRoZSBnaXZlbiB2YWx1ZXNcbiAqXG4gKiBAcGFyYW0ge051bWJlcn0geCBYIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHkgWSBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB6IFogY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjM30gYSBuZXcgM0QgdmVjdG9yXG4gKi9cbmZ1bmN0aW9uIGZyb21WYWx1ZXMoeCwgeSwgeikge1xuICAgIHZhciBvdXQgPSBuZXcgRmxvYXQzMkFycmF5KDMpXG4gICAgb3V0WzBdID0geFxuICAgIG91dFsxXSA9IHlcbiAgICBvdXRbMl0gPSB6XG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gbGVuZ3RoO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGxlbmd0aCBvZiBhIHZlYzNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBhXG4gKi9cbmZ1bmN0aW9uIGxlbmd0aChhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXSxcbiAgICAgICAgeiA9IGFbMl1cbiAgICByZXR1cm4gTWF0aC5zcXJ0KHgqeCArIHkqeSArIHoqeilcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IG11bHRpcGx5O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gbXVsdGlwbHkob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGJbMF1cbiAgICBvdXRbMV0gPSBhWzFdICogYlsxXVxuICAgIG91dFsyXSA9IGFbMl0gKiBiWzJdXG4gICAgcmV0dXJuIG91dFxufSIsIm1vZHVsZS5leHBvcnRzID0gc2NhbGU7XG5cbi8qKlxuICogU2NhbGVzIGEgdmVjMyBieSBhIHNjYWxhciBudW1iZXJcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSB2ZWN0b3IgdG8gc2NhbGVcbiAqIEBwYXJhbSB7TnVtYmVyfSBiIGFtb3VudCB0byBzY2FsZSB0aGUgdmVjdG9yIGJ5XG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbmZ1bmN0aW9uIHNjYWxlKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKiBiXG4gICAgb3V0WzFdID0gYVsxXSAqIGJcbiAgICBvdXRbMl0gPSBhWzJdICogYlxuICAgIHJldHVybiBvdXRcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHNxdWFyZWRMZW5ndGg7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBsZW5ndGggb2YgYSB2ZWMzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBjYWxjdWxhdGUgc3F1YXJlZCBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgbGVuZ3RoIG9mIGFcbiAqL1xuZnVuY3Rpb24gc3F1YXJlZExlbmd0aChhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXSxcbiAgICAgICAgeiA9IGFbMl1cbiAgICByZXR1cm4geCp4ICsgeSp5ICsgeip6XG59IiwibW9kdWxlLmV4cG9ydHMgPSBzdWJ0cmFjdDtcblxuLyoqXG4gKiBTdWJ0cmFjdHMgdmVjdG9yIGIgZnJvbSB2ZWN0b3IgYVxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xuZnVuY3Rpb24gc3VidHJhY3Qob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAtIGJbMF1cbiAgICBvdXRbMV0gPSBhWzFdIC0gYlsxXVxuICAgIG91dFsyXSA9IGFbMl0gLSBiWzJdXG4gICAgcmV0dXJuIG91dFxufSIsInZhciB2ZWMzID0ge1xuICAgIGNyZWF0ZTogcmVxdWlyZSgnZ2wtdmVjMy9jcmVhdGUnKSxcbiAgICBhZGQ6IHJlcXVpcmUoJ2dsLXZlYzMvYWRkJyksXG4gICAgZG90OiByZXF1aXJlKCdnbC12ZWMzL2RvdCcpLFxuICAgIHN1YjogcmVxdWlyZSgnZ2wtdmVjMy9zdWJ0cmFjdCcpLFxuICAgIHNjYWxlOiByZXF1aXJlKCdnbC12ZWMzL3NjYWxlJyksXG4gICAgZGlzdGFuY2U6IHJlcXVpcmUoJ2dsLXZlYzMvZGlzdGFuY2UnKVxufVxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9idWlsZCcpKHZlYzMpIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2ZWMpIHtcbiAgICB2YXIgZGVsdGEgPSB2ZWMuY3JlYXRlKClcbiAgICB2YXIgc2NhbGVkID0gdmVjLmNyZWF0ZSgpXG5cbiAgICBmdW5jdGlvbiBDb25zdHJhaW50KHBvaW50cywgb3B0KSB7XG4gICAgICAgIGlmICghcG9pbnRzIHx8IHBvaW50cy5sZW5ndGggIT09IDIpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3R3byBwb2ludHMgbXVzdCBiZSBzcGVjaWZpZWQgZm9yIHRoZSBjb25zdHJhaW50JylcbiAgICAgICAgaWYgKCFwb2ludHNbMF0ucG9zaXRpb24gfHwgIXBvaW50c1sxXS5wb3NpdGlvbilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignbXVzdCBzcGVjaWZ5IHZlcmxldC1wb2ludCBvciBzaW1pbGFyLCB3aXRoIHsgcG9zaXRpb24gfScpXG4gICAgICAgIHRoaXMucG9pbnRzID0gcG9pbnRzXG4gICAgICAgIHRoaXMuc3RpZmZuZXNzID0gMS4wXG4gICAgICAgIGlmIChvcHQgJiYgdHlwZW9mIG9wdC5zdGlmZm5lc3MgPT09ICdudW1iZXInKVxuICAgICAgICAgICAgdGhpcy5zdGlmZm5lc3MgPSBvcHQuc3RpZmZuZXNzXG5cbiAgICAgICAgaWYgKG9wdCAmJiB0eXBlb2Ygb3B0LnJlc3RpbmdEaXN0YW5jZSA9PT0gJ251bWJlcicpXG4gICAgICAgICAgICB0aGlzLnJlc3RpbmdEaXN0YW5jZSA9IG9wdC5yZXN0aW5nRGlzdGFuY2VcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5yZXN0aW5nRGlzdGFuY2UgPSB2ZWMuZGlzdGFuY2UodGhpcy5wb2ludHNbMF0ucG9zaXRpb24sIHRoaXMucG9pbnRzWzFdLnBvc2l0aW9uKVxuICAgIH1cblxuICAgIENvbnN0cmFpbnQucHJvdG90eXBlLnNvbHZlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vZGlzdGFuY2UgZm9ybXVsYVxuICAgICAgICB2YXIgcDEgPSB0aGlzLnBvaW50c1swXSxcbiAgICAgICAgICAgIHAyID0gdGhpcy5wb2ludHNbMV0sXG4gICAgICAgICAgICBwMXZlYyA9IHAxLnBvc2l0aW9uLFxuICAgICAgICAgICAgcDJ2ZWMgPSBwMi5wb3NpdGlvbixcbiAgICAgICAgICAgIHAxbWFzcyA9IHR5cGVvZiBwMS5tYXNzID09PSAnbnVtYmVyJyA/IHAxLm1hc3MgOiAxLFxuICAgICAgICAgICAgcDJtYXNzID0gdHlwZW9mIHAyLm1hc3MgPT09ICdudW1iZXInID8gcDIubWFzcyA6IDFcblxuICAgICAgICB2ZWMuc3ViKGRlbHRhLCBwMXZlYywgcDJ2ZWMpXG4gICAgICAgIHZhciBkID0gTWF0aC5zcXJ0KHZlYy5kb3QoZGVsdGEsIGRlbHRhKSlcblxuICAgICAgICAvL3JhdGlvIGZvciByZXN0aW5nIGRpc3RhbmNlXG4gICAgICAgIHZhciByZXN0aW5nUmF0aW8gPSBkPT09MCA/IHRoaXMucmVzdGluZ0Rpc3RhbmNlIDogKHRoaXMucmVzdGluZ0Rpc3RhbmNlIC0gZCkgLyBkXG4gICAgICAgIHZhciBzY2FsYXJQMSwgXG4gICAgICAgICAgICBzY2FsYXJQMlxuXG4gICAgICAgIC8vaGFuZGxlIHplcm8gbWFzcyBhIGxpdHRsZSBkaWZmZXJlbnRseVxuICAgICAgICBpZiAocDFtYXNzPT09MHx8cDJtYXNzPT09MCkge1xuICAgICAgICAgICAgc2NhbGFyUDEgPSB0aGlzLnN0aWZmbmVzc1xuICAgICAgICAgICAgc2NhbGFyUDIgPSB0aGlzLnN0aWZmbmVzc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9pbnZlcnQgbWFzcyBxdWFudGl0aWVzXG4gICAgICAgICAgICB2YXIgaW0xID0gMS4wIC8gcDFtYXNzXG4gICAgICAgICAgICB2YXIgaW0yID0gMS4wIC8gcDJtYXNzXG4gICAgICAgICAgICBzY2FsYXJQMSA9IChpbTEgLyAoaW0xICsgaW0yKSkgKiB0aGlzLnN0aWZmbmVzc1xuICAgICAgICAgICAgc2NhbGFyUDIgPSB0aGlzLnN0aWZmbmVzcyAtIHNjYWxhclAxXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vcHVzaC9wdWxsIGJhc2VkIG9uIG1hc3NcbiAgICAgICAgdmVjLnNjYWxlKHNjYWxlZCwgZGVsdGEsIHNjYWxhclAxICogcmVzdGluZ1JhdGlvKVxuICAgICAgICB2ZWMuYWRkKHAxdmVjLCBwMXZlYywgc2NhbGVkKVxuICAgICAgICBcbiAgICAgICAgdmVjLnNjYWxlKHNjYWxlZCwgZGVsdGEsIHNjYWxhclAyICogcmVzdGluZ1JhdGlvKVxuICAgICAgICB2ZWMuc3ViKHAydmVjLCBwMnZlYywgc2NhbGVkKVxuXG4gICAgICAgIHJldHVybiBkXG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHAxLCBwMiwgb3B0KSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29uc3RyYWludChwMSwgcDIsIG9wdClcbiAgICB9XG59IiwidmFyIHZlYzMgPSB7XG4gICAgY3JlYXRlOiByZXF1aXJlKCdnbC12ZWMzL2NyZWF0ZScpLFxuICAgIHN1YjogcmVxdWlyZSgnZ2wtdmVjMy9zdWJ0cmFjdCcpLFxuICAgIGNvcHk6IHJlcXVpcmUoJ2dsLXZlYzMvY29weScpXG59XG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL2J1aWxkJykodmVjMykiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZlYykge1xuICAgIGZ1bmN0aW9uIFBvaW50KG9wdCkge1xuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdmVjLmNyZWF0ZSgpXG4gICAgICAgIHRoaXMucHJldmlvdXMgPSB2ZWMuY3JlYXRlKClcbiAgICAgICAgdGhpcy5hY2NlbGVyYXRpb24gPSB2ZWMuY3JlYXRlKClcbiAgICAgICAgdGhpcy5tYXNzID0gMS4wXG4gICAgICAgIHRoaXMucmFkaXVzID0gMFxuXG4gICAgICAgIGlmIChvcHQgJiYgdHlwZW9mIG9wdC5tYXNzID09PSAnbnVtYmVyJylcbiAgICAgICAgICAgIHRoaXMubWFzcyA9IG9wdC5tYXNzXG4gICAgICAgIGlmIChvcHQgJiYgdHlwZW9mIG9wdC5yYWRpdXMgPT09ICdudW1iZXInKVxuICAgICAgICAgICAgdGhpcy5yYWRpdXMgPSBvcHQucmFkaXVzXG5cbiAgICAgICAgaWYgKG9wdCAmJiBvcHQucG9zaXRpb24pIFxuICAgICAgICAgICAgdmVjLmNvcHkodGhpcy5wb3NpdGlvbiwgb3B0LnBvc2l0aW9uKVxuICAgICAgICBcbiAgICAgICAgaWYgKG9wdCAmJiAob3B0LnByZXZpb3VzfHxvcHQucG9zaXRpb24pKSBcbiAgICAgICAgICAgIHZlYy5jb3B5KHRoaXMucHJldmlvdXMsIG9wdC5wcmV2aW91cyB8fCBvcHQucG9zaXRpb24pXG4gICAgICAgIFxuICAgICAgICBpZiAob3B0ICYmIG9wdC5hY2NlbGVyYXRpb24pXG4gICAgICAgICAgICB2ZWMuY29weSh0aGlzLmFjY2VsZXJhdGlvbiwgb3B0LmFjY2VsZXJhdGlvbilcbiAgICB9XG5cbiAgICBQb2ludC5wcm90b3R5cGUuYWRkRm9yY2UgPSBmdW5jdGlvbih2KSB7XG4gICAgICAgIHZlYy5zdWIodGhpcy5wcmV2aW91cywgdGhpcy5wcmV2aW91cywgdilcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG5cbiAgICBQb2ludC5wcm90b3R5cGUucGxhY2UgPSBmdW5jdGlvbih2KSB7XG4gICAgICAgIHZlYy5jb3B5KHRoaXMucG9zaXRpb24sIHYpXG4gICAgICAgIHZlYy5jb3B5KHRoaXMucHJldmlvdXMsIHYpXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9wdCkge1xuICAgICAgICByZXR1cm4gbmV3IFBvaW50KG9wdClcbiAgICB9XG59IiwidmFyIHZlYzMgPSB7XG4gICAgY3JlYXRlOiByZXF1aXJlKCdnbC12ZWMzL2NyZWF0ZScpLFxuICAgIGFkZDogcmVxdWlyZSgnZ2wtdmVjMy9hZGQnKSxcbiAgICBtdWx0aXBseTogcmVxdWlyZSgnZ2wtdmVjMy9tdWx0aXBseScpLFxuICAgIHN1YjogcmVxdWlyZSgnZ2wtdmVjMy9zdWJ0cmFjdCcpLFxuICAgIHNjYWxlOiByZXF1aXJlKCdnbC12ZWMzL3NjYWxlJyksXG4gICAgY29weTogcmVxdWlyZSgnZ2wtdmVjMy9jb3B5JyksXG4gICAgc3FyTGVuOiByZXF1aXJlKCdnbC12ZWMzL3NxdWFyZWRMZW5ndGgnKSxcbiAgICBmcm9tVmFsdWVzOiByZXF1aXJlKCdnbC12ZWMzL2Zyb21WYWx1ZXMnKSxcbn1cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9saWIvYnVpbGQnKSh2ZWMzKSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmVjKSB7XG4gICAgdmFyIG5lZ0luZmluaXR5ID0gdmVjLmZyb21WYWx1ZXMoLUluZmluaXR5LCAtSW5maW5pdHksIC1JbmZpbml0eSlcbiAgICB2YXIgcG9zSW5maW5pdHkgPSB2ZWMuZnJvbVZhbHVlcyhJbmZpbml0eSwgSW5maW5pdHksIEluZmluaXR5KVxuICAgIHZhciBvbmVzID0gdmVjLmZyb21WYWx1ZXMoMSwgMSwgMSlcbiAgICB2YXIgcmVmbGVjdCA9IHZlYy5jcmVhdGUoKVxuICAgIHZhciBFUFNJTE9OID0gMC4wMDAwMDFcblxuICAgIHJldHVybiBmdW5jdGlvbiBjb2xsaWRlcihwLCB2ZWxvY2l0eSwgbWluLCBtYXgsIGZyaWN0aW9uKSB7XG4gICAgICAgIGlmICghbWluICYmICFtYXgpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIFxuICAgICAgICAvL3Jlc2V0IHJlZmxlY3Rpb24gXG4gICAgICAgIHZlYy5jb3B5KHJlZmxlY3QsIG9uZXMpXG5cbiAgICAgICAgbWluID0gbWluIHx8IG5lZ0luZmluaXR5XG4gICAgICAgIG1heCA9IG1heCB8fCBwb3NJbmZpbml0eVxuXG4gICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgIG4gPSBwLnBvc2l0aW9uLmxlbmd0aCxcbiAgICAgICAgICAgIGhpdCA9IGZhbHNlLFxuICAgICAgICAgICAgcmFkaXVzID0gcC5yYWRpdXMgfHwgMFxuXG4gICAgICAgIC8vYm91bmNlIGFuZCBjbGFtcFxuICAgICAgICBmb3IgKGk9MDsgaTxuOyBpKyspXG4gICAgICAgICAgICBpZiAodHlwZW9mIG1pbltpXSA9PT0gJ251bWJlcicgJiYgcC5wb3NpdGlvbltpXS1yYWRpdXMgPCBtaW5baV0pIHtcbiAgICAgICAgICAgICAgICByZWZsZWN0W2ldID0gLTFcbiAgICAgICAgICAgICAgICBwLnBvc2l0aW9uW2ldID0gbWluW2ldK3JhZGl1c1xuICAgICAgICAgICAgICAgIGhpdCA9IHRydWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgZm9yIChpPTA7IGk8bjsgaSsrKVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBtYXhbaV0gPT09ICdudW1iZXInICYmIHAucG9zaXRpb25baV0rcmFkaXVzID4gbWF4W2ldKSB7XG4gICAgICAgICAgICAgICAgcmVmbGVjdFtpXSA9IC0xXG4gICAgICAgICAgICAgICAgcC5wb3NpdGlvbltpXSA9IG1heFtpXS1yYWRpdXNcbiAgICAgICAgICAgICAgICBoaXQgPSB0cnVlXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgLy9ubyBib3VuY2VcbiAgICAgICAgdmFyIGxlbjIgPSB2ZWMuc3FyTGVuKHZlbG9jaXR5KVxuICAgICAgICBpZiAoIWhpdCB8fCBsZW4yIDw9IEVQU0lMT04pXG4gICAgICAgICAgICByZXR1cm5cblxuICAgICAgICB2YXIgbSA9IE1hdGguc3FydChsZW4yKVxuICAgICAgICBpZiAobSAhPT0gMCkgXG4gICAgICAgICAgICB2ZWMuc2NhbGUodmVsb2NpdHksIHZlbG9jaXR5LCAxL20pXG5cbiAgICAgICAgLy9zY2FsZSBib3VuY2UgYnkgZnJpY3Rpb25cbiAgICAgICAgdmVjLnNjYWxlKHJlZmxlY3QsIHJlZmxlY3QsIG0gKiBmcmljdGlvbilcblxuICAgICAgICAvL2JvdW5jZSBiYWNrXG4gICAgICAgIHZlYy5tdWx0aXBseSh2ZWxvY2l0eSwgdmVsb2NpdHksIHJlZmxlY3QpXG4gICAgfVxufSIsInZhciBudW1iZXIgPSByZXF1aXJlKCdhcy1udW1iZXInKVxudmFyIGNsYW1wID0gcmVxdWlyZSgnY2xhbXAnKVxudmFyIGNyZWF0ZUNvbGxpZGVyID0gcmVxdWlyZSgnLi9ib3gtY29sbGlzaW9uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGUodmVjKSB7XG4gICAgXG4gICAgdmFyIGNvbGxpZGUgPSBjcmVhdGVDb2xsaWRlcih2ZWMpXG5cbiAgICB2YXIgdmVsb2NpdHkgPSB2ZWMuY3JlYXRlKClcbiAgICB2YXIgdG1wID0gdmVjLmNyZWF0ZSgpXG4gICAgdmFyIHplcm8gPSB2ZWMuY3JlYXRlKClcbiAgICBcbiAgICBmdW5jdGlvbiBWZXJsZXRTeXN0ZW0ob3B0KSB7XG4gICAgICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBWZXJsZXRTeXN0ZW0pKVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBWZXJsZXRTeXN0ZW0ob3B0KVxuICAgICAgICBcbiAgICAgICAgb3B0ID0gb3B0fHx7fVxuXG4gICAgICAgIHRoaXMuZ3Jhdml0eSA9IG9wdC5ncmF2aXR5IHx8IHZlYy5jcmVhdGUoKVxuICAgICAgICB0aGlzLmZyaWN0aW9uID0gbnVtYmVyKG9wdC5mcmljdGlvbiwgMC45OClcbiAgICAgICAgdGhpcy5taW4gPSBvcHQubWluXG4gICAgICAgIHRoaXMubWF4ID0gb3B0Lm1heFxuICAgICAgICB0aGlzLmJvdW5jZSA9IG51bWJlcihvcHQuYm91bmNlLCAxKVxuICAgIH1cbiAgICBcbiAgICBWZXJsZXRTeXN0ZW0ucHJvdG90eXBlLmNvbGxpc2lvbiA9IGZ1bmN0aW9uKHAsIHZlbG9jaXR5KSB7XG4gICAgICAgIGNvbGxpZGUocCwgdmVsb2NpdHksIHRoaXMubWluLCB0aGlzLm1heCwgdGhpcy5ib3VuY2UpXG4gICAgfVxuXG4gICAgVmVybGV0U3lzdGVtLnByb3RvdHlwZS5pbnRlZ3JhdGVQb2ludCA9IGZ1bmN0aW9uKHBvaW50LCBkZWx0YSkge1xuICAgICAgICB2YXIgbWFzcyA9IHR5cGVvZiBwb2ludC5tYXNzID09PSAnbnVtYmVyJyA/IHBvaW50Lm1hc3MgOiAxXG5cbiAgICAgICAgLy9pZiBtYXNzIGlzIHplcm8sIGFzc3VtZSBib2R5IGlzIHN0YXRpYyAvIHVubW92YWJsZVxuICAgICAgICBpZiAobWFzcyA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5jb2xsaXNpb24ocG9pbnQsIHplcm8pXG4gICAgICAgICAgICB2ZWMuY29weShwb2ludC5hY2NlbGVyYXRpb24sIHplcm8pXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHZlYy5hZGQocG9pbnQuYWNjZWxlcmF0aW9uLCBwb2ludC5hY2NlbGVyYXRpb24sIHRoaXMuZ3Jhdml0eSlcbiAgICAgICAgdmVjLnNjYWxlKHBvaW50LmFjY2VsZXJhdGlvbiwgcG9pbnQuYWNjZWxlcmF0aW9uLCBtYXNzKVxuICAgICAgICAgICAgXG4gICAgICAgIC8vZGlmZmVyZW5jZSBpbiBwb3NpdGlvbnNcbiAgICAgICAgdmVjLnN1Yih2ZWxvY2l0eSwgcG9pbnQucG9zaXRpb24sIHBvaW50LnByZXZpb3VzKVxuXG4gICAgICAgIC8vZGFtcGVuIHZlbG9jaXR5XG4gICAgICAgIHZlYy5zY2FsZSh2ZWxvY2l0eSwgdmVsb2NpdHksIHRoaXMuZnJpY3Rpb24pXG5cbiAgICAgICAgLy9oYW5kbGUgY3VzdG9tIGNvbGxpc2lvbnMgaW4gMkQgb3IgM0Qgc3BhY2VcbiAgICAgICAgdGhpcy5jb2xsaXNpb24ocG9pbnQsIHZlbG9jaXR5KVxuXG4gICAgICAgIC8vc2V0IGxhc3QgcG9zaXRpb25cbiAgICAgICAgdmVjLmNvcHkocG9pbnQucHJldmlvdXMsIHBvaW50LnBvc2l0aW9uKVxuICAgICAgICB2YXIgdFNxciA9IGRlbHRhICogZGVsdGFcbiAgICAgICAgICAgIFxuICAgICAgICAvL2ludGVncmF0ZVxuICAgICAgICB2ZWMuc2NhbGUodG1wLCBwb2ludC5hY2NlbGVyYXRpb24sIDAuNSAqIHRTcXIpXG4gICAgICAgIHZlYy5hZGQocG9pbnQucG9zaXRpb24sIHBvaW50LnBvc2l0aW9uLCB2ZWxvY2l0eSlcbiAgICAgICAgdmVjLmFkZChwb2ludC5wb3NpdGlvbiwgcG9pbnQucG9zaXRpb24sIHRtcClcblxuICAgICAgICAvL3Jlc2V0IGFjY2VsZXJhdGlvblxuICAgICAgICB2ZWMuY29weShwb2ludC5hY2NlbGVyYXRpb24sIHplcm8pXG4gICAgfVxuXG4gICAgVmVybGV0U3lzdGVtLnByb3RvdHlwZS5pbnRlZ3JhdGUgPSBmdW5jdGlvbihwb2ludHMsIGRlbHRhKSB7XG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuaW50ZWdyYXRlUG9pbnQocG9pbnRzW2ldLCBkZWx0YSlcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBWZXJsZXRTeXN0ZW1cbn0iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG51bXR5cGUobnVtLCBkZWYpIHtcblx0cmV0dXJuIHR5cGVvZiBudW0gPT09ICdudW1iZXInXG5cdFx0PyBudW0gXG5cdFx0OiAodHlwZW9mIGRlZiA9PT0gJ251bWJlcicgPyBkZWYgOiAwKVxufSIsIm1vZHVsZS5leHBvcnRzID0gY2xhbXBcblxuZnVuY3Rpb24gY2xhbXAodmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBtaW4gPCBtYXhcbiAgICA/ICh2YWx1ZSA8IG1pbiA/IG1pbiA6IHZhbHVlID4gbWF4ID8gbWF4IDogdmFsdWUpXG4gICAgOiAodmFsdWUgPCBtYXggPyBtYXggOiB2YWx1ZSA+IG1pbiA/IG1pbiA6IHZhbHVlKVxufVxuIl19
