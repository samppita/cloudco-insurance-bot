// server.js

// set up ======================================================================
// get all the tools we need
var express = require('express');
var app = express();
var port = process.env.PORT || 5014;
var mongoose = require('mongoose');
var passport = require('passport');
var flash = require('connect-flash');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var request = require('request');

var configDB = require('./config/database.js');
require('./config/passport')(passport);

var Account = require('./models/account');
var Benefits = require('./models/benefit');

// configuration ===============================================================

mongoose.connect(configDB.url); // connect to our database

app.use(express.static(__dirname + '/public'));

// set up our express application
app.use(morgan('dev')); // log every request to the console
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser()); // get information from html forms

app.set('view engine', 'html');

// required for passport
app.use(session({
    secret: 'ana-insurance-bot'
})); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

var bcrypt = require('bcrypt-nodejs');

// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {

    // if user is authenticated in the session, carry on 
    if (req.isAuthenticated())
        return next();

    // if they aren't redirect them to the home page
    res.redirect('/');
}

app.get('/login', function (req, res) {
    res.sendfile('./public/login.html');
});

// process the login form
app.post('/login', passport.authenticate('local-login', {
    successRedirect: '/loginSuccess', // redirect to the secure profile section
    failureRedirect: '/loginFailure', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
}));

app.get('/loginSuccess', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        username: req.user.local.email,
        outcome: 'success'
    }, null, 3));
})

app.get('/loginFailure', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        outcome: 'failure'
    }, null, 3));
})

app.get('/signupSuccess', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        username: req.user.local.email,
        outcome: 'success'
    }, null, 3));
})

app.get('/signupFailure', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        outcome: 'failure'
    }, null, 3));
})

app.get('/isLoggedIn', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    var result = {
        outcome: 'failure'
    };

    if (req.isAuthenticated()) {
        result.outcome = 'success';
        result.username = req.user.local.email;
    }

    res.send(JSON.stringify(result, null, 3));
})

// =====================================
// SIGNUP ==============================
// =====================================
// show the signup form

app.get('/signup', function (req, res) {
    res.sendfile('./public/signup.html');
});

// process the signup form
app.post('/signup', passport.authenticate('local-signup', {
    successRedirect: '/signupSuccess', // redirect to the secure profile section
    failureRedirect: '/signupFailure', // redirect back to the signup page if there is an error
    failureFlash: true // allow flash messages
}));

// =====================================
// CLAIMS ==============================
// =====================================
// show the signup form

app.get('/claims', isLoggedIn, function (req, res) {
    res.sendfile('./public/claims.html');
});

app.get('/history', isLoggedIn, function (req, res) {
    res.setHeader('Content-Type', 'application/json');

    Benefits.findOne({
        owner: req.user.local.email
    }, function (err, doc) {

        var allclaims = [];

        doc.policies.forEach(function (policy) {

            if (policy.claims.length > 0) {
                policy.claims.forEach(function (claim) {
                    var detailedclaim = new Object();
                    detailedclaim.date = claim.date;
                    detailedclaim.amount = claim.amount;
                    detailedclaim.provider = claim.provider;
                    detailedclaim.payment = claim.payment;
                    detailedclaim.outcome = claim.outcome;
                    detailedclaim.policy = policy.title;
                    detailedclaim.icon = policy.icon;
                    allclaims.push(detailedclaim);
                })
            }
        })

        var output = {
            owner: req.user.local.email,
            claims: allclaims
        };

        var responseString = JSON.stringify(output, null, 3);

        console.log(responseString);

        res.send(responseString);
    })
});


// process the signup form
app.post('/claims', function (req, res) {

    var claim = req.body;

    if (req.isAuthenticated()) {
        Benefits.findOne({
            owner: req.user.local.email
        }, function (err, doc) {

            doc.policies.forEach(function (policy) {

                if (policy.title === claim.benefit) {

                    /* default */

                    claim.outcome = 'DENIED';
                    claim.payment = 0;

                    var possibleEligibility = claim.amount * policy.percentCovered / 100;

                    var amountAvailable = policy.claimLimit - policy.amountClaimed;

                    console.log('eligibility: ' + possibleEligibility);
                    console.log('available: ' + amountAvailable);

                    if (policy.amountClaimed > amountAvailable && amountAvailable > 0) {
                        claim.outcome = 'PARTIAL';
                        claim.payment = policy.Limit - policy.amountClaimed;
                        policy.amountClaimed = policy.Limit;
                    }

                    if (possibleEligibility < amountAvailable) {
                        claim.outcome = 'FULL';
                        claim.payment = possibleEligibility;
                        policy.amountClaimed = policy.amountClaimed + possibleEligibility;
                    }

                    policy.claims.push(claim);

                    doc.save(function (err) {

                        res.setHeader('Content-Type', 'application/json');

                        var result = {
                            outcome: 'failure'
                        };

                        if (err) {
                            throw err;
                        } else {
                            result.outcome = 'success';
                        }

                        var responseString = JSON.stringify(result, null, 3);
                        res.send(responseString);
                    });
                }
            });
        })
    };
})


// =====================================
// PROFILE SECTION =====================
// =====================================
// we will want this protected so you have to be logged in to visit
// we will use route middleware to verify this (the isLoggedIn function)

app.get('/profile', isLoggedIn, function (req, res) {
    res.sendfile('./public/index.html');
});

app.get('/health', function (req, res) {
    if (req.isAuthenticated()) {
        res.sendfile('./public/health.html');
    } else {
        res.sendfile('./public/login.html');
    }
});

app.get('/soon', function (req, res) {
    res.sendfile('./public/soon.html');
})

app.get('/healthBenefits', isLoggedIn, function (req, res) {

    res.setHeader('Content-Type', 'application/json');

    Benefits.findOne({
        owner: req.user.local.email
    }, function (err, doc) {
        res.send(JSON.stringify(doc, null, 3));
    });
});

// =====================================
// LOGOUT ==============================
// =====================================

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

app.get('/', function (req, res) {
    res.render('index.html');
});


// =====================================
// WATSON TRADEOFF TRAVEL ==============
// =====================================

function makePostRequest(payload, url, res) {
    var options = {
        body: payload,
        json: true,
        url: url
    };

    request.post(options, function (err, response) {
        if (err)
            return res.json(err);
        else
            return res.json(response.body);
    });
}

/**
 * Constructs a URL for an insurance microservice
 */

function constructApiRoute(prefix, suffix) {
    return "https://" + prefix + suffix + ".mybluemix.net";
}

var catalog_url = 'http://insurance-store-front.mybluemix.net/api';

http: //insurance-store-front.mybluemix.net/api/tradeoff

    // Allow clients to make policy tradeoff calculations
    app.post('/api/tradeoff', function (req, res, next) {

        console.log(catalog_url + '/tradeoff');
        return makePostRequest(req.body, catalog_url + '/tradeoff', res);
    });

// Allow clients to create new policy orders
app.post('/api/orders', function (req, res, next) {
    return makePostRequest(req.body, orders_url + '/orders', res);
});

// launch ======================================================================

app.listen(port);
console.log('running on port ' + port);