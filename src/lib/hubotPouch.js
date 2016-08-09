/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const env = require('./env');
const fs = require('fs');
const path = require('path');

let PouchDB, opts;

const dbDir = path.join(env.dbPath, env.dbDirectory);

if (env.test){
	PouchDB = require('pouchdb-memory');
	opts = {
		name: 'test'
	};
}
else {
	PouchDB = require('pouchdb');
	// set any hubot defaults for pouchdb here so that the listener and db module
	// are in sync
	if (!fs.existsSync(dbDir)){
		fs.mkdirSync(dbDir);
	}
	opts = {
		name: dbDir + '/' + env.cloudantDb
	};
}

module.exports = PouchDB.defaults(opts);
