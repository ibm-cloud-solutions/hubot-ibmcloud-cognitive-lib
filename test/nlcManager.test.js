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
const dbSetup = require('./setupTestDb');
var db;

describe('Test the NLCManager library', function(){
	var watson_nlc;
	var watson_nlc_options;
	var nonExistantClassifier = 'test-classifier2';
	var trainingClassifier = 'test-classifier3';
	var unavailableClassifier = 'test-classifier4';

	before(function(done){
		dbSetup.setup().then((database) => {
			db = database;
			done();
		});
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

	it('Should monitor a classifier while it is being trained and delete old classifiers when training completes', function(done){
		watson_nlc.monitorTraining('cd02b5x110-nlc-5110').then(function(result){
			expect(result.status).to.be.equal('Available');

			db.get('cd02b5x110-nlc-0000').catch((err) => {
				expect(err.name).to.be.eql('not_found');
				expect(err.reason).to.be.eql('deleted');
				done();
			});
		});
	});

	it('should successfully get the status of most recent available classifier', function(done){
		watson_nlc.classifierStatus().then(function(result){
			expect(result.status).to.be.equal('Available');
			done();
		});
	});

	it('should successfully get status of most recent training classifier', function(done){
		watson_nlc.opts.classifierName = trainingClassifier;
		watson_nlc.nlc._options.classifierName = trainingClassifier;
		watson_nlc.classifierStatus().then(function(result){
			expect(result.status).to.be.equal('Training');
			done();
		});
	});

	it('should successfully list all classifiers in correct order', function(done){
		watson_nlc.classifierList().then(function(result){
			expect(result.length).to.be.equal(5);
			expect(result[0].name).to.be.equal('test-classifier');
			expect(result[4].name).to.be.equal(trainingClassifier);
			done();
		});
	});

	it('should successfully get the current classifier', function(done){
		watson_nlc.currentClassifier().then(function(result){
			expect(result.name).to.be.eql('test-classifier');
			expect(result.classifier_id).to.be.eql('cd02b5x110-nlc-5110');
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

		it('should fail to get status of classifier', function(done){
			watson_nlc.opts.classifierName = nonExistantClassifier;
			watson_nlc.nlc._options.classifierName = nonExistantClassifier;
			watson_nlc.classifierStatus().catch(function(error){
				expect(error).to.be.equal(`No classifiers found under [${nonExistantClassifier}]`);
				done();
			});
		});

		it('should fail to get an available/training classifier', function(done){
			watson_nlc.opts.classifierName = unavailableClassifier;
			watson_nlc.nlc._options.classifierName = unavailableClassifier;
			watson_nlc.classifierStatus().catch(function(error){
				expect(error).to.be.equal(`No classifiers available under [${unavailableClassifier}]`);
				done();
			});
		});

		it('should fail to get training data for a classifier that doesn\'t exist', function(done){
			watson_nlc.getClassifierData('bad-classifier').catch((error) => {
				expect(error).to.be.equal('Error retrieving data used to train classifier bad-classifier');
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

	it('should successfully get training data for classifier', function(done){
		watson_nlc.getClassifierData('classifier-data-123').then((result) => {
			expect(result.classification).to.be.an('array');
			expect(result.classification[0]).to.be.eql('Sample classification text');
			expect(result.classification[1]).to.be.eql('Sample classification text 2');
			expect(result.classification3[0]).to.be.eql('Sample classification text 3');
			done();
		});
	});


	describe('NLC 500 errors', function(){
		before(function() {
			return mockNLP.setupMockErrors();
		});

		it('should fail to list all classifiers', function(done){
			watson_nlc.classifierList().then(() => {
				done(Error('Test should have failed listing all classifiers'));
			}).catch(function(error){
				expect(error).to.include('Error getting list of classifiers.');
				done();
			});
		});

		it('should fail to train a classifier', function(done){
			watson_nlc.train().then(() => {
				done(Error('Test should have failed training a new classifier'));
			}).catch(function(error){
				expect(error).to.include('Error creating classifier');
				done();
			});
		});
	});
});
