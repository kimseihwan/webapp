    'use strict';

    /* Controllers */

    angular.module('cttvControllers', ['cttvServices']).






    /**
     * High level controller for the app
     */
    controller('CttvAppCtrl', ['$scope',  function ($scope) {
        
    }])



/**
 * DiseaseCtrl
 * Controller for the disease page
 * It loads general information about a given disease
 */
    .controller ('DiseaseCtrl', ["$scope", "$location", "$log", function ($scope, $location, $log) {
	$log.log("DiseaseCtrl()");
	var cttvRestApi = cttvApi();
	var efo_code = $location.url().split("/")[2];
	var url = cttvRestApi.url.disease({'efo' : efo_code});
	$log.log(url);
	cttvRestApi.call(url)
	    .then (function (resp) {
		resp = JSON.parse(resp.text);
		resp.path_labels.shift(); // remove cttv_disease
		resp.path_codes.shift(); // remove cttv_disease
		var path = [];
		for (var i=0; i<resp.path_labels.length; i++) {
		    path.push({
			"label" : resp.path_labels[i],
			"efo" : resp.path_codes[i]
		    });
		}
		if (resp.efo_synonyms.length === 0) {
		    resp.efo_synonyms.push(resp.label);
		}
		$scope.disease = {
		    "label" : resp.label,
		    "efo" : efo_code,
		    "description" : resp.definition || resp.label,
		    "synonyms" : _.uniq(resp.efo_synonyms),
		    "path" : path
		};

		// Update bindings
		$scope.$apply();
	    })
    }])

