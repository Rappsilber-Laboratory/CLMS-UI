//		a matrix viewer
//
//		Colin Combe, Martin Graham
//		Rappsilber Laboratory, 2015
    
  var CLMSUI = CLMSUI || {};

  CLMSUI.ListViewBB = CLMSUI.utils.BaseFrameView.extend ({   
        
    events: function() {
      var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
      if(_.isFunction(parentEvents)){
          parentEvents = parentEvents();
      }
      return _.extend({},parentEvents,{
		  "mouseleave .d3table tbody": "clearHighlight",
		  "click button.toggleHeatMapMode": "toggleHeatMapMode",
		  "click button.generateStats": "generateStats",
		  "click .downloadButton3": "downloadImage",
		  "click .toggleClusterControls": "toggleClusterControls",
      });
    },
		
	defaultOptions: {
		selectedColour: "#ff0",
		highlightedColour: "#f80",
		heatMap: false,
		statDistance: "euclidean",
		statLinkage: "average",
		groups: {},
		outputStatColumns: d3.set(),
		showClusterControls: true,
		groupRegex: "\\d+",
	},

    initialize: function (viewOptions) {
        CLMSUI.ListViewBB.__super__.initialize.apply (this, arguments);
        
        var self = this;
        
        this.margin = {
            top:    this.options.chartTitle  ? 30 : 0,
            right:  20,
            bottom: this.options.xlabel ? 40 : 25,
            left:   this.options.ylabel ? 60 : 40
        };
		this.zCellColourer = function() { return undefined; };
        
        // targetDiv could be div itself or id of div - lets deal with that
        // Backbone handles the above problem now - element is now found in this.el
        //avoids prob with 'save - web page complete'
        var mainDivSel = d3.select(this.el).classed("listView", true); 
        
        var flexWrapperPanel = mainDivSel.append("div")
            .attr ("class", "verticalFlexContainer")
        ;
        
        this.controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar");
		
		this.viewStateModel = new (Backbone.Model.extend ({
			initialize: function () {
                this.listenTo (this, "change:statDistance change:statLinkage change:statColumns", function (vsmodel) { 
					var colCount = vsmodel.get("statColumns").size();
					self.indicateRecalcNeeded (colCount ? true : false); 
				});
				this.listenTo (this, "change:heatMap change:sortColumn", function () {
					self.showDendrogram();
				});
				this.listenTo (this, "change:outputStatColumns", function () {
					self.updateColumnSelectors2 (self.controlDiv2);
				});
				this.listenTo (this, "change:normalColumn", function () { self.normalise().updateSingleColumnZColourScheme(); });
				this.listenTo (this, "change:colourByColumn", function () { self.updateSingleColumnZColourScheme(); })
            },
		}))(this.options);
		
		// Add download button
        var buttonData = [
			{class: "downloadButton3", label: "Download Image", type: "button", id: "download3"},
			{class: "toggleClusterControls", label: "Toggle Cluster Controls", type: "button", id: "clusterToggle"},
        ];
        CLMSUI.utils.makeBackboneButtons (this.controlDiv, self.el.id, buttonData);
        
		
		this.controlDiv2 = flexWrapperPanel.append("div").attr("class", "toolbar");

		this.controlDiv2.append("label")
			.text ("Clusters")
			.attr ("class", "btn staticLabel")
		;
		
		// Set up d3table
		
		var selfModel = this.model;
		var physDistanceFunc = function (d) {
			return selfModel.getSingleCrosslinkDistance (d);
		}

		// first column is hidden column which has fixed filter later on to only show filtered cross-links
		var columnSettings = {	
			filtered: {columnName: "Filtered", type: "numericGt", tooltip: "", visible: false, accessor: function (d) { return d.filteredMatches_pp.length; }},
			protein: {columnName: "Protein", type: "alpha", tooltip: "", visible: true, accessor: function (d) { return d.fromProtein.name + (d.toProtein ? " " + d.toProtein.name : ""); }},
			matchCount: {columnName: "Match Count", type: "numeric", tooltip: "", visible: true, accessor: function (d) { return d.filteredMatches_pp.length; }},
			distance: {columnName: "Distance", type: "numeric", tooltip: "", visible: true, accessor: physDistanceFunc, cellStyle: "number", cellD3EventHook: this.makeColourSchemeBackgroundHook ("Distance")},
		};
		var initialStatColumns = d3.entries(columnSettings)
			.filter (function (colEntry) {return colEntry.value.visible && colEntry.value.type === "numeric"; })
			.map (function (colEntry) { return colEntry.key; })
		;
		this.viewStateModel.set ("statColumns", d3.set(initialStatColumns));
		
		var initialValues = {
			filters: {filtered: 0},	
		};
		var colourRows = function (rowSelection) {
			var selectedCrossLinks = self.model.getMarkedCrossLinks("selection");
			var selectedSet = d3.set (_.pluck (selectedCrossLinks, "id"));
			
			var highlightedCrossLinks = self.model.getMarkedCrossLinks("highlights");
			var highlightedSet = d3.set (_.pluck (highlightedCrossLinks, "id"));
			
			rowSelection.each (function (d) {
				d3.select(this).style ("background", highlightedSet.has(d.id) ? self.options.highlightedColour : (selectedSet.has(d.id) ? self.options.selectedColour : null));	
			});
		}
		var addRowListeners = function (rowSelection) {
			rowSelection.on ("click", function (d) {
				self.model.setMarkedCrossLinks ("selection", [d], false, d3.event.ctrlKey);	
			});
			rowSelection.on ("mouseover", function (d) {
				self.model.setMarkedCrossLinks ("highlights", [d], false, d3.event.ctrlKey);
				var ttm = self.model.get("tooltipModel");
				ttm
					.set ("header", CLMSUI.modelUtils.makeTooltipTitle.link (d))
					.set ("contents", CLMSUI.modelUtils.makeTooltipContents.link (d))
					.set ("location", d3.event)
				;
				ttm.trigger ("change:location");
			});
		};
		var empowerRows = function (rowSelection) {
			colourRows (rowSelection);
			addRowListeners (rowSelection);
		};
		var distance2dp = d3.format(".2f");
		var dataToHTMLModifiers = {
			filtered: function (d) { return d.filteredMatches_pp.length; },
			protein: function (d) { return d.fromProtein.name + (d.toProtein ? " " + d.toProtein.name : ""); },
			matchCount: function (d) { return d.filteredMatches_pp.length; },
			distance: function(d) { var dist = physDistanceFunc(d); return dist != undefined ? distance2dp(dist) : ""; },
		};
		d3.entries(dataToHTMLModifiers).forEach (function (entry) {
			columnSettings[entry.key].dataToHTMLModifier = dataToHTMLModifiers[entry.key];	
		});
        
		var d3tableElem = flexWrapperPanel.append("div").attr("class", "d3tableContainer verticalFlexContainer")
			.datum({
				data: Array.from (self.model.get("clmsModel").get("crossLinks").values()), 
				columnSettings: columnSettings,
				columnOrder: d3.keys(columnSettings),
			})
		;
		var d3table = CLMSUI.d3Table ();
		d3table (d3tableElem);
		
		//console.log ("table", d3table);

		// Bespoke filter type to hide rows not in current filtered crosslinks
		d3table.typeSettings ("numericGt", {
			preprocessFunc: function (d) { return d; },
			filterFunc: function (datum, d) { return datum > d; },
			comparator: d3table.typeSettings("numeric").comparator,		
		});
			
		var d3tableWrapper = d3.select(this.el).select(".d3table-wrapper");
		d3tableWrapper.style("display", "flex").style("flex-direction", "row");
		this.dendrosvg = d3tableWrapper.append("svg").style("min-width", "170px").style("overflow", "visible");
		
		d3table.dispatch().on ("ordering2.colord", this.columnOrdering.bind(this));
		
		//table.getFilterCells().style("display", "none");

		// set initial filters
		var keyedFilters = {};
		d3.keys(columnSettings).forEach (function (columnKey) {
			keyedFilters[columnKey] = initialValues.filters[columnKey];	
		});

		d3table
			.filter (keyedFilters)
			.postUpdate (empowerRows)
		;
		
		// Second row of controls
		
		this.updateColumnSelectors (this.controlDiv2, d3table);
		
		CLMSUI.utils.addMultipleSelectControls ({
            addToElem: this.controlDiv2, 
            selectList: ["Distance"], 
            optionList: ["euclidean", "manhattan", "max"], 
			keepOldOptions: false,
            selectLabelFunc: function () { return "Distance ►"; }, 
			initialSelectionFunc: function (d) { return d === self.viewStateModel.get("statDistance"); },
            changeFunc: function () { self.viewStateModel.set ("statDistance", d3.event.target.value); },
			idFunc: function (d) { return d; },
        });
		
		CLMSUI.utils.addMultipleSelectControls ({
			addToElem: this.controlDiv2, 
            selectList: ["Linkage"], 
            optionList: ["average", "single", "complete"], 
			keepOldOptions: false,
            selectLabelFunc: function () { return "Linkage ►"; }, 
			initialSelectionFunc: function (d) { return d === self.viewStateModel.get("statLinkage"); },
            changeFunc: function () { self.viewStateModel.set ("statLinkage", d3.event.target.value); },
			idFunc: function (d) { return d; },
        });
		
		var buttonData2 = [
			{class: "generateStats", label: "Calculate", type: "button", id: "generateStats", tooltip: "Adds 2 columns to the table, Kmcluster and TreeOrder"},
			{class: "toggleHeatMapMode", label: "Toggle HeatMap", type: "button", id: "heatmap", tooltip: "Shows table as heatmap"},
        ];
        CLMSUI.utils.makeBackboneButtons (this.controlDiv2, self.el.id, buttonData2);
		
		this.controlDiv2.append("hr").style("display", "block");
		
		this.controlDiv2.append("label")
			.text ("Z Scores")
			.attr ("class", "btn staticLabel")
		;
		
		this.updateColumnSelectors2 (this.controlDiv2);
		

		// Backbone event listeners
		
		// rerender crosslinks if selection/highlight changed or filteringDone
        this.listenTo (this.model, "filteringDone", function() {
			this.indicateRecalcNeeded(true).render({refilter: true});
		});
		this.listenTo (this.model, "change:selection change:highlights", function() {
			colourRows (d3table.getAllRowsSelection());
		});
        this.listenTo (CLMSUI.linkColour.Collection, "aColourModelChanged", this.render);   // redraw if any colour model chanegs
        this.listenTo (this.model.get("clmsModel"), "change:distancesObj change:matches", this.render);  // Entire new set of distances or new matches added (via csv generally)
        this.listenTo (CLMSUI.vent, "distancesAdjusted", this.render);  // Existing residues/pdb but distances changed
		this.listenTo (CLMSUI.vent, "linkMetadataUpdated", function (metaData) {
			this
				.updateTableData (metaData)
				.updateColumnSelectors (this.controlDiv2, this.d3table, undefined)
				.render({refilter: true})
			;
		}); // New/Changed metadata attributes present
		
		this.d3table = d3table;
		
		this
			.toggleClusterControls()
			.showDendrogram()
			.render({refilter: true})
		;
    },
	  
	clearHighlight: function () {
		this.model.setMarkedCrossLinks ("highlights", [], false, false);
		this.model.get("tooltipModel").set("contents", null);
        return this;
	},
	  
	getColour: function (columnKey, value) {
		var colScheme = CLMSUI.linkColour.Collection.get(columnKey);
		return colScheme.getValue (value);
	},
	  
	makeColourSchemeBackgroundHook: function (columnKey) {
		var self = this;
		return function (cellSel) {
			cellSel.style("background", function(d) { 
				var colour = self.zCellColourer (d);
				if (colour) { return colour; }
				var colScheme = CLMSUI.linkColour.Collection.get(columnKey);
				var dValue = colScheme.getValue (d.value);	// d.value is crosslink
				return dValue !== undefined ? colScheme.getColour(d.value) : "none";
			});
		};
	},
	  
	updateTableData: function (metaData) {
		var columnSettings = this.d3table.columnSettings();
		var self = this;

		metaData.columns.map (function (mcol) {
			var columnType = metaData.columnTypes[mcol];
			
			// Use Z-Score if calculated, otherwise use cross-link raw values in link meta object
			var accFunc = function (d) { 
				var linkZScores = self.stats && self.stats.zscoresByLinkMap ? self.stats.zscoresByLinkMap[d.id] : undefined;
				if (linkZScores) {
					var columnIndex = self.stats.zColumnNames.indexOf (mcol);
					if (columnIndex >= 0) {
						return linkZScores [columnIndex];
					}
				}
				return d.getMeta (mcol);
			};
			
			var zscoreRoundFormat = d3.format(",.5f");
			var zscoreRounder = function (d) {
				var val = accFunc (d);
				var columnIndex = self.stats && self.stats.zColumnNames ? self.stats.zColumnNames.indexOf (mcol) : undefined;
				if (columnIndex >= 0 && val !== undefined && !Number.isInteger(val)) {
					return zscoreRoundFormat (val);
				}
				return val;
			}
			
			var cellD3Hook = columnType === "numeric" && CLMSUI.linkColour.Collection.get(mcol) ? 
				this.makeColourSchemeBackgroundHook (mcol) : undefined
			;

			columnSettings[mcol] = {
				columnName: mcol, 
				type: columnType || "alpha", 
				tooltip: "", 
				visible: true, 
				accessor: accFunc, 
				dataToHTMLModifier: zscoreRounder, 
				cellStyle: columnType === "numeric" ? "number" : undefined,
				cellD3EventHook: cellD3Hook,
			};
		}, this);
		
		this.d3table
			.columnSettings (columnSettings)
			.columnOrder (d3.keys(columnSettings))
		;
		
		this.d3table (this.d3table.getSelection());
		
		return this;
	},
	  
	  // Add a multiple select widget for column visibility
	updateColumnSelectors: function (containerSelector, d3table) {

		var self = this;
		
		function getPickableColumns() {
			var removeThese = d3.set(["kmcluster", "treeOrder"]);
			
			return d3.entries (d3table.columnSettings())
				.filter (function (columnSettingEntry) {
					return columnSettingEntry.value.visible && columnSettingEntry.value.type === "numeric" && !removeThese.has(columnSettingEntry.key);
				})
			;
		};
		var pickableColumns = getPickableColumns();
		
		var selects = CLMSUI.utils.addMultipleSelectControls ({
			addToElem: containerSelector, 
            selectList: ["Use Columns"], 
            optionList: pickableColumns, 
			keepOldOptions: true,
			optionLabelFunc: function (d) { return d.value.columnName; },
			optionValueFunc: function (d) { return d.key; },
            selectLabelFunc: function (d) { return d+" ►"; }, 
			idFunc: function (d) { return d.key; },
        });
		selects.property ("multiple", "true");	// important, set first select element to allow multiple choices
		
		$(selects.node()).multipleSelect ({  
			width: 200,
			onClick: function (view) {
				var key = view.value;
				var statColumns = self.viewStateModel.get("statColumns");
				statColumns[view.checked ? "add" : "remove"](key);
				self.viewStateModel
					.set ("statColumns", statColumns)
					.trigger ("change:statColumns", self.viewStateModel)
				;
			},
			onCheckAll: function () {
				var keys = getPickableColumns().map (function (pcolumn) { return pcolumn.key; });
				self.viewStateModel.set("statColumns", d3.set(keys));
			},
			onUncheckAll: function () {
				self.viewStateModel.set("statColumns", d3.set([]));
			}
		});

		function restoreSelectionToInputs () {
			$(selects.node()).multipleSelect ("setSelects", self.viewStateModel.get("statColumns").values());
		}
		restoreSelectionToInputs();
		
		var mslist = d3.select(this.el).select(".ms-drop ul");
		var items = mslist.selectAll("li:not(.ms-select-all)").data(pickableColumns);
		items.selectAll("input.group").data(function(d) { return [d]; }, function(d) { return d.key; })
			.enter()
			.insert("input", ":first-child")
				.attr("class", "group")
				.attr("type", "number")
				.attr("min", 0)
				.attr("title", "Set group number")
				.on ("input", function (d) {
					self.options.groups[d.key] = d3.select(this).property("value");
					self.viewStateModel.trigger ("change:statColumns", self.viewStateModel)
				})
		;
		
		function restoreGroupsToInputs () {
			items.selectAll("input.group").property ("value", function(d) { return self.options.groups[d.key]; });
		}
		restoreGroupsToInputs();
		
		var groupWidget = mslist.insert("li", ":first-child").append("div")
		
		groupWidget.append("button")
			.attr ("class", "btn btn-1 btn-1a")
			.text ("Auto Group")
			.on ("click", function() {
				var regex = new RegExp (self.viewStateModel.get("groupRegex"));
				var keys = [];
				items.data().forEach (function (d) {
					var match = regex.exec (d.key);
					var val = match && match.length ? match[0] : undefined;
					self.options.groups[d.key] = val;
					if (val !== undefined) {
						keys.push (d.key);
					}
				});
			
				self.viewStateModel
					.set("statColumns", d3.set(keys), {silent: true})
					.trigger ("change:statColumns", self.viewStateModel)
				;
				restoreSelectionToInputs();
				restoreGroupsToInputs ();
			})
		;
		
		groupWidget.append("input")
			.attr("type", "text")
			.attr ("class", "regexInput")
			.attr("placeholder", "A Regex String")
			.attr("value", self.viewStateModel.get("groupRegex"))
			.attr("title", "A regular expression acting on column names to produce group numbers.")
			.on ("input", function () {
				self.viewStateModel.set("groupRegex", d3.select(this).property("value"));
			})
		;
		
		console.log ("listview", this);
		
		return this;
	},
	  
	 updateColumnSelectors2: function (containerSelector) {
		 var self = this;
		 var columnNames = this.viewStateModel.get("outputStatColumns").values();
		 columnNames.unshift ("None");
		 
		 var selects2 = CLMSUI.utils.addMultipleSelectControls ({
			addToElem: containerSelector, 
            selectList: ["Normalise Other Columns To", "Build Colour Scheme On"], 
            optionList: columnNames, 
			keepOldOptions: true,
            selectLabelFunc: function (d) { return d + " ►"; }, 
			idFunc: function (d) { return d; },
        });
		
		selects2.classed ("selectMinWidth", true)
			.on ("change", function (d, i, ii) { 
				self.viewStateModel.set (ii === 0 ? "normalColumn": "colourByColumn", this.value); 
			})
		 ;
	 },
	  
	updateSingleColumnZColourScheme: function () {
		var colourScheme = CLMSUI.linkColour.Collection.get("zrange");
		var columnName = this.viewStateModel.get("colourByColumn");
		var columnIndex = this.stats.zColumnNames.indexOf (columnName);
		if (columnIndex >= 0) {
			var self = this;
			CLMSUI.vent.trigger ("addMapBasedLinkColourModel", {
				id: "ZMetaColumn", 
				columnIndex: columnIndex,
				label: "Norm. "+columnName, 
				linkMap: self.stats.zscoresByLinkMap
			});	// make colour model based on z value extents
		}
	},

    render: function (options) {
		options = options || {};
		if (options.refilter) {
			this.needsRefilter = true;
		}
		
        if (this.isVisible()) {
			if (options.refilter || this.needsRefilter) {
				this.needsRefilter = false;
				var filter = this.d3table.filter ();
				filter.filtered = 0;
				this.d3table.filter(filter);
			}
			this.d3table.update();
        }
        return this;
    },
	  
	 toggleClusterControls: function () {
		 var showClusterControls = this.viewStateModel.get("showClusterControls");
		 showClusterControls = !showClusterControls;
		 this.controlDiv2.style ("display", showClusterControls ? null : "none");
		 this.viewStateModel.set ("showClusterControls", showClusterControls);
		 return this;
	 },
	  
	toggleHeatMapMode: function () {
		var heatMap = this.viewStateModel.get("heatMap");
		heatMap = !heatMap;
		d3.select(this.el).select(".d3table").classed ("heatmap", heatMap);
		this.viewStateModel.set("heatMap", heatMap);
		
		var csettings = d3.entries(this.d3table.columnSettings());
		
		var ps = this.d3table.pageSize();
		this.d3table.pageSize(120 - ps);
		
		if (!heatMap) {
			csettings.forEach (function (cEntry) {
				this.d3table.showColumnByKey (cEntry.key, this.visColDefaults[cEntry.key]);
			}, this);
		} else {
			// store default visibilities for restoration later
			this.visColDefaults = {};
			csettings.forEach (function (csetting) {
				this.visColDefaults[csetting.key] = csetting.value.visible;
			}, this);
			
			var showSet = d3.set(this.viewStateModel.get("outputStatColumns").values());
			showSet.add ("treeOrder");
			showSet.add ("kmcluster");
			csettings.forEach (function (cEntry) {
				this.d3table.showColumnByKey (cEntry.key, showSet.has (cEntry.key));
			}, this);
		}
		
		this.d3table.update();
		
		return this;
	},
	  
	generateStats: function () {
		var crossLinks = this.model.getFilteredCrossLinks();
		var columnSettings = this.d3table.columnSettings();
		var accessor = function (crossLinks, dim) {
			var accessFunc = columnSettings[dim].accessor;
			return crossLinks.map (function (crossLink) {
				var val = accessFunc ? accessFunc(crossLink) : crossLink[dim];
				return val ? val : ((val === 0) ? val : undefined);
			});
		};
		var options = {
			distance: this.viewStateModel.get("statDistance"), 
			linkage: this.viewStateModel.get("statLinkage"),
			columns: this.viewStateModel.get("statColumns").values(),	// values 'cos d3.set not array
			groups: this.options.groups,
			accessor: accessor,
		}
		
		this.stats = CLMSUI.modelUtils.metaClustering (crossLinks, options);
		
		this.viewStateModel.set ("outputStatColumns", d3.set (this.stats.zColumnNames));
		
		//console.log ("stat", stats);
		CLMSUI.utils.drawDendrogram (this.dendrosvg, this.stats.cfk_distances.tree, {
			ltor: false,
			labelFunc: function (d) { return d.origValue.clink.id; },
			title: "Distance "+this.viewStateModel.get("statDistance")+", Linkage "+this.viewStateModel.get("statLinkage"),
		});
		
		this
			.indicateRecalcNeeded (false)
			.normalise()
		;
		return this;
	},
	  
	normalise: function () {
		
		if (this.stats) {
			var columnIndexMap = {};
			this.stats.zColumnNames.forEach (function (columnKey, i) {
				columnIndexMap[columnKey] = i;
			});
			
			var self = this;
			var normScores = CLMSUI.modelUtils.normalize2DArrayToColumn (this.stats.zscores, columnIndexMap[this.viewStateModel.get("normalColumn")]);
			var zrange = d3.extent (d3.merge (normScores.map (function (zs) { return d3.extent (zs); })));
			
			var zmap = {};
			normScores.forEach (function (row, i) { 
				row.clink = this.stats.zscores[i].clink;
				zmap[row.clink.id] = row;
			}, this);
			
			this.stats.normZScores = normScores;
			this.stats.zscoresByLinkMap = zmap;
			
			
			// Update group meta data with normalised values
			/*
			var gcolumns = this.stats.groupColumns.map (function (col) { return col.name; });
			CLMSUI.modelUtils.updateMetaDataWithTheseColumns (normScores, gcolumns);
			CLMSUI.vent.trigger ("linkMetadataUpdated", {
				columns: gcolumns, 
				columnTypes: _.object (gcolumns, _.range(gcolumns.length).map(function() { return "numeric"; })), 
				items: self.model.getFilteredCrossLinks(), 
				matchedItemCount: normScores.length
			});
			*/
			
			//console.log ("stats", this.stats);

			this.zCellColourer = function (d) {
				var colourScheme = CLMSUI.linkColour.Collection.get("zrange");
				var zcolumnIndex = columnIndexMap[d.key];
				var colValue;
				if (colourScheme && zcolumnIndex !== undefined) {
					var linkZScores = self.stats.zscoresByLinkMap[d.value.id];	// d.value is crosslink
					if (linkZScores) {
						var val = linkZScores[zcolumnIndex];
						colValue = val !== undefined ? colourScheme.getColourByValue (val) : "transparent"; //colourScheme.undefinedColour;
					}
				}
				return colValue;
			};

			CLMSUI.vent.trigger ("addNonCrossLinkColourModel", {id: "zrange", domain: zrange});	// make colour model based on normalised z value extents
			
			this.render();
		}
		
		return this;
	},
	  
	columnOrdering: function (sortColumn, sortDesc) {
		this.viewStateModel.set("sortColumn", sortColumn);
	},
	  
	showDendrogram: function () {
		var shiftY = $(d3.select(this.el).select(".d3table tbody").node()).position().top;
		this.dendrosvg
			.style ("display", this.viewStateModel.get("sortColumn") === "treeOrder" && this.viewStateModel.get("heatMap") ? null : "none")
			.select ("g.dendro")
			.style ("transform", "translate(70px, "+shiftY+"px)")
		;
		return this;
	},
	  
	indicateRecalcNeeded: function (truthy) {
		d3.select(this.el).select("button.generateStats").property ("disabled", !truthy);
		return this;
	},
	  
	getTableBackgroundColourArray: function (d3table) {
		d3table = d3table || this.d3table;
		
		var fdata = d3table.getFilteredData();
	},
	  
	downloadImage: function () {
		var self = this;
		this.getHTMLAsDataURL (d3.select(this.el).select(".d3table"), 
			{
				removeChildren: "svg.d3table-arrow,tfoot,input",
			},
			function (dataURL, size) {
				var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				var d3svg = d3.select(svg);

				var img = d3svg.append("image").attr("xlink:href", dataURL);
				var nestedSvg = self.dendrosvg;
				//console.log ("g", nestedSvg, img);
				var clone = nestedSvg.node().cloneNode(true);
				d3.select(clone).attr("x", size.width);
				d3svg.node().appendChild (clone);

				self.downloadSVG (undefined, d3svg);	
			}, 
		);	
	},
        
    identifier: "List View",
        
    optionsToString: function () {
        return (this.viewStateModel.get("heatMap") ? "Heatmap_" : "") + "Sorted_by_"+this.d3table.orderKey()+"-"+this.d3table.orderDir();
    },
});
    