

function transformLinkList( linkList, chainname, structureId, residueStore ){

    chainname = chainname === undefined ? "A" : chainname;

    var tLinkList = [];
    //var nextLinkId = 0;
    var nextResidueId = 0;

    var residueDict = {};
    function getResidueId( resIndex ){
        // TODO add structureId to key
        // TODO in NMR structures there are multiple models
        var key = resIndex + ":" + chainname;
        if( residueDict[ key ] === undefined ){
            residueDict[ key ] = nextResidueId;
            nextResidueId += 1;
        }
        return residueDict[ key ];
    }

    tLinkList = linkList.map( function(rl, i) {
        return {
            origId: rl.id,
            linkId: i,
            residueA: {
                residueId: getResidueId( rl.fromResidue ),
                resno: residueStore.resno [rl.fromResidue], // ngl resindex to resno conversion, as Selection() works with resno not resindex
                chainname: chainname,
                structureId: structureId
            },
            residueB: {
                residueId: getResidueId( rl.toResidue ),
                resno: residueStore.resno [rl.toResidue],   // ngl resindex to resno conversion, as Selection() works with resno not resindex
                chainname: chainname,
                structureId: structureId
            }
        };
    } );

    return tLinkList;

}


var CrosslinkData = function( linkList ){

    this.signals = {
        //linkListChanged: new signals.Signal()
        linkListChanged: new NGL.Signal()
    };

    this.setLinkList( linkList );

};

CrosslinkData.prototype = {

    setLinkList: function( linkList ){

        var linkIdToResidueIds = {};
        var residueIdToLinkIds = {};

        var linkIdToLink = {};
        var residueIdToResidue = {};

        var residueList = [];

        //

        linkList.forEach( function( rl ){
            linkIdToResidueIds[ rl.linkId ] = [
                rl.residueA.residueId,
                rl.residueB.residueId
            ];
            linkIdToLink[ rl.linkId ] = rl;
        } );

        function insertResidue( residue, link ){
            var list = residueIdToLinkIds[ residue.residueId ];
            if( list === undefined ){
                residueIdToLinkIds[ residue.residueId ] = [ link.linkId ];
            }else if( list.indexOf( link.linkId ) === -1 ){
                list.push( link.linkId );
            }
            residueIdToResidue[ residue.residueId ] = residue;
        }

        linkList.forEach( function( rl ){
            insertResidue( rl.residueA, rl );
            insertResidue( rl.residueB, rl );
        } );

        for( var residueId in residueIdToResidue ){
            residueList.push( residueIdToResidue[ residueId ] );
        }

        //

        this._linkIdToResidueIds = linkIdToResidueIds;
        this._residueIdToLinkIds = residueIdToLinkIds;

        this._linkIdToLink = linkIdToLink;
        this._residueIdToResidue = residueIdToResidue;

        this._linkList = linkList;
        this._residueList = residueList;

        this.signals.linkListChanged.dispatch();

    },

    getLinks: function( residue ){

        if( residue === undefined ){

            return this._linkList;

        }else{

            var links = [];
            var linkIds = this._residueIdToLinkIds[ residue.residueId ];

            if( linkIds ){
                for( var i = 0, il = linkIds.length; i < il; ++i ){
                    links.push( this._linkIdToLink[ linkIds[ i ] ] );
                }
            }

            return links;

        }

    },

    getResidues: function( link ){

        if( link === undefined ){

            return this._residueList;

        }else if( Array.isArray( link ) ){

            var residues = [];
            link.forEach( function( l ){
                residues.push( l.residueA, l.residueB );
            } );
            return residues;

        }else{

            return [ link.residueA, link.residueB ];

        }

    },

    findLinks: function( residueA, residueB ){

        var idA = residueA.residueId;
        var idB = residueB.residueId;
        var linklist = this._linkList;

        var links = [];

        for( var i = 0, il = linklist.length; i < il; ++i ){
            var l = linklist[ i ];
            if( l.residueA.residueId === idA && l.residueB.residueId === idB ){
                links.push( l );
            }
        }

        return links.length ? links : false;

    },

    findResidues: function( resno, chainname ){

        var residueList = this._residueList;

        var residues = [];

        for( var i = 0, il = residueList.length; i < il; ++i ){
            var r = residueList[ i ];
            if( r.resno === resno && r.chainname === chainname ){
                residues.push( r );
            }
        }

        return residues.length ? residues : false;

    },

    hasResidue: function( residue ){

        var id = residue.residueId;
        return this._residueIdToResidue[ id ] === undefined ? false : true;

    },

    hasLink: function( link ){

        var id = link.linkId;
        return this._linkIdToLink[ id ] === undefined ? false : true;

    }

};


