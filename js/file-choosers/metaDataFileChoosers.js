import * as _ from 'underscore';
import Backbone from "backbone";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {utils} from "../utils";
import {modelUtils} from "../modelUtils";

const AbstractMetaDataFileChooserBB = BaseFrameView.extend({

    events: function() {
        var parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "change .selectMetaDataFileButton": "selectMetaDataFile",
        });
    },

    defaultOptions: {
        expandTheseKeys: d3.set(["example"]),
        removeTheseKeys: d3.set(["sectionName", "id"]),
    },

    initialize: function(viewOptions) {
        AbstractMetaDataFileChooserBB.__super__.initialize.apply(this, arguments);

        var self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        var mainDivSel = d3.select(this.el);

        mainDivSel.classed ("metaLoadPanel", true);

        var wrapperPanel = mainDivSel.append("div")
            .attr("class", "panelInner");

        var toolbar = wrapperPanel.append("div").attr("class", "toolbar");

        toolbar.append("label")
            .attr("class", "btn btn-1 btn-1a fakeButton")
            .append("span")
            .text(self.options.buttonText)
            .append("input")
            .attr({
                type: "file",
                accept: "text/csv,.csv,.gaf",
                class: "selectMetaDataFileButton"
            });

        wrapperPanel.append("div").attr("class", "messagebar").style("display", "none");

        var formatPanel = wrapperPanel.append("div").attr("class", "expectedFormatPanel");

        formatPanel.append("a")
            .text ("Click to open XiDocs for CSV format details")
            .attr ("href", self.options.docUrl)
            .attr ("target", "_blank")
        ;
    },

    setUpCompletionListener: function () {
        var self = this;
        this.listenToOnce (vent, self.options.loadedEventName, function(metaMetaData, sourceData) {
            if (sourceData && sourceData.source === "file") {
                var columns = metaMetaData.columns;
                var matchedItemCount = metaMetaData.matchedItemCount;
                var success = !_.isEmpty(columns) && matchedItemCount ? true : false;
                var msg1 = _.template(this.options.parseMsgTemplate)({
                    attrCount: columns ? columns.length : 0,
                    itemCount: matchedItemCount
                });
                self.setStatusText("File " + this.lastFileName + ":<br>" + (success ? "" : "Error! ") + msg1, success);
            }
        });
    },

    setStatusText: function(msg, success) {
        var mbar = d3.select(this.el).select(".messagebar").style("display", null);
        var t = mbar.html(msg).transition().delay(0).duration(1000).style("color", (success === false ? "red" : (success ? "blue" : null)));
        if (success !== undefined) {
            t.transition().duration(5000).style("color", "#091d42");
        }
    },

    selectMetaDataFile: function(evt) {
        var fileObj = evt.target.files[0];
        this.setStatusText("Please Wait...");
        this.lastFileName = fileObj.name;
        var onLoadFunc = this.onLoadFunction.bind(this);
        modelUtils.loadUserFile(fileObj, onLoadFunc);
    },

    identifier: "An Abstract MetaData File Chooser",
});

export const ProteinMetaDataFileChooserBB = AbstractMetaDataFileChooserBB.extend({

    initialize: function(viewOptions) {
        var myDefaults = {
            buttonText: "Select Protein MetaData CSV File",
            loadedEventName: "proteinMetadataUpdated",
            parseMsgTemplate: "Parsed <%= attrCount %> MetaData Attributes across <%= itemCount %> Identified Proteins",
            docUrl: "../xidocs/html/import/proteinmeta.html",
        };
        viewOptions.myOptions = _.extend(myDefaults, viewOptions.myOptions);
        ProteinMetaDataFileChooserBB.__super__.initialize.apply(this, arguments);
    },

    onLoadFunction: function(fileContents) {
        this.setUpCompletionListener ();
        modelUtils.updateProteinMetadata (fileContents, this.model.get("clmsModel"));
    },

    identifier: "Protein MetaData File Chooser",
});


export const LinkMetaDataFileChooserBB = AbstractMetaDataFileChooserBB.extend({

    initialize: function(viewOptions) {
        var myDefaults = {
            buttonText: "Select Cross-Link or PPI MetaData CSV File",
            loadedEventName: "linkMetadataUpdated",
            parseMsgTemplate: "Parsed <%= attrCount %> MetaData Attributes across <%= itemCount %> Identified Cross-Links",
            docUrl: "../xidocs/html/import/crossmeta.html"
        };
        viewOptions.myOptions = _.extend(myDefaults, viewOptions.myOptions);
        LinkMetaDataFileChooserBB.__super__.initialize.apply(this, arguments);
    },

    onLoadFunction: function(fileContents) {
        this.setUpCompletionListener ();
        modelUtils.updateLinkMetadata (fileContents, this.model.get("clmsModel"));
    },

    identifier: "Cross-Link MetaData File Chooser",
});


export const UserAnnotationsMetaDataFileChooserBB = AbstractMetaDataFileChooserBB.extend({

    initialize: function(viewOptions) {
        var myDefaults = {
            buttonText: "Select User-Defined Annotations CSV File",
            loadedEventName: "userAnnotationsUpdated",
            parseMsgTemplate: "Parsed <%= attrCount %> Annotation Types across <%= itemCount %> Annotations",
            docUrl: "../xidocs/html/import/userannotations.html"
        };
        viewOptions.myOptions = _.extend(myDefaults, viewOptions.myOptions);
        UserAnnotationsMetaDataFileChooserBB.__super__.initialize.apply(this, arguments);
    },

    onLoadFunction: function(fileContents) {
        this.setUpCompletionListener ();
        modelUtils.updateUserAnnotationsMetadata (fileContents, this.model.get("clmsModel"));
    },

    identifier: "User Annotations File Chooser",
});

const MetaLoaderViewRegistry = [ProteinMetaDataFileChooserBB, LinkMetaDataFileChooserBB, UserAnnotationsMetaDataFileChooserBB];
