/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const path = require('path');
const TAG = path.basename(__filename);
const watson = require('watson-developer-cloud');
const ServiceManager = require('./serviceManager');
const logger = require('./logger');
const fs = require('fs');
// const rrConfig = require('./rrconfig');

/**
 * @param options Object with the following configuration.
 *        options.url = Watson RR API URL (OPTIONAL, defaults to https://gateway-s.watsonplatform.net/retrieve-and-rank/api)
 *        options.username = Watson R&R username (REQUIRED)
 *        options.password = Watson R&R password (REQUIRED)
 *        options.version = Watson R&R version (OPTIONAL, defaults to V1)
 *				options.clusterName = Watson R&R solr cluster name (OPTIONAL, defaults to 'default-cluster')
 *				options.configName = Watson R&R solr config name (OPTIONAL, defaults to 'default-config')
 *				options.collectionName = Watson R&R collection name (OPTIONAL, defaults to 'default-collection')
 *        options.rankerName = Watson R&R Ranker name (OPTIONAL, defaults to 'default-ranker')
 *        options.maxRankers = Maximum number of rankers with name 'rankerName', will delete rankers exceding this num (OPTIONAL, defaults to 1)
 *        options.training_data = ReadStream, typically created from a CSV file.  (OPTIONAL, if omitted training data will come from rrDb)
 *				options.documents = ReadStream, typically created from a JSON file.  (OPTIONAL, if omitted documents will come from rrDb)
 *				options.config = ReadStream, typically created from a zip file.  (OPTIONAL, if omitted config will come from rrDb)
 *        options.saveTrainingData = Saves data used to train the ranker (OPTIONAL, defaults to true)
 * @constructor
 */
function RRManager(options) {
	this.opts = options || {};

	this.opts.clusterName = options.clusterName || 'default-cluster';
	this.opts.configName = options.configName || 'default-config';
	this.opts.collectionName = options.collectionName || 'default-collection';
	this.opts.rankerName = options.rankerName || 'default-ranker';
	this.opts.maxRankers = options.maxRankers || 1;
	this.opts.saveTrainingData = options.saveTrainingData === false ? options.saveTrainingData : true;
	this.opts.version = options.version || 'v1';
	this.opts.serviceName = 'rr';
	this.rr = watson.retrieve_and_rank(this.opts);
	this.serviceManager = new ServiceManager(this.opts);
}

/* ---------- Cluster-specific methods ---------- */

/**
 * Sets up a new solr cluster. The new cluster can't be used until its status becomes 'AVAILABLE'.
 * TIP:
 * 	 It is useful to monitor solr status using `monitorCluster(cluster_id)`.
 *
 * @return Promise	When resolved it returns a JSON object with the new ranker information.
 */
RRManager.prototype.setupCluster = function(){
	return this._setupCluster();
};

/**
 * Find the most recent cluster.  If no such cluster, then start creating one.
 * TIP:
 * 	 It is useful to monitor progress using `monitorCluster(cluster_id)`.
 *
 * @return Promise Resolved with existing cluster or new cluster information if training is needed.
 */
RRManager.prototype.setupIfNeeded = function(){
	return new Promise((resolve, reject) => {
		this._getCluster().then((cluster) => {
			resolve(this.cluster_cache);
		}).catch((err) => {
			reject(err);
		});
	});
};

/**
* Deletes the current cluster and all rankers
*/
RRManager.prototype.deleteCluster = function(){
	return new Promise((resolve, reject) => {
		this._getCluster(true).then((result) => {
			let params = {
				cluster_id: result.solr_cluster_id
			};
			return this._deleteCluster(params);
		}).then((result) => {
			resolve(result);
		}).catch((err) => {
			reject(err);
		});
	});
};

/**
 * Internal method to set up a cluster.
 *
 * @return Promise
 */
