/* ------------------------------------------------------------

   Copyright 2016 Esri

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at:
   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

--------------------------------------------------------------- */

define([
    'esri/core/declare',
    'esri/views/3d/externalRenderers'
], function (
    declare,
    externalRenderers
) {
    // Enforce strict mode
    'use strict';

    // Constants
    var THREE = window.THREE;
    var RADIUS = 6378137;
    var OFFSET = 5000;
    var SIZE = 100000;
    var COLOR = 0xffffff;
    var REST = 75; //ms

    return declare([], {
        constructor: function (view, tracks) {
            this.view = view;
            this.tracks = tracks;
            this.index = 0;
            this.max = 0;
            this.refresh = Date.now();
        },
        setup: function (context) {
            // Create the THREE.js webgl renderer
            this.renderer = new THREE.WebGLRenderer({
                context: context.gl
            });

            // Make sure it does not clear anything before rendering
            this.renderer.autoClear = false;
            this.renderer.autoClearDepth = false;
            this.renderer.autoClearColor = false;
            this.renderer.autoClearStencil = false;

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera();

            // Create lights that will resemble the sun light lighting that we do internally
            this._createLights();

            // Create objects and add them to the scene
            this._createObjects();

            // Set starting geometries
            this._updateObjects();
        },
        render: function (context) {
            // Make sure to reset the internal THREE.js state
            this.renderer.resetGLState();

            // Update the THREE.js camera so it's synchronized to our camera
            this._updateCamera(context);

            // Update the THREE.js lights so it's synchronized to our light
            this._updateLights(context);

            // Advance current geometry
            this._updateObjects(context);

            // Render the scene
            this.renderer.render(this.scene, this.camera);

            // Immediately request a new redraw
            externalRenderers.requestRender(this.view);
        },
        dispose: function (content) { },
        _createObjects: function () {
            // 
            var scope = this;

            this.tracks.forEach(function (track) {
                // Get the length of the longest track
                scope.max = Math.max(scope.max, track.length);

                // Create plane without geometry. Attach user data.
                var mesh = new THREE.Mesh(undefined, new THREE.MeshPhongMaterial({
                    color: COLOR
                }));
                mesh.userData.offset = Math.floor((Math.random() * (track.length - 1)));
                mesh.userData.geometries = track.map(function (e) {
                    // Convert lat/long to radians
                    var lon = e.x * Math.PI / 180 - Math.PI;
                    var lat = e.y * Math.PI / 180 - Math.PI / 2;

                    // Get direction
                    var azm = Math.atan2(e.dx, e.dy);
                    if (azm < 0) { azm += 2 * Math.PI; }

                    // Create vector to 
                    var q = new THREE.Vector3(RADIUS + OFFSET, 0, 0);
                    q.applyAxisAngle(new THREE.Vector3(0, 1, 0), lat);
                    q.applyAxisAngle(new THREE.Vector3(0, 0, 1), lon);

                    // Create plane
                    var s = SIZE / 2;

                    // Add vectices
                    var geometry = new THREE.Geometry();
                    geometry.vertices.push(new THREE.Vector3(0, 0, 0));
                    geometry.vertices.push(new THREE.Vector3(-s, s, 0));
                    geometry.vertices.push(new THREE.Vector3(0, s, 0));
                    geometry.vertices.push(new THREE.Vector3(s, 0, 0));
                    geometry.vertices.push(new THREE.Vector3(0, -s, 0));
                    geometry.vertices.push(new THREE.Vector3(-s, -s, 0));

                    // Add faces
                    geometry.faces.push(new THREE.Face3(2, 1, 0));
                    geometry.faces.push(new THREE.Face3(3, 2, 0));
                    geometry.faces.push(new THREE.Face3(4, 3, 0));
                    geometry.faces.push(new THREE.Face3(5, 4, 0));

                    geometry.computeFaceNormals();

                    // Apply arrow orientation
                    geometry.rotateZ(azm);

                    // Apply image centering
                    geometry.translate(SIZE, SIZE, 0);

                    // Local rotation to compensate for Earth curvature
                    geometry.rotateY(lat + Math.PI / 2);
                    geometry.rotateZ(lon);

                    // Apply world coordinate transformation
                    geometry.translate(q.x, q.y, q.z);

                    return geometry;
                });

                // Add plane to scene
                scope.scene.add(mesh);
            });
        },
        _createLights: function () {
            // Create both a directional light, as well as an ambient light
            this.directionalLight = new THREE.DirectionalLight();
            this.scene.add(this.directionalLight);

            this.ambientLight = new THREE.AmbientLight();
            this.scene.add(this.ambientLight);
        },
        _updateCamera: function (context) {
            // Get Esri's camera
            var c = context.camera;

            // Update three.js camera
            this.camera.projectionMatrix.fromArray(c.projectionMatrix);
            this.camera.position.set(c.eye[0], c.eye[1], c.eye[2]);
            this.camera.up.set(c.up[0], c.up[1], c.up[2]);
            this.camera.lookAt(new THREE.Vector3(c.center[0], c.center[1], c.center[2]));
        },
        _updateLights: function (context) {
            // Get Esri's current sun settings
            var direction = context.sunLight.direction;
            var diffuse = context.sunLight.diffuse;

            // Update the directional light color, intensity and position
            this.directionalLight.color.setRGB(diffuse.color[0], diffuse.color[1], diffuse.color[2]);
            this.directionalLight.intensity = diffuse.intensity;
            this.directionalLight.position.set(direction[0], direction[1], direction[2]);

            // Update the ambient light color and intensity
            var ambient = context.sunLight.ambient;
            this.ambientLight.color.setRGB(ambient.color[0], ambient.color[1], ambient.color[2]);
            this.ambientLight.intensity = ambient.intensity;
        },
        _updateObjects: function (context) {
            // Only update shapes every ~75ms
            var now = Date.now();
            if (now - this.refresh < REST) { return; }
            this.refresh = now;

            // Loop for every shape
            var scope = this;
            this.scene.children.forEach(function (e) {
                // Create a new offset index
                var index = scope.index + e.userData.offset;
                if (index > scope.max) {
                    index -= scope.max;
                }

                // Ignore other shapes
                if (e.type === 'Mesh') {
                    if (index >= e.userData.geometries.length) {
                        e.visible = false;
                    } else {
                        e.geometry = e.userData.geometries[index];
                        e.visible = true;
                    }
                }
            });

            // Increment the drawing index
            this.index++;
            if (this.index >= this.max) {
                this.index = 0;
            }
        }
    });
});
