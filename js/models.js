var CLMSUI = CLMSUI || {};

CLMSUI.BackboneModelTypes = _.extend (CLMSUI.BackboneModelTypes || {},

{
    DistancesModel: Backbone.Model.extend({
        flattenedDistances: function () {
            return CLMSUI.modelUtils.flattenDistanceMatrix (this.get("distances"));
        }
    }),

    FilterModel: Backbone.Model.extend ({
        defaults: {
            "A": true, "B": true, "C": true, "Q": true, "unval": true, 
            "AUTO": true,
            "linears": true,
            "decoys": false,
            "pepSeq": "",
            "protNames": "",
            "charge": "",
            "runName": "",
            "scanNumber": "",            
            "selfLinks": true,
            "ambig": true,
            interFDRCut: undefined,
            intraFDRCut: undefined,
            "seqSep": "",
        },

        initialize: function () {
            // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
            if (!this.get("cutoff")) {
                this.set ("cutoff", [0,100]);
            }
            // scoreExtent used to restrain text input values
            this.scoreExtent = this.get("cutoff").slice(0);
        },

        filter: function (match) {
			//linears? - if linear and linears not selected return false
            if (match.linkPos1 == 0 && this.get("linears")  == false) return false; 

			//decoys? - if decoy and decoys not selected return false
            if (match.is_decoy && this.get("decoys")  == false) return false; 

			//ambigs? - if ambig's not selected and match is ambig return false
			if (this.get("ambig") == false) {
				if (match.pepPos1.length > 1 || match.pepPos2.length > 1) return false;
			}

			//self-links? - if self links's not selected and match is self link return false
			// possible an ambiguous self link will still get displayed
			if (this.get("selfLinks") == false) {
				var isSelfLink = true;
				var p1 = match.protein1[0];
				for (var i = 1; i < match.protein1.length; i++) {
					if (match.protein1[i] != p1){
						 isSelfLink = false;
						 break;
					 }
				}
				for (var i = 0; i < match.protein2.length; i++) {
					if (match.protein2[i] != p1){
						isSelfLink = false;
						break;
					}
				}
				if (isSelfLink) {
					return false;
				}
			}

			// if fail score cut off, return false;
            if (match.score < this.get("cutoff")[0] || match.score > this.get("cutoff")[1]){
				return false;
			}
			
			//peptide seq check
			if (seqCheck(this.get("pepSeq")) == false) {
				return false;
			};
			
			//protein name check
			if (proteinNameCheck(this.get("protNames")) == false) {
				return false;
			};
			
			//charge check
			var chargeFilter = this.get("charge");
			if (chargeFilter && match.precursorCharge != chargeFilter){
				return false;
			}

			//run name check
			var runNameFilter = this.get("runName");
			if (runNameFilter && 
					match.runName.toLowerCase().indexOf(runNameFilter.toLowerCase()) == -1){
				return false;
			}

			//scan number check
			var scanNumberFilter = this.get("scanNumber");
			if (scanNumberFilter && 
					match.scanNumber.toString().toLowerCase()
						.indexOf(scanNumberFilter.toLowerCase()) == -1){
				return false;
			}


            var seqSepFilter = this.get("seqSep");
            if (!isNaN(seqSepFilter)) {
                 //if not ambig && is selfLink
                if (match.protein1.length == 1 && match.protein2
                        && match.protein1[0] == match.protein2[0]) {
                    var unambigCrossLink = match.crossLinks[0];
                    if ((unambigCrossLink.toResidue - unambigCrossLink.fromResidue) < seqSepFilter){
                        return false;
                    }
                }
            }

            var vChar = match.validated;
            if (vChar == 'R') return false;
            if (vChar == 'A' && this.get("A")) return true;
            if (vChar == 'B' && this.get("B")) return true;
            if (vChar == 'C' && this.get("C")) return true;
            if (vChar == '?' && this.get("Q")) return true;
            
            if (match.autovalidated && this.get("AUTO")) return true;
			if (match.autovalidated == false && !vChar && this.get("unval")) return true;
            return false;
            
            //peptide seq check function
			function seqCheck(searchString) {
				if (searchString) {
					var pepStrings = searchString.split('-');
					if (pepStrings.length ==1) {
						for (matchedPeptide of match.matchedPeptides) {
							if (matchedPeptide.sequence.indexOf(searchString.toUpperCase()) != -1
								|| matchedPeptide.seq_mods.toLowerCase().indexOf(searchString.toLowerCase()) != -1) {
								return true;
							}
						}
						return false;
					}
					
					var used = [], matchedPepCount = match.matchedPeptides.length;
					for (pepString of pepStrings) {
						if (pepString){
							var found = false;
							for (var i = 0; i < matchedPepCount; i++){
								var matchedPeptide = match.matchedPeptides[i];
								if (found === false && typeof used[i] == 'undefined'){
									if (matchedPeptide.sequence.indexOf(pepString.toUpperCase()) != -1
									 || matchedPeptide.seq_mods.toLowerCase().indexOf(pepString.toLowerCase()) != -1) {
										 found = true;
										 used[i] = true;
									}
								}
							}
							if (found === false) return false;					
						}
					}
				}
				return true;
			}            
			
            //protein name check
			function proteinNameCheck(searchString) {
				if (searchString) {
					var nameStrings = searchString.split('-');
					if (nameStrings.length ==1) {
						for (matchedPeptide of match.matchedPeptides) {
							for (pid of matchedPeptide.prt) {
								var name = 
								CLMSUI.compositeModelInst.get("clmsModel").get("interactors").get(pid).name;
								if (name.toLowerCase().indexOf(searchString.toLowerCase()) != -1) {
									return true;
								}
							
							}
						}
						return false;
					}
					
					var used = [], matchedPepCount = match.matchedPeptides.length;
					for (nameString of nameStrings) {
						if (nameString){
							var found = false;
							for (var i = 0; i < matchedPepCount; i++){
								var matchedPeptide = match.matchedPeptides[i];
								if (found === false && typeof used[i] == 'undefined'){
									for (pid of matchedPeptide.prt) {
										var name = CLMSUI.compositeModelInst.get("clmsModel")
												.get("interactors").get(pid).name;
										if (name.toLowerCase().indexOf(nameString.toLowerCase()) != -1) {
											found = true;
											used[i] = true;
										}
									}
								}
							}
							if (found === false) return false;					
						}
					}
				}
				return true;
			}
        },
        
        filterLink: function (link) {
            if (link.meta && link.meta.fdrScore !== undefined) {
                var fdr = link.meta.fdrScore;
                var intra = CLMSUI.modelUtils.isIntraLink (link);
                return fdr >= this.get (intra ? "intraFDRCut" : "interFDRCut");
            }
            return false;
        }
    }),


    RangeModel: Backbone.Model.extend ({
        defaults: {
            active: false
        },
    }),

        // I want MinigramBB to be model agnostic so I can re-use it in other places
    MinigramModel: Backbone.Model.extend ({
        defaults: {
            domainStart: 0,
            domainEnd: 100,
        },
        data: function() { return [1,2,3,4]; },
    }),

    TooltipModel: Backbone.Model.extend ({
        defaults: {
            location: null,
            header: "Tooltip",
        },
        initialize: function () {
            // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
            this.set("contents", ["Can show", "single items", "lists or", "tables"]);
        }
    }),

    BlosumModel: Backbone.Model.extend ({
        initialize: function() {
            console.log ("Blosum model initialised", this);
        },
    }),


    TestModel: Backbone.Model.extend ({
        defaults : {
            prime: "animal",
            //secondaries: ["blee", "whee"],
            tertiary: 36,
        },

        initialize: function () {
            // http://stackoverflow.com/questions/6433795/backbone-js-handling-of-attributes-that-are-arrays
            // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
            this.set ("secondaries", ["blee", "whee"]);
        },
    }),

});

// this is separate to get round the fact BlosumModel won't be available within the same declaration
CLMSUI.BackboneModelTypes = _.extend (CLMSUI.BackboneModelTypes || {},
{
    BlosumCollection: Backbone.Collection.extend ({
        model: CLMSUI.BackboneModelTypes.BlosumModel,
        url: "R/blosums.json",
        parse: function(response) {
            // turn json object into array, add keys to value parts, then export just the values
            var entries = d3.entries (response);
            var values = entries.map (function (entry) {
                entry.value.key = entry.key;
                return entry.value;
            });

            console.log ("response", response, values);
            return values;
        }
    }),

    TestCollection: Backbone.Collection.extend ({
        model: CLMSUI.BackboneModelTypes.TestModel,

        // use this to grab merger of new and existing arrays for a model attribute before adding/merging the collection's models themselves
        mergeArrayAttr: function (modelId, attrName, appendThis) {
            var model = this.get(modelId);
            if (model) {
                var attr = model.get(attrName);
                if (attr && $.type(attr) === "array") {
                    appendThis.unshift.apply (appendThis, attr);
                }
            }
            return appendThis;
        },
    }),
});
