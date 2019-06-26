angular.module('otDirectives')
    .directive('otDrugSummary', ['otApi', 'otUtils', 'otDictionary', 'otUpperCaseFirstFilter', function (otApi, otUtils, otDictionary, otUpperCaseFirstFilter) {
        'use strict';

        function pngToDataUrl (url, callback, outputFormat) {
            var img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = function () {
                var canvas = document.createElement('CANVAS');
                var ctx = canvas.getContext('2d');
                var dataURL;
                canvas.height = this.height;
                canvas.width = this.width;
                ctx.drawImage(this, 0, 0);
                dataURL = canvas.toDataURL(outputFormat);
                callback(dataURL);
                canvas = null;
            };
            img.onerror = function (e) {
                // If the image is not found we get a 404 error and ugly broken image icon
                // In that case we invoke the callback with no data so that we can hide the image instead
                callback(undefined);
            };
            img.src = url;
        }

        return {
            restrict: 'E',
            templateUrl: 'src/components/drug-summary/drug-summary.html',
            scope: {
                drug: '='
            },
            link: function (scope) {
                scope.$watch('drug', function () {
                    if (!scope.drug) {
                        return;
                    }

                    // Get the information for the drug from API
                    otApi.getDrug({
                        method: 'GET',
                        params: {
                            id: scope.drug
                        }
                    })
                        .then(
                            function (resp) {
                                // General properties
                                scope.displayName = otUpperCaseFirstFilter((resp.body.pref_name || resp.body.molecule_chembl_id).toString().toLowerCase());
                                scope.mol_type = resp.body.type || otDictionary.NA;
                                scope.first_approval = resp.body.year_first_approved || otDictionary.NA;
                                scope.max_phase = resp.body.max_clinical_trial_phase || otDictionary.NA;
                                scope.internal = resp.body.internal_compound;
                                // TODO: full_molformula is currently not available in the API response
                                // if (resp.body.molecule_properties && resp.body.molecule_properties.full_molformula) {
                                //     scope.formula = resp.body.molecule_properties.full_molformula;
                                // } else {
                                //     scope.formula = otDictionary.NA;
                                // }

                                if (scope.mol_type.toLowerCase() !== 'antibody') {
                                    pngToDataUrl('https://www.ebi.ac.uk/chembl/api/data/image/' + scope.drug, function (base64Img) {
                                        var img = document.getElementById('drugDiagramContainer');
                                        if (base64Img) {
                                            img.setAttribute('src', base64Img);
                                        } else {
                                            img.style.visibility = 'hidden';
                                        }
                                    });
                                }

                                // Mechanism of action...
                                // TODO: process references
                                scope.mechanisms = resp.body.mechanisms_of_action;

                                // Associated targets
                                otApi.getSearch({
                                    method: 'GET',
                                    params: {
                                        q: scope.displayName,
                                        size: 100,
                                        filter: 'target',
                                        search_profile: 'drug'
                                    }
                                })
                                    .then(function (targetsResp) {
                                        scope.targets = targetsResp.body.data.map(function (t) {
                                            return {
                                                id: t.id,
                                                name: t.data.approved_symbol
                                            };
                                        }).sort(function (a, b) {
                                            return (a.name < b.name) ? -1 : (a.name > b.name) ? 1 : 0;
                                        });
                                        if (scope.targets.length > 1) {
                                            scope.batchSearchTargets = otUtils.compressTargetIds(scope.targets.map(function (d) {
                                                return d.id;
                                            })).join(',');
                                        }
                                    });

                                // Associated diseases
                                otApi.getSearch({
                                    method: 'GET',
                                    params: {
                                        q: scope.displayName,
                                        size: 100,
                                        filter: 'disease',
                                        search_profile: 'drug'
                                    }
                                })
                                    .then(function (diseasesResp) {
                                        scope.diseases = diseasesResp.body.data.map(function (d) {
                                            return {
                                                id: d.id,
                                                label: otUtils.ucFirst(d.data.efo_label)
                                            };
                                        }).sort(function (a, b) {
                                            return (a.label < b.label) ? -1 : (a.label > b.label) ? 1 : 0;
                                        });
                                    });
                            },
                            function (err) {
                                // no drug data?
                                scope.noDrug = true;
                            }
                        );
                });
            }
        };
    }]);
