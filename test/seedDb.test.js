/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const expect = require('chai').expect;
const assert = require('chai').assert;

const initDb = require('../src/lib/initDb');
const testDb = require('./setupTestDb');

const nlcFile = 'test/resources/mock.seed.json';
const nlcConfig = require('../src/lib/nlcconfig');

// Passing arrow functions to mocha is discouraged: https://mochajs.org/#arrow-functions
// return promises from mocha tests rather than calling done() - http://tobyho.com/2015/12/16/mocha-with-promises/
describe('Testing initial load of database', function() {

	context('Test loading master NLC JSON file', function() {

		before(function(){
			return initDb.init(nlcFile).then((db) => {
				this.db = db;
			}).catch((err) => {
				// safe to ignore doc update conflicts
				if (err.status !== 409){
					throw err;
				}
				else {
					// get a handle to the db
					return testDb.setup().then((db) => {
						this.db = db;
					});
				}
			});
		});

		it('should test database has been loaded with seed data', function() {
			assert(this.db, 'db should be initialized');
			return this.db.info().then((info) => {
				// should be at least 25 documents in the database with data from the seed json
				// and an internal design document from nlcDb.js
				// initDb adds 6 docs, so this is a safe threshold for testing
				expect(info.doc_count).to.be.above(25);
			});
		});

		it('should test database class responses with seed data from a JSON file format', function() {
			assert(this.db, 'db should be initialized');
			return nlcConfig.getClassEmitTarget('app.list').then((tgt) => {
				expect(tgt.target).to.eql('app.list');
				return nlcConfig.getClassEmitTarget('app.start');
			}).then((tgt) => {
				expect(tgt.target).to.eql('app.start.js');
				return nlcConfig.getClassEmitTarget('app.test.1');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.1.js');
				return nlcConfig.getClassEmitTarget('app.test.2');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.2.js');
				return nlcConfig.getClassEmitTarget('app.test.3');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.3.js');
				return nlcConfig.getClassEmitTarget('app.test.4');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.4.js');
				return nlcConfig.getClassEmitTarget('app.test.5');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.5.js');
				return nlcConfig.getClassEmitTarget('app.test.6');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.6.js');
				return nlcConfig.getClassEmitTarget('app.test.7');
			}).then((tgt) => {
				expect(tgt.target).to.eql('test.7.js');
			});

		});

		it('should test database parameter responses with seed data from a JSON file format', function() {
			assert(this.db, 'db should be initialized');
			// app.test.2 uses a reference parameter.value
			return nlcConfig.getClassEmitTarget('app.test.2').then((tgt) => {
				expect(tgt.parameters.length).to.eql(2);
				expect(tgt.parameters[0].values).to.exist;
				expect(tgt.parameters[0].values.length).to.eql(5);
				return nlcConfig.getClassEmitTarget('app.test.5');
			}).then((tgt) => {
				expect(tgt.parameters.length).to.eql(1);
				expect(tgt.parameters[0].values).to.exist;
				expect(tgt.parameters[0].values.length).to.eql(4);
			});
		});


	});

});
