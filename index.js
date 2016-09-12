/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';
const DBManager = require('./src/lib/dbManager');
const env = require('./src/lib/env');

module.exports.nlcconfig = require('./src/lib/nlcconfig');
module.exports.nlcManager = require('./src/lib/nlcManager');
module.exports.hubotPouch = require('./src/lib/PouchDB');
module.exports.nlcDb = new DBManager({localDbName: env.db_nlc_local});
module.exports.rrManager = require('./src/lib/rrManager');
