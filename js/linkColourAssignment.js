var CLMSUI = CLMSUI || {};
CLMSUI.linkColour = CLMSUI.linkColour || {};

CLMSUI.BackboneModelTypes.ColourModel = Backbone.Model.extend({
    defaults: {
        title: undefined,
        longDescription: undefined,
        type: "linear",
        fixed: false,
        undefinedColour: "#aaa",
        undefinedLabel: "Unknown",
        unit: "",
    },
    setDomain: function(newDomain) {
        this.get("colScale").domain(newDomain);
        this.triggerColourModelChanged({
            domain: newDomain
        });
        return this;
    },
    setRange: function(newRange) {
        this.get("colScale").range(newRange);
        this.triggerColourModelChanged({
            range: newRange
        });
        return this;
    },
    getDomainIndex: function (obj) {    // obj is generally a crosslink, but is non-specific at this point
        var val = this.getValue(obj);
        var dom = this.get("colScale").domain();
        return val != undefined ? (this.get("type") !== "ordinal" ? d3.bisect(dom, val) : dom.indexOf(val)) : undefined;
    },
    getDomainCount: function() {
        var domain = this.get("colScale").domain();
        return this.isCategorical() ? (this.get("type") === "threshold" ? domain.length + 1 : domain.length) : domain[1] - domain[0] + 1;
    },
    getColour: function(obj) {  // obj is generally a crosslink, but is non-specific at this point
        var val = this.getValue(obj);
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    },
    getColourByValue: function(val) {
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    },
    triggerColourModelChanged: function(changedAttrs) {
        this.trigger("colourModelChanged", this, changedAttrs);
    },
    isCategorical: function() {
        return this.get("type") !== "linear";
    },
    getLabelColourPairings: function () {
        var colScale = this.get("colScale");
        var labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        var minLength = Math.min (colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        var colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip (labels, colScaleRange);
    },
});

CLMSUI.BackboneModelTypes.ColourModelCollection = Backbone.Collection.extend({
    model: CLMSUI.BackboneModelTypes.ColourModel,
});


CLMSUI.BackboneModelTypes.DefaultLinkColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        this
            .set("labels", this.get("colScale").copy().range(["Self Cross-Links", "Self Cross-Links (Overlapping Peptides)", "Between Protein Cross-Links"]))
            .set("type", "ordinal")
        ;
    },
    getValue: function(crossLink) {
        return crossLink.isSelfLink() || crossLink.isLinearLink() ? (crossLink.confirmedHomomultimer ? 1 : 0) : 2;
    },
});


CLMSUI.BackboneModelTypes.GroupColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(attrs, options) {

        this.searchMap = options.searchMap;
        // find the search to group mappings
        var groups = new Map();
        var searchArray = CLMS.arrayFromMapValues(this.searchMap);
        searchArray.forEach(function(search) {
            var arr = groups.get(search.group);
            if (!arr) {
                arr = [];
                groups.set(search.group, arr);
            }
            arr.push(search.id);
        });

        // build scales on the basis of this mapping
        var groupDomain = [-1]; //[undefined];
        var labelRange = ["Multiple Groups"];
        var groupArray = CLMS.arrayFromMapEntries(groups);
        groupArray.forEach(function(group) {
            groupDomain.push(group[0]);
            labelRange.push("Group " + group[0] + " (" + group[1].join(", ") + ")");
        });

        var groupCount = groups.size;
        var colScale;

        var multiGroupColour = "#202020"; // default colour for links involved in multiple groups
        if (groupCount < 11) {
            var colArr = [multiGroupColour].concat(groupCount < 6 ? colorbrewer.Dark2[5] : colorbrewer.Paired[10]);
            colScale = d3.scale.ordinal().range(colArr).domain(groupDomain);
        } else { // more than 10 groups, not really feasible to find colour scale that works - a d3.scale that always returns gray?
            colScale = d3.scale.linear().domain([-1, 0]).range([multiGroupColour, "#448866"]).clamp(true);
            labelRange = ["Multiple Groups", "Single Group"];
        }
        this
            .set("colScale", colScale)
            .set("labels", this.get("colScale").copy().range(labelRange))
            .set("type", "ordinal")
        ;
    },
    getValue: function(crossLink) {
        //check if link uniquely belongs to one group
        var filteredMatchesAndPepPositions = crossLink.filteredMatches_pp;

        var value = null;
        for (var fm_pp = filteredMatchesAndPepPositions.length; --fm_pp >= 0;) {
            var match = filteredMatchesAndPepPositions[fm_pp].match;
            var group = this.searchMap.get(match.searchId).group;
            if (!value) {
                value = group;
            } else if (value !== group) {
                value = -1;    //undefined;
                break;
            }
        }
        // choose value if link definitely belongs to just one group or set as undefined (-1)
        return value;
    },
    getColourByValue: function(val) {
        var scale = this.get("colScale");
        // the ordinal scales will have had a colour for undefined already added to their scales (in initialize)
        // if it's the linear scale [-1 = multiple, 0 = single] and value is undefined we change it to -1 so it then takes the [multiple] colour value
        if (val === undefined && scale.domain()[0] === -1) {
            val = -1;
        }
        // now all 'undefined' values will get a colour so we don't have to check/set undefined colour here like we do in the default getColour function
        return scale(val);
    },
    getColour: function(crossLink) {
        return this.getColourByValue (this.getValue (crossLink));
    },
});

