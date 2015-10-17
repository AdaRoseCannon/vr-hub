/*global THREE*/
'use strict';

module.exports = function initSky() {

	// Add Sky Mesh
	const sky = new THREE.Sky();

	var effectController  = {
		turbidity: 10,
		reileigh: 2,
		mieCoefficient: 0.005,
		mieDirectionalG: 0.8,
		luminance: 1,
		inclination: 0.49, // elevation / inclination
		azimuth: 0.25, // Facing front,
	};

	var distance = 400000;

	function initUniforms() {

		const uniforms = sky.uniforms;
		const sunPos = new THREE.Vector3();
		uniforms.turbidity.value = effectController.turbidity;
		uniforms.reileigh.value = effectController.reileigh;
		uniforms.luminance.value = effectController.luminance;
		uniforms.mieCoefficient.value = effectController.mieCoefficient;
		uniforms.mieDirectionalG.value = effectController.mieDirectionalG;

		var theta = Math.PI * ( effectController.inclination - 0.5 );
		var phi = 2 * Math.PI * ( effectController.azimuth - 0.5 );

		sunPos.x = distance * Math.cos( phi );
		sunPos.y = distance * Math.sin( phi ) * Math.sin( theta );
		sunPos.z = distance * Math.sin( phi ) * Math.cos( theta );

		sky.uniforms.sunPosition.value.copy( sunPos );

	}
	initUniforms();

	return sky.mesh;
};
