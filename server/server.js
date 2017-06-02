var fs = require('fs'); // file systems
var jwt = require('jsonwebtoken'); // json web tokens
var express = require('express'); // web server
var request = require('request'); // http trafficer
var jwkToPem = require('jwk-to-pem'); // converts json web key to pem
var bodyParser = require('body-parser'); // http body parser
var mongodb = require('mongodb'); // MongoDB driver

var Mongo = mongodb.MongoClient;
var ObjectID = mongodb.ObjectID;

var webroot = __dirname + '/../client/';

var keyCache = {}; // public key cache

const MONGO_URL = 'mongodb://localhost:27017/todo';
const CLIENT_ID = fs.readFileSync('client_id', 'utf8');

/**
 * MongoDB operations
 * connects to MongoDB and registers a series of asynchronous methods
 */
Mongo.connect(MONGO_URL, function(err, db) {
    
    // TODO: handle err

    Mongo.ops = {};
    
    Mongo.ops.find = function(collection, json, callback) {
        db.collection(collection).find(json).toArray(function(error, docs) {
            if(callback) callback(error, docs);
        });
    };
    
    Mongo.ops.findOne = function(collection, json, callback) {
        db.collection(collection).findOne(json, function(error, doc) {
            if(callback) callback(error, doc);
        });
    };

    Mongo.ops.insert = function(collection, json, callback) {
        db.collection(collection).insert(json, function(error, result) {
            if(callback) callback(error, result);
        });
    };

    Mongo.ops.upsert = function(collection, query, json, callback) {
        db.collection(collection).updateOne(query, { $set: json }, { upsert: true }, function(error, result) {
            if (callback) callback(error, result);
        });
    };
    
    Mongo.ops.updateOne = function(collection, query, json, callback) {
        db.collection(collection).updateOne(query, { $set : json }, function(error, result) {
            if(callback) callback(error, result);
        });
    };
    
    Mongo.ops.deleteOne = function(collection, query, callback) {
        db.collection(collection).deleteOne(query, function(error, result) {
            if(callback) callback(error, result);
        });
    };
    
    Mongo.ops.deleteMany = function(collection, query, callback) {
        db.collection(collection).deleteMany(query, function(error, result) {
            if(callback) callback(error, result);
        });
    };
});



// web server
var app = express();
var http = require('http').createServer(app);
var server = http.listen(3000, function() {
    cacheWellKnownKeys();
    log('hosting from ', webroot);
    log('server listening on http://localhost:3000');
});
var io = require('socket.io').listen(server);

// use middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(allowCrossDomain);
app.use('/a', authorize);
app.use('/', express.static(webroot));

app.post('/a/login', function(req, res) {
    var query = { id: req.body.id };
    Mongo.ops.upsert('login', query, req.body, function(error, result) {
      log('/login req.body = ', req.body);
      if(error) res.status(500).send(error);
      else res.status(201).send(result);      
    });
});

app.post('/a/task', function(req, res) {
    Mongo.ops.insert('task', payload(req), function(error, result) {
        log('post /task = ', payload(req));
        if(error) res.status(500).send(error);
        else res.status(201).send(result);
    });
});

app.put('/a/task/:taskId', function(req, res) {
    var query = { _id : new ObjectID(req.params.taskId) };
    query.userid = getUserId(req);
    Mongo.ops.updateOne('task', query, req.body, function(error, result) {
        log('put /task/:taskId = ', query);
        if(error) res.status(500).send(error);
        else res.status(200).send(result);
    });
});

app.delete('/a/task/:taskId', function(req, res) {
    var query = payload(req);
    query._id = new ObjectID(req.params.taskId);
    Mongo.ops.deleteOne('task', query, function(error, result) {
        log('delete /task/:taskId = ', query);
        if(error) res.status(500).send(error);
        else res.status(200).send(result);
    });
});

app.get('/a/tasks', function(req, res) {
    Mongo.ops.find('task', payload(req), function(error, docs) {
        log('get /tasks = ', payload(req));
        if(error) res.status(500).send(error);
        else res.status(200).send(docs);
    });
});


io.sockets.on('connection', function(socket) {
    var clientIp = socket.request.connection.remoteAddress;

    log('socket connected from ', clientIp);
});


/**
 * Middleware:
 * allows cross domain requests
 * ends preflight checks
 */
function allowCrossDomain(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');

    // end pre flights
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
    } else {
        next();
    }
}

/**
 * Middlware:
 * validate tokens and authorize users
 */
function authorize(req, res, next) {

    // jwt.decode: https://github.com/auth0/node-jsonwebtoken#jwtdecodetoken--options
    // jwt.verify: https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback

    try {
        var token       = req.headers.authorization;
        var decoded     = jwt.decode(token, { complete: true });
        var keyID       = decoded.header.kid;
        var algorithm   = decoded.header.alg;
        var iss         = decoded.payload.iss;
        var pem         = getPem(keyID);

        if (iss === 'accounts.google.com' || iss === 'https://accounts.google.com') {
            var options = {
                audience: CLIENT_ID,
                issuer: iss,
                algorithms: [algorithm]
            }

            jwt.verify(token, pem, options, function(err) {
                if (err) {
                    res.writeHead(401);
                    res.end();
                } else {
                    next();
                }
            });            

        } else {
            res.writeHead(401);
            res.end();
        }
    } catch (err) {
        res.writeHead(401);
        res.end();
    }
}

/**
 * Attach user ID to their payload
 */
function payload(req) {
    if(req.body) {
        var data = req.body;
        data.userid = getUserId(req);
        return data;        
    } else {
        return { userid : getUserId(req) };
    }
}

/**
 * Get userid from idtoken in authorization header
 */
function getUserId(req) {
    var idToken = req.headers.authorization;
    return jwt.decode(idToken).sub;
};

/**
 * Converts json web key to pem key
 */
function getPem(keyID) {
    var jsonWebKeys = keyCache.keys.filter(function(key) {
        return key.kid === keyID;
    });
    return jwkToPem(jsonWebKeys[0]);
}

/**
 * Cache Google's well known public keys
 */
function cacheWellKnownKeys() {

    // get the well known config from google
    request('https://accounts.google.com/.well-known/openid-configuration', function(err, res, body) {
        var config = JSON.parse(body);
        var address = config.jwks_uri; // ex: https://www.googleapis.com/oauth2/v3/certs

        // get the public json web keys
        request(address, function(err, res, body) {

            keyCache.keys = JSON.parse(body).keys;

            // example cache-control header: 
            // public, max-age=24497, must-revalidate, no-transform
            var cacheControl = res.headers['cache-control'];
            var values = cacheControl.split(',');
            var maxAge = parseInt(values[1].split('=')[1]);

            // update the key cache when the max age expires
            setTimeout(cacheWellKnownKeys, maxAge * 1000);

            log('Cached keys = ', keyCache.keys);
        });
    });
}

/**
 * Custom logger to prevent circular reference in JSON.parse(obj)
 */
function log(msg, obj) {
    console.log('\n');
    if (obj) {
        try {
            console.log(msg + JSON.stringify(obj));
        } catch (err) {
            var simpleObject = {};
            for (var prop in obj) {
                if (!obj.hasOwnProperty(prop)) {
                    continue;
                }
                if (typeof(obj[prop]) == 'object') {
                    continue;
                }
                if (typeof(obj[prop]) == 'function') {
                    continue;
                }
                simpleObject[prop] = obj[prop];
            }
            console.log('circular-' + msg + JSON.stringify(simpleObject)); // returns cleaned up JSON
        }
    } else {
        console.log(msg);
    }
}