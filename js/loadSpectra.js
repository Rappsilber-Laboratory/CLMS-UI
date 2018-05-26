var CLMSUI = CLMSUI || {};

CLMSUI.loadSpectra = function (match, randId, spectrumModel) {

    var xiAnnotRoot = CLMSUI.xiAnnotRoot || "";

    var annotationRequest = {};

    var peptides = [];
    var linkSites = [];
    peptides[0] = CLMSUI.arrayifyPeptide(match.matchedPeptides[0].seq_mods);
    linkSites[0] = {"id":0, "peptideId":0, "linkSite": match.linkPos1 - 1};
    if (match.matchedPeptides[1]) {
        peptides[1] = CLMSUI.arrayifyPeptide(match.matchedPeptides[1].seq_mods);
        linkSites[1] = {"id":0, "peptideId":1, "linkSite": match.linkPos2 - 1}
    }

    annotationRequest.Peptides = peptides;
    annotationRequest.LinkSite = linkSites;

    annotationRequest.annotation = {};

    var fragTolArr = match.spectrum.ft.split(" ");
    annotationRequest.annotation.fragmentTolerance = {"tolerance":+fragTolArr[0], "unit":fragTolArr[1]};

    // //todo modifications
    annotationRequest.annotation.modifications =// CLMSUI.compositeModelInst.get('clmsModel').get('modifications');
[
       {"aminoAcids":["M"],"id":"oxidation","mass":"15.994915"},
        {"aminoAcids":["C"],"id":"cm","mass":"57.021465"},
        {"aminoAcids":["Q"],"id":"ammonia-loss","mass":"-17.026548"},
        {"aminoAcids":["A"],"id":"acetyl","mass":"42.010567"}
];



    //annotationRequest.annotation.modifications = [{aminoAcids: ["M"], id: "oxidation", mass: "15.994915"}];

    var ionTypes = match.ions.split(";");
    var ionTypeCount = ionTypes.length;
    var ions = [];
    for (var it = 0; it < ionTypeCount; it++) {
        var ionType = ionTypes[it];
        ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
    }
    annotationRequest.annotation.ions = ions;

    var crossLinker = {};
    crossLinker.modMass = 0;//+match.matchedPeptides[0].clModMass;
    annotationRequest.annotation["cross-linker"] = crossLinker; // yuk
    //
    annotationRequest.annotation.precursorCharge = +match.precursorCharge;
    annotationRequest.annotation.precursorMZ = +match.expMZ;
    annotationRequest.annotation.custom = [""];

    // annotationRequest.annotation =  {
    //                             "fragmentTolerance":{"tolerance":"0.01","unit":"Da"},
    //                             "modifications":[
    //                                 {"aminoAcids":["M"],"id":"oxidation","mass":"15.994915"}
    //                                 //{"aminoAcids":["C"],"id":"carbamidomethyl","mass":"57.021465"},
    //                                 //{"aminoAcids":["Q"],"id":"ammonia-loss","mass":"-17.026548"},
    //                                 //{"aminoAcids":["A"],"id":"acetyl","mass":"42.010567"}
    //                             ],
    //                             "ions":[
    //                                 {"type":"PeptideIon"},
    //                                 {"type":"BIon"},
    //                                 {"type":"YIon"}],
    //                             "cross-linker":{"modMass":0},
    //                             "precursorCharge":3,
    //                             "precursorMZ":1102.9017300194,
    //                             "custom":[""]
    //                         };


    //var annotationRequest = CLMSUI.convert_to_json_request(match);

    d3.text ('../CLMS-model/php/peakList.php?uid='+match.searchId+'&spid='+match.spectrumId, function(error, text) {
        if (error) {
            console.log ("error getting peak list", error);
            d3.select("#range-error").text ("Cannot load spectra from URL");
            spectrumModel.clear();
        } else {
            //console.log ("peakList:", text);
            var peakJson = [];
            var peaks = text.split('\n');
            var peakCount = peaks.length;
            for (var p = 0; p < peakCount; p++) {
                var peak = peaks[p].trim();
                if (peak != ""){
                    peakParts = peak.split(/\s+/);
                    peakJson.push({"mz":+peakParts[0], "intensity":+peakParts[1]})
                }
            }
            annotationRequest.peaks = peakJson;

            // annotationRequestJson = JSON.stringify(annotationRequest)
            // console.log(annotationRequestJson);

    		var response = $.ajax({
    			type: "POST",
    			headers: {
    			    'Accept': 'application/json',
    			    'Content-Type': 'application/json'
    			},
    			data: JSON.stringify(annotationRequest),
    			async: false,
    			url: xiAnnotRoot + "annotate/FULL",
    			success: function(data) {
    				//ToDo: Error handling -> talked to Lutz, he will implement transfer of error message as json
    				console.log("annotation response:", data);
    				spectrumModel.set({"JSONdata": data, match: match, randId: randId});
    				//self.setData();

    				// if (self.otherModel !== undefined){
    				// 	var json_data_copy = jQuery.extend({}, data);
    				// 	self.otherModel.set({"JSONdata": json_data_copy, "JSONrequest": json_request});
    				// 	self.otherModel.trigger("change:JSONdata");
    				// }
    				//self.trigger('request_annotation:done');
    			}
    		});

            /*var url = xiAnnotRoot + "annotate/" + annotationRequestJson;

            console.log("URL!:", url)

            d3.json (url, function(error, json) {
                if (error) {
                    console.log ("error", error, "for", url);
                    d3.select("#range-error").text ("Cannot load spectra from URL");
                    spectrumModel.clear();
                } else {
                    d3.select("#range-error").text ("");
                    spectrumModel.set ({JSONdata: json, match: match, randId: randId});
                }
            });
            */
        }
    });
};
/*
xiSPEC.convert_to_json_request = function (data) {

    // defaults
    if(data.ionTypes === undefined){
        data.ionTypes = "peptide;b;y";
    }
    if(data.crossLinkerModMass === undefined){
        data.crossLinkerModMass = 0;
    }
    if(data.modifications === undefined){
        data.modifications = [];
    }
    if(data.fragmentTolerance === undefined){
        data.fragmentTolerance = {"tolerance": '20.0', 'unit': 'ppm'};
    }


    var annotationRequest = {};
    var peptides = [];
    var linkSites = [];
    peptides[0] = CLMSUI.arrayifyPeptide(data.sequence1);

    if(data.linkPos1 !== undefined){
        linkSites[0] = {"id":0, "peptideId":0, "linkSite": data.linkPos1};
    }
    if (data.sequence2 !== undefined) {
        peptide[1] = xiSPEC.arrayifyPeptide(data.sequence2);
        linkSites[1] = {"id":0, "peptideId":1, "linkSite": data.linkPos1}
    }

    var peaks = [];
    for (var i = 0; i < data.peaklist.length; i++) {
        peaks.push(
            {"intensity": data.peaklist[i][1], "mz": data.peaklist[i][0]}
        );
    }

    annotationRequest.Peptides = peptides;
    annotationRequest.LinkSite = linkSites;
    annotationRequest.peaks = peaks;
    annotationRequest.annotation = {};

    var ionTypes = data.ionTypes.split(";");
    var ionTypeCount = ionTypes.length;
    var ions = [];
    for (var it = 0; it < ionTypeCount; it++) {
        var ionType = ionTypes[it];
        ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
    }
    annotationRequest.annotation.fragmentTolerance = data.fragmentTolerance;
    annotationRequest.annotation.modifications = data.modifications;
    annotationRequest.annotation.ions = ions;
    annotationRequest.annotation["cross-linker"] = {'modMass': data.crossLinkerModMass}; // yuk
    annotationRequest.annotation.precursorMZ = data.precursorMZ;
    annotationRequest.annotation.precursorCharge = data.precursorCharge;
    annotationRequest.annotation.custom = [];

    console.log("request", annotationRequest);
    return annotationRequest;

};*/

CLMSUI.arrayifyPeptide = function (seq_mods) {
    var peptide = {};
    peptide.sequence = [];

    var seq_AAonly = seq_mods.replace(/[^A-Z]/g, '')
    var seq_length = seq_AAonly.length;

    for (var i = 0; i < seq_length; i++) {
        peptide.sequence[i] = {"aminoAcid":seq_AAonly[i], "Modification":"" }
    }

    var re = /[^A-Z]+/g;
    var offset = 1;
    var result;
    while (result = re.exec(seq_mods)) {
        console.log(result);
        peptide.sequence[result.index - offset]["Modification"] = result[0];
        offset += result[0].length;
    }
    return peptide;
}

/*
CLMSUI.validate = function (matchId, validationStatus, randId, successCallBack) {
    $.ajax ({
        type: "POST",
        url: "./php/validateMatch.php",
        data: "mid=" + matchId + "&val=" + validationStatus + "&randId="+randId,
        contentType: "application/x-www-form-urlencoded",
        success: function (data, status, xhr){
            console.log ("SUCCESS VALIDATION", data, status, xhr.responseText);
            successCallBack();
        },
    });
};
*/