RRManager.prototype._setupCluster = function(){
	return new Promise((resolve, reject) => {
		if (this.clusterInitializing) {
			resolve(this.clusterInitializing);
		}

		else {
			let params = {
				cluster_name: this.opts.clusterName
			};
			this._createCluster(params).then((result) => {
				return this._monitorCluster(result.solr_cluster_id);
			}).then((result) => {
				let config_params = {
					cluster_id: this.cluster_cache.solr_cluster_id,
					config_name: this.opts.configName,
					config_zip_path: this.opts.config
				};
				return this._uploadConfig(config_params);
			}).then((result) => {
				let collection_params = {
					cluster_id: this.cluster_cache.solr_cluster_id,
					config_name: this.opts.configName,
					collection_name: this.opts.collectionName
				};
				return this._createCollection(collection_params);
			}).then((result) => {
				if (this.opts.documents){
					fs.readFile(this.opts.documents, 'utf8', (err, data) => {
						if (err){
							reject(err);
						}
						else {
							let documents = JSON.parse(data);
							return this._uploadDocuments(documents);
						}
					});
				}
				else {
					reject('failed to upload training documents: no documents found.');
					// TODO: Implement way to train with documents stored in db by crawler?
					// rrConfig.getDocuments().then((jsonInput) => {
					// 	return this._uploadDocuments(jsonInput);
					// }).catch((error) => {
					// 	reject(error);
					// });
				}
			}).then((result) => {
				resolve(this.cluster_cache);
			}).catch((err) => {
				reject(err);
			});
		}
	});
};

/**
 * Helper method that creates an RR solr cluster
 *
 * @param  Object 	params 	Parameters for the Watson RR service.
 * @return Object        	Result from Watson RR service.
 */
RRManager.prototype._createCluster = function(params){

	logger.info('Creating cluster with params ', params);
	return new Promise((resolve, reject) => {
		this.rr.createCluster(params, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error creating solr cluster.`, err);
				logger.error(`${TAG} Options and data sent to train RR service.`, params);
				reject('Error creating solr cluster');
			}
			else {
				this.clusterInitializing = response;
				resolve(response);
			}
		});
	});
};

/**
 * Helper method that uploads a config file to a cluster
 *
 * @param  Object 	params 	Parameters for the Watson RR service.
 * @return Object        	Result from Watson RR service.
 */
RRManager.prototype._uploadConfig = function(params){
	return new Promise((resolve, reject) => {
		this.rr.uploadConfig(params, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error creating solr cluster.`, err);
				logger.error(`${TAG} Options and data sent to train RR service.`, params);
				reject('Error creating solr cluster');
			}
			else {
				resolve(response);
			}
		});
	});
};

/**
 * Helper method that creates a collection for a cluster
 *
 * @param  Object 	params 	Parameters for the Watson RR service.
 * @return Object        	Result from Watson RR service.
 */
RRManager.prototype._createCollection = function(params){
	return new Promise((resolve, reject) => {
		this.rr.createCollection(params, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error creating collection.`, err);
				logger.error(`${TAG} Options and data sent to create collection.`, params);
				reject('Error creating collection');
			}
			else {
				resolve(response);
			}
		});
	});
};

/**
 * Helper method that uploads documents to RR instance.
 *
 * @param  Object 	params 	Parameters for the Watson RR service.
 * @return Object        	Result from Watson RR service.
 */
RRManager.prototype._uploadDocuments = function(documents){
	return new Promise((resolve, reject) => {
		if (!this.solrClient){
			let params = {
				cluster_id: this.cluster_cache.solr_cluster_id,
				collection_name: this.opts.collectionName
			};
			this.solrClient = this.rr.createSolrClient(params);
		}
		this.solrClient.add(documents, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error uploading documents to collection.`, err);
				reject('Error uploading documents');
			}
			else {
				this.solrClient.commit(function(err) {
					if (err) {
						reject('Error committing change: ' + err);
					}
					else {
						resolve('successfully committed changes');
					}
				});
			}
		});
	});
};

/**
 * Internal method to delete a cluster.
 *
 * @return Promise
 */
