'use strict';

module.exports = function (three) {

	// Add cardboard button
	const container = document.body;
	const cardboard = document.getElementById('cardboard');
	cardboard.addEventListener('click', setUpCardboard);

	function removeCardboardButton() {
		cardboard.style.display = 'none';
	}

	setTimeout(removeCardboardButton, 5000);
	function setUpCardboard() {

		// Stop deviceOrientation.js eating the click events.
		three.deviceOrientation({manualControl: false}); 

		removeCardboardButton();
		three.useCardboard();

		if (container.requestFullscreen) {
			container.requestFullscreen();
		} else if (container.msRequestFullscreen) {
			container.msRequestFullscreen();
		} else if (container.mozRequestFullScreen) {
			container.mozRequestFullScreen();
		} else if (container.webkitRequestFullscreen) {
			container.webkitRequestFullscreen();
		}
		container.removeEventListener('click', setUpCardboard);
	}



}