var CrosslinkRepresentation = function( CLMSmodel, stage, structureComp, crosslinkData, params ){

    var p = Object.assign( {}, params );

    if( p.displayedResiduesColor === undefined && p.displayedColor === undefined ){
        p.displayedResiduesColor = "lightgrey";
    }
    if( p.displayedLinksColor === undefined && p.displayedColor === undefined ){
        p.displayedLinksColor = "lightblue";
    }
    if( p.highlightedResiduesColor === undefined && p.highlightedColor === undefined ){
        p.highlightedResiduesColor = "lightgreen";
    }
    if( p.highlightedLinksColor === undefined && p.highlightedColor === undefined ){
        p.highlightedLinksColor = "lightgreen";
    }
    if( p.sstrucColor === undefined ){
        p.sstrucColor = "wheat";
    }
    if( p.displayedDistanceColor === undefined ){
        p.displayedDistanceColor = "tomato";
    }
    if( p.highlightedDistanceColor === undefined ){
        p.highlightedDistanceColor = "white";
    }
    if( p.displayedDistanceVisible === undefined ){
        p.displayedDistanceVisible = false;
    }
    if( p.highlightedDistanceVisible === undefined ){
        p.highlightedDistanceVisible = true;
    }

    this.setParameters( p, true );

    //

    this.signals = {
        //onPicking: new signals.Signal()
        clicked: new NGL.Signal()
    };

    this.CLMSmodel = CLMSmodel;
    this.stage = stage;
    this.structureComp = structureComp;
    this.crosslinkData = crosslinkData;

    //

    this._displayedResidues = this.crosslinkData.getResidues();
    this._highlightedResidues = [];

    this._displayedLinks = this.crosslinkData.getLinks();
    this._highlightedLinks = [];

    //

    this.colorOptions = {};
    this._initColorSchemes();

    this._initStructureRepr();
    this._initLinkRepr();
    
    console.log ("stage", this.stage);

    this.stage.signals.clicked.add(
        this._handlePicking, this
    );
    this.crosslinkData.signals.linkListChanged.add(
        this._handleDataChange, this
    );

};