CLMSUI.BackboneModelTypes.DistanceColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        this
            .set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Within Distance", "Borderline", "Overlong"]))
            .set("unit", "Å")
        ;
    },
    getValue: function(crossLink) {
        return crossLink.getMeta("distance");
        //return CLMSUI.compositeModelInst.getSingleCrosslinkDistance(crossLink);
    },
});

CLMSUI.BackboneModelTypes.InterProteinColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(properties, options) {
        var colScale;
        var labels = ["Same Protein"];
        var proteinIDs = _.pluck (CLMSUI.modelUtils.filterOutDecoyInteractors (CLMS.arrayFromMapValues(options.proteins)), "id");

        if (proteinIDs && proteinIDs.length > 2 && proteinIDs.length < 6) {
            var groupDomain = ["same"];
            proteinIDs.forEach (function (proteinID1, i) {
                for (var m = i + 1; m < proteinIDs.length; m++) {
                    groupDomain.push (this.makeProteinPairKey(proteinID1, proteinIDs[m]));
                    labels.push (options.proteins.get(proteinID1).name + " - " + options.proteins.get(proteinIDs[m]).name);
                }
            }, this);
            var colArr = colorbrewer.Set3[10].slice();
            colArr.unshift("grey");
            colScale = d3.scale.ordinal().range(colArr).domain(groupDomain);
        } else {
            colScale = d3.scale.ordinal().range(["blue", "grey"]).domain(["other", "same"]);
            labels = ["Other", "Same"];
            this.overload = true;   // too many proteins for sensible number of colours
        }

        this
            .set("colScale", colScale)
            .set("labels", this.get("colScale").copy().range(labels))
        ;
    },

    makeProteinPairKey: function(pid1, pid2) {
        return pid1 < pid2 ? pid1 + "---" + pid2 : pid2 + "---" + pid1;
    },

    getValue: function(crossLink) {
        var id1 = crossLink.fromProtein.id;
        var id2 = crossLink.toProtein ? crossLink.toProtein.id : undefined;
        return (id2 === undefined || id1 === id2) ? "same" : (this.overload ? "other" : this.makeProteinPairKey(id1, id2));
    },
});


CLMSUI.BackboneModelTypes.MetaDataColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(properties, options) {
        var domain = this.get("colScale").domain();
        var labels;
        if (this.isCategorical()) {
            labels = domain.map(function(domVal) {
                return String(domVal)
                    .toLowerCase()
                    .replace(/\b[a-z](?=[a-z]{1})/g, function(letter) {
                        return letter.toUpperCase();
                    });
            });
        } else {
            labels = (domain.length === 2 ? ["Min", "Max"] : ["Min", "Zero", "Max"]);
            domain.map(function(domVal, i) {
                labels[i] += " (" + domVal + ")";
            });
        }

        this.set("labels", this.get("colScale").copy().range(labels));
    },
    getValue: function (obj) {  // obj can be anything with a getMeta function - crosslink or, now, proteins
        return obj.getMeta(this.get("field"));
    },
});

