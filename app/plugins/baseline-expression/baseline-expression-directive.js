angular.module('otPlugins')
    .directive('otBaselineExpression', ['$timeout', '$http', 'otUtils', '$filter', function ($timeout, $http, otUtils, $filter) {
        'use strict';

        return {
            restrict: 'E',
            templateUrl: 'plugins/baseline-expression/baseline-expression.html',
            scope: {
                target: '=',
                width: '='
            },
            link: function (scope, element, attrs) {
                var w = scope.width - 40;
                var target = scope.target.symbol;
                scope.ext = {
                    // hasData: false // leave undefined to start with
                };

                $timeout(function () {
                    // Expression Atlas
                    expressionAtlasHeatmapHighcharts.render({
                        atlasUrl: 'https://www.ebi.ac.uk/gxa/',
                        target: 'gxaWidget',
                        query: {
                            species: 'homo sapiens',
                            geneQuery: scope.target.ensembl_gene_id
                        },
                        disableGoogleAnalytics: true
                    });

                    // GTEx
                    var firstUrl = 'https://www.gtexportal.org/rest/v1/reference/gene?geneId=' + target + '&v=clversion';
                    $http.get(firstUrl)
                        .then(function (resp) {
                            // Need to extract gencodeId (an Ensembl ID with GRCh37 version appended)
                            var gencodeId = resp.data.gene.filter(function (g) {
                                return g.geneSymbol === target;
                            })[0].gencodeId;
                            var secondUrl = 'https://www.gtexportal.org/rest/v1/expression/geneExpression?boxplotDetail=full&gencodeId=' + gencodeId;
                            return $http.get(secondUrl);
                        })
                        .then(function (resp) {
                            // var arr = obj2array(resp.data.genetpm);
                            var arr = transformData(resp.data.geneExpression);
                            var svg = d3.select('#gtexWidget')
                                .append('svg')
                                .attr('width', (w - 150))
                                .attr('height', (arr.length * 20) + 100)
                                .append('g')
                                .attr('class', 'gtexView')
                                .attr('transform', 'translate(' + ~~(w * 0.4) + ',70)');

                            plotGtex(svg, arr);
                        });
                }, 0);

                function plotGtex (container, data) {
                    data.sort(function (a, b) {
                        return b.median - a.median;
                    });
                    var valExtent = getExtent(data);

                    // X axis legend
                    container.append('g')
                        .attr('transform', 'translate(0,-40)')
                        .append('text')
                        .style('font-size', '12px')
                        .style('fill', '#666666')
                        .text('Normalised expression (RPKM)');

                    var valScale = d3.scale.linear()
                        .domain(valExtent)
                        .range([0, ~~(w * 0.6)]);

                    var colScale = d3.scale.category20();

                    var tissues = container.selectAll('.tissue')
                        .data(data)
                        .enter()
                        .append('g')
                        .attr('class', 'tissue')
                        .attr('transform', function (d, i) {
                            return 'translate(0,' + (i * 20) + ')';
                        });

                    // box
                    tissues
                        .append('rect')
                        .attr('x', function (d) {
                            return valScale(d.q1);
                        })
                        .attr('width', function (d) {
                            return valScale((d.q3) - (d.q1));
                        })
                        .attr('y', 0)
                        .attr('height', 10)
                        .attr('fill', function (d, i) {
                            return colScale(i % 20);
                        });

                    // high whisker
                    tissues
                        .append('line')
                        .attr('x1', function (d) {
                            return valScale(d.q3);
                        })
                        .attr('x2', function (d) {
                            return valScale(d.upperLimit);
                        })
                        .attr('y1', 5)
                        .attr('y2', 5)
                        .attr('stroke-width', 1)
                        .attr('stroke', 'gray');
                    tissues
                        .append('line')
                        .attr('x1', function (d) {
                            return valScale(d.upperLimit);
                        })
                        .attr('x2', function (d) {
                            return valScale(d.upperLimit);
                        })
                        .attr('y1', 0)
                        .attr('y2', 10)
                        .attr('stroke-width', 1)
                        .attr('stroke', 'gray');


                    // lower whisker
                    tissues
                        .append('line')
                        .attr('x1', function (d) {
                            return valScale(d.q1);
                        })
                        .attr('x2', function (d) {
                            return valScale(d.lowerLimit);
                        })
                        .attr('y1', 5)
                        .attr('y2', 5)
                        .attr('stroke-width', 1)
                        .attr('stroke', 'gray');
                    tissues
                        .append('line')
                        .attr('x1', function (d) {
                            return valScale(d.lowerLimit);
                        })
                        .attr('x2', function (d) {
                            return valScale(d.lowerLimit);
                        })
                        .attr('y1', 0)
                        .attr('y2', 10)
                        .attr('stroke-width', 1)
                        .attr('stroke', 'gray');

                    // outliers
                    tissues
                        .each(function (d) {
                            for (var i = 0; i < d.outliers.length; i++) {
                                var o = d.outliers[i];
                                d3.select(this)
                                    .append('circle')
                                    .attr('cx', function () {
                                        return valScale(o);
                                    })
                                    .attr('cy', 5)
                                    .attr('r', 2)
                                    .attr('stroke', 'gray')
                                    .attr('stroke-width', 1)
                                    .attr('fill', 'none');
                            }
                        });

                    // medians
                    tissues
                        .append('line')
                        .attr('x1', function (d) {
                            return valScale(d.median);
                        })
                        .attr('x2', function (d) {
                            return valScale(d.median);
                        })
                        .attr('y1', function (d) {
                            return 0;
                        })
                        .attr('y2', function (d) {
                            return 10;
                        })
                        .attr('class', 'median')
                        .attr('stroke-width', 2)
                        .attr('stroke', 'black');

                    // Axes
                    // values axis
                    var valAxis = d3.svg.axis()
                        .scale(valScale)
                        .orient('top')
                        .ticks(5);

                    // tissues axis
                    var tissueNames = data.map(function (d) {
                        return $filter('otClearUnderscores')(d.tissueSiteDetailId);
                    });
                    var tissuesScale = d3.scale.ordinal()
                        .domain(tissueNames)
                        .rangePoints([5, (tissueNames.length * 20) - 15]);

                    var tissuesAxis = d3.svg.axis()
                        .scale(tissuesScale)
                        .orient('left');

                    container.call(tissuesAxis);
                    container
                        .append('g')
                        .attr('class', 'axis')
                        .attr('transform', 'translate(0,' + (-10) + ')')
                        .call(valAxis);
                }

                // function obj2array (obj) {
                //     var arr = [];
                //     for (var tissue in obj) {
                //         obj[tissue].tissue = tissue;
                //         arr.push(obj[tissue]);
                //     }
                //     return arr;
                // }

                function getExtent (data) {
                    var max = -Infinity;
                    for (var i = 0; i < data.length; i++) {
                        var d = data[i];
                        if (d.high_wisker > max) {
                            max = d.high_wisker;
                        }
                        for (var j = 0; j < d.outliers.length; j++) {
                            var o = d.outliers[j];
                            if (o > max) {
                                max = o;
                            }
                        }
                    }
                    return [0, (max + 10)];
                }

                // map data to old gtex format
                function transformData (data) {
                    return data.map(function (d) {
                        // d3 requires for the array of values to be sorted before using median and quantile
                        d.data.sort(function (a, b) { return (a - b); });
                        var median = d3.median(d.data);
                        var q1 = d3.quantile(d.data, 0.25);
                        var q3 = d3.quantile(d.data, 0.75);
                        var outliers = [];
                        var notoutliers = [];
                        var iqr = q3 - q1; // interquartile range

                        // find the outliers and not outliers
                        d.data.forEach(function (d) {
                            if (d < q1 - 1.5 * iqr || d > q3 + 1.5 * iqr) {
                                outliers.push(d);
                            } else {
                                notoutliers.push(d);
                            }
                        });

                        return {
                            tissueSiteDetailId: d.tissueSiteDetailId,
                            median: median,
                            q1: q1,
                            q3: q3,
                            lowerLimit: notoutliers[0],
                            upperLimit: notoutliers[notoutliers.length - 1],
                            outliers: outliers
                        };
                    });
                }

                if (otUtils.browser.name !== 'IE') {
                    scope.toExport = function () {
                        var svg = d3.select('#gtexWidget').select('svg').node();
                        return svg;
                    };
                }
            }
        };
    }]);
