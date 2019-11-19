var mongoose = require('mongoose');

var Schema = mongoose.Schema;
var Mixed = Schema.Types.Mixed;
var HoldemHandSchema = new Schema({
    tournamentid :      { type:String },
    handid:             { type:String },
    date:               { type:String },
    blinds:             { type:String },
    chipswon:           { types:Number, default: 0 },
    allin_adj:          { types:Number, default:0 },
    allin_stage:        { types:String, default:'' },
    hero:               { types:String, default:'' },
    winner:             { types:String, default:'' },
    players:            { type:Mixed, default:[]},
    pot:                { type:Number, default:0 },
});

module.exports = mongoose.model('holdem_hands', HoldemHandSchema);