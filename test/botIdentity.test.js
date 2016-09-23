/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const expect = require('chai').expect;
const nock = require('nock');
const DBManager = require('../src/lib/dbManager');
const path = require('path');
const env = require(path.resolve(__dirname, '..', 'src', 'lib', 'env'));
const sprinkles = require('mocha-sprinkles');

describe('Test repication uses correct bot identity', function() {
	// Mock HTTP/HTTPS requests to external APIs
	before(function() {
		nock.disableNetConnect();

		nock(env.slackApi).persist().get('/auth.test?token=abc').reply(200, {user: 'mimiron'});
		nock('https://' + env.syncToMasterEndpoint).persist().get(/\/generate\?botid=.*/).reply(200, function(uri){
			return {dbname: uri.substring(uri.indexOf('=') + 1), apikey: 'abc', password: '123'};
		});
	});

	// Restore network connectivity
	after(function(){
		nock.enableNetConnect();
	});

	// Restore environment variables
	let slackApi = env.slackApi;
	let slackToken = env.slackToken;
	let botName = env.botName;
	let bluemixUser = env.bluemixUser;
	let bluemixOrg = env.bluemixOrg;
	let bluemixSpace = env.bluemixSpace;
	after(function(){
		env.slackApi = slackApi;
		env.slackToken = slackToken;
		env.botName = botName;
		env.bluemixUser = bluemixUser;
		env.bluemixOrg = bluemixOrg;
		env.bluemixSpace = bluemixSpace;
	});


	it('Should extract bot name from Slack token when present', function(done){
		let testDb = new DBManager({localDbName: 'testdb2', remoteDbName: 'testdb2'});

		sprinkles.eventually(function(){
			return testDb.get('botInfo');
		}).then((botInfo) => {
			expect(botInfo.botName).to.be.eql('mimiron');
			expect(botInfo.localDbName).to.be.eql('testdb2');
			done();
		}).catch((error) => {
			done(error);
		});
	});

	it('Should replicate to master using cached data', function(done){
		let testDb2 = new DBManager({localDbName: 'testdb2'});

		sprinkles.eventually(function(){
			return testDb2.get('botInfo');
		}).then((botInfo) => {
			expect(botInfo.botName).to.be.eql('mimiron');
			expect(botInfo.localDbName).to.be.eql('testdb2');
			done();
		}).catch((error) => {
			done(error);
		});
	});

	it('Should use HUBOT_NAME to replicate to master', function(done){
		env.botName = 'test Bot';
		let testDb3 = new DBManager({localDbName: 'testdb3'});

		sprinkles.eventually(function(){
			return testDb3.get('botInfo');
		}).then((botInfo) => {
			expect(botInfo.botName).to.be.eql('test Bot');
			expect(botInfo.localDbName).to.be.eql('testdb3');
			expect(botInfo.masterCloudantCreds.dbname).to.be.eql('testbot_testdb3_zho6');
			done();
		}).catch((error) => {
			done(error);
		});
	});

	it('Should use HUBOT_BLUEMIX_USER to replicate to master', function(done){
		env.slackToken = undefined;
		env.botName = undefined;
		env.bluemixUser = 'bluemixUser@us.ibm.com';

		let testDb4 = new DBManager({localDbName: 'testdb4'});

		sprinkles.eventually(function(){
			return testDb4.get('botInfo');
		}).then((botInfo) => {
			expect(botInfo.botName).to.be.eql('bluemixUser');
			expect(botInfo.localDbName).to.be.eql('testdb4');
			expect(botInfo.masterCloudantCreds.dbname).to.be.eql('bluemixuser_testdb4_6n69');
			done();
		}).catch((error) => {
			done(error);
		});
	});

	it('Should use default bot name "hubot" to replicate to master', function(done){
		env.botName = undefined;
		env.bluemixUser = undefined;

		let testDb5 = new DBManager({localDbName: 'testdb5'});

		sprinkles.eventually(function(){
			return testDb5.get('botInfo');
		}).then((botInfo) => {
			expect(botInfo.botName).to.be.eql('hubot');
			expect(botInfo.localDbName).to.be.eql('testdb5');
			expect(botInfo.masterCloudantCreds.dbname).to.be.eql('hubot_testdb5_bmni');
			done();
		}).catch((error) => {
			done(error);
		});
	});

	it('Should use default bot name "hubot" if there\'s an error connecting to the Slack API', function(done){
		env.botName = undefined;
		env.slackToken = 'abc';
		env.slackApi = 'badURL';

		let testDb6 = new DBManager({localDbName: 'testdb6'});

		sprinkles.eventually(function(){
			return testDb6.get('botInfo');
		}).then((botInfo) => {
			expect(botInfo.botName).to.be.eql('hubot');
			expect(botInfo.localDbName).to.be.eql('testdb6');
			expect(botInfo.masterCloudantCreds.dbname).to.be.eql('hubot_testdb6_7m3o');
			done();
		}).catch((error) => {
			done(error);
		});
	});

});
