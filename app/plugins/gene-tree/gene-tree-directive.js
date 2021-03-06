angular.module('otPlugins')
    .directive('otGeneTree', ['otColumnFilter', 'otUtils', '$timeout', 'otConsts', '$log', function (otColumnFilter, otUtils, $timeout, otConsts, $log) {
        'use strict';

        return {
            restrict: 'E',
            templateUrl: 'plugins/gene-tree/gene-tree.html',

            scope: {
                target: '=',
                width: '='
            },
            link: function (scope) {
                var width = scope.width - 40;

                // Gene tree
                var gt = targetGeneTree()
                    .id(scope.target.id)
                    .width(width)
                    .proxy(otConsts.PROXY + 'rest.ensembl.org')
                    .on('notFound', function () {
                        scope.notFound = 1;
                    });

                $timeout(function () {
                    var el = document.getElementById('gene-tree');
                    gt(el);
                }, 0);

                if (otUtils.browser.name !== 'IE') {
                    scope.toExport = function () {
                        return document.getElementById('gene-tree').querySelector('svg');
                    };
                }

                // Orthology table
                var homologyType = {
                    'ortholog_one2one': 'ortholog 1:1',
                    'ortholog_one2many': 'ortholog 1:many',
                    'within_species_paralog': 'paralog'
                };

                var scientific2common = {
                    'homo_sapiens': 'Human',
                    'mus_musculus_reference': 'Mouse',
                    'mus_musculus': 'Mouse',
                    'cavia_porcellus': 'Guinea pig',
                    'macaca_mulatta': 'Macaque',
                    'canis_lupus_familiaris': 'Dog',
                    'canis_familiaris': 'Dog',
                    'oryctolagus_cuniculus': 'Rabbit',
                    'rattus_norvegicus': 'Rat',
                    'sus_scrofa': 'Pig',
                    'sus_scrofa_usmarc': 'Pig',
                    'xenopus_tropicalis': 'Frog',
                    'danio_rerio': 'Zebrafish',
                    'drosophila_melanogaster': 'Fly',
                    'caenorhabditis_elegans': 'Worm',
                    'pan_troglodytes': 'Chimpanzee',
                    'mus_musculus_reference_(CL57BL6)': 'Mouse',
                    'caenorhabditis_elegans_N2': 'Worm'
                };


                function formatHomologuesDataToArray (data, info) {
                    var tableData = [];
                    data.forEach(function (item) {
                        var row = [];

                        // Target species
                        row.push(scientific2common[item.target.species]);

                        // Homology type
                        row.push(homologyType[item.type] || 'N/A');

                        // Orthologue
                        var displayName = (info[item.target.id].display_name) ? info[item.target.id].display_name : '';
                        if (displayName) {
                            row.push(displayName + (displayName ? ' ' : '') + '(<a href="http://www.ensembl.org/' + item.target.species + '/Gene/Summary?g=' + item.target.id + '" target="_blank">' + item.target.id + ')');
                        } else {
                            row.push('<a href="http://www.ensembl.org/' + item.target.species + '/Gene/Summary?g=' + item.target.id + '" target="_blank">' + item.target.id);
                        }

                        // dN/dS
                        row.push(item.dn_ds || 'N/A');

                        // Query %id
                        row.push(item.source.perc_id);

                        // Target %id
                        row.push(item.target.perc_id);

                        // hidden columns for filtering
                        // row.push(displayName);

                        tableData.push(row);
                    });

                    return tableData;
                }

                // target_taxon=9598;target_taxon=7227;target_taxon=6239
                var species = [9606, 10090, 10141, 9544, 9615, 9986, 10116, 9823, 8364, 7955, 9598, 7227, 6239];


                var rest = tnt.ensembl()
                    .proxyUrl(otConsts.PROXY + 'rest.ensembl.org');

                var homologsUrl = rest.url.homologues({
                    'id': scope.target.id,
                    'target_taxons': species,
                    'format': 'full'
                });
                scope.showSpinner = true;
                rest.call(homologsUrl)
                    .then(function (resp) {
                        var infoUrl = otConsts.PROXY + 'rest.ensembl.org/lookup/id/';
                        var infoTargets = [];
                        var homologies = resp.body.data[0].homologies.filter(
                            function (d) {
                                if (!scientific2common[d.target.species]) {
                                    $log.warn('Species not found: ' + d.target.species);
                                }
                                return scientific2common[d.target.species];
                            }
                        );
                        homologies.forEach(function (h) {
                            infoTargets.push(h.target.id);
                        });
                        var post = {
                            ids: infoTargets
                        };
                        rest.call(infoUrl, post)
                            .then(function (resp2) {
                                scope.showSpinner = false;
                                $timeout(function () {
                                    var dropdownColumns = [0, 1];
                                    $('#gene-homologues-table').DataTable(otUtils.setTableToolsParams({
                                        'data': formatHomologuesDataToArray(homologies, resp2.body),
                                        'ordering': true,
                                        'order': [[4, 'desc']],
                                        'autoWidth': false,
                                        'paging': true,
                                        // 'columnDefs': [
                                        //     {
                                        //         'targets': [2],
                                        //         'width': '14%',
                                        //         'mRender': otColumnFilter.mRenderGenerator(6),
                                        //         'mData': otColumnFilter.mDataGenerator(2, 6)
                                        //     }
                                        // ],
                                        initComplete: otColumnFilter.initCompleteGenerator(dropdownColumns)
                                    }, scope.target.id + '-homologies'));
                                }, 0);
                            });
                    });
            }
        };
    }]);
