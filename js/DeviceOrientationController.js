/**
 * -------
 * threeVR (https://github.com/richtr/threeVR)
 * -------
 *
 * W3C Device Orientation control (http://www.w3.org/TR/orientation-event/)
 * with manual user drag (rotate) and pinch (zoom) override handling
 *
 * Author: Rich Tibbett (http://github.com/richtr)
 * License: The MIT License
 *
**/

var DeviceOrientationController = function( object, domElement ) {

  this.object = object;
  this.element = domElement || document;

  this.freeze = true;

  this.enableManualDrag = true; // enable manual user drag override control by default
  this.enableManualZoom = true; // enable manual user zoom override control by default

  this.useQuaternions = true; // use quaternions for orientation calculation by default

  this.deviceOrientation = {};
  this.screenOrientation = 0;

  // Manual rotate override components
  var startX = 0, startY = 0,
      currentX = 0, currentY = 0,
      scrollSpeedX, scrollSpeedY,
      tmpQuat = new THREE.Quaternion();

  // Manual zoom override components
  var zoomStart = 1, zoomCurrent = 1,
      zoomP1 = new THREE.Vector2(),
      zoomP2 = new THREE.Vector2(),
      tmpFOV;

  var STATE = { DEVICE: -1, MANUAL_ROTATE: 0, MANUAL_ZOOM: 1 };
  var appState = STATE.DEVICE;

  this.onDeviceOrientationChange = function(rawEvtData) {
    this.deviceOrientation = rawEvtData;
  }.bind(this);

  this.onScreenOrientationChange = function() {
    this.screenOrientation = window.orientation || 0;
  }.bind(this);

  this.onDocumentMouseDown = function(event) {
    if ( this.enableManualDrag !== true ) return;

    event.preventDefault();

    appState = STATE.MANUAL_ROTATE;

    tmpQuat.copy(this.object.quaternion);

    startX = currentX = event.clientX;
    startY = currentY = event.clientY;

    // Set consistent scroll speed based on current viewport width/height
    scrollSpeedX = (1200 / window.innerWidth) * 0.1;
    scrollSpeedY = (800 / window.innerHeight) * 0.1;

    this.element.addEventListener('mousemove', this.onDocumentMouseMove, false);
    this.element.addEventListener('mouseup', this.onDocumentMouseUp, false);
  }.bind(this);

  this.onDocumentMouseMove = function(event) {
    currentX = event.clientX;
    currentY = event.clientY;
  }.bind(this);

  this.onDocumentMouseUp = function(event) {
    this.element.removeEventListener('mousemove', this.onDocumentMouseMove, false);
    this.element.removeEventListener('mouseup', this.onDocumentMouseUp, false);

    appState = STATE.DEVICE;
  }.bind(this);

  this.onDocumentTouchStart = function(event) {
    event.preventDefault();

    switch( event.touches.length ) {
      case 1: // ROTATE
        if ( this.enableManualDrag !== true ) return;

        appState = STATE.MANUAL_ROTATE;

        tmpQuat.copy(this.object.quaternion);

        startX = currentX = event.touches[0].pageX;
        startY = currentY = event.touches[0].pageY;

        // Set consistent scroll speed based on current viewport width/height
        scrollSpeedX = (1200 / window.innerWidth) * 0.1;
        scrollSpeedY = (800 / window.innerHeight) * 0.1;

        this.element.addEventListener('touchmove', this.onDocumentTouchMove, false);
        this.element.addEventListener('touchend', this.onDocumentTouchEnd, false);

        break;

      case 2: // ZOOM
        if ( this.enableManualZoom !== true ) return;

        appState = STATE.MANUAL_ZOOM;

        tmpFOV = this.object.fov;

        zoomP1.set(event.touches[0].pageX, event.touches[0].pageY);
        zoomP2.set(event.touches[1].pageX, event.touches[1].pageY);

        zoomStart = zoomCurrent = zoomP1.distanceTo( zoomP2 );

        this.element.addEventListener('touchmove', this.onDocumentTouchMove, false);
        this.element.addEventListener('touchend', this.onDocumentTouchEnd, false);

        break;
    }
  }.bind(this);

  this.onDocumentTouchMove = function(event) {
    switch( event.touches.length ) {
      case 1:
        currentX = event.touches[0].pageX;
        currentY = event.touches[0].pageY;
        break;

      case 2:
        zoomP1.set(event.touches[0].pageX, event.touches[0].pageY);
        zoomP2.set(event.touches[1].pageX, event.touches[1].pageY);
        zoomCurrent = zoomP1.distanceTo( zoomP2 );
        break;
    }
  }.bind(this);

  this.onDocumentTouchEnd = function(event) {
    this.element.removeEventListener('touchmove', this.onDocumentTouchMove, false);
    this.element.removeEventListener('touchend', this.onDocumentTouchEnd, false);

    if ( appState === STATE.MANUAL_ZOOM ) {
        this.object.fov = tmpFOV; // reset object FOV
    }

    appState = STATE.DEVICE; // reset control state
  }.bind(this);

  var createQuaternion = function() {

    var finalQuaternion = new THREE.Quaternion();

    var euler = new THREE.Euler();

    var screenTransform = new THREE.Quaternion();

    var worldTransform = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around the x-axis

    var minusHalfAngle = 0;

    return function(alpha, beta, gamma, screenOrientation) {

      euler.set(beta, alpha, -gamma, 'YXZ');

      finalQuaternion.setFromEuler(euler);

      minusHalfAngle = -screenOrientation / 2;

      screenTransform.set(0, 0, Math.sin(minusHalfAngle), Math.cos(minusHalfAngle));

      if (alpha !== 0) {
        finalQuaternion.multiply(worldTransform);
      }

      finalQuaternion.multiply(screenTransform);

      return finalQuaternion;

    }

  }();

  var createRotationMatrix = function() {

    var finalMatrix = new THREE.Matrix4();

    var deviceEuler = new THREE.Euler();
    var screenEuler = new THREE.Euler();
    var worldEuler = new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ'); // - PI/2 around the x-axis

    var screenTransform = new THREE.Matrix4();

    var worldTransform = new THREE.Matrix4();
    worldTransform.makeRotationFromEuler(worldEuler);

    return function(alpha, beta, gamma, screenOrientation) {

      deviceEuler.set(beta, alpha, -gamma, 'YXZ');

      finalMatrix.identity();

      finalMatrix.makeRotationFromEuler(deviceEuler);

      screenEuler.set(0, -screenOrientation, 0, 'YXZ');

      screenTransform.identity();

      screenTransform.makeRotationFromEuler(screenEuler);

      finalMatrix.multiply(screenTransform);

      if (alpha !== 0) {
        finalMatrix.multiply(worldTransform);
      }

      return finalMatrix;

    }

  }();

  this.updateManualMove = function() {

    var rotation = new THREE.Euler(0, 0, 0, "YXZ");

    var rotQuat = new THREE.Quaternion();
    var objQuat = new THREE.Quaternion();

    var lat, lon;

    var zoomFactor, minZoomFactor = 1; // maxZoomFactor = Infinity

    return function() {

      if ( appState === STATE.MANUAL_ROTATE ) {

        lat = (startY - currentY) * scrollSpeedY;
        lon = (startX - currentX) * scrollSpeedX;

        rotation.set(
          THREE.Math.degToRad(lat),
          THREE.Math.degToRad(lon),
          0
        );

        rotQuat.setFromEuler(rotation);

        objQuat.multiplyQuaternions(tmpQuat, rotQuat);

        //this.object.quaternion.slerp( objQuat, 0.07 ); // smoothing
        this.object.quaternion.copy( objQuat ); // no smoothing

      } else if ( appState === STATE.MANUAL_ZOOM ) {

        zoomFactor = zoomStart / zoomCurrent;

        if ( zoomFactor <= minZoomFactor ) {
          this.object.fov = tmpFOV * zoomFactor;
          this.object.updateProjectionMatrix();
        }

      }

    };

  }();

  this.updateDeviceMove = function() {

    var adjustedAlpha;

    var alpha, beta, gamma, orient;

    var objQuat; // when we use quaternions

    var objMatrix; // when we use rotation matrixes

    return function() {

      if (this.freeze) return;

      // iOS world-accurate 'alpha' fix
      try {
        adjustedAlpha = this.deviceOrientation.webkitCompassAccuracy !== undefined
                          && this.deviceOrientation.webkitCompassAccuracy !== null
                            && this.deviceOrientation.webkitCompassAccuracy !== -1
                              ? 360 - (this.deviceOrientation.webkitCompassHeading || 360)
                                : this.deviceOrientation.alpha;
      } catch(e) {
        adjustedAlpha = this.deviceOrientation.alpha;
      }

      alpha  = THREE.Math.degToRad(adjustedAlpha                || 0); // Z
      beta   = THREE.Math.degToRad(this.deviceOrientation.beta  || 0); // X'
      gamma  = THREE.Math.degToRad(this.deviceOrientation.gamma || 0); // Y''
      orient = THREE.Math.degToRad(this.screenOrientation       || 0); // O

      if (this.useQuaternions) {

        objQuat = createQuaternion(alpha, beta, gamma, orient);

        //this.object.quaternion.slerp( objQuat, 0.07 ); // smoothing
        this.object.quaternion.copy( objQuat ); // no smoothing

      } else {

        objMatrix = createRotationMatrix(alpha, beta, gamma, orient);

        this.object.quaternion.setFromRotationMatrix(objMatrix);

      }

    };

  }();

  this.update = function() {
    if ( appState === STATE.DEVICE ) {
      this.updateDeviceMove();
    } else {
      this.updateManualMove();
    }
  };

  this.connect = function() {
    this.onScreenOrientationChange(); // run once on load

    window.addEventListener('orientationchange', this.onScreenOrientationChange, false);
    window.addEventListener('deviceorientation', this.onDeviceOrientationChange, false);

    this.element.addEventListener('mousedown', this.onDocumentMouseDown, false);
    this.element.addEventListener('touchstart', this.onDocumentTouchStart, false);

    this.freeze = false;
  };

  this.disconnect = function() {
    this.freeze = true;

    window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);
    window.removeEventListener('deviceorientation', this.onDeviceOrientationChange, false);

    this.element.removeEventListener('mousedown', this.onDocumentMouseDown, false);
    this.element.removeEventListener('touchstart', this.onDocumentTouchStart, false);
  };

};