RRManager.prototype._deleteCluster = function(params){
	return new Promise((resolve, reject) => {
		this.rr.deleteCluster(params, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error deleting solr cluster.`, err);
				logger.error(`${TAG} Options and data sent to delete cluster.`, params);
				reject('Error deleting solr cluster');
			}
			else {
				this.cluster_cache = undefined;
				resolve(response);
			}
		});
	});
};

/**
 * Internal method to poll for cluster status.
 *
 * @param  String 	cluster_id 	The id of the cluster.
 * @return Promise               	Resolved when cluster status becomes AVAILABLE. Returns the cluster settings/status. Errors if training fails.
 */
RRManager.prototype._monitorCluster = function(cluster_id){
	return new Promise((resolve, reject) => {
		const checkAvailable = (resolve, reject) => {
			logger.info(`Checking status of cluster ${cluster_id}`);
			this.rr.pollCluster({cluster_id: cluster_id}, (err, status) => {
				if (err){
					reject('Error getting status for cluster.');
				}
				else {
					logger.info(`Status of cluster ${cluster_id} is ${status.solr_cluster_status}.`);
					if (status.solr_cluster_status === 'NOT_AVAILABLE'){
						setTimeout(() => {
							checkAvailable(resolve, reject);
						}, 1000 * 60);
					}
					else if (status.solr_cluster_status === 'READY'){
						this.clusterInitializing = undefined;
						this.cluster_cache = status;
						resolve(status);
					}
					else {
						reject(status);
					}
				}
			});
		};
		checkAvailable(resolve, reject);
	});
};

/**
 * Helper method to finds a cluster which is ready
 * and with the most recent creation date.  If none are 'READY' then find
 * the most recent cluster that is 'NOT_AVAILABLE'.  If none exist at all,
 * start setting up a new one.
 *
 * @return Promise When resolved it returns a JSON object with the cluster information.
 */
RRManager.prototype._getCluster = function(doNotCreate){
	return new Promise((resolve, reject) => {
		if (this.cluster_cache){
			logger.debug(`Using cached RR cluster ${this.cluster_cache.cluster_id}`);
			resolve(this.cluster_cache);
		}
		else {
			this.rr.listClusters({}, (err, response) => {
				if (err) {
					reject('Error getting available clusters.' + JSON.stringify(err, null, 2));
				}
				else {
					let filteredClusters = response.clusters.filter((cluster) => {
						return cluster.cluster_name === this.opts.clusterName;
					});

					if (filteredClusters.length < 1){
						if (doNotCreate) {
							reject(`No clusters found under [${this.opts.clusterName}]`);
						}
						else {
							// no clusters found by this name, so create one and start training.
							logger.info(`No clusters found with name ${this.opts.clusterName}. Creating a new one.`);
							this._setupCluster().then((result) => {
								resolve(result);
							}).catch((err) => {
								reject(err);
							});
						}
					}
					else {
						// try to find the most recent available.  or most recent that started training.
						let sortedClusters = filteredClusters.sort((a, b) => {
							return new Date(b.created) - new Date(a.created);
						});

						let checkStatus = [];
						sortedClusters.map((cluster) => {
							checkStatus.push(this._getClusterStatus(cluster.solr_cluster_id));
						});

						Promise.all(checkStatus).then((clusterStatus) => {

							this.clusterInitializing = undefined;
							for (let i = 0; i < sortedClusters.length; i++){
								if (sortedClusters[i].cluster_name === this.opts.clusterName){
									if (clusterStatus[i].solr_cluster_status === 'READY'){
										this.cluster_cache = clusterStatus[i];
										resolve(clusterStatus[i]);
										return;
									}
									else if (clusterStatus[i].solr_cluster_status === 'NOT_AVAILABLE' && !this.clusterInitializing){
										this.clusterInitializing = clusterStatus[i];
									}
								}
							}

							if (this.clusterInitializing){
								resolve(this.clusterInitializing);
							}
							else {
								if (doNotCreate) {
									reject(`No clusters available under [${this.opts.clusterName}]`);
								}
								else {
									// none are available or training, start training one.
									logger.info(`No clusters with name ${this.opts.clusterName} are avilable or initializing. Creating a new one.`);
									this._setupCluster().then((result) => {
										resolve(result);
									}).catch((err) => {
										reject(err);
									});
								}
							}
						}).catch((error) => {
							reject('Error getting a cluster.' + JSON.stringify(error));
						});
					}
				}
			});
		}
	});
};

/**
 * Helper method to retrieve the status of a cluster.
 *
 * @param  String 	cluster_id 	The id of the cluster.
 * @return Promise       			When resolved returns the cluster data.
 */
RRManager.prototype._getClusterStatus = function(cluster_id){
	return new Promise((resolve, reject) => {
		if (cluster_id) {
			this.rr.pollCluster({cluster_id: cluster_id}, (err, status) => {
				if (err){
					reject('Error while checking status of cluster ' + cluster_id + JSON.stringify(err, null, 2));
				}
				else {
					// If cluster is unavailable, record it's training duration
					if (status.status === 'NOT_AVAILABLE') {
						let duration = Math.floor((Date.now() - new Date(status.created)) / 60000);
						status.duration = duration > 0 ? duration : 0;
					}
					resolve(status);
				}
			});
		}
		else {
			this._getCluster(true).then(function(status) {
				resolve(status);
			}).catch(function(err) {
				reject(err);
			});
		}
	});
};


/* ---------- Ranker-specific methods ---------- */

/**
 * Creates a new ranker and starts training it. The new ranker can't be used until training completes.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(ranker_id)`.
 *
 * @return Promise	When resolved it returns a JSON object with the new ranker information.
 */
RRManager.prototype.train = function(){
	return this.serviceManager.train(this.cluster_cache);
};

/**
 * Find the most recent ranker that either available or training.  If no such ranker, then start training.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(ranker_id)`.
 *
 * @return Promise Resolved with existing ranker or new ranker information if training is needed.
 */
RRManager.prototype.trainIfNeeded = function(){
	return this.serviceManager.trainIfNeeded(this.cluster_cache);
};

/**
 * Asynchronously monitors a ranker that is being trained. It resolves when training
 * completes and the ranker status is 'Available'. It polls for ranker status every
 * 60 seconds. Training a ranker takes at least 10 minutes.
 *
 * @param  String 	ranker_id 	The id of the ranker.
 * @return Promise               	Resolved when training completes. Returns the ranker settings/status. Errors if training fails.
 */
RRManager.prototype.monitorTraining = function(ranker_id){
	return this.serviceManager.monitorTraining(ranker_id);
};

/**
 * Gets the current status for the ranker with ranker_id
 *
 * @param  String 	ranker_id 	The id of the ranker.
 * @return Promise       			When resolved returns the ranker data. It errors if a ranker isn't found.
 */
RRManager.prototype.rankerStatus = function(ranker_id){
	return this.serviceManager.getStatus(ranker_id);
};

/**
 * Gets list of rankers
 *
 * @return Promise       			When resolved returns a list of rankers.
 */
RRManager.prototype.rankerList = function(){
	return this.serviceManager.getList();
};

/**
 * Get information about the curent ranker
 *
 * @return Promise
 */
RRManager.prototype.currentRanker = function(){
	return this.serviceManager.currentInstance();
};

/**
 * Returns documents that match a query using the latest ranker available.
 *
 * @param  String	text	Question to be matched with ranked documents.
 * @return JSON      		Ranking data from Watson Retrieve and Rank ranker.
 */
RRManager.prototype.rank = function(text){
	return this.serviceManager.process(text, this.cluster_cache);
};

/**
 * Gets data used to train the ranker with rankerId.
 *
 * @param  String	rankerId
 * @return Promise  JSON			Sample result:	{"className": ["Text 1.", "Text 2"]}
 */
RRManager.prototype.getRankerData = function(rankerId){
	return this.serviceManager.getInstanceData(rankerId);
};


module.exports = RRManager;
