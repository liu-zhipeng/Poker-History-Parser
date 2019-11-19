

var BaseController = require('./BaseController');
var View = require('../views/base');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var handParser = require('../hhp');
var HoldemHandModel = require('../models/HoldemHand');
var config = require('../config/index');

var PokerOddsCalcultor = require('poker-odds-calculator');
var CardGroup = PokerOddsCalcultor.CardGroup;
var OddsCalculator = PokerOddsCalcultor.OddsCalculator;

var output_path = path.join(__dirname, '../public/outputs/output.csv');

module.exports = BaseController.extend({
    name: 'HomeController',

    run: async function(req, res, next) {

        var v = new View(res, 'home');
        v.render({
            title: 'Welcome',
            i18n: res,
            session: req.session,
            config: config,
            error: req.flash('error'),
            success: req.flash('success')
        });
    },

    upload: function(req, res, next) {

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).send('No files were uploaded.');
        }

        var input = req.files.handhistory.data;
        this.parseHandHistoryFromUpload(input.toString());


        return res.redirect(req.header.referer);
    },

    parseHandHistoryFromUpload: function(data)
    {
        var self = this;
        var result = handParser.parseHands(data, null);
        var parsedHands = result.parsedHands;
        var logEnabled = false;


        console.log("Parsing hands...");
        var parsedHoldemHands = [];
        for (var idx = 0; idx < parsedHands.length; idx++)
        {
            
            var hand = parsedHands[idx];
            if (logEnabled)
            {
                console.log(hand);
            }
            var tournamentid = hand.info.gameno;
            // if (tournamentid != '2685588964') continue;
            var handid = hand.info.handid;
            var date_time = hand.info.day + '/' + hand.info.month + '/' + hand.info.year + ' ' + hand.info.hour + ':' + hand.info.min + ':' + hand.info.sec;
            var blinds = hand.info.sb + '/' + hand.info.bb + ' ' + hand.info.limit + ' ' + hand.table.maxseats + 'max';
            var hero = hand.hero;
            var pot = 0;
            var winner_name = '';
            var allin_stage = '';
            var donation = hand.info.donation;
            var rake = hand.info.rake;
            var buyin = hand.info.buyin;
            var currency = hand.info.currency;

            // get betting info from users.
            var seats = hand.seats;
            var players = [];
            for (var seatId = 0; seatId < seats.length; seatId++)
            {
                var seat = seats[seatId];
                var seatno = seat.seatno;
                var player = seat.player;
                var chips = seat.chips;
                var player_info = {
                    seatno: seatno,
                    player: player,
                    chips: chips,
                    amount: 0,
                    current_bet_amount: 0,
                    type:'Unknown',
                    is_folded: false,
                    allin: false,
                    card1: 'xx',
                    card2: 'xx',
                    won: false,

                }
                players.push(player_info);
            }

            // process posts stage (small blind and big blind)
            var posts = hand.posts;
            if (posts == undefined || posts.length == 0) 
            {
                console.log("ParsingError: Uncompleted hands detected at post stage");
                continue;
            }
            
            for (var postIdx = 0; postIdx < posts.length; postIdx++)
            {
                var post = posts[postIdx];
                var playername = post.player;
                var player = self.getPlayerFromName(playername, players);

                if (player == null) continue;

                player.type = post.type;
                var blind_amount = post.amount;
                player.amount = blind_amount;
                player.current_bet_amount = blind_amount;

                if (logEnabled)
                {
                    console.log(player.player);
                    console.log(player.amount);
                }
            }

            // 1.  process preflop stage
            var preflops = hand.preflop;
            if (preflops == undefined || preflops.length == 0)
            {
                console.log("ParsingError: Uncompleted hands detected at preflop stage");
                continue;
            }

            for (var preflopIdx = 0; preflopIdx < preflops.length; preflopIdx++)
            {
                var preflop = preflops[preflopIdx];
                var playername = preflop.player;
                var amount = preflop.amount;
                var allin = preflop.allin;
                var type = preflop.type;
                var player = self.getPlayerFromName(playername, players);
                
                if (player == null) continue;

                if (allin != undefined)
                {

                    player.allin = allin;
                    if (allin)
                        allin_stage = 'preflop';
                }

                if (type == 'fold')
                {
                    player.is_folded = true;
                }
                else if (type == 'bet')
                {
                    // player.amount = player.amount + amount - player.current_bet_amount;
                    player.amount = player.amount + amount;
                    player.current_bet_amount = player.current_bet_amount + amount;
                }
                else if (type == 'call')
                {
                    player.amount = player.amount + amount;
                    player.current_bet_amount = 0;
                    //self.betFinished(players);
                }
                else if (type == 'raise')
                {
                    //console.log('current_bet_amount = ' + player.current_bet_amount);
                    var raise_amount = preflop.raiseTo;
                    player.amount = player.amount + raise_amount - player.current_bet_amount;
                    player.current_bet_amount = raise_amount;
                    
                }
                else if (type == 'bet-returned')
                {
                    player.amount = player.amount - amount;
                }
                if (logEnabled)
                {
                    console.log('preflop : ' + type);
                    console.log(player.player);
                    console.log(player.amount);
                }
            }

            self.betFinished(players);

            // 2.  process flop stage
            var flops = hand.flop;

            for (var flopIdx = 0; flopIdx < flops.length; flopIdx++)
            {
                var flop = flops[flopIdx];
                var playername = flop.player;
                var amount = flop.amount;
                var allin = flop.allin;
                var type = flop.type;
                var player = self.getPlayerFromName(playername, players);
                
                
                if (player == null) continue;

                if (allin != undefined)
                {

                    player.allin = allin;
                    if (allin)
                        allin_stage = 'flop';
                }

                if (type == 'fold')
                {
                    player.is_folded = true;
                }
                else if (type == 'bet')
                {
                    // player.amount = player.amount + amount - player.current_bet_amount;
                    player.amount = player.amount + amount;
                    player.current_bet_amount = player.current_bet_amount + amount;

                }
                else if (type == 'call')
                {
                    player.amount = player.amount + amount;;
                    player.current_bet_amount = 0;
                    //self.betFinished(players);
                }
                else if (type == 'raise')
                {
                    var raise_amount = flop.raiseTo;
                    player.amount = player.amount + raise_amount - player.current_bet_amount;
                    player.current_bet_amount = raise_amount;
                }
                else if (type == 'bet-returned')
                {
                    player.amount = player.amount - amount;
                }
                if (logEnabled)
                {
                    console.log('flop : ' + type);
                    console.log(player.player);
                    console.log(player.amount);
                }
            }

            self.betFinished(players);
            // 3.  process turn stage
            var turns = hand.turn;

            for (var turnIdx = 0; turnIdx < turns.length; turnIdx++)
            {
                var turn = turns[turnIdx];
                var playername = turn.player;
                var amount = turn.amount;
                var type = turn.type;
                var allin = turn.allin;
                var player = self.getPlayerFromName(playername, players);
                
                
                if (player == null) continue;
                if (allin != undefined)
                {

                    player.allin = allin;
                    if (allin)
                        allin_stage = 'turn';
                }


                if (type == 'fold')
                {
                    player.is_folded = true;
                }
                else if (type == 'bet')
                {
                    player.amount = player.amount + amount;
                    player.current_bet_amount = player.current_bet_amount + amount;

                }
                else if (type == 'call')
                {
                    player.amount = player.amount + amount;;
                    player.current_bet_amount = 0;
                }
                else if (type == 'raise')
                {
                    var raise_amount = turn.raiseTo;
                    player.amount = player.amount + raise_amount - player.current_bet_amount;
                    player.current_bet_amount = raise_amount;
                }
                else if (type == 'bet-returned')
                {
                    player.amount = player.amount - amount;
                }

                if (player.allin)
                {
                    player.current_bet_amount = 0;
                }


                if (logEnabled)
                {
                    console.log('turn : ' + type);
                    console.log(player.player);
                    console.log(player.amount);
                }
            }              
            

            self.betFinished();
            // 4.  process river stage
            var rivers = hand.river;

            for (var riverIdx = 0; riverIdx < rivers.length; riverIdx++)
            {
                var river = rivers[riverIdx];
                var playername = river.player;
                var amount = river.amount;
                var allin = river.allin;
                var type = river.type;
                var player = self.getPlayerFromName(playername, players);
                
                if (player == null) continue;

                if (allin != undefined)
                {
                    player.allin = allin;
                    if (allin)
                        allin_stage = 'river';
                }

                if (type == 'fold')
                {
                    player.is_folded = true;
                }
                else if (type == 'bet')
                {
                    player.amount = player.amount + amount;
                    player.current_bet_amount = player.current_bet_amount + amount;

                }
                else if (type == 'call')
                {
                    player.amount = player.amount + amount;
                    player.current_bet_amount = 0;
                }
                else if (type == 'raise')
                {
                    var raise_amount = river.raiseTo;
                    player.amount = player.amount + raise_amount - player.current_bet_amount;
                    player.current_bet_amount = raise_amount;
                }
                else if (type == 'bet-returned')
                {
                    player.amount = player.amount - amount;
                }

                if (logEnabled)
                {
                    console.log('river : ' + type);
                    console.log(player.player);
                    console.log(player.amount);
                }
            }          
            
            // 5. process showdown
            var showdowns = hand.showdown;
            for (var showdownIdx = 0; showdownIdx < showdowns.length; showdownIdx++)
            {
                var showdown_item = showdowns[showdownIdx];
                
                var player_name = showdown_item.player;
                var player = self.getPlayerFromName(player_name, players);
                var type = showdown_item.type;

                if (type == 'show')
                {
                    var card1 = showdown_item.card1;
                    var card2 = showdown_item.card2;
                    player.card1 = card1;
                    player.card2 = card2;                      
                }
                else if (type == 'collect')
                {
                    winner_name = player_name;
                    player.won = true;
                }
            }

            // 6. get winner name from summary
            var summary = hand.summary;


            for (var summaryIdx = 0; summaryIdx < summary.length; summaryIdx++)
            {
                var summaryItem = summary[summaryIdx];

                if (summaryItem.type != undefined && summaryItem.type == 'pot')
                {
                    pot = summaryItem.amount;
                }
            }

            if (winner_name == '')
            {
                for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                {
                    if (!players[playerIdx].is_folded)
                    {
                        winner_name = players[playerIdx].player;
                        players[playerIdx].won = true;
                        break;
                    }
                }
            }




            if (logEnabled)
            {
                console.log("New Hand#" + handid);
                for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                {
                    console.log(">>========" + playerIdx + "=======<<");
                    console.log(players[playerIdx]);
                }
                console.log();
            }

            // 7. select hero player.
            var heroPlayer = null;
            for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
            {
                if (hero == players[playerIdx].player)
                {
                    heroPlayer = players[playerIdx];
                    break;
                }
            }

            // calculation of EV equity of Hero.
            var equity = 0;
            var chips_won = 0;
            var allin_adj = 0;
            if (hero == winner_name)
            {
                var playerCards = [];
                var winner_idx = 0;
                var no_fold_count = 0;
                var does_not_show_hand = false;
                for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                {
                    var _player = players[playerIdx];
                    if (_player.is_folded) continue;

                    no_fold_count++;
                    if (_player.card1 == 'xx' || _player.card2 == 'xx')
                    {
                        does_not_show_hand = true;
                        break;
                    }
                    var playercard = _player.card1 + _player.card2;
                    playerCards.push(CardGroup.fromString(playercard));
                    if (_player.player != winner_name)
                        winner_idx++;

                }
                if (no_fold_count == 1 || does_not_show_hand)
                {
                    equity = 1;
                }
                else
                {
                    var board = '';
                    if (allin_stage == 'preflop')            
                    {
                        board = '';
                    }
                    else if (allin_stage == 'flop')
                    {
                        board = hand.board.card1 + hand.board.card2 + hand.board.card3;
                    }
                    else if (allin_stage == 'turn')
                    {
                        board = hand.board.card1 + hand.board.card2 + hand.board.card3 + hand.board.card4;
                    }
                    else
                        allin_exist = false;
                    var board_card = CardGroup.fromString(board);
                    const result = OddsCalculator.calculate(playerCards, board_card);
                    var possibleHandsCount = result.equities[winner_idx].possibleHandsCount;
                    var bestHandCount = result.equities[winner_idx].bestHandCount;
                    var tieHandCount = result.equities[winner_idx].tieHandCount;
                    equity = (bestHandCount + tieHandCount / 2) / possibleHandsCount;
                }

                chips_won = pot - heroPlayer.amount;
                allin_adj = pot * equity - heroPlayer.amount;
            }
            else if (!heroPlayer.is_folded && winner_name != hero)
            {
                var playerCards = [];
                var winner_idx = 0;
                var no_fold_count = 0;
                var does_not_show_hand = false;
                for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                {
                    var _player = players[playerIdx];
                    if (_player.is_folded) continue;

                    no_fold_count++;
                    if (_player.card1 == 'xx' || _player.card2 == 'xx')
                    {
                        does_not_show_hand = true;
                        break;
                    }
                    var playercard = _player.card1 + _player.card2;
                    playerCards.push(CardGroup.fromString(playercard));
                    if (_player.player != winner_name)
                        winner_idx++;

                }
                if (no_fold_count == 1 || does_not_show_hand)
                {
                    
                    equity = 0;
                }
                else
                {
                    var board = '';
                    if (allin_stage == 'preflop')            
                    {
                        board = '';
                    }
                    else if (allin_stage == 'flop')
                    {
                        board = hand.board.card1 + hand.board.card2 + hand.board.card3;
                    }
                    else if (allin_stage == 'turn')
                    {
                        board = hand.board.card1 + hand.board.card2 + hand.board.card3 + hand.board.card4;
                    }
                    else
                        allin_exist = false;
                    var board_card = CardGroup.fromString(board);
                    const result = OddsCalculator.calculate(playerCards, board_card);
                    var possibleHandsCount = result.equities[winner_idx].possibleHandsCount;
                    var bestHandCount = result.equities[winner_idx].bestHandCount;
                    var tieHandCount = result.equities[winner_idx].tieHandCount;
                    equity = (bestHandCount + tieHandCount / 2) / possibleHandsCount;
                }

                chips_won = 0 - heroPlayer.amount;
                allin_adj = pot * equity - heroPlayer.amount;
            }
            else
            {
                equity = -1;
                chips_won = 0 - heroPlayer.amount;
                allin_adj = 0 - heroPlayer.amount;
            }

            var donation = hand.info.donation;
            var rake = hand.info.rake;
            var buyin = hand.info.buyin;
            var currency = hand.info.currency;

            var holdemHand = {
                tournamentid : tournamentid,
                handid: handid,
                date: date_time,
                blinds: blinds,
                allin_stage: allin_stage,
                winner: winner_name,
                hero: hero,
                chips_won: chips_won,
                allin_adj: allin_adj,
                equity: equity,
                pot: pot,
                board: board,
                donation: donation,
                rake:  rake,
                buyin: buyin,
                currency: currency
                // players: players,
            }
            parsedHoldemHands.push(holdemHand);
            
            if (logEnabled)
            {
                console.log(holdemHand);
            }
            
        }

        console.log('>>>=================Parsing Finished====================<<<');
        console.log("Creating reports...");

        var reports = [];

        for (var handidx = 0; handidx < parsedHoldemHands.length; handidx++)
        {
            var _parsedHoldemHand = parsedHoldemHands[handidx];

            //console.log(_parsedHoldemHand.handid + '\t' + _parsedHoldemHand.chips_won + '\t' + _parsedHoldemHand.allin_adj + '\t' + _parsedHoldemHand.winner);

            // continue;
            if (self.isReported(_parsedHoldemHand.hero, _parsedHoldemHand.tournamentid, reports))
            {
                self.addReport(_parsedHoldemHand, reports);
            }
            else
            {
                self.createReport(_parsedHoldemHand, reports);
            }
            
        }
        // return;

        console.log('>>>=================Creating Reports Finished====================<<<');
        console.log("Creating report file...");

        
        var output_content = '';
        output_content = 'Player, Tournament#, Hands, Buy-In, Net Won, Chips Won, All-In Adj\n';

        for (var reportIdx = 0; reportIdx < reports.length; reportIdx++)
        {
            var report = reports[reportIdx];
            console.log('>>==========' + reportIdx + '==========<<');
            console.log(reports[reportIdx]);
            output_content += report.player + ', ' +
                              report.tournament + ',' +
                              report.hands + ', ' +
                              report.buyin + ', ' +
                              report.net_won + ', ' +
                              report.chips_won + ', ' +
                              report.allin_adj + '\n';
        }

        fs.writeFile(output_path, output_content, function(err){

            if (err) throw err;
            console.log("Reports created");
        });
    },

    testFileParse: function(filepath){
        var self = this;

        // fs.writeFile(output_path, 'aaaa, bbb, ccc\n', function(err){
        //     if (err) throw err;
        //     console.log('Saved');
        // })

        // return;
        fs.readFile(filepath, {encoding: 'utf-8'}, function(err,data){
            if (!err) {
                var result = handParser.parseHands(data, null);
                var parsedHands = result.parsedHands;
                var logEnabled = config.logEnabled;


                console.log("Parsing hands...");
                var parsedHoldemHands = [];
                for (var idx = 0; idx < parsedHands.length; idx++)
                {
                    
                    var hand = parsedHands[idx];
                    if (logEnabled)
                    {
                        console.log(hand);
                    }
                    var tournamentid = hand.info.gameno;
                    if (tournamentid != '2685584841') continue;
                    var handid = hand.info.handid;
                    var date_time = hand.info.day + '/' + hand.info.month + '/' + hand.info.year + ' ' + hand.info.hour + ':' + hand.info.min + ':' + hand.info.sec;
                    var blinds = hand.info.sb + '/' + hand.info.bb + ' ' + hand.info.limit + ' ' + hand.table.maxseats + 'max';
                    var hero = hand.hero;
                    var pot = 0;
                    var winner_name = '';
                    var allin_stage = '';
                    var donation = hand.info.donation;
                    var rake = hand.info.rake;
                    var buyin = hand.info.buyin;
                    var currency = hand.info.currency;

                    // get betting info from users.
                    var seats = hand.seats;
                    var players = [];
                    for (var seatId = 0; seatId < seats.length; seatId++)
                    {
                        var seat = seats[seatId];
                        var seatno = seat.seatno;
                        var player = seat.player;
                        var chips = seat.chips;
                        var player_info = {
                            seatno: seatno,
                            player: player,
                            chips: chips,
                            amount: 0,
                            current_bet_amount: 0,
                            type:'Unknown',
                            is_folded: false,
                            allin: false,
                            card1: 'xx',
                            card2: 'xx',
                            allin_stage:'',
                            won: false,

                        }
                        players.push(player_info);
                    }

                    // select hero player.
                    var heroPlayer = null;
                    for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                    {
                        if (hero == players[playerIdx].player)
                        {
                            heroPlayer = players[playerIdx];
                            break;
                        }
                    }

                    // process posts stage (small blind and big blind)
                    var posts = hand.posts;
                    if (posts == undefined || posts.length == 0) 
                    {
                        console.log("ParsingError: Uncompleted hands detected at post stage");
                        continue;
                    }
                    
                    for (var postIdx = 0; postIdx < posts.length; postIdx++)
                    {
                        var post = posts[postIdx];
                        var playername = post.player;
                        var player = self.getPlayerFromName(playername, players);

                        if (player == null) continue;

                        player.type = post.type;
                        var blind_amount = post.amount;
                        player.amount = blind_amount;
                        player.current_bet_amount = blind_amount;

                        if (logEnabled)
                        {
                            console.log(player.player);
                            console.log(player.amount);
                        }
                    }

                    // 1.  process preflop stage
                    var preflops = hand.preflop;
                    if (preflops == undefined || preflops.length == 0)
                    {
                        console.log("ParsingError: Uncompleted hands detected at preflop stage");
                        continue;
                    }

                    for (var preflopIdx = 0; preflopIdx < preflops.length; preflopIdx++)
                    {
                        var preflop = preflops[preflopIdx];
                        var playername = preflop.player;
                        var amount = preflop.amount;
                        var allin = preflop.allin;
                        var type = preflop.type;
                        var player = self.getPlayerFromName(playername, players);
                        
                        if (player == null) continue;

                        if (allin != undefined)
                        {

                            player.allin = allin;
                            if (allin)
                            {
                                allin_stage = 'preflop';
                                player.allin_stage = allin_stage;
                            }
                                
                        }

                        if (type == 'fold')
                        {
                            player.is_folded = true;
                        }
                        else if (type == 'bet')
                        {
                            // player.amount = player.amount + amount - player.current_bet_amount;
                            player.amount = player.amount + amount;
                            player.current_bet_amount = player.current_bet_amount + amount;
                        }
                        else if (type == 'call')
                        {
                            player.amount = player.amount + amount;
                            player.current_bet_amount = 0;
                            //self.betFinished(players);
                        }
                        else if (type == 'raise')
                        {
                            //console.log('current_bet_amount = ' + player.current_bet_amount);
                            var raise_amount = preflop.raiseTo;
                            player.amount = player.amount + raise_amount - player.current_bet_amount;
                            player.current_bet_amount = raise_amount;
                            
                        }
                        else if (type == 'bet-returned')
                        {
                            player.amount = player.amount - amount;
                        }
                        if (logEnabled)
                        {
                            console.log('preflop : ' + type);
                            console.log(player.player);
                            console.log(player.amount);
                        }
                    }

                    self.betFinished(players);

                    // 2.  process flop stage
                    var flops = hand.flop;

                    for (var flopIdx = 0; flopIdx < flops.length; flopIdx++)
                    {
                        var flop = flops[flopIdx];
                        var playername = flop.player;
                        var amount = flop.amount;
                        var allin = flop.allin;
                        var type = flop.type;
                        var player = self.getPlayerFromName(playername, players);
                        
                        
                        if (player == null) continue;

                        if (allin != undefined)
                        {

                            player.allin = allin;
                            if (allin)
                            {
                                allin_stage = 'flop';
                                player.allin_stage = 'flop';
                                if (heroPlayer.allin_stage != '' && heroPlayer.allin_stage != allin_stage)
                                {
                                    heroPlayer.is_folded = true;
                                }
                            }
                                
                        }

                        if (type == 'fold')
                        {
                            player.is_folded = true;
                        }
                        else if (type == 'bet')
                        {
                            // player.amount = player.amount + amount - player.current_bet_amount;
                            player.amount = player.amount + amount;
                            player.current_bet_amount = player.current_bet_amount + amount;

                        }
                        else if (type == 'call')
                        {
                            player.amount = player.amount + amount;;
                            player.current_bet_amount = 0;
                            //self.betFinished(players);
                        }
                        else if (type == 'raise')
                        {
                            var raise_amount = flop.raiseTo;
                            player.amount = player.amount + raise_amount - player.current_bet_amount;
                            player.current_bet_amount = raise_amount;
                        }
                        else if (type == 'bet-returned')
                        {
                            player.amount = player.amount - amount;
                        }
                        if (logEnabled)
                        {
                            console.log('flop : ' + type);
                            console.log(player.player);
                            console.log(player.amount);
                        }
                    }

                    self.betFinished(players);
                    // 3.  process turn stage
                    var turns = hand.turn;

                    for (var turnIdx = 0; turnIdx < turns.length; turnIdx++)
                    {
                        var turn = turns[turnIdx];
                        var playername = turn.player;
                        var amount = turn.amount;
                        var type = turn.type;
                        var allin = turn.allin;
                        var player = self.getPlayerFromName(playername, players);
                        
                        
                        if (player == null) continue;

                        if (allin)
                        {
                            allin_stage = 'turn';
                            player.allin_stage = 'turn';
                            if (heroPlayer.allin_stage != '' && heroPlayer.allin_stage != allin_stage)
                            {
                                heroPlayer.is_folded = true;
                            }
                        }


                        if (type == 'fold')
                        {
                            player.is_folded = true;
                        }
                        else if (type == 'bet')
                        {
                            player.amount = player.amount + amount;
                            player.current_bet_amount = player.current_bet_amount + amount;

                        }
                        else if (type == 'call')
                        {
                            player.amount = player.amount + amount;;
                            player.current_bet_amount = 0;
                        }
                        else if (type == 'raise')
                        {
                            var raise_amount = turn.raiseTo;
                            player.amount = player.amount + raise_amount - player.current_bet_amount;
                            player.current_bet_amount = raise_amount;
                        }
                        else if (type == 'bet-returned')
                        {
                            player.amount = player.amount - amount;
                        }

                        if (player.allin)
                        {
                            player.current_bet_amount = 0;
                        }


                        if (logEnabled)
                        {
                            console.log('turn : ' + type);
                            console.log(player.player);
                            console.log(player.amount);
                        }
                    }              
                    

                    self.betFinished(players);
                    // 4.  process river stage
                    var rivers = hand.river;

                    for (var riverIdx = 0; riverIdx < rivers.length; riverIdx++)
                    {
                        var river = rivers[riverIdx];
                        var playername = river.player;
                        var amount = river.amount;
                        var allin = river.allin;
                        var type = river.type;
                        var player = self.getPlayerFromName(playername, players);
                        
                        
                        if (player == null) continue;

                        if (allin)
                        {
                            allin_stage = 'river';
                            player.allin_stage = 'river';
                            if (heroPlayer.allin_stage != '' && heroPlayer.allin_stage != allin_stage)
                            {
                                heroPlayer.is_folded = true;
                            }
                        }


                        if (type == 'fold')
                        {
                            player.is_folded = true;
                        }
                        else if (type == 'bet')
                        {
                            player.amount = player.amount + amount;
                            player.current_bet_amount = player.current_bet_amount + amount;

                        }
                        else if (type == 'call')
                        {
                            player.amount = player.amount + amount;
                            player.current_bet_amount = 0;
                        }
                        else if (type == 'raise')
                        {
                            // console.log('bet_amount = ' + player.current_bet_amount);
                            var raise_amount = river.raiseTo;
                            player.amount = player.amount + raise_amount - player.current_bet_amount;
                            player.current_bet_amount = raise_amount;
                        }
                        else if (type == 'bet-returned')
                        {
                            player.amount = player.amount - amount;
                        }

                        if (logEnabled)
                        {
                            console.log('river : ' + type);
                            console.log(player.player);
                            console.log(player.amount);
                        }
                    }          
                    
                    // 5. process showdown
                    var showdowns = hand.showdown;
                    for (var showdownIdx = 0; showdownIdx < showdowns.length; showdownIdx++)
                    {
                        var showdown_item = showdowns[showdownIdx];
                        
                        var player_name = showdown_item.player;
                        var player = self.getPlayerFromName(player_name, players);
                        var type = showdown_item.type;

                        if (type == 'show')
                        {
                            var card1 = showdown_item.card1;
                            var card2 = showdown_item.card2;
                            player.card1 = card1;
                            player.card2 = card2;                      
                        }
                        else if (type == 'collect')
                        {
                            winner_name = player_name;
                            player.won = true;
                        }
                    }

                    // 6. get winner name from summary
                    var summary = hand.summary;


                    for (var summaryIdx = 0; summaryIdx < summary.length; summaryIdx++)
                    {
                        var summaryItem = summary[summaryIdx];

                        if (summaryItem.type != undefined && summaryItem.type == 'pot')
                        {
                            pot = summaryItem.amount;
                        }
                    }

                    var splitted = false;
                    var won_count = 0;
                    for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                    {
                        if (players[playerIdx].won)
                        {
                            won_count++;
                        }
                    }
                    if (won_count > 1)
                    {
                        splitted = true;
                        winner_name = "[Split Pot]";
                    }

                    if (winner_name == '')
                    {
                        for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                        {
                            if (!players[playerIdx].is_folded)
                            {
                                winner_name = players[playerIdx].player;
                                players[playerIdx].won = true;
                                break;
                            }
                        }
                    }




                    if (logEnabled)
                    {
                        console.log("All-In stage:" + allin_stage);
                        console.log("New Hand#" + handid);
                        for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                        {
                            console.log(">>========" + playerIdx + "=======<<");
                            console.log(players[playerIdx]);
                        }
                        console.log();
                    }



                    // calculation of EV equity of Hero.
                    var equity = 0;
                    var chips_won = 0;
                    var allin_adj = 0;
                    if (hero == winner_name)
                    {
                        var playerCards = [];
                        var winner_idx = 0;
                        var tmp_idx = 0;
                        var no_fold_count = 0;
                        var does_not_show_hand = false;
                        for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                        {
                            var _player = players[playerIdx];
                            if (_player.is_folded) continue;

                            no_fold_count++;
                            if (_player.card1 == 'xx' || _player.card2 == 'xx')
                            {
                                does_not_show_hand = true;
                                break;
                            }
                            var playercard = _player.card1 + _player.card2;
                            playerCards.push(CardGroup.fromString(playercard));
                            if (_player.player == winner_name)
                            {
                                winner_idx = tmp_idx;
                            }
                            tmp_idx++;
                        }
                        if (no_fold_count == 1 || does_not_show_hand)
                        {
                            equity = 1;
                        }
                        else
                        {
                            var board = '';
                            if (allin_stage == 'preflop')            
                            {
                                board = '';
                            }
                            else if (allin_stage == 'flop')
                            {
                                board = hand.board.card1 + hand.board.card2 + hand.board.card3;
                            }
                            else if (allin_stage == 'turn')
                            {
                                board = hand.board.card1 + hand.board.card2 + hand.board.card3 + hand.board.card4;
                            }
                            else if (allin_stage == 'river')
                            {
                                board = hand.board.card1 + hand.board.card2 + hand.board.card3 + hand.board.card4 + hand.board.card5;
                            }
                            else
                                allin_exist = false;

                            var board_card = CardGroup.fromString(board);
                            const result = OddsCalculator.calculate(playerCards, board_card);
                            if (logEnabled)
                            {
                                console.log(result);
                                console.log('winneridx = ' + winner_idx);
                            }
                            
                            var possibleHandsCount = result.equities[winner_idx].possibleHandsCount;
                            var bestHandCount = result.equities[winner_idx].bestHandCount;
                            var tieHandCount = result.equities[winner_idx].tieHandCount;
                            equity = (bestHandCount + tieHandCount / 2) / possibleHandsCount;

                            // console.log('equity = ' + equity);
                        }

                        chips_won = pot - heroPlayer.amount;
                        allin_adj = pot * equity - heroPlayer.amount;
                    }
                    else if (!heroPlayer.is_folded && winner_name != hero)
                    {
                        var playerCards = [];
                        var winner_idx = 0;
                        var tmp_idx = 0;
                        var no_fold_count = 0;
                        var does_not_show_hand = false;
                        for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
                        {
                            var _player = players[playerIdx];
                            if (_player.is_folded) continue;

                            no_fold_count++;
                            if (_player.card1 == 'xx' || _player.card2 == 'xx')
                            {
                                does_not_show_hand = true;
                                break;
                            }
                            var playercard = _player.card1 + _player.card2;
                            playerCards.push(CardGroup.fromString(playercard));
                            if (_player.player == hero)
                            {
                                winner_idx = tmp_idx;
                            }
                                
                            tmp_idx++;



                        }
                        if (no_fold_count == 1 || does_not_show_hand)
                        {
                            
                            equity = 0;
                        }
                        else
                        {
                            var board = '';
                            if (allin_stage == 'preflop')            
                            {
                                board = '';
                            }
                            else if (allin_stage == 'flop')
                            {
                                board = hand.board.card1 + hand.board.card2 + hand.board.card3;
                            }
                            else if (allin_stage == 'turn')
                            {
                                board = hand.board.card1 + hand.board.card2 + hand.board.card3 + hand.board.card4;
                            }
                            else if (allin_stage == 'river')
                            {
                                board = hand.board.card1 + hand.board.card2 + hand.board.card3 + hand.board.card4 + hand.board.card5;
                            }
                            else
                                allin_exist = false;
                            var board_card = CardGroup.fromString(board);
                            const result = OddsCalculator.calculate(playerCards, board_card);
                            if (logEnabled)
                            {
                                console.log(result);
                                console.log('winneridx = ' + winner_idx);
                            }
                            var possibleHandsCount = result.equities[winner_idx].possibleHandsCount;
                            var bestHandCount = result.equities[winner_idx].bestHandCount;
                            var tieHandCount = result.equities[winner_idx].tieHandCount;
                            equity = (bestHandCount + tieHandCount / 2) / possibleHandsCount;
                        }

                        if (!splitted)
                            chips_won = 0 - heroPlayer.amount;    
                        else
                            chips_won = pot * equity - heroPlayer.amount;

                        //chips_won = 0 - heroPlayer.amount;
                        allin_adj = pot * equity - heroPlayer.amount;
                    }
                    else
                    {
                        equity = -1;
                        chips_won = 0 - heroPlayer.amount;
                        allin_adj = 0 - heroPlayer.amount;
                    }

                    var donation = hand.info.donation;
                    var rake = hand.info.rake;
                    var buyin = hand.info.buyin;
                    var currency = hand.info.currency;

                    var holdemHand = {
                        tournamentid : tournamentid,
                        handid: handid,
                        date: date_time,
                        blinds: blinds,
                        allin_stage: allin_stage,
                        winner: winner_name,
                        hero: hero,
                        chips_won: chips_won,
                        allin_adj: allin_adj,
                        equity: equity,
                        pot: pot,
                        board: board,
                        donation: donation,
                        rake:  rake,
                        buyin: buyin,
                        currency: currency
                        // players: players,
                    }
                    parsedHoldemHands.push(holdemHand);
                    
                    if (logEnabled)
                    {
                        console.log(holdemHand);
                    }
                    
                }

                console.log('>>>=================Parsing Finished====================<<<');
                console.log("Creating reports...");

                var reports = [];

                for (var handidx = 0; handidx < parsedHoldemHands.length; handidx++)
                {
                    var _parsedHoldemHand = parsedHoldemHands[handidx];

                    if (self.isReported(_parsedHoldemHand.hero, _parsedHoldemHand.tournamentid, reports))
                    {
                        self.addReport(_parsedHoldemHand, reports);
                    }
                    else
                    {
                        self.createReport(_parsedHoldemHand, reports);
                    }
                    

                    if (config.testMode)
                    {
                        console.log(_parsedHoldemHand.handid + '\t' + _parsedHoldemHand.chips_won + '\t' + _parsedHoldemHand.allin_adj + '\t' + _parsedHoldemHand.winner);
                        // continue;
                    }
                }

                if (!config.printMode)
                     return;

                console.log('>>>=================Creating Reports Finished====================<<<');
                console.log("Creating report file...");

                
                var output_content = '';
                output_content = 'Player, Tournament#, Hands, Buy-In, Net Won, Chips Won, All-In Adj\n';

                for (var reportIdx = 0; reportIdx < reports.length; reportIdx++)
                {
                    var report = reports[reportIdx];
                    console.log('>>==========' + reportIdx + '==========<<');
                    console.log(reports[reportIdx]);
                    output_content += report.player + ', ' +
                                      report.tournament + ',' +
                                      report.hands + ', ' +
                                      report.buyin + ', ' +
                                      report.net_won + ', ' +
                                      report.chips_won + ', ' +
                                      report.allin_adj + '\n';
                }

                fs.writeFile(output_path, output_content, function(err){

                    if (err) throw err;
                    console.log("Reports created");
                });
            } else {
                console.log(err);
            }
        });
    },

    getPlayerFromName: function(playername, players){

        if (playername == undefined) return null;
        if (players == null ||players.length == 0) return null;
        
        for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
        {
            var player = players[playerIdx];
            if (player.player == playername)
            {
                return player;
            }
        }
        return null;
    },
    betFinished: function(players) {

        if (players == null || players.length == 0) return;
        for (var playerIdx = 0; playerIdx < players.length; playerIdx++)
        {
            var player = players[playerIdx];
            player.current_bet_amount = 0;
        }
    },

    isReported: function(playername, tournamentid, reports) {


        for (var reportIdx = 0; reportIdx < reports.length; reportIdx++) 
        {
            var report = reports[reportIdx];
            if (report.player == playername && report.tournament == tournamentid)
            {
                return true;
            }
        }

        return false;
    },

    addReport: function(holdemHand, reports) {
        
        for (var reportIdx = 0; reportIdx < reports.length; reportIdx++)
        {
            var report = reports[reportIdx];
            if (report.player == holdemHand.hero &&
                report.tournament == holdemHand.tournamentid)
            {
                report.hands = report.hands + 1;
                report.chips_won = report.chips_won + holdemHand.chips_won;
                report.allin_adj = report.allin_adj + holdemHand.allin_adj;
                break;
            }
        }
    },

    createReport: function(holdemHand, reports) {

        var report = {
            player: holdemHand.hero,
            tournament: holdemHand.tournamentid,
            hands: 1,
            buyin: holdemHand.currency + holdemHand.donation + '+' + holdemHand.currency + holdemHand.rake,
            net_won: 0,
            chips_won: holdemHand.chips_won,
            allin_adj: holdemHand.allin_adj,
        }

        reports.push(report);
    },
});