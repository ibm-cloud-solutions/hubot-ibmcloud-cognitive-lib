/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const nock = require('nock');
const path = require('path');
const env = require(path.resolve(__dirname, '..', 'src', 'lib', 'env'));

const nlcEndpoint = env.nlc_url;

const mockClassifyResults = require(path.resolve(__dirname, 'resources', 'mock.classifyResult.json'));
const mockClassifierStatusAvailableResults = require(path.resolve(__dirname, 'resources', 'mock.classifierStatusAvailable.json'));
const mockClassifierStatusTrainingResults = require(path.resolve(__dirname, 'resources', 'mock.classifierStatusTraining.json'));
const mockClassifierStatusUnavailableResults = require(path.resolve(__dirname, 'resources', 'mock.classifierStatusUnavailable.json'));

let classifierList = require(path.resolve(__dirname, 'resources', 'mock.classifierList.json'));

module.exports = {
	setupMockery: function() {
		let nlcScope = nock(nlcEndpoint).persist();

		// Mock route to list all classifiers.
		nlcScope.get('/v1/classifiers')
		.reply(200, function(){
			return classifierList;
		});


		// Mock route for classifier status.
		nlcScope.get('/v1/classifiers/cd02b5x110-nlc-5103')
		.reply(200, mockClassifierStatusAvailableResults);
		nlcScope.get('/v1/classifiers/cd02b5x110-nlc-5110')
		.reply(200, mockClassifierStatusAvailableResults);
		nlcScope.get('/v1/classifiers/cd02b5x110-nlc-5074')
		.reply(200, mockClassifierStatusAvailableResults);
		nlcScope.get('/v1/classifiers/cd02b5x110-nlc-0000')
		.reply(200, mockClassifierStatusAvailableResults);
		nlcScope.get('/v1/classifiers/cd02b5x110-nlc-9999')
		.reply(200, mockClassifierStatusTrainingResults.testClassifier3);
		nlcScope.get('/v1/classifiers/cd02b5x110-nlc-8888')
		.reply(200, mockClassifierStatusUnavailableResults);

		// Mock route for classifier error status.
		nlcScope.get('/v1/classifiers/classifier-id-0000')
		.reply(400, 'Mock: Classifier doesn\'t exist');


		// Mock route for deleting a classifier, deletes it from our mock list of classifiers.
		nlcScope.delete('/v1/classifiers/cd02b5x110-nlc-0000')
		.reply(200, function(uri, requestBody) {
			classifierList.classifiers = classifierList.classifiers.filter(function(item){
				return item.classifier_id !== 'cd02b5x110-nlc-0000';
			});
			return {};
		});


		// Mock route to get classification data.
		nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5110/classify')
		.reply(200, mockClassifyResults);


		// Mock route to create a new classifier.
		nlcScope.post('/v1/classifiers')
		.reply(201, mockClassifierStatusTrainingResults.testClassifier);
	},

	setupMockErrors: function() {
		nock.cleanAll();
		nock.disableNetConnect();
		let nlcErrorScope = nock(nlcEndpoint).persist();

		// Mock route to list all classifiers.
		nlcErrorScope.get('/v1/classifiers')
		.reply(500, function(){
			return 'Some 500 error message from the NLC service';
		});

		// Mock route to create a new classifier.
		nlcErrorScope.post('/v1/classifiers')
		.reply(400, {});
	}
};