/**
 * TargetCtrl
 * Controller for the target page
 * It loads information about a given target
 */
    .controller ("TargetCtrl", ["$scope", "$location", "$log", function ($scope, $location, $log) {
	$log.log('TargetCtrl()');
	var cttvRestApi = cttvApi();
	var geneId = $location.url().split("/")[2];
	var url = cttvRestApi.url.gene({'gene_id' : geneId});
	$log.log(url);

	cttvRestApi.call(url)
	    .then(function (resp) {
		resp = JSON.parse(resp.text);
		$scope.target = {
		    label : resp.approved_name || resp.ensembl_external_name,
		    symbol : resp.approved_symbol || resp.approved_name || resp.ensembl_external_name,
		    id : resp.approved_id || resp.ensembl_gene_id,
		    description : resp.uniprot_function[0]
		};

		// Synonyms
		var syns = {};
		var synonyms = resp.synonyms;
		if (synonyms !== undefined) {
		    for (var i=0; i<synonyms.length; i++) {
			syns[synonyms[i]] = 1;
		    }
		}
		var prev_symbols = resp.previous_symbols;
		if (prev_symbols !== undefined) {
		    for (var j=0; j<prev_symbols.length; j++) {
			syns[prev_symbols[j]] = 1;
		    }
		}
		$log.log(synonyms);
		$scope.synonyms = _.keys(syns);

		// Uniprot
		$scope.uniprot = {
		    id : resp.uniprot_id,
		    subunits : resp.uniprot_subunit,
		    locations : resp.uniprot_subcellular_location,
		    accessions : resp.uniprot_accessions,
		    keywords : resp.uniprot_keywords
		}

		// Ensembl
		var isHuman = resp.ensembl_gene_id.substring(0,4) === "ENSG";
		$scope.ensembl = {
		    id : resp.ensembl_gene_id,
		    description : resp.ensembl_description,
		    isHuman : isHuman,
		    chr : resp.chromosome,
		    start : resp.gene_start,
		    end : resp.gene_end
		};
		
		// GO terms
		var goterms = _.filter(resp.dbxrefs, function (t) {return t.match(/^GO:/)});
		var cleanGoterms = _.map(goterms, function (t) {return t.substring(3, t.length)});
		var uniqGoterms = _.uniq(cleanGoterms);
		$scope.goterms = uniqGoterms;

		// Expression Atlas
		$scope.toggleBaselineExpression = function () {
		    $scope.eaTarget = resp.ensembl_gene_id;
		};
		$scope.toggleGenomeLocation = function () {
		    $scope.chr = resp.chromosome,
		    $scope.genomeBrowserGene = resp.ensembl_gene_id;
		}

		// Bibliography
		var bibliography = _.filter(resp.dbxrefs, function (t) {return t.match(/^PubMed/)});
		var cleanBibliography = _.map(bibliography, function (t) {return t.substring(7, t.length)});
		var bibliographyStr = cleanBibliography.join (",");
		$scope.pmids = bibliographyStr;
		$scope.pmidsLinks = (_.map(cleanBibliography,function (p) {return "EXT_ID:" + p})).join(" OR ");

		// Update the bindings
		$scope.$apply();
	    });
    }]).

    /**
     * AssociationsCtrl
     * Controller for the target associations page
     * It loads a list of associations for the given search
     */
    // controller('AssociationsCtrl', ['$scope', '$location', '$log', 'cttvAppToAPIService', 'cttvAPIservice', function ($scope, $location, $log, cttvAppToAPIService, cttvAPIservice) {
    controller ("AssociationsCtrl", ['$scope', '$location', '$log', function ($scope, $location, $log) {
        $log.log('AssociationsCtrl()');
        $scope.search = {
    	    query : $location.search().q,
    	    label : $location.search().label
        };
        $scope.nresults = 0;
        // $scope.search = cttvAppToAPIService.createSearchInitObject();

	// Display toggle (bubbles / table)
	$scope.displaytype = "bubbles";
	$scope.setDisplay = function (displ) {
	    $scope.displaytype = displ;
	}
    }]).

    /**
     * SearchAppCtrl
     * Controller for the search/results page
     */
    controller('SearchAppCtrl', ['$scope', '$location', '$log', 'cttvAppToAPIService', 'cttvAPIservice', function ($scope, $location, $log, cttvAppToAPIService, cttvAPIservice) {
        
        $log.log('SearchCtrl()');

        
        $scope.search = cttvAppToAPIService.createSearchInitObject();
        $scope.filters = {
            gene : {
                total : 0,
                selected: false
            },
            efo : {
                total : 0,
                selected : false
            }
        }

        /**
        Something like:
            {
                query:{
                    q: APP_QUERY_Q, // ""
                    page: APP_QUERY_PAGE,   // 1
                    size: APP_QUERY_SIZE    // 10
                },

                results:{}
            }
        */

        var getFiltersData = function(){

            cttvAPIservice.getSearch({
                    q: $scope.search.query.q,
                    size : 1,
                    filter : 'gene'
                }).
                then(
                    function(resp) {
                        $log.info(resp);
                        $scope.filters.gene.total = resp.body.total;
                    },
                    cttvAPIservice.defaultErrorHandler
                );

            cttvAPIservice.getSearch({
                    q: $scope.search.query.q,
                    size : 1,
                    filter : 'efo'
                }).
                then(
                    function(resp) {
                        $log.info(resp);
                        $scope.filters.efo.total = resp.body.total;
                    },
                    cttvAPIservice.defaultErrorHandler
                );

        }



        $scope.getResults = function(){
            //$log.log("SEARCH URL: ");
            //$log.log(cttvAppToAPIService.getApiQueryObject(cttvAppToAPIService.SEARCH, $scope.search.query));
            var queryobject = cttvAppToAPIService.getApiQueryObject(cttvAppToAPIService.SEARCH, $scope.search.query);
            // if one and only one of the filters is selected, apply the corresponding filter
            // cool way of mimicking a XOR operator ;)
            if( $scope.filters.gene.selected != $scope.filters.efo.selected ){
                queryobject.filter = $scope.filters.gene.selected ? 'gene' : 'efo';
            }
            

            
            cttvAPIservice.getSearch( queryobject )
                .then(
                    function(resp) {
                        $log.info(resp);
                        $scope.search.results = resp.body;
                    },
                    cttvAPIservice.defaultErrorHandler
                );

        }


        if($location.search().q){
            // parse parameters
            $scope.search.query.q = $location.search().q || "";

            // need a way of parsing filters too...

            // and fire the search
            $scope.getResults();
            getFiltersData();
        }


    }]).



    controller('SearchResultsCtrl', ['$scope', '$http', '$location', function ($scope, $http, $location) {
        
    }]).


    controller('MastheadCtrl', ['$scope', '$location', '$log', function ($scope, $location, $log) {
        
        $log.log('MastheadCtrl()');
        $scope.location = $location;

    }]).

    controller('D3TestCtrl', ['$scope', '$log', function ($scope, $log) {
        $log.log("D3TestCtrl");
    }])



