/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const expect = require('chai').expect;
const assert = require('chai').assert;
const testDbs = require('./setupTestDb');

const nock = require('nock');
const DBManager = require('../src/lib/dbManager');
const path = require('path');
const env = require(path.resolve(__dirname, '..', 'src', 'lib', 'env'));

const learnedId = 'learned';

// Passing arrow functions to mocha is discouraged: https://mochajs.org/#arrow-functions
// return promises from mocha tests rather than calling done() - http://tobyho.com/2015/12/16/mocha-with-promises/
describe('Testing of database.', function() {

	before(function(){
		// load up local database
		return testDbs.setup().then((dbs) => {
			this.nlcDb = dbs.nlcDb;
		});
	});

	context('Test database info', function() {

		it('should respond with database info', function() {
			assert(this.nlcDb, 'db should be initialized');
			return this.nlcDb.info().then((info) => {
				// should be at least 5 documents in the database
				// the seed db test increases the number of documents
				expect(info.doc_count).to.be.above(4);
				return this.nlcDb.info({
					allDocs: true,
					include_docs: true
				}).then((allDocs) => {
					assert.property(allDocs, 'total_rows');
				});
			});
		});

	});

	context('Test adding to an existing document in the database', function() {

		it('should update the existing document in the database with a `dummy` field', function() {
			assert(this.nlcDb, 'db should be initialized');
			let rev;
			return this.nlcDb.get(learnedId).then((doc) => {
				doc.dummy = 'ignore this';
				rev = doc._rev;
				return this.nlcDb.put(doc).then((info) => {
					assert(rev, 'existing rev should exist');
					expect(rev).to.not.eql(info.rev);
				});
			});
		});

	});

	context('Test posting documents in the database', function() {

		it('should create a  document in the database with a `classification` field', function() {
			assert(this.nlcDb, 'db should be initialized');

			return this.nlcDb.post(['classes'], 'learned', 'mySelection').then((result) => {
				let docId = result.id;
				return this.nlcDb.get(docId).then((doc) => {
					assert(doc.classification, 'classification should exists');
					expect(doc.classification.length).to.eql(1);
					assert(doc.selectedClass, 'selected class should exist');
					expect(doc.selectedClass).to.eql('mySelection');
				});
			});
		});

		it('should create a  document in the database with a `logs` field', function() {
			assert(this.nlcDb, 'db should be initialized');

			return this.nlcDb.post(['log message'], 'negative_fb').then((result) => {
				let docId = result.id;
				return this.nlcDb.get(docId).then((doc) => {
					assert(doc.logs, 'logs should exists');
					expect(doc.logs.length).to.eql(1);
				});
			});
		});

		it('should create a document in the database with thresholds', function() {
			assert(this.nlcDb, 'db should be initialized');

			return this.nlcDb.post(['classes'], 'learned', 'mySelection').then((result) => {
				let docId = result.id;
				return this.nlcDb.get(docId).then((doc) => {
					assert(doc.lowConfidenceThreshold, 'low conf threshold should exists');
					assert(doc.highConfidenceThreshold, 'high conf threshold should exists');
					assert(doc.botVersion, 'bot version should exists');
					assert(doc.botName, 'bot name should exists');
				});
			});
		});

	});

	context('Test repication of training data', function() {
		it('Should replicate to user\'s Cloudant', function(done){
			nock('https://' + env.cloudantEndpoint).get(function(uri) {
				if (uri.indexOf('remotetest') > -1) {
					done();
				}
				else {
					done(new Error(`Sync attempted to replicate to incorrect database.  Expected [remotetest]. Actual [${uri}]`));
				}
				return true;
			}).reply(200, '');

			let db = new DBManager({localDbName: 'localtest', remoteDbName: 'remotetest'});
			db.get('botInfo').then((botInfo) => {
				expect(botInfo.botName).to.be.eql('mimiron');
				expect(botInfo.localDbName).to.be.eql('localtest');
			});
		});

	});
});
