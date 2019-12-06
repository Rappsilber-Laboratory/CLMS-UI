//		STRING Loader Widget
//
//		Martin Graham
//
//		js/STRINGFileChooser.js

var CLMSUI = CLMSUI || {};

CLMSUI.STRINGFileChooserBB = CLMSUI.utils.BaseFrameView.extend({

    events: function() {
        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "keyup .inputTaxonID": "enteringTaxonID",
        });
    },

    initialize: function(viewOptions) {
        CLMSUI.STRINGFileChooserBB.__super__.initialize.apply(this, arguments);

        // this.el is the dom element this should be getting added to, replaces targetDiv
        var mainDivSel = d3.select(this.el).classed ("metaLoadPanel", true);
        var self = this;

        var wrapperPanel = mainDivSel.append("div").attr("class", "panelInner");

        var box = wrapperPanel.append("div").attr("class", "columnbar");

        box.append("p").attr("class", "smallHeading").text("Set NCBI Taxon ID");

        var common = [
            {name: "No Selection", value: "-"},
            {name: "Human", value: 9606},
            {name: "E. Coli str. K-12 / MG1655", value: 511145},
        ];

        box.append("label")
            .text ("Either Choose Organism")
            .attr ("class", "btn nopadLeft")
            .attr ("title", "Select an organism to search STRING scores on")
            .append("select").attr("class", "selectTaxonID withSideMargins")
                .on ("change", function () {
                    var optionSelected = $("option:selected", this);
                    var valueSelected = this.value;
                    d3.select(self.el).select(".inputTaxonID").property ("value", valueSelected);
                    self.enteringTaxonID({keyCode: 13});
                })
                .selectAll("option")
                .data (common)
                .enter()
                .append("option")
                .attr ("value", function (d) { return d.value; })
                .text (function(d) { return d.name + " (" + d.value + ")"; })
        ;


        var taxonSpan = box.append("div")
            .attr("class", "btn nopadLeft")
            .html("or Enter <a href='https://www.ncbi.nlm.nih.gov/taxonomy' target='_blank'>NCBI Taxon ID</a>")
        ;

        taxonSpan.append("input")
            .attr({
                type: "text",
                class: "inputTaxonID withSideMargins",
                maxlength: 16,
                pattern: CLMSUI.utils.commonRegexes.digitsOnly,
                size: 16,
                title: "Enter NCBI Taxon ID here for use in STRING search",
                //placeholder: "eg 1AO6"
            })
            .property("required", true)
        ;

        taxonSpan.append("span").text("& Press Enter");


        box.append("p").attr("class", "smallHeading").text("Other Actions");

        box.append("button")
            .attr ("class", "btn btn-1 btn-1a irreversible")
            .text ("Purge cache")
            .attr ("title", "If local storage reports as full, you can purge cached STRING interactions by pressing this button.")
            .on ("click", function () {
                if (localStorage) {
                    CLMSUI.STRINGUtils.purgeCache();
                }
            })
        ;

        wrapperPanel.append("p").attr("class", "smallHeading").text("Results");
        wrapperPanel.append("div").attr("class", "messagebar").html("&nbsp;"); //.style("display", "none");

        d3.select(this.el).selectAll(".smallHeading").classed("smallHeadingBar", true);

        // Pre-load pdb if requested
        if (viewOptions.initPDBs) {
            this.setVisible (true);
            d3.select(this.el).select(".inputPDBCode").property("value", viewOptions.initPDBs);
            this.loadPDBCode();
        }
    },

    enteringTaxonID: function(evt) {
        if (this.isTaxaIDValid() && evt.keyCode === 13) { // if return key pressed do same as pressing 'Enter' button
            this.loadSTRINGData();
        }
    },

    loadSTRINGData: function() {
        var taxonID = d3.select(this.el).select(".inputTaxonID").property("value");

        this.setWaitingEffect();
        var self = this;
        var callback = function (csv, errorReason) {
            self.setCompletedEffect ();
            var statusText = "";
            if (!errorReason) {
                var result = CLMSUI.modelUtils.updateLinkMetadata (csv, self.model.get("clmsModel"));
                statusText = result.ppiCount + " STRING Interactions matched to protein set.<br>"
            }
            self.setStatusText (errorReason || statusText + "STRING data now available as Legend colour schemes", !errorReason);
        };
        CLMSUI.STRINGUtils.loadStringDataFromModel (this.model.get("clmsModel"), taxonID, callback);
    },

    isTaxaIDValid: function() {
        var elem = d3.select(this.el).select(".inputTaxonID");
        return elem.node().checkValidity();
    },

    identifier: "STRING Data Loader",
});
