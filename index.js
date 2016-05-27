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

require({
    packages: [{
        name: 'app',
        location: document.location.pathname + '/..'
    }]
}, [
    'esri/Map',
    'esri/views/SceneView',
    'esri/views/3d/externalRenderers',
    'app/renderers/arrows',
    'app/renderers/lines',
    'dojo/_base/xhr',
    'dojo/domReady!'
],
function (
    Map,
    SceneView,
    ExternalRenderers,
    Arrows,
    Lines,
    xhr
    ) {
    // Enforce strict mode
    'use strict';

    //
    var SPEED = 1;
    var LATITUDE_BUFFER = 25;
    var TRACK_VECTORS_MIN = 5;

    //
    var _hash = {};
    var _externalRenderer = null;

    // Update UI
    updateMenu();

    // Create map and view
    var _view = new SceneView({
        container: 'map',
        ui: {
            components: [
                'zoom',
                'compass'
            ]
        },
        padding: {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0
        },
        center: [40, 22],
        environment: {
            lighting: {
                directShadowsEnabled: false,
                ambientOcclusionEnabled: false,
                cameraTrackingEnabled: true
            },
            atmosphereEnabled: 'default',
            atmosphere: {
                quality: 'low'
            },
            starsEnabled: false
        },
        map: new Map({
            basemap: 'dark-gray'
        })
    })
    _view.then(function () {
        xhr.get({
            url: 'data/data.js',
            handleAs: 'json',
            load: function (points) {
                // Load ocean current data to spatial hash table
                for (var i = 0; i < points.length; i++) {
                    var point = points[i];
                    var id = point[0];
                    var lattitude = Math.floor(id / 360);
                    if (lattitude < LATITUDE_BUFFER || lattitude > 180 - LATITUDE_BUFFER) { continue; }
                    point.shift();
                    _hash[id] = point;
                }

                // Load renderer
                loadRenderer();
            }
        });
    });

    function interpolateCurrent(e, season) {
        // Use bilinear interpolation to find intermediary direction and velocity.
        // Get the four nearest current vectors (if any).
        var fx = Math.floor(e.x);
        var fy = Math.floor(e.y);
        var ul = getCurrent({ x: fx + 0, y: fy + 0 }, season);
        var ur = getCurrent({ x: fx + 1, y: fy + 0 }, season);
        var ll = getCurrent({ x: fx + 0, y: fy + 1 }, season);
        var lr = getCurrent({ x: fx + 1, y: fy + 1 }, season);

        // Remove missing current vectors.
        var nn = [ul, ur, ll, lr].filter(function (f) {
            return f !== null;
        });

        // Calculate squared distance from interpolate point to current vector.
        nn.forEach(function (f) {
            f.xy = Math.pow(f.x - e.x, 2) + Math.pow(f.y - e.y, 2)
        });

        // Get sum of squared distances.
        var ln = nn.reduce(function (p, c) {
            return p + c.xy;
        }, 0);

        // Get a weighted average of the delta x and y.
        var dx = 0;
        var dy = 0;
        nn.forEach(function (f) {
            dx += f.dx * (1 - f.xy / ln);
            dy += f.dy * (1 - f.xy / ln);
        });

        // Return mean current vector
        return {
            x: e.x,
            y: e.y,
            dx: dx,
            dy: dy
        };
    }
    function extrapolateCurrent(e) {
        return {
            x: e.x + SPEED * e.dx,
            y: e.y + SPEED * e.dy
        };
    }
    function getCurrent(e, season) {
        var i = e.x + e.y * 360;
        if (i in _hash) {
            var h = _hash[i];
            var a = null;
            var m = null;
            switch (season) {
                case 'Summer':
                    a = h[4];
                    m = h[5];
                    break;
                case 'Fall':
                    a = h[0];
                    m = h[1];
                    break;
                case 'Winter':
                    a = h[6];
                    m = h[7];
                    break;
                case 'Spring':
                    a = h[2];
                    m = h[3];
                    break;
            }
            var v = new THREE.Vector2(
                Math.sin(a * Math.PI / 180),
                -Math.cos(a * Math.PI / 180)
            );
            v.normalize();
            v.multiplyScalar(m);
            return {
                x: e.x,
                y: e.y,
                dx: v.x,
                dy: v.y
            };
        }
        return null;
    }
    function loadRenderer() {
        // Remove old renderer
        if (_externalRenderer) {
            ExternalRenderers.remove(_view, _externalRenderer);
        }

        // User defined settings
        var type = $('.rc-type li.active a').html();
        var season = $('.rc-season li.active a').html();
        var trackcount = Number($('.rc-count li.active a').html());
        var tracklength = Number($('.rc-length li.active a').html());

        // Tracks array
        var tracks = [];

        // Loops until we have generated enough tracks
        while (tracks.length < trackcount) {
            // Vectors for a single track
            var track = [];

            // Start with a random location
            var first = getCurrent({
                x: Math.floor(Math.random() * 360),
                y: Math.floor(Math.random() * 180)
            }, season);

            // Skip if nearby current vector does not exist in hashtable
            if (first === null) { continue; }
            track.push(first);

            // Advance vector
            for (var j = 0; j < tracklength; j++) {
                var last = track[track.length - 1];
                var next = extrapolateCurrent(last);
                var inter = interpolateCurrent(next, season);
                if (inter === null) { break; }
                track.push(inter);
            }

            // Discard track is threshold length not met
            if (track.length < TRACK_VECTORS_MIN) { continue; }

            // Store generalized line
            tracks.push(track);
        }

        // Create renderer
        switch (type) {
            case 'Arrows':
                _externalRenderer = new Arrows(_view, tracks);
                break;
            case 'Lines':
                _externalRenderer = new Lines(_view, tracks);
                break;
        }

        // Add renderer
        ExternalRenderers.add(
            _view,
            _externalRenderer
        );
    }
    function updateMenu() {
        $('.dropdown-menu').each(function () {
            $(this).siblings('a').find('.rc-itemValue').html(
                $(this).find('li.active a').html()
            );
        });
    }
    // 
    $('.dropdown-menu li a').click(function () {
        // Exit if menu item is already checked.
        if ($(this).parent().hasClass('active')) { return; }

        // Toggle checked state for clicked menu item.
        $(this).parent().addClass('active').siblings().removeClass('active');

        // Update UI
        updateMenu();

        // Reload renderer.
        loadRenderer();
    });
    $('#buttonAbout').click(function () {
        $('#modalAbout').modal('show');
    });
    $('.modal a').attr('target', '_blank');
});
