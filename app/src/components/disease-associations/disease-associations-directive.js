/* Directives */
angular.module('otDirectives')


/**
*
* Options for configuration are:
*   filename: the string to be used as filename when exporting the directive table to excel or pdf; E.g. "targets_associated_with_BRAF"
*   loadprogress: the name of the var in parent scope to be used as flag for API call progress update. E.g. laodprogress="loading"
*
* Example:
*   <ot-disease-associations target="{{search.query}}" filename="targets_associated_with_BRAF" loadprogress="loading"></ot-disease-associations>
*
*   In this example, "loading" is the name of the var in the parent scope, pointing to $scope.loading.
*   This is useful in conjunction with a spinner where you can have ng-show="loading"
*/
    .directive('otDiseaseAssociations', ['otUtils', 'otDictionary', 'otConsts', 'otApi', 'otGoogleAnalytics', function (otUtils, otDictionary, otConsts, otApi, otGoogleAnalytics) {
        'use strict';

        var filters = {};
        var targets = [];

        var colorScale = otUtils.colorScales.BLUE_0_1; // blue orig
        // var colorScale = d3.interpolateYlGnBu;

        // Controls pagination in datatables [Prev | Next] with the Next index
        // indexes contains an array of the indexes for all previous pages and the next one
        // currStart is needed to know if we are going forward (next) or backwards (prev).
        // currLength stores the current number of rows per page (this is needed because we revert to page 0 if this changes).
        var draw = 1;
        var indexes = [];
        var currStart = 0;
        var currLength;

        var state = {};

        var tableState; // initializes to undefined
        var searchDebounceId;

        /*
        * Generates and returns the string representation of the span element
        * with color information for each cell
        */
        var getColorStyleString = function (value, href) {
            var str = '';
            if (value <= 0) {
                str = '<span class=\'no-data\' title=\'No data\'></span>'; // quick hack: where there's no data, don't put anything so the sorting works better
            } else {
                var col = colorScale(value);
                var val = (value === 0) ? '0' : otUtils.floatPrettyPrint(value);
                str = '<span style=\'background: ' + col + ';\' title=\'Score: ' + val + '\'><span class="heatmap-cell-val">' + val + '</span></span>';
            }

            if (href && (value >= 0)) {
                str = '<a href=' + href + '>' + str + '</a>';
            }

            return str;
        };

        /*
        * Columns definitions
        */
        var cols = [
        // empty col for the gene symbol
            {name: '', title: otDictionary.TARGET_SYMBOL},
            // {name: "", title: otDictionary.ENSEMBL_ID},
            {name: '', title: otDictionary.ASSOCIATION_SCORE},
            // here are the datatypes:
            {name: otConsts.datatypes.GENETIC_ASSOCIATION.id, title: otConsts.datatypes.GENETIC_ASSOCIATION.label},
            {name: otConsts.datatypes.SOMATIC_MUTATION.id, title: otConsts.datatypes.SOMATIC_MUTATION.label},
            {name: otConsts.datatypes.KNOWN_DRUG.id, title: otConsts.datatypes.KNOWN_DRUG.label},
            {name: otConsts.datatypes.AFFECTED_PATHWAY.id, title: otConsts.datatypes.AFFECTED_PATHWAY.label},
            {name: otConsts.datatypes.RNA_EXPRESSION.id, title: otConsts.datatypes.RNA_EXPRESSION.label},
            {name: otConsts.datatypes.LITERATURE.id, title: otConsts.datatypes.LITERATURE.label},
            {name: otConsts.datatypes.ANIMAL_MODEL.id, title: otConsts.datatypes.ANIMAL_MODEL.label},
            // empty col for sorting by total score (sum)
            {name: '', title: 'total score'},
            // empty col for the gene name
            {name: '', title: otDictionary.TARGET_NAME}
        ];

        var a = [];
        for (var i = 0; i < cols.length; i++) {
            var columnData = {
                'title': '<div><span title=\'' + cols[i].title + '\'>' + cols[i].title + '</span></div>',
                'name': cols[i].name
            };
            a.push(columnData);
            // if datatype is configured to be expanded, add columns for individual datasources:
            var datatype = otUtils.getDatatypeById(cols[i].name);
            if (datatype && datatype.showExpanded) {
                datatype.datasources.forEach(function (element) {
                    var datasource = otConsts.datasources[element];
                    columnData = {
                        'title': '<div><span style=\'color:lightgrey\' class=\'' + datasource.customLabelStylingClass + '\' title=\'' + element + '\'>' +
                                    datasource.label + '</span></div>',
                        'name': element
                    };
                    a.push(columnData);
                });
            }
        }


        /*
        Setup the table cols and return the DT object
        */
        var setupTable = function (table, disease, filename, download) {
            var range = function (start, end) {
                var result = [];
                for (var i = start; i <= end; i++) {
                    result.push(i);
                }
                return result;
            };

            var t = $(table).DataTable({
                'destroy': true,
                'pagingType': 'simple',
                'dom': '<"clearfix" <"clear small" i><"pull-left small" f><"pull-right" B>>rt<"clearfix" <"pull-left small" l><"pull-right small" p>>',
                'buttons': [
                    {
                        text: '<span title="Download as .csv"><span class="fa fa-download"></span> Download .csv</span>',
                        action: download
                    }
                ],
                'columns': a,
                'columnDefs': [
                    {
                        'targets': [0],
                        'width': '30%'
                    },
                    {
                        'targets': [a.length - 2],
                        'className': 'never',
                        'visible': false
                    },
                    {
                        'targets': [a.length - 1],
                        'orderable': false,
                        'width': '30%'
                    },
                    {'orderSequence': ['desc', 'asc'], 'targets': range(1, a.length - 2)},
                    {'orderSequence': ['asc', 'desc'], 'targets': [0]}
                ],
                'processing': false,
                'serverSide': true,
                // 'searchDelay': 500,
                'ajax': function (data, cbak) {
                    if (!currLength) {
                        currLength = data.length;
                    }
                    if (data.length !== currLength) {
                        data.start = 0;
                        currLength = data.length;
                        indexes = [];
                        if (t) {
                            t.page('first');
                        }
                    }

                    // set table event listeners for tracking analytics
                    // tableState holds the previous state, if any:
                    // use it to check changes in state and fire appropriate tracking
                    // order is important! as certain params change depending on others and we don't want to track that
                    if (tableState) {
                        if (! _.isEqual(tableState.order, data.order)) {
                            // table sorting
                            otGoogleAnalytics.trackEvent('associations', 'sort', 'columnName');
                        } else if (! _.isEqual(tableState.search, data.search)) {
                            // table search/filtering
                            clearTimeout(searchDebounceId);
                            if (data.search.value) {
                                // dubounce the search tracking call; built-in 'searchDelay' option fires unwanted events :/
                                searchDebounceId = setTimeout(function () {
                                    otGoogleAnalytics.trackEvent('associations', 'search', 'search-term-entered');
                                }, 700);
                            }
                        } else if (! _.isEqual(tableState.length, data.length)) {
                            // table length
                            otGoogleAnalytics.trackEvent('associations', 'dropdown', 'show-' + data.length + '-entries');
                        } else if (! _.isEqual(tableState.start, data.start)) {
                            // pagination
                            var label = (data.start > tableState.start) ? 'next' : 'previous';
                            otGoogleAnalytics.trackEvent('associations', 'btn-click', label);
                        }
                    }
                    // update table state with new data
                    tableState = data;

                    // Order options
                    // mappings:
                    // 0 => gene name alphabetically -- not supported in the api

                    // 1 => overall
                    // Datatypes (and possible datasources, for datatypes that are configured to show as expanded):
                    // 2 => genetic_association
                    // .. => somatic_mutation
                    // .. => known_drug
                    // .. => affected_pathway
                    // .. => rna_expression
                    // .. => text_mining
                    // N => animal_model
                    // last => overall -- hidden column
                    // xx => gene description -- not supported in the api, so not included in options
                    var mappings = {
                        0: 'target.gene_info.symbol',
                        1: 'association_score.overall'
                    };
                    // iterate over the data types of each column and add mappings accordingly:
                    cols.forEach(function (coldef) {
                        var datatype = otUtils.getDatatypeById(coldef.name);
                        if (datatype) {
                            mappings[Object.keys(mappings).length] = 'association_score.datatypes.' + datatype.id;
                            // if datatype is configured to be expanded, add columns for individual datasources:
                            if (datatype.showExpanded) {
                                datatype.datasources.forEach(function (element) {
                                    var datasource = otConsts.datasources[element];
                                    mappings[Object.keys(mappings).length] = 'association_score.datasources.' + datasource.id;
                                });
                            }
                        }
                    });
                    mappings[Object.keys(mappings).length] = 'association_score.overall';

                    var order = [];
                    for (var i = 0; i < data.order.length; i++) {
                        var prefix = data.order[i].dir === 'asc' ? '~' : '';
                        order.push(prefix + mappings[data.order[i].column]);
                    }

                    // TODO: put this back if we put the state back
                    // data.start = stt.p*data.length || data.start;   // NaN || data.start in case it's not defined
                    var searchValue = (data.search.value).toLowerCase();

                    var opts = {
                        disease: [disease],
                        facets: false,
                        size: data.length,
                        // from: data.start,
                        sort: order,
                        search: searchValue,
                        draw: draw
                    };

                    var currPage = data.start / data.length;

                    // Control pagination
                    if (data.start > currStart) {
                        // We are moving forward...
                        opts.next = indexes[currPage];
                    } else if (data.start < currStart) {
                        // We are moving backwards...
                        opts.next = indexes[currPage];
                    }

                    // set targets and filter (facets) options from the corresponding directive var:
                    // we don't have access to the scope here, and we don't want to pass these as arguments to setup()
                    // or it will fail to update when firing the ajax call.
                    if (targets && targets.length) {
                        opts.target = targets;
                    }
                    opts = otApi.addFacetsOptions(filters, opts);

                    var queryObject = {
                        method: 'POST',
                        params: opts
                    };

                    otApi.getAssociations(queryObject)
                        .then(function (resp) {
                            var dtData = parseServerResponse(resp.body.data);
                            var o = {
                                recordsTotal: resp.body.total,
                                recordsFiltered: resp.body.total,
                                data: dtData,
                                draw: draw
                            };

                            // To control pagination
                            indexes[currPage + 1] = resp.body.next;
                            currStart = data.start;

                            draw++;
                            cbak(o);
                        });
                },

                'order': [[1, 'desc']],
                'orderMulti': false,
                'autoWidth': false,
                'ordering': true,
                'lengthMenu': [[10, 50, 200, 500], [10, 50, 200, 500]],
                'pageLength': 50,
                'language': {
                    // "lengthMenu": "Display _MENU_ records per page",
                    // "zeroRecords": "Nothing found - sorry",
                    'info': 'Showing _START_ to _END_ of _TOTAL_ targets'
                    // "infoEmpty": "No records available",
                    // "infoFiltered": "(filtered from _MAX_ total records)"
                }
            }, filename);

            return t;
        };

        function parseServerResponse (data) {
            var newData = new Array(data.length);

            var getPanelLink = function (datatypeId, datasourceId) {
                // checks if datasource has its own panel (property hasCustomPanel)
                var datasource = otUtils.getDatasourceById(datasourceId.toLowerCase());
                return (datasource.hasCustomPanel ? datasourceId : datatypeId);
            };

            var getScore = function (d, dt) {
                // TODO - remove unnecessary 2nd part of condition (&& !data[d].evidence_count.datatypes[dt])
                return (!data[d].association_score.datatypes[dt] && !data[d].evidence_count.datatypes[dt]) ? -1 : data[d].association_score.datatypes[dt];
            };

            var getDatasourceScore = function (d, datasourceId) {
                return (!data[d].association_score.datasources[datasourceId]) ? -1 : data[d].association_score.datasources[datasourceId];
            };

            for (var i = 0; i < data.length; i++) {
                var row = [];
                var geneDiseaseLoc = '/evidence/' + data[i].target.id + '/' + data[i].disease.id;

                // target
                row.push('<a href=\'' + geneDiseaseLoc + '\' title=\'' + data[i].target.gene_info.symbol + '\'>' + data[i].target.gene_info.symbol + '</a>');

                // The association score
                row.push(getColorStyleString(data[i].association_score.overall, geneDiseaseLoc));

                // iterate over the data types
                cols.forEach(function (coldef) {
                    var datatype = otUtils.getDatatypeById(coldef.name);
                    if (datatype) {
                        // if datatype is configured to be expanded, add columns for individual datasources:
                        if (datatype.showExpanded) {
                            row.push(getColorStyleString(getScore(i, datatype.id)));
                            datatype.datasources.forEach(function (element) {
                                var datasource = otConsts.datasources[element];
                                row.push(getColorStyleString(getDatasourceScore(i, datasource.id), geneDiseaseLoc + (geneDiseaseLoc.indexOf('?') === -1 ? '?' : '&') + 'view=sec:' + getPanelLink(datatype.id, datasource.id)));
                            });
                        } else {
                            // add only main column, with href to this datatype's panel:
                            row.push(getColorStyleString(getScore(i, datatype.id), geneDiseaseLoc + (geneDiseaseLoc.indexOf('?') === -1 ? '?' : '&') + 'view=sec:' + datatype.id));
                        }
                    }
                });

                // Total score
                row.push(data[i].association_score.datatypes.genetic_association +
                data[i].association_score.datatypes.somatic_mutation +
                data[i].association_score.datatypes.known_drug +
                data[i].association_score.datatypes.rna_expression +
                data[i].association_score.datatypes.affected_pathway +
                data[i].association_score.datatypes.animal_model);

                // Push gene name again instead
                row.push('<a href=\'' + geneDiseaseLoc + '\' title=\'' + data[i].target.gene_info.name + '\'>' + data[i].target.gene_info.name + '</a>');

                // just for for internal use to see direct and indirect associations
                // if (data[i].is_direct === true) { row.push( ... ) }

                newData[i] = row;
            }
            return newData;
        }


        /*
         * TODO: currently not being called
         * Update function passes the current view (state) to the URL
         */
        // function update (id, st) { otLocationState.setStateFor(id, st); }


        /*
         * Renders page elements based on state from locationStateService
         */
        // function render (new_state, old_state) { state = .....}

        return {
            restrict: 'E',
            scope: {
                filename: '=',
                targets: '=',
                disease: '=',
                filters: '=',
                stateId: '@?'
            },
            templateUrl: 'src/components/disease-associations/disease-associations.html',
            link: function (scope, elem) {
                // TODO: initialize the state if we enable this feature
                // otLocationState.init();
                // state = otLocationState.getState()[scope.stateId] || {};

                // table itself
                var table = elem.children().eq(0).children().eq(0)[0];
                var dtable;

                // legend stuff
                scope.legendText = 'Score';
                scope.colors = [];

                for (var i = 0; i <= 100; i += 25) {
                    var j = i / 100;
                    scope.colors.push({color: colorScale(j), label: j});
                }
                scope.legendData = [
                    {label: 'No data', class: 'no-data'}
                ];

                scope.stateId = scope.stateId || 'dhm'; // Disease Heat Map ??

                // Download the whole table
                scope.downloadTable = function () {
                    otGoogleAnalytics.trackEvent('associations', 'download', 'CSV');
                    var size = 10000;
                    var totalText = '';
                    function columnsNumberOk (csv, n) {
                        var firstRow = csv.split('\n')[0];
                        var cols = firstRow.split(',');

                        return cols.length === n;
                    }

                    function getNextChunk (nextIndex) {
                        var opts = {
                            disease: [scope.disease],
                            facets: false,
                            format: 'csv',
                            size: size,
                            fields: ['target.gene_info.symbol',
                                'target.id',
                                'association_score.overall',
                                'association_score.datatypes.genetic_association',
                                'association_score.datatypes.somatic_mutation',
                                'association_score.datatypes.known_drug',
                                'association_score.datatypes.affected_pathway',
                                'association_score.datatypes.rna_expression',
                                'association_score.datatypes.literature',
                                'association_score.datatypes.animal_model',
                                'target.gene_info.name'
                            ]
                            // from: from
                        };
                        if (scope.targets && scope.targets.length) {
                            opts.target = scope.targets;
                        }

                        if (nextIndex) {
                            opts.next = nextIndex;
                        }

                        opts = otApi.addFacetsOptions(scope.filters, opts);

                        var queryObject = {
                            method: 'POST',
                            params: opts
                        };

                        return otApi.getAssociations(queryObject)
                            .then(function (resp) {
                                var moreText = resp.body;

                                if (columnsNumberOk(moreText, opts.fields.length)) {
                                    if (nextIndex) {
                                        // Not in the first page, so remove the header row
                                        moreText = moreText.split('\n').slice(1).join('\n');
                                    }
                                    totalText += moreText;
                                }
                            });
                    }

                    function getNextIndex (nextIndex) {
                        var opts = {
                            disease: [scope.disease],
                            facets: false,
                            size: size,
                            fields: ['thisfielddoesnotexist'] // only interested in the next index
                        };

                        if (nextIndex) {
                            opts.next = nextIndex;
                        }

                        opts = otApi.addFacetsOptions(scope.filters, opts);

                        var queryObject = {
                            method: 'POST',
                            params: opts
                        };

                        return otApi.getAssociations(queryObject)
                            .then(function (resp) {
                                return resp.body.next;
                            });
                    }

                    // Makes 2 calls to the api,
                    // The first one to take the next data (in csv)
                    // The second one to take the next index
                    function callNext (nextIndex) {
                        getNextChunk(nextIndex)
                            .then(function () {
                                return getNextIndex(nextIndex)
                                    .then(function (nextNext) {
                                        if (nextNext) {
                                            callNext(nextNext);
                                        } else {
                                            var b = new Blob([totalText], {type: 'text/csv;charset=utf-8'});
                                            saveAs(b, scope.filename + '.csv');
                                        }
                                    });
                            });
                    }

                    callNext();
                };


                // TODO: check this
                // Do we want the directive to listen for changes in the URL?
                // Probably so, but not with this implementation of DataTables...
                // So for now we leave it OUT
                // scope.$on(otLocationState.STATECHANGED, function (evt, new_state, old_state) {
                //     render( new_state, old_state ); // if there are no facets, no worries, the API service will handle undefined
                // });

                scope.$watchGroup(['filters', 'disease', 'targets'], function (attrs) {
                    filters = attrs[0];
                    targets = attrs[2];

                    // if the table has already been setup just reload the data
                    // Note that in the prioritization view we re-setup the table every time
                    if (dtable) {
                        dtable.ajax.reload();
                    } else {
                        dtable = setupTable(table, scope.disease, scope.filename, scope.downloadTable);
                    }

                    // listener for page and order changes
                    // dtable.on('page.dt', function () { });
                    // dtable.on('order.dt', function () { });
                });
            } // end link
        }; // end return
    }]);