CrosslinkRepresentation.prototype = {

    constructor: CrosslinkRepresentation,

    _getAtomPairsFromLink: function( linkList ){

        var atomPairs = [];
        var origIds = [];

        if( !linkList || ( Array.isArray( linkList ) && !linkList.length ) ){

            // atomPairs = [];

        }else if( linkList === "all" ){

            atomPairs = this._getAtomPairsFromResidue();

        }else{

            console.log ("linkList", linkList);
            var resToSele = this._getSelectionFromResidue;

            linkList.forEach( function( rl ){
  
                var selA = resToSele (rl.residueA, false);
                var selB = resToSele (rl.residueB, false);

                if( selA && selB ){
                    atomPairs.push( [selA, selB, rl.origId] );
                    origIds.push (rl.origId);
                } else {
                    console.log ("dodgy pair", rl);
                }

            } );

        }
        
        this.origIds = origIds;

        return atomPairs;
    },
    
    _getAtomObjectPairsFromLink: function( linkList ){

        var atomPairs = [];

        if( !linkList || ( Array.isArray( linkList ) && !linkList.length ) ){

            // atomPairs = [];

        }else if( linkList === "all" ){

            atomPairs = this._getAllAtomObjectPairs();

        }else{

            var structure = this.structureComp.structure;
            var resToSele = this._getSelectionFromResidue;

            atomPairs = linkList.map ( function( rl ){
                //var a1 = structure.getAtoms( resToSele( rl.residueA, true ), true );
                //var a2 = structure.getAtoms( resToSele( rl.residueB, true ), true );
                var selA = resToSele( rl.residueA, false);
                var selB = resToSele( rl.residueB, false );
                //var a1 = structure.getAtomSet( resToSele( rl.residueA, true ), true );
                //var a2 = structure.getAtomSet( resToSele( rl.residueB, true ), true );
                var a3 = structure.getAtomIndices (selA);
                var a4 = structure.getAtomIndices (selB);
                //console.log (rl.residueA, rl.residueB, a1, a2);
                return [a3[0], a4[0]]; // don't filter out null/undefined a1/a2s; ensures atomPair array index order matches linklist array order
            } );

        }

        return atomPairs;
    },
    
    _getAllAtomObjectPairs: function() {
        return this._getAtomObjectPairsFromLink (this.crosslinkData.getLinks());
    },
    
    
    getLinkDistances: function (atomObjPairs) {
        return atomObjPairs.map (function (pair) {
            return pair[0] && pair[1] ? pair[0].distanceTo (pair[1]) : undefined;    
        }); 
    },

    _getAtomPairsFromResidue: function( residue ){

        var linkList = this.crosslinkData.getLinks( residue );

        return this._getAtomPairsFromLink( linkList );

    },

    _getSelectionFromResidue: function( resnoList, asSelection ){

        var sele;

        if( !resnoList || ( Array.isArray( resnoList ) && !resnoList.length ) ){

            sele = "none";

        }else{

            if( resnoList === "all" ){
                resnoList = this.crosslinkData.getResidues();
            }

            if( !Array.isArray( resnoList ) ) resnoList = [ resnoList ];

            var tmp = resnoList.map ( function( r ){
                var rsele = r.resno;
                //if( r.chainname ) { rsele = rsele + ":" + r.chainname; }
                return rsele;
            } );

            sele = "( " + tmp.join( " OR " ) + " ) AND .CA";

        }

        return asSelection ? new NGL.Selection( sele ) : sele;

    },

    _initStructureRepr: function(){

        var comp = this.structureComp;

        var resSele = this._getSelectionFromResidue(
            this._displayedResidues
        );
        var resEmphSele = this._getSelectionFromResidue(
            this._highlightedResidues
        );

        this.sstrucRepr = comp.addRepresentation( "cartoon", {
            color: this.sstrucColor,
            name: "sstruc"
        } );

        this.resRepr = comp.addRepresentation( "spacefill", {
            sele: resSele,
            color: this.displayedResiduesColor,
            scale: 0.6,
            name: "res"
        } );

        this.resEmphRepr = comp.addRepresentation( "spacefill", {
            sele: resEmphSele,
            color: this.highlightedResiduesColor,
            scale: 0.9,
            opacity: 0.7,
            name: "resEmph"
        } );

        this.stage.centerView( true );
        comp.centerView( true );

    },

    _initLinkRepr: function(){

        var comp = this.structureComp;

        var xlPair = this._getAtomPairsFromLink(
            this._displayedLinks
        );
        var xlPairEmph = this._getAtomPairsFromLink(
            this._highlightedLinks
        );

        this.linkRepr = comp.addRepresentation( "distance", {
            atomPair: xlPair,
            //colorValue: this.displayedLinksColor,
            colorScheme: this.colorOptions["selScheme"],
            labelSize: 2.0,
            labelColor: this.displayedDistanceColor,
            labelVisible: false, //this.displayedDistanceVisible,
            name: "link"
        } );
        
        console.log ("comp & repr", comp, this.linkRepr, xlPair);

        this.linkEmphRepr = comp.addRepresentation( "distance", {
            atomPair: xlPairEmph,
            colorValue: this.highlightedLinksColor,
            labelSize: 2.0,
            labelColor: this.highlightedDistanceColor,
            labelVisible: this.highlightedDistanceVisible,
            scale: 2.5,
            opacity: 0.6,
            name: "linkEmph"
        } );

    },

    _initColorSchemes: function(){

        var self = this;

        var linkCountScale = chroma
            .scale( 'YlGn' )
            .mode('lch')
            .domain( [ 0, 8 ] );

        this.linkCountScheme = NGL.ColorMakerRegistry.addScheme( function( params ){

            this.atomColor = function( atom ){

                var count = self.xlRes[ atom.resno ].length;

                var _c = linkCountScale( count )._rgb;
                var c = _c[0] << 16 | _c[1] << 8 | _c[2];

                return c;

            }

        }, "linkCount" );

        this.colorOptions[ "linkCount" ] = this.linkCountScheme;
        //this.colorOptions[ "white" ] = new THREE.Color( "white" ).getHex();
        //this.colorOptions[ "lightgrey" ] = new THREE.Color( "lightgrey" ).getHex();
        this.colorOptions[ "white" ] = new NGL.Color( "white" ).getHex();
        this.colorOptions[ "lightgrey" ] = new NGL.Color( "lightgrey" ).getHex();
        
        var selColourScheme = function(params) {
            this.atomColor = function( a ){
                console.log ("atom", a);
                return 255;
            };
            
            this.bondColor = function(b, fromTo) {
                console.log ("bond", b);
                var origLinkId = self.origIds[b.index];
                console.log ("origLink", origLinkId);
                var link = self.CLMSmodel.get("clmsModel").get("crossLinks").get(origLinkId);
                console.log ("link", link);
                var col = self.CLMSmodel.get("linkColourAssignment").get("colScale")(link);

                console.log ("col", col);
                var col3 = d3.rgb(col);
                return col ? (col3.r << 16) + (col3.g << 8) + col3.b : 255;
            };
        };
        
        this.colorOptions["selScheme"] = NGL.ColorMakerRegistry.addScheme (selColourScheme, "xlink");
        console.log ("scheme", this.colorOptions["selScheme"]);

    },

    _handlePicking: function( pickingData ){

        var pd = pickingData;
        var crosslinkData = this.crosslinkData;

        var pd2 = {
            residue: undefined,
            link: undefined
        };

        if( pd.atom !== undefined && pd.bond === undefined ){

            var residues = crosslinkData.findResidues(
                pd.atom.resno, pd.atom.chainname
            );
            if( residues ){
                pd2.residue = residues[ 0 ];
            }

        }else if( pd.bond !== undefined ){

            var residuesA = crosslinkData.findResidues(
                pd.bond.atom1.resno, pd.bond.atom1.chainname
            );

            var residuesB = crosslinkData.findResidues(
                pd.bond.atom2.resno, pd.bond.atom2.chainname
            );

            if( residuesA && residuesB ){
                var links = crosslinkData.findLinks(
                    residuesA[ 0 ], residuesB[ 0 ]
                );
                if( links ){
                    pd2.link = links[ 0 ];
                }
            }

        }

        this.signals.clicked.dispatch( pd2 );

    },

    _handleDataChange: function(){

        this.setDisplayedResidues( this._displayedResidues );
        this.setHighlightedResidues( this._highlightedResidues );

        this.setDisplayedLinks( this._displayedLinks );
        this.setHighlightedLinks( this._highlightedLinks );

    },

    _getAvailableResidues: function( residues ){

        if( !residues ) return residues;

        var crosslinkData = this.crosslinkData;
        var availableResidues = [];

        residues.forEach( function( r ){
            if( crosslinkData.hasResidue( r ) ){
                availableResidues.push( r );
            }
        } );

        return availableResidues;

    },

    _getAvailableLinks: function( links ){

        if( !links ) return links;

        var crosslinkData = this.crosslinkData;
        var availableLinks = [];

        links.forEach( function( l ){
            if( crosslinkData.hasLink( l ) ){
                availableLinks.push( l );
            }
        } );

        return availableLinks;

    },
    
    _makeOverallSelection: function (aPairs) {
        var allSels = d3.merge (aPairs);
        return "(" + allSels.join(") OR (") + ")";
    },
    
    /*
    tinkerWithBonds: function (repr) {
        console.log ("repr", repr);
        var distanceData = repr.dataList[0];
        var bondParams = {
	       bondSet: distanceData.bondSet,
	       bondStore: distanceData.bondStore
	   };
	   var bondData = repr.getBondData( repr.structureView, undefined, bondParams );
        
        return bondData;
    },
    */
    // API

    setDisplayed: function( residues, links ){
        this.setDisplayedResidues( residues );
        this.setDisplayedLinks( links );

    },

    setHighlighted: function( residues, links ){

        this.setHighlightedResidues( residues );
        this.setHighlightedLinks( links );

    },

    setDisplayedResidues: function( residues ){

        this._displayedResidues = residues;
        var availableResidues = this._getAvailableResidues( residues );

        this.resRepr.setSelection(
            this._getSelectionFromResidue( availableResidues )
        );

    },

    setHighlightedResidues: function( residues ){

        this._highlightedResidues = residues;
        var availableResidues = this._getAvailableResidues( residues );

        this.resEmphRepr.setSelection(
            this._getSelectionFromResidue( availableResidues )
        );

    },

    setDisplayedLinks: function( links ){
        this._displayedLinks = links;
        var availableLinks = this._getAvailableLinks( links );
       // console.log ("disp links", availableLinks);
        //console.log ("resids", this.crosslinkData._residueIdToLinkIds, this.crosslinkData._linkIdToResidueIds);
        var atomPairs = this._getAtomPairsFromLink (availableLinks);
        console.log ("atom pairs", atomPairs);
        
        console.log ("this", this.linkRepr);
        //console.log ("bonddata", this.tinkerWithBonds (this.linkRepr.repr));
        this.linkRepr.setParameters ({
            atomPair: atomPairs,
        });
    },

    setHighlightedLinks: function( links ){

        this._highlightedLinks = links;
        var availableLinks = this._getAvailableLinks( links );

        //console.log ("this", this.linkEmphRepr);
        this.linkEmphRepr.setParameters( {
            atomPair: this._getAtomPairsFromLink( availableLinks ),
        } );

    },
    

    /**
     * params
     *
     * - displayedColor (sets residues and links color)
     * - highlightedColor (sets residues and links color)
     * - displayedResiduesColor
     * - highlightedResiduesColor
     * - displayedLinksColor
     * - highlightedLinksColor
     * - sstrucColor
     * - displayedDistanceColor (can't be a color scheme)
     * - highlightedDistanceColor (can't be a color scheme)
     * - displayedDistanceVisible
     * - highlightedDistanceVisible
     */
    setParameters: function( params, initialize ){

        var p = Object.assign( {}, params );

        var resParams = {};
        var linkParams = {};
        var resEmphParams = {};
        var linkEmphParams = {};
        var sstrucParams = {};

        // set params

        resParams.color = p.displayedColor;
        linkParams.color = p.displayedColor;
        resEmphParams.color = p.highlightedColor;
        linkEmphParams.color = p.highlightedColor;

        if( p.displayedResiduesColor ){
            resParams.color = p.displayedResiduesColor;
        }
        if( p.displayedLinksColor ){
            linkParams.color = p.displayedLinksColor;
        }
        if( p.highlightedResiduesColor ){
            resEmphParams.color = p.highlightedResiduesColor;
        }
        if( p.highlightedLinksColor ){
            linkEmphParams.color = p.highlightedLinksColor;
        }

        sstrucParams.color = p.sstrucColor;

        linkParams.labelColor = p.displayedDistanceColor;
        linkEmphParams.labelColor = p.highlightedDistanceColor;
        linkParams.labelVisible = p.displayedDistanceVisible;
        linkEmphParams.labelVisible = p.highlightedDistanceVisible;

        // set object properties

        if( resParams.color !== undefined ){
            this.displayedResiduesColor = resParams.color;
        }
        if( linkParams.color !== undefined ){
            this.displayedLinksColor = linkParams.color;
        }
        if( resEmphParams.color !== undefined ){
            this.highlightedResiduesColor = resEmphParams.color;
        }
        if( linkEmphParams.color !== undefined ){
            this.highlightedLinksColor = linkEmphParams.color;
        }

        if( sstrucParams.color !== undefined ){
            this.sstrucColor = sstrucParams.color;
        }

        if( linkParams.labelColor !== undefined ){
            this.displayedDistanceColor = linkParams.labelColor;
        }
        if( linkEmphParams.labelColor !== undefined ){
            this.highlightedDistanceColor = linkEmphParams.labelColor;
        }
        if( linkParams.labelVisible !== undefined ){
            this.displayedDistanceVisible = linkParams.labelVisible;
        }
        if( linkEmphParams.labelVisible !== undefined ){
            this.highlightedDistanceVisible = linkEmphParams.labelVisible;
        }

        // pass params to representations

        if( !initialize ){

            this.resRepr.setColor( resParams.color );
            this.linkRepr.setColor( linkParams.color );
            this.resEmphRepr.setColor( resEmphParams.color );
            this.linkEmphRepr.setColor( linkEmphParams.color );
            this.sstrucRepr.setColor( sstrucParams.color );

            this.resRepr.setParameters( resParams );
            this.linkRepr.setParameters( linkParams );
            this.resEmphRepr.setParameters( resEmphParams );
            this.linkEmphRepr.setParameters( linkEmphParams );
            this.sstrucRepr.setParameters( sstrucParams );

        }

    },

    dispose: function(){

        this.stage.signals.clicked.remove(
            this._handlePicking, this
        );
        this.crosslinkData.signals.linkListChanged.remove(
            this._handleDataChange, this
        );

        this.stage.removeRepresentation( this.sstrucRepr );
        this.stage.removeRepresentation( this.resRepr );
        this.stage.removeRepresentation( this.resEmphRepr );
        this.stage.removeRepresentation( this.linkRepr );
        this.stage.removeRepresentation( this.linkEmphRepr );

    }

};
