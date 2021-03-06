/*  Service to keep track of lazy loaded resources  */

angular.module('otServices')

    .factory('otLazy', [function () {
        'use strict';

        var ll = {
            import: function (file) {
                // Systemjs has already been configured based on config sections in app.js
                return System.import(file);
            }
        };

        return ll;
    }]);
