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
      });
    },
		
	defaultOptions: {
		selectedColour: "#ff0",
		highlightedColour: "#f80",
		heatMap: false,
		statDistance: "euclidean",
		statLinkage: "average",
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
            },
		}))(this.options);
		
		// Add download button
        var buttonData = [
            {class: "toggleHeatMapMode", label: "Toggle HeatMap", type: "button", id: "heatmap"},
			{class: "downloadButton3", label: "Download Image", type: "button", id: "download3"},
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
			
		this.dendrosvg = d3.select(this.el).select(".d3table-wrapper")
			.style ("display", "flex")
			.style ("flex-direction", "row")
			.append ("svg")
			.style ("min-width", "100px")
		;
		
		d3table.dispatch().on ("ordering2", this.columnOrdering.bind(this));
		
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
		
		this.updateColumnSelector (this.controlDiv2, d3table, undefined);
		
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
        ];
        CLMSUI.utils.makeBackboneButtons (this.controlDiv2, self.el.id, buttonData2);
		

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
				.updateColumnSelector (this.controlDiv2, this.d3table, undefined)
				.render({refilter: true})
			;
		}); // New/Changed metadata attributes present
		
		this.d3table = d3table;
		
        this.render({refilter: true});
    },
	  
	clearHighlight: function () {
		this.model.setMarkedCrossLinks ("highlights", [], false, false);
		this.model.get("tooltipModel").set("contents", null);
        return this;
	},
	  
	makeColourSchemeBackgroundHook: function (columnKey) {
		return function (cellSel) {
			cellSel.style("background", function(d) { 
				var colScheme = CLMSUI.linkColour.Collection.get(columnKey);
				var dValue = colScheme.getValue (d.value);
				return dValue !== undefined ? colScheme.getColour(d.value) : "none";
			});
		};
	},
	  
	updateTableData: function (metaData) {
		var columnSettings = this.d3table.columnSettings();

		metaData.columns.map (function (mcol) {
			var columnType = metaData.columnTypes[mcol];
			
			var accFunc = function (d) { return d.meta ? d.meta[mcol] : ""; };
			var cellD3Hook = columnType === "numeric" && CLMSUI.linkColour.Collection.get(mcol) ? 
				this.makeColourSchemeBackgroundHook (mcol) : undefined
			;

			columnSettings[mcol] = {
				columnName: mcol, 
				type: columnType || "alpha", 
				tooltip: "", 
				visible: true, 
				accessor: accFunc, 
				dataToHTMLModifier: accFunc, 
				cellStyle: columnType === "numeric" ? "number" : undefined,
				cellD3EventHook: cellD3Hook,
			};
		}, this);
		
		this.d3table
			.columnSettings (columnSettings)
			.columnOrder (d3.keys(columnSettings))
		;
		
		this.d3table (this.d3table.getSelection());
		
		this.d3table.dispatch().on ("ordering2.dendro", this.columnOrdering.bind(this));	// needs to be fixed in d3table rather than here
		
		return this;
	},
	  
	  // Add a multiple select widget for column visibility
	updateColumnSelector: function (containerSelector, d3table, dispatch) {

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
			addToElem: this.controlDiv2, 
            selectList: ["Show Columns"], 
            optionList: pickableColumns, 
			keepOldOptions: true,
			optionLabelFunc: function (d) { return d.value.columnName; },
			optionValueFunc: function (d) { return d.key; },
            initialSelectionFunc: function (d,i) { return true; },
            selectLabelFunc: function () { return "Use Columns ►"; }, 
			idFunc: function (d) { return d.key; },
        });
		selects.property("multiple", "true");	// important, set select to allow multiple choices
		this.columnChoices = selects;
		
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

		$(selects.node()).multipleSelect ("setSelects", this.viewStateModel.get("statColumns").values());
		
		console.log ("listview", this);
		
		return this;
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
	  
	toggleHeatMapMode: function () {
		this.options.heatMap = !this.options.heatMap;
		 d3.select(this.el).select(".d3table").classed ("heatmap", this.options.heatMap);
		var ps = this.d3table.pageSize();
		this.d3table.pageSize(120 - ps).update();
		
		this.showDendrogram();
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
			accessor: accessor,
		}
		
		var stats = CLMSUI.modelUtils.metaClustering (crossLinks, options);
		console.log ("stat", stats);
		CLMSUI.utils.drawDendrogram (this.dendrosvg, stats.cfk_distances.tree);
		
		this.indicateRecalcNeeded (false);
		return this;
	},
	  
	columnOrdering: function (sortColumn, sortDesc) {
		console.log ("col", sortColumn);
		this.viewStateModel.set("sortColumn", sortColumn);
		this.showDendrogram();
	},
	  
	showDendrogram: function () {
		var shiftY = $(d3.select(this.el).select(".d3table tbody").node()).position().top;
		console.log ("yo");
		this.dendrosvg
			.style ("display", this.viewStateModel.get("sortColumn") === "treeOrder" && this.options.heatMap ? null : "none")
			.style ("transform", "translateY("+shiftY+"px) scale(-1)")
		;
	},
	  
	indicateRecalcNeeded: function (truthy) {
		d3.select(this.el).select("button.generateStats").property ("disabled", !truthy);
		return this;
	},
	  
	downloadImage: function () {
		var self = this;
		this.downloadHTMLAsImg (d3.select(this.el).select(".d3table"), function (dataURL, img) {
			var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			var d3svg = d3.select(svg);
			
			d3svg.append("image").attr("xlink:href", dataURL);
			var clone = self.dendrosvg.select("g.dendro").node().cloneNode(true);
			console.log ("clone", clone);
			d3svg.append (clone);
			
			console.log ("svg", d3svg);
		});	
	},
        
    identifier: "List View",
        
    optionsToString: function () {
        var matrixObj = this.options.matrixObj;
        return [matrixObj.fromProtein, matrixObj.toProtein]
            .map (function (protein) { return protein.name.replace("_", " "); })
            .join("-")
        ;
    },
});
    