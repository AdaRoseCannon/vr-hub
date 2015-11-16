'use strict';

module.exports = VRTarget;

function css(node, props) {
	function units(prop, i) {
		if (typeof i === "number") {
			if (prop.match(/width|height|top|left|right|bottom/)) {
				return i + "px";
			}
		}
		return i;
	}
	for (let n in props) {
		if (props.hasOwnProperty(n)) {
			node.style[n] = units(n, props[n]);
		}
	}
	return node;
}

function VRTarget(parent) {

	// Create iframe and add it to the doc
	const iframe = document.createElement('iframe');
	css(iframe, {
		position: 'absolute',
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
		width: '100%',
		height: '100%',
		border: 'none',
		pointerEvents: 'none'
	});
	iframe.setAttribute('seamless', 'seamless');
	iframe.setAttribute('mozbrowser', '1');
	iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
	this.iframe = iframe;
	this.parent = parent || document.body;
	this.parent.insertBefore(this.iframe, this.parent.firstChild);
}

VRTarget.prototype.load = function (url) {
	this.iframe.src = url;
	return new Promise(function (resolve) {
		this.iframe.addEventListener('load', resolve);
	}.bind(this))
	.then(() => {
		css(this.iframe, {
			pointerEvents: 'auto'
		});
	});
};

VRTarget.prototype.unload = function (url) {
	this.iframe.src = 'about:blank';
	css(this.iframe, {
		pointerEvents: 'none'
	});
};


VRTarget.prototype.destroy = function (url) {
	this.parent.removeChild(this.iframe);
	this.iframe = null;
};
