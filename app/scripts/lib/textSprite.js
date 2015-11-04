// From http://stemkoski.github.io/Three.js/Sprite-Text-Labels.html
/*global THREE*/
'use strict';

function makeTextSprite( message, parameters ) {
	if ( parameters === undefined ) parameters = {};
	
	const fontface = parameters.hasOwnProperty("fontface") ? 
		parameters["fontface"] : "Arial";
	
	const borderThickness = parameters.hasOwnProperty("borderThickness") ? 
		parameters["borderThickness"] : 2;

	// may tweaked later to scale text
	let size = parameters.hasOwnProperty("size") ? 
		parameters["size"] : 1;
		
	const canvas1 = document.createElement('canvas');
	const context1 = canvas1.getContext('2d');
	const height = 256;

	function setStyle(context) {

		context.font = "Bold " + (height - borderThickness) + "px " + fontface;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		
		context.lineWidth = borderThickness;

		// text color
		context.strokeStyle = "rgba(255, 255, 255, 1.0)";
		context.fillStyle = "rgba(0, 0, 0, 1.0)";
	}

	setStyle(context1);

	const canvas2 = document.createElement('canvas');

	// Make the canvas width a power of 2 larger than the text width
	const measure = context1.measureText( message );
	canvas2.width = Math.pow(2, Math.ceil(Math.log2( measure.width )));
	canvas2.height = height;
	console.log(measure);
	const context2 = canvas2.getContext('2d');

	context2.rect(0, 0, canvas2.width, canvas2.height);
	context2.fillStyle="red";
	context2.fill();

	setStyle(context2);

	context2.strokeText( message, canvas2.width/2, canvas2.height/2);
	context2.fillText( message, canvas2.width/2, canvas2.height/2);
	
	// canvas contents will be used for a texture
	const texture = new THREE.Texture(canvas2) ;
	texture.needsUpdate = true;

	const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
	const sprite = new THREE.Sprite(spriteMaterial);

	const maxWidth = height * 4;

	if (canvas2.width > maxWidth) size *= maxWidth/canvas2.width;
	console.log(canvas2.width, canvas2.height);
    
	// get size data (height depends only on font size)
	sprite.scale.set(size * canvas2.width/canvas2.height, size, 1);
	return sprite;
}

module.exports = makeTextSprite;