/* Colour model that doesn't use crosslink properties, if querying by crosslink will just return undefined colour */
/* Q: What's the point then? A: it can be used to return colours to values, and also as it extends ColourModel we */
/* can change the colours in the legend panel. */
CLMSUI.BackboneModelTypes.NonCrossLinkColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        var domain = this.get("colScale").domain();
        var labels = (domain.length === 2 ? ["Min", "Max"] : ["Min", "Zero", "Max"]);
        domain.map(function(domVal, i) {
            labels[i] += " (" + domVal + ")";
        });

        this
            .set("labels", this.get("colScale").copy().range(labels))
            .set("title", this.get("id"))
            .set("longDescription", this.get("id"))
        ;
    },
    getValue: function() {
        return undefined;
    },
});


/* Colour model based on map of crosslinks to values rather than properties of crosslinks themselves */
/* Good for making models based on calculated / derived values */
CLMSUI.BackboneModelTypes.MapBasedLinkColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        var domain = this.get("colScale").domain();
        var labels = (domain.length === 2 ? ["Min", "Max"] : ["Min", "Zero", "Max"]);
        domain.map(function(domVal, i) {
            labels[i] += " (" + domVal + ")";
        });

        this.set("labels", this.get("colScale").copy().range(labels));
    },
    getValue: function(obj) {   // obj is generally a crosslink, but can be any object with an id property that is a key in a supplied valueMap
        return this.get("valueMap")[obj.id];
    },
});


CLMSUI.BackboneModelTypes.DefaultProteinColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        this
            .set("labels", this.get("colScale").copy().range(["Protein"]))
            .set("type", "ordinal")
        ;
    },
    getValue: function (protein) {
        return 0;
    },
});



