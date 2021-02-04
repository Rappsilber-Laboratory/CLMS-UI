//		GO terms viewer
//
//		Colin Combe, Martin Graham
//		Rappsilber Laboratory, 2019

var CLMSUI = CLMSUI || {};

CLMSUI.GoTermsViewBB = CLMSUI.utils.BaseFrameView.extend({

    events: function () {
        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "keyup .goTextMatch": "goTextMatch",
        });
    },

    defaultOptions: {
        margin: {
            top: 5,
            right: 5,
            bottom: 5,
            left: 5
        },
        subclassColour: "gray",
        partofColour: "brown",
        canHideToolbarArea: true,
        canTakeImage: true,
    },

    initialize: function (viewOptions) {
        CLMSUI.GoTermsViewBB.__super__.initialize.apply(this, arguments);

        var self = this;

        // targetDiv could be div itself or id of div - lets deal with that
        // Backbone handles the above problem now - element is now found in this.el
        //avoids prob with 'save - web page complete'
        var mainDivSel = d3.select(this.el).classed("goTermsView", true);

        var flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        var controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");
        this.termSelect = controlDiv.append("label")
            .attr("class", "btn selectHolder")
            .append("span")
            //.attr("class", "noBreak")
            .text("Term Type ►")
            .append("select")
            .attr("id", mainDivSel.attr("id") + "goTermSelect")
            .on("change", function () {
                self.updateThenRender();
            });

        var termSelectData = ["protein containing complex"];//"cellular_component", "biological_process", "molecular_function"];

        var options = this.termSelect.selectAll("option")
            .data(termSelectData)
            .enter()
            .append("option");

        // Set the text and value for your options

        options.text(function (d) {
            return d;
        })
            .attr("value", function (d) {
                return d;
            });

        controlDiv.append("input")
            .attr("type", "text")
            .attr("placeholder", "Search Go Term Names...")
            .attr("class", "btn-1 goTextMatch")
        ;

        controlDiv.append("span").attr("class", "goTextResult");

        this.chartDiv = flexWrapperPanel.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", 1)
            .style("position", "relative");

        // SVG element
        this.svg = this.chartDiv.append("svg");
        this.svg.on("click", function (d) {
            // self.model.set("groupedGoTerms", []);
            // self.model.trigger("groupedGoTermsChanged");
        })
            .on("contextmenu", function (d) {
                //d3.event.preventDefault();
                // react on right-clicking
                //self.fixed = [];
                //self.render();
            });
        var margin = this.options.margin;
        this.vis = this.svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        this.backgroundGroup = this.vis.append("g");
        // this.linkGroup = vis.append("g");
        this.foregroundGroup = this.vis.append("g");
        this.listenTo(this.model.get("clmsModel"), "change:matches", this.updateThenRender); // New matches added (via csv generally)
        this.listenTo(this.model, "hiddenChanged", this.updateThenRender);

        this.sankey = d3.sankey().nodeWidth(15);
        //this.fixed = [];

        //markers
        var data = [{
            id: 1,
            name: 'diamond',
            path: 'M 0,-7.0710768 L -7.0710894,0 L 0,7.0710589 L 7.0710462,0 L 0,-7.0710768 z',
            viewbox: '-5 -5 15 15',
            transform: 'scale(0.7) translate(5,0)',
            color: this.options.partofColour
        }, {
            id: 2,
            name: 'arrow',
            path: "M 8.7185878,4.0337352 L -2.2072895,0.016013256 L 8.7185884,-4.0017078 C 6.9730900,-1.6296469 6.9831476,1.6157441 8.7185878,4.0337352 z",
            viewbox: '-5 -5 15 15',
            transform: 'scale(1.1) translate(1,0)',
            color: this.options.subclassColour
        }];

        var defs = this.svg.append('svg:defs');
        var marker = defs.selectAll('marker')
            .data(data)
            .enter()
            .append('svg:marker')
            .attr('id', function (d) {
                return 'marker_' + d.name;
            })
            .attr('markerHeight', 15)
            .attr('markerWidth', 15)
            .attr('markerUnits', 'userSpaceOnUse')
            // .attr('orient', 'auto')
            .attr('refX', 0)
            .attr('refY', 0)
            .attr('viewBox', function (d) {
                return d.viewbox;
            })
            .append('svg:path')
            .attr('d', function (d) {
                return d.path;
            })
            .attr('fill', function (d) {
                return d.color;
            })
            .attr('transform', function (d) {
                return d.transform;
            })
        ;

        // initial update done via hiddenChanged trigger above - which is called after all views are set up
        this.update();  // needed here to init interactors in goterms, temp hack, todo
    },


    goTextMatch: function (evt) {
        var self = this;
        var val = evt.target.value;
        var regex = new RegExp(val, "i");
        //var textPos = this.textPos.bind(this);

        var allInteractorSet = new Set();
        var goMatchCount = 0;

        var nodes = this.foregroundGroup.selectAll(".node")
            .each(function (d) {
                d.strMatch = val && val.length > 1 && d.name.match(regex);
                if (d.strMatch) {
                    goMatchCount++;
                    var interactorSet = d.term.getInteractors();
                    if (interactorSet) {
                        interactorSet.forEach(allInteractorSet.add, allInteractorSet);
                    }
                }
            })
            .sort(function (a, b) {
                return (a.strMatch ? 1 : 0) - (b.strMatch ? 1 : 0);
            })
            .classed("highlightedGOTerm", function (d) {
                return d.strMatch;
            })
        ;

        nodes.select("rect")
            .style("stroke", function (d) {
                return d.strMatch ? null : d3.rgb(d.color).darker(2);
            })
        ;

        nodes.select("text")
            .attr("clip-path", function (d) {
                return d.strMatch ? null : self.textOrient(d);
            })
            .call(textPos, function () {
                return false;
            })
        ;

        var interactors = Array.from(allInteractorSet.values());
        var msg = (!val || val.length < 2) ? "Enter at least 2 characters" : (goMatchCount ? goMatchCount + " matching GO terms, mapping to " + interactors.length + " proteins" : "No matches");
        d3.select(this.el).select(".goTextResult").text(msg);
        this.model[evt.key === "Enter" || evt.keyCode === 13 || evt.which === 13 ? "setSelectedProteins" : "setHighlightedProteins"](interactors, false);
    },

    update: function () {
        var termType = d3.select("#goTermsPanelgoTermSelect")
            .selectAll("option")
            .filter(function () {
                return d3.select(this).property("selected");
            })
            .datum()
            .trim()
        ;

        var go = this.model.get("go");
        //associate go terms with proteins (clear them first)
        for (var g of go.values()) {
            var gints = g.interactors;
            if (gints && gints.size > 0) {
                gints.clear();
            }
            g.filtInteractorCount = 0;
        }

        var proteins = this.model.get("clmsModel").get("participants").values();
        for (var protein of proteins) {
            if (protein.uniprot) {
                for (var goId of protein.uniprot.go) {
                    var goTerm = go.get(goId);
                    if (goTerm) {
                        goTerm.interactors = goTerm.interactors || new Set();  // Lazy instantiation
                        goTerm.interactors.add(protein);
                    }
                }
            }
        }

        var nodes = new Map();
        var linksMap = new Map();

        CLMSUI.GoTerm.prototype.getCount = 0;
        if (termType == "biological_process") {
            go.get("GO0008150").getInteractors(true);
            sankeyNode("GO0008150");
        } else if (termType == "molecular_function") {
            go.get("GO0003674").getInteractors(true);
            sankeyNode("GO0003674");
        } else { // default to cellular component
            go.get("GO0032991").getInteractors(true);
            sankeyNode("GO0032991");
        }

        function sankeyNode(goId) {
            if (!nodes.has(goId)) {
                const goTerm = go.get(goId);
                const node = {
                    name: goTerm.name,
                    id: goTerm.id,
                    term: goTerm,
                };
                nodes.set(node.id, node);
                const interactorCount = goTerm.filtInteractorCount;

                if (goTerm.part_of) {
                    for (let partOfId of goTerm.part_of) {
                        const partOfTerm = go.get(partOfId);
                        if (partOfTerm.isDescendantOf("GO0032991")) {
                        // if (partOfTerm.namespace == goTerm.namespace) {
                            const linkId = partOfId + "_" + node.id;
                            const link = {
                                source: sankeyNode(partOfId),
                                target: node,
                                value: interactorCount,
                                id: linkId,
                                partOf: true
                            };
                            linksMap.set(linkId, link);
                        }
                    }
                }
                if (goTerm.is_a) {
                    for (let superclassId of goTerm.is_a) {
                        const superclassTerm = go.get(superclassId);
                        if (superclassTerm.isDescendantOf("GO0032991")) {
                        // if (superclassTerm.namespace == goTerm.namespace) {
                            const linkId = superclassId + "_" + node.id;
                            const link = {
                                source: sankeyNode(superclassId),
                                target: node,
                                value: interactorCount,
                                id: linkId,
                                partOf: false
                            };
                            linksMap.set(linkId, link);
                        }
                    }
                }
                if (goTerm.parts) {
                    for (let partId of goTerm.parts) {
                        const partTerm = go.get(partId);
                        if (partTerm.isDescendantOf("GO0032991")) {
                            if (partTerm.namespace == goTerm.namespace && partTerm.filtInteractorCount > 1) {
                                sankeyNode(partId);
                            }
                        }
                    }
                }
                if (goTerm.subclasses) {
                    for (let subclassId of goTerm.subclasses) {
                        const subclassTerm = go.get(subclassId);
                        if (subclassTerm.isDescendantOf("GO0032991")){
                            if (subclassTerm.namespace == goTerm.namespace && subclassTerm.filtInteractorCount > 1) {
                                sankeyNode(subclassId);
                            }
                        }
                    }
                }
                return node;
            } else {
                return nodes.get(goId);
            }
        }

        this.data = {
            "nodes": Array.from(nodes.values()),
            "links": Array.from(linksMap.values())
        };

        return this;
    },

    // leftRightSwitch: function (d) {
    //     return false;//d.x < this.sankey.size()[0] / 1.5;   // if true, right
    // },
    //
    // textOrient: function (d) {
    //     var orient = this.leftRightSwitch(d) ? "right" : "left";
    //     return "url(#sankeyColumn" + orient + ")";
    // },
    //
    // textPos: function (sel, val1) {
    //     var self = this;
    //     sel
    //         .filter(function (d) {
    //             return !self.leftRightSwitch(d);
    //         })
    //         .style("text-anchor", function (d) {
    //             return d.strMatch || val1(d) ? "end" : "start";
    //         })
    //         .attr("x", function (d) {
    //             return d.strMatch || val1(d) ? -6 : -self.colWidth + self.sankey.nodeWidth();
    //         })
    //     ;
    // },

    render: function (renderOptions) {
        if (this.isVisible()) {
            //this.update();
            if (this.data) {

                renderOptions = renderOptions || {iterations: 32};

                //console.log("RENDERING GO TERMS");
                var jqElem = $(this.svg.node());
                var cx = jqElem.width(); //this.svg.node().clientWidth;
                var cy = jqElem.height(); //this.svg.node().clientHeight;
                var margin = this.options.margin;
                var width = Math.max(0, cx - margin.left - margin.right);
                var height = Math.max(0, cy - margin.top - margin.bottom);

                this.sankey
                    .nodes(this.data.nodes)
                    .links(this.data.links)
                    .size([width, height])
                    .layout(renderOptions.iterations)
                ;

                //console.log ("res", this.sankey);
                var maxDepth = d3.max(this.data.nodes, function (d) {
                    return d.depth;
                });
                var colWidth = (width - this.sankey.nodePadding() - this.sankey.nodeWidth()) / maxDepth;
                this.colWidth = colWidth;
                //console.log ("data", this.data, maxDepth, colWidth);

                // this.svg.select("defs").selectAll("clipPath.sankeyColumn").remove();
                // var leftRight = [
                //     {x: -colWidth + this.sankey.nodeWidth(), width: colWidth - this.sankey.nodeWidth(), orient: "left"},
                //     {x: 0, width: colWidth, orient: "right"}
                // ];
                // this.svg.select("defs").selectAll("clipPath.sankeyColumn")
                //     .data(leftRight)
                //     .enter()
                //     .append("clipPath")
                //     .attr("id", function (d) {
                //         return "sankeyColumn" + d.orient;
                //     })
                //     .attr("class", "sankeyColumn")
                //     .append("rect")
                //     .attr("y", -10)
                //     .attr("height", height + 10)
                //     .attr("x", function (d) {
                //         return isFinite(d.x) ? d.x : 0;
                //     })
                //     .attr("width", function (d) {
                //         return d.width ? d.width : 0;
                //     })
                // ;

                var color = d3.scale.category20();

                var path = this.sankey.link();
                var self = this;

                // var textPos = self.textPos.bind(self);


                var linkSel = self.backgroundGroup.selectAll(".goLink")
                    .data(this.data.links,
                        function (d) {
                            return d.id;
                        }
                    );

                linkSel.enter()
                    .append("path")
                    .attr("class", "goLink")
                    .style("stroke", function (d) {
                        return d.partOf ? self.options.partofColour : self.options.subclassColour; //"#bdbdbd"
                    })
                    // .style("display", "none")
                    .attr('marker-start', function (d, i) {
                        return 'url(#marker_' + (d.partOf ? "diamond" : "arrow") + ')';
                    })
                ;

                var nodeSel = this.foregroundGroup.selectAll(".node")
                    .data(this.data.nodes, function (d) {
                        return d.id;
                    })
                ;

                var nodeEnter = nodeSel.enter().append("g")
                    .attr("class", "node")
                    .on("click", function (d) {
                        self.model.setSelectedProteins([], false);
                        self.model.setSelectedProteins(Array.from(d.term.getInteractors().values()), true);
                        // self.model.get("groupedGoTerms").push(d.term);
                        // self.model.trigger("groupedGoTermsChanged");
                        d3.event.stopPropagation();
                    })
                    .on("mouseover", function (d) {
                        const term = d.term;
                        self.hideAllExceptMe(term);
                        self.hideAllLinksExceptTo(term);
                        self.model.setHighlightedProteins(Array.from(term.getInteractors().values()));
                    })
                    .on("mouseout", function () {
                        self.hideAllExceptMe();
                        self.hideAllLinksExceptTo();
                        self.model.setHighlightedProteins([]);
                    })
                    .on("contextmenu", function (d) {
                        //d3.event.preventDefault();
                        //d3.event.stopPropagation();
                        // react on right-clicking
                        //self.fixed.push(d.id);
                    });

                nodeEnter.append("rect")
                    .attr("width", self.sankey.nodeWidth())
                    .style("fill", function (d) {
                        return d.color = color(d.name.replace(/ .*/, ""));
                    })
                    .style("fill-opacity", function (d) {
                        return 0.2;
                    })
                    .style("stroke", function (d) {
                        return d3.rgb(d.color).darker(2);
                    })
                    .append("title")
                    .text(function (d) {
                        return d.id + ":" + d.name;// + ":" + d.value;
                    });

                nodeEnter.append("text")
                    .attr("dy", ".35em")
                    // .attr("clip-path", function (d) {
                    //     return self.textOrient(d);
                    // })
                    .text(function (d) {
                        return d.name;
                    });

                nodeSel.attr("transform", function (d) {
                    return "translate(" + (d.x ? d.x : 0) + "," + (d.y ? d.y : 0) + ")";
                });
                nodeSel.select("rect")
                    .attr("height", function (d) {
                        return Math.max(1, (d.dy ? d.dy : 0));
                    });
                nodeSel.select("text")
                    .attr("x", function (d) {
                        //return (d.x < width / 1.5) ? 6 + self.sankey.nodeWidth() : -6;
                        // return (d.x < width / 1.5) ? 6 + self.sankey.nodeWidth() : -colWidth + self.sankey.nodeWidth() ;
                        return -6;//6 + self.sankey.nodeWidth();
                    })
                    .style("text-anchor", function (d) {
                        return "end";
                        // return self.leftRightSwitch(d) ? "start" : "end";
                    })
                    .attr("y", function (d) {
                        return (d.dy ? d.dy : 0) / 4;
                    })
                ;

                linkSel.attr("d", path);

                nodeSel.exit().remove();
                linkSel.exit().remove();
            }
        }

        return this;
    },

    hideAllExceptMe: function (term) {
        const nodeSel = this.foregroundGroup.selectAll(".node")
            .data(this.data.nodes, function (d) {
                return d.id;
            })
        ;
        if (!term) {
            nodeSel.style("opacity", function (d2) {
                return 1;
            });
        } else {
            nodeSel.style("opacity", function (d2) {
                return term.isDirectRelation(d2.term) ? 1 : 0;
            });
        }
    },

    hideAllLinksExceptTo: function (term) {
        const linkSel = this.backgroundGroup.selectAll(".goLink")
            .data(this.data.links,
                function (d) {
                    return d.id;
                }
            );
        linkSel.style("display", function (dlink) {
            return !term || (term.id === dlink.source.id || term.id === dlink.target.id) ? null : "none";
        });
    },

    updateThenRender: function () {
        if (this.isVisible()) {
            return this.update().render();
        }
        return this;
    },

    relayout: function (descriptor) {
        if (descriptor && descriptor.dragEnd) { // avoids doing two renders when view is being made visible
            this.render({iterations: 6});
        }
        return this;
    },

    reshow: function () {
        return this.update();
    },

    // called when things need repositioned, but not re-rendered from data
    // gets called before render
    resize: function () {
        return this.render();
    },

    identifier: "Go Terms View",
});
