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

const rrEndpoint = env.rr_url;

const mockRankResults = require(path.resolve(__dirname, 'resources', 'mock.rankResult.json'));
const mockRankerStatusAvailableResults = require(path.resolve(__dirname, 'resources', 'mock.rankerStatusAvailable.json'));
const mockClusterStatusReadyResults = require(path.resolve(__dirname, 'resources', 'mock.clusterStatusReady.json'));
const mockRankerStatusTrainingResults = require(path.resolve(__dirname, 'resources', 'mock.rankerStatusTraining.json'));
const mockRankerStatusUnavailableResults = require(path.resolve(__dirname, 'resources', 'mock.rankerStatusUnavailable.json'));
const mockRSInputs = require(path.resolve(__dirname, 'resources', 'mock.RSInputs.json'));

const rankerList = require(path.resolve(__dirname, 'resources', 'mock.rankerList.json'));
const clusterList = require(path.resolve(__dirname, 'resources', 'mock.clusterList.json'));

module.exports = {
	setupMockery: function() {
		let rrScope = nock(rrEndpoint).persist();

		// Mock route to list all rankers.
		rrScope.get('/v1/rankers')
		.reply(200, function(){
			return rankerList;
		});

		// Mock route to list all clusters.
		rrScope.get('/v1/solr_clusters')
		.reply(200, function(){
			return clusterList;
		});

		// Mock route for cluster status.
		rrScope.get('/v1/solr_clusters/cd02b5x110-rr-5103')
		.reply(200, mockClusterStatusReadyResults);

		// Mock route for ranker status.
		rrScope.get('/v1/rankers/cd02b5x110-rr-5103')
		.reply(200, mockRankerStatusAvailableResults);
		rrScope.get('/v1/rankers/cd02b5x110-rr-5110')
		.reply(200, mockRankerStatusAvailableResults);
		rrScope.get('/v1/rankers/cd02b5x110-rr-5074')
		.reply(200, mockRankerStatusAvailableResults);
		rrScope.get('/v1/rankers/cd02b5x110-rr-0000')
		.reply(200, mockRankerStatusAvailableResults);
		rrScope.get('/v1/rankers/cd02b5x110-rr-9999')
		.reply(200, mockRankerStatusTrainingResults.testRanker3);
		rrScope.get('/v1/rankers/cd02b5x110-rr-8888')
		.reply(200, mockRankerStatusUnavailableResults);

		// Mock route for ranker error status.
		rrScope.get('/v1/rankers/ranker-id-0000')
		.reply(400, 'Mock: Ranker doesn\'t exist');

		// Mock route for deleting a ranker, deletes it from our mock list of rankers.
		rrScope.delete('/v1/rankers/cd02b5x110-rr-0000')
		.reply(200, function(uri, requestBody) {
			rankerList.rankers = rankerList.rankers.filter(function(item){
				return item.ranker_id !== 'cd02b5x110-rr-0000';
			});
			return {};
		});

		// Mock route to get ranking data.
		rrScope.get('/v1/solr_clusters/sc8675309-s117/solr/test-collection/fcselect?q=using%20the%20cf%20command%20line&ranker_id=cd02b5x110-rr-5110&fl=id%2Ctitle&wt=json')
		.reply(200, mockRankResults);

		// Mock route to create a new ranker.
		rrScope.post('/v1/rankers')
		.reply(201, mockRankerStatusTrainingResults.testRanker);
	},

	setupMockErrors: function() {
		nock.cleanAll();
		nock.disableNetConnect();
		let rrErrorScope = nock(rrEndpoint).persist();

		// Mock route to list all rankers.
		rrErrorScope.get('/v1/rankers')
		.reply(500, function(){
			return 'Some 500 error message from the RR service';
		});

		// Mock route to create a new ranker.
		rrErrorScope.post('/v1/rankers')
		.reply(400, {});

		// Mock routes to get training data for ranker training
		rrErrorScope.get('/v1/solr_clusters/sc8675309-s117/solr/test-collection/fcselect?q=mySelection&gt=undefined%2Cundefined&returnRSInput=true&rows=10&wt=json&fl=id')
		.reply(200, mockRSInputs);
		rrErrorScope.get('/v1/solr_clusters/sc8675309-s117/solr/test-collection/fcselect?q=approved&gt=should%20see%20this&returnRSInput=true&rows=10&wt=json&fl=id')
		.reply(200, mockRSInputs);
		rrErrorScope.get('/v1/solr_clusters/sc8675309-s117/solr/test-collection/fcselect?q=test.class&gt=test%20data&returnRSInput=true&rows=10&wt=json&fl=id')
		.reply(200, mockRSInputs);

		// Mock route to list all clusters.
		rrErrorScope.get('/v1/solr_clusters')
		.reply(200, function(){
			return clusterList;
		});

		// Mock route for cluster status.
		rrErrorScope.get('/v1/solr_clusters/cd02b5x110-rr-5103')
		.reply(200, mockClusterStatusReadyResults);

	}
};