CLMSUI.linkColour.setupColourModels = function (userConfig) {
    console.log ("BLOOO");
    var defaultConfig = {
        default: {domain: [0, 1, 2], range: ["#9970ab", "#35978f", "#35978f"]},
        distance: {domain: [15, 25], range: ['#5AAE61', '#FDB863', '#9970AB']}
    };
    var config = $.extend (true, {}, defaultConfig, userConfig);    // true = deep merging
    
    CLMSUI.linkColour.defaultColoursBB = new CLMSUI.BackboneModelTypes.DefaultLinkColourModel({
        colScale: d3.scale.ordinal().domain(config.default.domain).range(config.default.range),
        title: "Cross-Link Type",
        longDescription: "Default colour scheme, differentiates self and between Cross-Links.",
        id: "Default"
    });

    var makeGroupColourModel = function() {
        return new CLMSUI.BackboneModelTypes.GroupColourModel({
            title: "Group",
            longDescription: "Differentiate Cross-Links by search group when multiple searches are viewed together.",
            id: "Group",
        }, {
            searchMap: CLMSUI.compositeModelInst.get("clmsModel").get("searches"),
        });
    };

    CLMSUI.linkColour.groupColoursBB = makeGroupColourModel();

    CLMSUI.linkColour.interProteinColoursBB = new CLMSUI.BackboneModelTypes.InterProteinColourModel({
        title: "Protein-Protein Colouring",
        longDescription: "Differentiate Cross-Links by the proteins they connect. Suitable for 3 to 5 proteins only.",
        id: "InterProtein",
        type: "ordinal"
    }, {
        proteins: CLMSUI.compositeModelInst.get("clmsModel").get("participants")
    });

    CLMSUI.linkColour.distanceColoursBB = new CLMSUI.BackboneModelTypes.DistanceColourModel({
        colScale: d3.scale.threshold().domain(config.distance.domain).range(config.distance.range),
        title: "Distance (Å)",
        longDescription: "Colour Cross-Links by adjustable distance category. Requires PDB file to be loaded (via Load -> PDB Data).",
        id: "Distance",
        superDomain: [0, 120], // superdomain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
    });

    // add distanceColoursBB to this collection later if needed
    var linkColourCollection = new CLMSUI.BackboneModelTypes.ColourModelCollection([
        CLMSUI.linkColour.defaultColoursBB,
        CLMSUI.linkColour.interProteinColoursBB,
        CLMSUI.linkColour.groupColoursBB,
        CLMSUI.linkColour.distanceColoursBB,
    ]);

    // If necessary, swap in newly added colour scale with same id as removed (but current) scale pointed to by linkColourAssignment
    var replaceCurrentLinkColourAssignment = function (collection) {
        var currentColourModel = CLMSUI.compositeModelInst.get("linkColourAssignment");
        if (currentColourModel && !currentColourModel.collection) {
            CLMSUI.compositeModelInst.set("linkColourAssignment", collection.get(currentColourModel.get("id")));
        }
    };

    // Just the group colour scale is replaced for this event
    linkColourCollection.listenTo(CLMSUI.compositeModelInst.get("clmsModel"), "change:matches", function() {
        this.remove("Group");   // remove old group scale
        CLMSUI.linkColour.groupColoursBB = makeGroupColourModel();
        this.add (CLMSUI.linkColour.groupColoursBB);    // add new group scale
        replaceCurrentLinkColourAssignment(this);   // replace existing selected scale if necessary
    });

    // All colour scales with ids in metadataFields array are removed (if already extant) and new scales added
    linkColourCollection.listenTo(CLMSUI.vent, "linkMetadataUpdated", function(metaMetaData) {
        var columns = metaMetaData.columns;
        var crossLinks = metaMetaData.items;
        var colMaps = columns.map(function(field) {
            return CLMSUI.linkColour.makeColourModel(field, field, crossLinks);
        });
        this.remove(columns);
        this.add(colMaps);
        replaceCurrentLinkColourAssignment(this);
    });

    linkColourCollection.listenTo(CLMSUI.vent, "addNonCrossLinkColourModel", function(data) {
        this.remove(data.id);
        var newModel = CLMSUI.linkColour.makeNonCrossLinkColourModel(data.id, data.domain);
        this.add(newModel);
        replaceCurrentLinkColourAssignment(this);
    });

    linkColourCollection.listenTo(CLMSUI.vent, "addMapBasedLinkColourModel", function(data) {
        console.log("AMB", data);
        this.remove(data.id);
        var newModel = CLMSUI.linkColour.makeMapBasedLinkColourModel(data.columnIndex, data.label, data.linkMap);
        newModel.set("id", data.id);
        this.add(newModel);
        CLMSUI.compositeModelInst.set("linkColourAssignment", newModel);
        replaceCurrentLinkColourAssignment(this);
    });
    
    CLMSUI.linkColour.Collection = linkColourCollection;
    
    
    // Protein colour schemes
    
    CLMSUI.linkColour.defaultProteinColoursBB = new CLMSUI.BackboneModelTypes.DefaultProteinColourModel ({
        colScale: d3.scale.ordinal().domain([0]).range(["#aaa"]),
        title: "Default Protein Colour",
        longDescription: "Default protein colour.",
        id: "Default Protein"
    });
    
    console.log ("GHJHJK", CLMSUI.linkColour.defaultProteinColoursBB);
    
    // Can add other metdata-based schemes to this collection later
    var proteinColourCollection = new CLMSUI.BackboneModelTypes.ColourModelCollection([
        CLMSUI.linkColour.defaultProteinColoursBB,
    ]);
    
    // If necessary, swap in newly added colour scale with same id as removed (but current) scale pointed to by linkColourAssignment
    var replaceCurrentProteinColourAssignment = function (collection) {
        var currentColourModel = CLMSUI.compositeModelInst.get("proteinColourAssignment");
        if (currentColourModel && !currentColourModel.collection) {
            CLMSUI.compositeModelInst.set("proteinColourAssignment", collection.get(currentColourModel.get("id")));
        }
    };
    
    // All colour scales with ids in metadataFields array are removed (if already extant) and new scales added
    proteinColourCollection.listenTo(CLMSUI.vent, "proteinMetadataUpdated", function(metaMetaData) {
        var columns = metaMetaData.columns;
        var proteins = metaMetaData.items;
        var colMaps = columns.map(function(field) {
            return CLMSUI.linkColour.makeColourModel(field, field, proteins);
        });
        this.remove(columns);
        this.add(colMaps);
        replaceCurrentProteinColourAssignment(this);
    });
    
    CLMSUI.linkColour.ProteinCollection = proteinColourCollection;
};

