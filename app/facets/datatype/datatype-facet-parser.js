angular.module('facets')

    .factory('datatypeFacetParser', ['otDictionary', 'otConsts', 'datasourceFacetParser', function (otDictionary, otConsts, datasourceFacetParser) {
        'use strict';


        var datatypes = [
            {key: otConsts.datatypes.GENETIC_ASSOCIATION, selected: true},
            {key: otConsts.datatypes.SOMATIC_MUTATION, selected: true},
            {key: otConsts.datatypes.KNOWN_DRUG, selected: true},
            {key: otConsts.datatypes.AFFECTED_PATHWAY, selected: true},
            {key: otConsts.datatypes.RNA_EXPRESSION, selected: true},
            {key: otConsts.datatypes.LITERATURE, selected: true},
            {key: otConsts.datatypes.ANIMAL_MODEL, selected: false}
        ];


        var parser = {};

        /**
         * Parse function
         * Every FacetParser *must* expose a parse() function.
         * The function essentially maps and returns the filters (values) for a specific collection
         * (i.e. a facet, like the datatype facet or score distribution facet).
         *
         * Parser function must take the following parameters:
         *     config [Object] config object for the collection; contains key and options object
         *     data [Object] the data object for this facet (from the API)
         *     countsToUse [String] e.g. "unique_disease_count"
         *     isSelected [Function] this is the FiltersService.isSelected(). The problem is we cannot reference the FiltersService here (circular dependency)
         *
         * It returns an Array of filters.
         */
        parser.parse = function (config, data, countsToUse, isSelected) {
            // set array of filters
            config.filters = datatypes.map(function (obj) {
                var conf = {};
                var def = {};
                def[countsToUse] = {};
                var dtb = data.buckets.filter(function (o) { return o.key === obj.key; })[0] || def;
                conf.key = obj.key;
                conf.label = otDictionary[obj.key.toUpperCase()] || '';
                conf.count = dtb[countsToUse].value; // dtb.doc_count;
                conf.enabled = dtb.key !== undefined; // it's actually coming from the API and not {}
                conf.selected = isSelected(config.key, obj.key); // && conf.count>0;    // do we want to show disabled items (with count==0) as selected or not?
                conf.facet = config.key;
                conf.collection = null;

                if (dtb.datasource) {
                    // if there are subfilters, we pass those as a Collection config object with the parameter "filters"
                    conf.collection = {
                        filters: datasourceFacetParser.parse({key: 'datasources'}, dtb.datasource, countsToUse, isSelected).filters
                    };
                }

                /* .filter( function(obj){
                    // Use a filter function to keep only those returned by the API??
                    return obj.count>0;
                });*/

                return conf;
            });

            return config;
        };

        return parser;
    }]);

