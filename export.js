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

require([
    'esri/layers/support/Raster',
    'dojo/dom',
    'dojo/Deferred',
    'dojo/promise/all',
    'dojo/domReady!'
],
function (
        Raster,
        dom,
        Deferred,
        all
    ) {
    // Enforce strict mode
    'use strict';

    // Constants
    var URLS = {
        fall: {
            forward: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_forward_fall/ImageServer',
            back: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_back_fall/ImageServer',
            velocity: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/velocity_fall/ImageServer'
        },
        spring: {
            forward: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_forward_spring/ImageServer',
            back: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_back_spring/ImageServer',
            velocity: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/velocity_spring/ImageServer'
        },
        summer: {
            forward: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_forward_summer/ImageServer',
            back: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_back_summer/ImageServer',
            velocity: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/velocity_summer/ImageServer'
        },
        winter: {
            forward: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_forward_winter/ImageServer',
            back: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/direction_back_winter/ImageServer',
            velocity: 'http://maps.esri.com/apl15/rest/services/OceanCurrents/velocity_winter/ImageServer'
        }
    };

    //
    all([
        loadPixels(URLS.fall.forward),
        loadPixels(URLS.fall.velocity),
        loadPixels(URLS.spring.forward),
        loadPixels(URLS.spring.velocity),
        loadPixels(URLS.summer.forward),
        loadPixels(URLS.summer.velocity),
        loadPixels(URLS.winter.forward),
        loadPixels(URLS.winter.velocity)
    ]).then(function (results) {
        var data = [];
        for (var i = 0; i < 360 * 180; i++) {
            if (results[0].values[i] !== results[0].noData) {
                data.push([
                    i,                                            // Index from 0 to 64799
                    Math.round(results[0].values[i]),             // Fall direction (degrees)
                    Math.round(results[1].values[i] * 100) / 100, // Fall velocity (km/hr)
                    Math.round(results[2].values[i]),             // Spring direction
                    Math.round(results[3].values[i] * 100) / 100, // Spring velocity
                    Math.round(results[4].values[i]),             // Summer direction
                    Math.round(results[5].values[i] * 100) / 100, // Summer velocity
                    Math.round(results[6].values[i]),             // Winter direction
                    Math.round(results[7].values[i] * 100) / 100  // Winter velocity
                ]);
            }
        }
        dom.byId('data').innerHTML = JSON.stringify(data);
    });

    function loadPixels(url) {
        var deferred = new Deferred();
        var options = {
            imageServiceParameters: {
                format: 'lerc',
                size: '360, 180',
                bbox: '-180, -90, 180, 90'
            },
            nBands: 1,
            pixelType: 'F32'
        };
        var raster = new Raster({
            url: url
        });
        raster.read(options).then(function (e) {
            deferred.resolve({
                values: e.pixelData.pixelBlock.pixels[0],
                noData: e.pixelData.pixelBlock.statistics[0].noDataValue,
                min: e.pixelData.pixelBlock.statistics[0].minValue,
                max: e.pixelData.pixelBlock.statistics[0].maxValue
            });
        });
        return deferred.promise;
    }
});