CLMSUI.linkColour.colourRangeMaker = function (extents) {
    var range = ["green", "blue"];
    if (extents[0] < 0 && extents[1] > 0) {
        extents.splice(1, 0, 0);
        range.splice(1, 0, "#888");
    } else if (extents[0] === extents[1]) {
        range = ["#888"];
    }
    return range;
};

CLMSUI.linkColour.makeColourModel = function(field, label, links) {
    var linkArr = links.length ? links : CLMS.arrayFromMapValues(links);
    // first attempt to treat as if numbers
    var extents = d3.extent(linkArr, function(link) {
        return link.getMeta(field);
    });
    var range = CLMSUI.linkColour.colourRangeMaker (extents);

    // see if it is a list of colours
    var hexRegex = CLMSUI.utils.commonRegexes.hexColour;
    var dataIsColours = (hexRegex.test(extents[0]) && hexRegex.test(extents[1]));
    var isCategorical = false;

    // if it isn't a list of colours and consists of only a few unique values, make it categorical
    if (!dataIsColours) {
        var uniq = d3.set(linkArr.map(function(link) {
            return link.getMeta(field);
        })).size();
        // if the values in this metadata form 6 or less distinct values count it as categorical
        isCategorical = uniq < 7;
        if (isCategorical) {
            //extents.push(undefined);  // removed, undefined will automatically get assigned a value in an ordinal scale if present
            range = colorbrewer.Dark2[8].slice();
        }
    }

    var newColourModel = new CLMSUI.BackboneModelTypes.MetaDataColourModel({
        colScale: (isCategorical ? d3.scale.ordinal() : d3.scale.linear()).domain(extents).range(range),
        id: label,
        title: label || field,
        longDescription: (label || field) + ", " + (isCategorical ? "categorical" : "") + " data extracted from Cross-Link metadata.",
        field: field,
        type: isCategorical ? "ordinal" : "linear",
    });

    if (dataIsColours) {
        // if data is just a list of colours make this colour scale just return the value for getColour
        newColourModel.getColour = function(crossLink) {
            var val = this.getValue(crossLink);
            return val !== undefined ? val : this.get("undefinedColour");
        };
        newColourModel.getColourByValue = function(val) {
            return val !== undefined ? val : this.get("undefinedColour");
        };
        newColourModel
            .set("fixed", true)
            .set("longDescription", (label || field) + ", fixed colours per Cross-Link from metadata. Not editable.")
        ;
    }

    return newColourModel;
};

CLMSUI.linkColour.makeNonCrossLinkColourModel = function(id, domain) {
    var extents = d3.extent(domain);
    var range = CLMSUI.linkColour.colourRangeMaker (extents);

    var newColourModel = new CLMSUI.BackboneModelTypes.NonCrossLinkColourModel({
        colScale: d3.scale.linear().domain(extents).range(range),
        id: id,
    });

    return newColourModel;
};

CLMSUI.linkColour.makeMapBasedLinkColourModel = function(columnIndex, label, linkMap) {
    var entries = d3.entries(linkMap);
    var domain = entries.map(function(entry) {
        return entry.value[columnIndex];
    });
    var fieldValueMap = {};
    entries.forEach(function(entry, i) {
        fieldValueMap[entry.key] = domain[i];
    });
    //console.log("dfv", domain, fieldValueMap);

    var extents = d3.extent(domain);
    var range = CLMSUI.linkColour.colourRangeMaker (extents);

    var newColourModel = new CLMSUI.BackboneModelTypes.MapBasedLinkColourModel({
        colScale: d3.scale.linear().domain(extents).range(range),
        title: label,
        longDescription: label + " Z-values.",
        valueMap: fieldValueMap
    });

    return newColourModel;
};
