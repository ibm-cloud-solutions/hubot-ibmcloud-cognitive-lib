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
const RRManager = require('../index').rrManager;
const mockRR = require('./rrManager.mock');
const env = require('../src/lib/env.js');
const dbSetup = require('./setupTestDb');
let rrDb;
let docs = path.resolve(__dirname, 'resources', 'mock.documents.json');

describe('Test the RRManager library', function(){
	let watson_rr;
	const nonExistentRanker = 'test-ranker2';
	const trainingRanker = 'test-ranker3';
	const unavailableRanker = 'test-ranker4';

	let initRRManager = function(rankerName, training_data){
		let options = {
			url: env.rr_url,
			username: env.rr_username,
			password: env.rr_password,
			clusterName: 'test-cluster',
			configName: 'test-config',
			config: 'test/resources/test-config.zip',
			collectionName: 'test-collection',
			documents: path.resolve(__dirname, 'resources', 'mock.documents.json'),
			rankerName: rankerName,
			version: 'v1',
			maxRankers: 3,
			training_data
		};
		return new RRManager(options);
	};

	before(function(done){
		dbSetup.setup().then((databases) => {
			rrDb = databases.rrDb;
			done();
		});
	});

	beforeEach(function(){
		watson_rr = initRRManager('test-ranker');
	});

	describe('Test the solr cluster methods', function(){
		before(function() {
			return mockRR.setupSolrMockery();
		});

		it('should return a training cluster if none found ready', function(done){
			watson_rr._getCluster().then((result) => {
				expect(result.solr_cluster_id).to.be.equal('sc8675309-s117-notready');
				expect(result.cluster_name).to.be.equal(watson_rr.opts.clusterName);
				expect(result.solr_cluster_status).to.be.equal('NOT_AVAILABLE');
				done();
			});
		});

		it('should create a solr cluster', function(done){
			watson_rr._createCluster().then((result) => {
				expect(result.solr_cluster_id).to.be.equal('sc117-13225-sjd27');
				expect(result.cluster_name).to.be.equal(watson_rr.opts.clusterName);
				expect(result.solr_cluster_status).to.be.equal('NOT_AVAILABLE');
				done();
			});
		});

		it('should upload a solr config', function(done){
			let params = {cluster_id: 'sc117-13225-sjd27',
			config_name: 'test-config',
			config_zip_path: 'test/resources/test-config.zip'};
			watson_rr._uploadConfig(params).then((result) => {
				expect(result).to.exist;
				expect(result).to.be.an('object');
				expect(result).to.be.empty;
				done();
			});
		});

		it('should create a solr collection', function(done){
			let params = {cluster_id: 'sc117-13225-sjd27',
			config_name: 'test-config',
			collection_name: 'test-collection'};
			watson_rr._createCollection(params).then((result) => {
				expect(result.responseHeader.status).to.be.equal(0);
				expect(result.responseHeader.QTime).to.be.equal(1627);
				expect(result.core).to.be.equal('test_collection_shard1_replica1');
				done();
			});
		});

		it('should upload documents', function(done){
			watson_rr.setupIfNeeded().then((result) => {
				return watson_rr._uploadDocuments(require(docs));
			}).then((result) => {
				expect(result).to.exist;
				done();
			});
		});

		it('should setup from start to finish', function(done){
			watson_rr.setupCluster().then((result) => {
				expect(result.solr_cluster_id).to.be.equal('sc117-13225-sjd27');
				done();
			});
		});

		it('should find cached solr cluster', function(done){
			watson_rr.setupIfNeeded().then((result) => {
				return watson_rr._getCluster();
			}).then((result) => {
				expect(result.solr_cluster_id).to.be.equal('sc117-13225-sjd27');
				expect(result.cluster_name).to.be.equal(watson_rr.opts.clusterName);
				expect(result.solr_cluster_status).to.be.equal('READY');
				done();
			});
		});

		it('should get cluster status without specifying a cluster id', function(done){
			watson_rr._getClusterStatus().then((result) => {
				expect(result.solr_cluster_id).to.be.equal('sc117-13225-sjd27');
				expect(result.cluster_name).to.be.equal(watson_rr.opts.clusterName);
				expect(result.solr_cluster_status).to.be.equal('READY');
				done();
			});
		});

		it('should delete clusters', function(done){
			watson_rr.deleteCluster().then((result) => {
				expect(result).to.exist;
				expect(result).to.be.empty;
				return watson_rr.deleteCluster();
			}).then((result) => {
				expect(result).to.exist;
				expect(result).to.be.empty;
				return watson_rr._getCluster(true);
			}).then((result) => {
				expect(result).to.not.exist();
			}, (error) => {
				expect(error).to.be.eql('No clusters found under [test-cluster]');
				done();
			});
		});

		it('should return error if no clusters found and doNotCreate true', function(done){
			watson_rr._getCluster(true).then((result) => {
				expect(result).to.not.exist;
			},
			(error) => {
				expect(error).to.be.equal('No clusters found under [test-cluster]');
				done();
			});
		});
	});

	describe('Test the ranker methods', function(){

		before(function() {
			return mockRR.setupMockery();
		});

		it('should return cf cli doc as top result', function(done){
			watson_rr.setupIfNeeded().then((result) => {
				return watson_rr.rank('using the cf command line');
			}).then((result) => {
				expect(result.docs[0].url).to.be.equal('cli/reference/cfcommands/index.html');
				done();
			});
		});

		it('Should monitor a ranker and delete old rankers', function(done){
			watson_rr.monitorTraining('cd02b5x110-rr-5110').then((result) => {
				expect(result.status).to.be.equal('Available');
				rrDb.get('cd02b5x110-rr-0000').catch((err) => {
					expect(err.name).to.be.eql('not_found');
					expect(err.reason).to.be.eql('deleted');
					done();
				});
			});
		});

		it('should successfully get the status of most recent available ranker', function(done){
			watson_rr.rankerStatus().then((result) => {
				expect(result.status).to.be.equal('Available');
				done();
			});
		});

		it('should successfully get status of most recent training ranker', function(done){
			initRRManager(trainingRanker).rankerStatus().then((result) => {
				expect(result.status).to.be.equal('Training');
				done();
			});
		});

		it('should successfully list filtered rankers in correct order', function(done){
			watson_rr.rankerList().then((result) => {
				expect(result.length).to.be.equal(3);
				expect(result[0].name).to.be.equal('test-ranker');
				expect(result[1].name).to.be.equal('test-ranker');
				expect(result[2].name).to.be.equal('test-ranker');
				done();
			});
		});

		it('should successfully get the current ranker', function(done){
			watson_rr.currentRanker().then((result) => {
				expect(result.name).to.be.eql('test-ranker');
				expect(result.ranker_id).to.be.eql('cd02b5x110-rr-5110');
				done();
			});
		});

		it('Should not train existing ranker', function(done){
			// this test is using default env.rr_ranker who's mocked list most recent status is Available.
			watson_rr.trainIfNeeded().then((result) => {
				expect(result.status).to.be.equal('Available');
				done();
			});
		});

		it('Should start training ranker with training_data from db', function(done){
			let temp_rr_instance = initRRManager('non-exist-ranker');
			temp_rr_instance.setupIfNeeded().then((result) => {
				return temp_rr_instance.trainIfNeeded();
			}).then((result) => {
				expect(result.status).to.be.equal('Training');
				done();
			});
		});

		it('Should start training ranker with provided training_data', function(done){
			initRRManager('non-exist-ranker', fs.createReadStream(path.resolve(__dirname, 'resources', 'training.data.csv'))).trainIfNeeded().then((result) => {
				expect(result.status).to.be.equal('Training');
				done();
			});
		});

		it('should successfully get training data for ranker', function(done){
			watson_rr.getRankerData('ranker-data-123').then((result) => {
				expect(result.ranking).to.be.an('array');
				expect(result.ranking[0]).to.be.eql('Sample ranking text');
				expect(result.ranking[1]).to.be.eql('Sample ranking text 2');
				expect(result.ranking3[0]).to.be.eql('Sample ranking text 3');
				done();
			});
		});
	});

	describe('Negative tests', function(){
		it('should fail getting the status of ranker', function(done){
			watson_rr.rankerStatus('ranker-id-0000').catch(function(error){
				expect(error).to.be.not.equal(undefined);
				done();
			});
		});

		it('should fail to get status of ranker', function(done){
			initRRManager(nonExistentRanker).rankerStatus().catch(function(error){
				expect(error).to.be.equal(`No rankers found under [${nonExistentRanker}]`);
				done();
			});
		});

		it('should fail to get an available/training ranker', function(done){
			initRRManager(unavailableRanker).rankerStatus().catch(function(error){
				expect(error).to.be.equal(`No rankers available under [${unavailableRanker}]`);
				done();
			});
		});

		it('should fail to get training data for a ranker that doesn\'t exist', function(done){
			watson_rr.getRankerData('bad-ranker').catch((error) => {
				expect(error).to.be.equal('Error retrieving data used to train ranker bad-ranker');
				done();
			});
		});
	});


	describe('RR 500 errors', function(){
		before(function() {
			return mockRR.setupMockErrors();
		});

		it('should fail to list all rankers', function(done){
			watson_rr.rankerList().then(() => {
				done(Error('Test should have failed listing all rankers'));
			}).catch(function(error){
				expect(error).to.include('Error getting list of rankers.');
				done();
			});
		});

		it('should fail to train a ranker', function(done){
			watson_rr.setupIfNeeded().then((result) => {
				return watson_rr.train();
			}).then(() => {
				done(Error('Test should have failed training a new ranker'));
			}).catch(function(error){
				expect(error).to.include('Error creating ranker');
				done();
			});
		});
	});
});
