/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;
const NLCManager = require('../index').nlcManager;
const mockNLP = require('./nlcManager.mock');
const env = require('../src/lib/env.js');
const db = require('./setupTestDb');

describe('Test the NLCManager library', function(){
	var watson_nlc;
	var watson_nlc_options;

	before(function(){
		return db.setup;
	});


	before(function() {
		return mockNLP.setupMockery();
	});

	beforeEach(function(){
		watson_nlc_options = {
			url: env.nlc_url,
			username: env.nlc_username,
			password: env.nlc_password,
			classifierName: env.nlc_classifier,
			version: 'v1'
		};
		watson_nlc = new NLCManager(watson_nlc_options);
	});

	it('should classify statement as weather', function(done){
		watson_nlc.classify('What is the weather today?').then(function(result){
			expect(result.top_class).to.be.equal('weather.js');
			done();
		});
	});

	it('Should monitor a classifier while it is being trained', function(done){
		watson_nlc.monitorTraining('cd02b5x110-nlc-5110').then(function(result){
			expect(result.status).to.be.equal('Available');
			done();
		});
	});

	describe('Negative tests', function(){
		it('should fail getting the status of classifier', function(done){
			watson_nlc.classifierStatus('classifier-id-0000').catch(function(error){
				expect(error).to.be.not.equal(undefined);
				done();
			});
		});
	});

	it('Should not train existing classifier', function(done){
		// this test is using default env.nlc_classifier who's mocked list most recent status is Available.
		watson_nlc.trainIfNeeded().then(function(result){
			expect(result.status).to.be.equal('Available');
			done();
		});
	});

	it('Should start training classifier with provided training_data', function(done){
		watson_nlc_options.classifierName = 'non-exist-classifier';
		watson_nlc_options.training_data = fs.createReadStream(path.resolve(__dirname, 'resources', 'training.data.csv'));
		watson_nlc.trainIfNeeded().then(function(result){
			expect(result.status).to.be.equal('Training');
			done();
		});
	});
});
