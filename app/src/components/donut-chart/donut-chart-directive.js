/**
 * Donut chart
 * A directive to display a donut chart
 * @param {string} header - the text to be display in a heading. Optional.
 * @param {array} data - the data to use for building the chart. Each item in array is in format {label:string, value:number}.
 * @param {boolean} showLegend - true to display legend; false to display labels over each arc of the chart.
 * @param {function} scale - the D3 scale to use for color. Optional.
 * @param {number} size - external width or height (i.e. the diameter). Optional
 * @param {number} hole - the diameter of internal donut 'hole'. Optional
 */
angular.module('otDirectives')

    .directive('otDonutChart', [function () {
        'use strict';

        return {
            restrict: 'AE',
            templateUrl: 'src/components/donut-chart/donut-chart.html',
            scope: {
                header: '@?',       // optional header
                data: '=',
                showLegend: '<?',   // optional show legend (else labels added to chart arcs) -- one-way binding
                scale: '=?',    // optional color scale
                size: '<?',     // optional size (diameter)
                hole: '<?'      // optional hole size (diameter)
            },
            link: function (scope, elem, attrs) {
                scope.$watch('data', function (n, o) {
                    if (n === undefined) { return; }

                    var color = scope.scale || d3.scale.category20();
                    var size = scope.size || 200;
                    var hole = scope.hole || Math.round(size * 0.6);

                    var data = scope.data;

                    // update data id and color info
                    // id: can be used to pass a different value to calculate color on
                    // color: can be used to pass a specific color for each arc
                    data.forEach(function (e) {
                        e.id = e.id || e.label;
                        e.color = e.color || color(e.id);
                    });

                    var width = size,
                        height = size;
                        // radius = size / 2,


                    var arc = d3.svg.arc()
                        .outerRadius(size / 2)
                        .innerRadius(hole / 2);

                    var pie = d3.layout.pie()
                        .sort(null)
                        .value(function (d) { return d.value; });

                    // var svg = elem.find('svg').el(0) // d3.select("body").append("svg")
                    var svg = d3.select(elem[0].querySelector('svg'))
                        .attr('width', width)
                        .attr('height', height)
                        .append('g')
                        .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');

                    var g = svg.selectAll('.arc')
                        .data(pie(data))
                        .enter().append('g')
                        .attr('class', 'arc');

                    g.append('title')
                        .text(function (d) { return d.data.label + ' (' + d.data.value + ')'; });

                    g.append('path')
                        .attr('d', arc)
                        .style('fill', function (d) { return d.data.color; })
                        .attr('title', function (d) { return d.data.label; });

                    if (!scope.showLegend) {
                        // attach lables to chart
                        g.append('text')
                            .attr('transform', function (d) { return 'translate(' + arc.centroid(d) + ')'; })
                            .attr('dy', '.35em')
                            .text(function (d) { return d.data.label; });
                    } else {
                        // the html will take care of displaying the legend
                    }
                });
            }
        };
    }]);
