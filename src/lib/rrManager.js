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
const csvParse = require('csv-parse');
const DBManager = require('./dbManager');
const env = require('./env');
const rrDb = new DBManager({localDbName: 'rr', remoteDbName: env.cloudantDb});
const logger = require('./logger');
const fs = require('fs');
const qs = require('qs');
const request = require('request');

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

	this.rr = watson.retrieve_and_rank(this.opts);
}


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
* Deletes the current cluster and all rankers
*/
RRManager.prototype.deleteCluster = function(){
	return new Promise((resolve, reject) => {
		this._getCluster(true).then((result) => {
			return this._deleteOldRankers();
		}).then((result) => {
			let params = {
				cluster_id: this.cluster_cache.solr_cluster_id
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
 * Creates a new ranker and starts training it. The new ranker can't be used until training completes.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(ranker_id)`.
 *
 * @return Promise	When resolved it returns a JSON object with the new ranker information.
 */
RRManager.prototype.train = function(){
	return this._startTraining();
};

/**
 * Find the most recent ranker that either available or training.  If no such ranker, then start training.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(ranker_id)`.
 *
 * @return Promise Resolved with existing ranker or new ranker information if training is needed.
 */
RRManager.prototype.trainIfNeeded = function(){
	return new Promise((resolve, reject) => {
		this._getRanker().then((ranker) => {
			resolve(ranker);
		}).catch((err) => {
			reject(err);
		});
	});
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
			let config_params = {
				cluster_id: this.cluster_cache.solr_cluster_id,
				config_name: this.opts.configName,
				config_zip_path: this.opts.config
			};
			return this._getConfig(config_params);
		}).then((config) => {
			resolve(this.cluster_cache);
		}).catch((err) => {
			reject(err);
		});
	});
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
	return this._monitor(ranker_id);
};


/**
 * Gets the current status for the ranker with ranker_id
 *
 * @param  String 	ranker_id 	The id of the ranker.
 * @return Promise       			When resolved returns the ranker data. It errors if a ranker isn't found.
 */
RRManager.prototype.rankerStatus = function(ranker_id){
	return this._getRankerStatus(ranker_id);
};

/**
 * Gets list of rankers
 *
 * @return Promise       			When resolved returns a list of rankers.
 */
RRManager.prototype.rankerList = function(){
	return this._getRankerList();
};


/**
 * Get information about the curent ranker
 *
 * @return Promise
 */
RRManager.prototype.currentRanker = function(){
	return this._getRanker(true);
};

/**
 * Returns documents that match a query using the latest ranker available.
 *
 * @param  String	text	Question to be matched with ranked documents.
 * @return JSON      		Ranking data from Watson Retrieve and Rank ranker.
 */
RRManager.prototype.rank = function(text){
	return new Promise((resolve, reject) => {
		this._getRanker().then((ranker) => {
			logger.info(`Using ranker ${ranker.ranker_id}`);
			if (ranker.status === 'Training'){
				resolve(ranker);
			}
			else {
				if (!this.solrClient){
					let params = {
						cluster_id: this.cluster_cache.solr_cluster_id,
						collection_name: this.opts.collectionName
					};
					this.solrClient = this.rr.createSolrClient(params);
				}
				this.solrClient.get('fcselect', qs.stringify({
					q: text,
					ranker_id: ranker.ranker_id,
					fl: 'id,title'}),
					(err, response) => {
						if (err) {
							this.ranker_cache = undefined;
							reject(err);
						}
						else {
							resolve(response);
						}
					});
			}
		}).catch((err) => {
			this.ranker_cache = undefined;
			reject(err);
		});
	});
};


/**
 * Gets data used to train the ranker with rankerId.
 *
 * @param  String	rankerId
 * @return Promise  JSON			Sample result:	{"className": ["Text 1.", "Text 2"]}
 */
RRManager.prototype.getRankerData = function(rankerId){
	logger.debug(`${TAG} Requested data used to train RR with rankerId=${rankerId}`);
	return new Promise((resolve, reject) => {
		rrDb.get(rankerId).then((doc) => {
			csvParse(doc.trainedData, function(err, jsonData){
				if (err){
					logger.error(`${TAG}: Error parsing CSV data used to train RR with rankerId=${rankerId}`, err);
					reject(err);
				}
				else {
					// Sort data by className for better display.
					let result = {};
					jsonData.forEach((trainingRecord) => {
						for (let i = 1; i < trainingRecord.length; i++){
							let texts = result[trainingRecord[i]] || [];
							texts.push(trainingRecord[0]);
							result[trainingRecord[i]] = texts;
						}
					});
					logger.debug(`${TAG}: Data used to train RR with rankerId=${rankerId}`, result);
					resolve(result);
				}
			});
		}).catch((err) => {
			logger.error(`Error retrieving data used to train ranker ${rankerId}`, err);
			reject(`Error retrieving data used to train ranker ${rankerId}`, err);
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
				resolve(response);
			}
		});
	});
};


/**
 * Internal method to set up a cluster.
 *
 * @return Promise
 */
RRManager.prototype._setupCluster = function(){

	logger.info('Creating new solr cluster...');
	return new Promise((resolve, reject) => {
		if (this.clusterInitializing) {

			logger.info('a solr cluster already exists');
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
					rrDb.getDocuments().then((jsonInput) => {
						return this._uploadDocuments(jsonInput);
					}).catch((error) => {
						reject(error);
					});
				}
			}).then((result) => {
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		}
	});
};


/**
 * Internal method to start training a ranker.
 *
 * @return Promise
 */
RRManager.prototype._startTraining = function(){

	logger.info('Starting training a ranker');
	return new Promise((resolve, reject) => {
		if (this.rankerTraining) {
			logger.info(`Ranker already in training: ${this.rankerTraining}`);
			resolve(this.rankerTraining);
		}
		// Training with data initialized in opts.
		else if (this.opts.training_data) {
			let params = {
				training_data: this.opts.training_data,
				training_metadata: JSON.stringify({name: this.opts.rankerName})
			};
			this._createRanker(params).then((result) => {
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		}

		// Training data from PouchDB.
		else {
			rrDb.getRRClasses().then((csvInput) => {
				let csv_text = 'question_id,f0,f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,r1,r2,s,ground_truth\n';
				let fcselect_calls = [];
				for (let i = 0; i < csvInput.length; i++){
					let row = csvInput[i];
					fcselect_calls.push(new Promise((resolve, reject) => {
						let query = this.opts.url + '/v1/solr_clusters/' + this.cluster_cache.solr_cluster_id + '/solr/' + this.opts.collectionName + '/fcselect?q=' + row[0] + '&gt=' + row[1] + '&returnRSInput=true&rows=10&wt=json&fl=id';
						let auth = {
							auth: {
								pass: this.opts.password,
								user: this.opts.username
							}
						};
						request.get(query, auth, (err, response, body) => {
							if (err) {
								reject(err);
							}
							else {
								if (response.statusCode >= 300){
									reject(response.statusMessage);
								}
								else {
									csv_text += JSON.parse(body).RSInput;
									resolve(JSON.parse(body).RSInput);
								}
							}
						});
					}));
				}
				Promise.all(fcselect_calls).then((result) => {
					this.opts.training_data = csv_text;
					let params = {
						training_data: this.opts.training_data,
						training_metadata: JSON.stringify({name: this.opts.rankerName})
					};
					this._createRanker(params).then((result) => {
						resolve(result);
					}).catch((error) => {
						reject(error);
					});
				});
			}).catch((error) => {
				reject(error);
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
				logger.info('Created cluster: ', this.clusterInitializing);
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
	logger.info('Uploading config for cluster');
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
	logger.info('Creating collection for cluster: ', params);
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
	logger.info('Uploading documents for cluster...');
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
 * Helper method that creates an RR instance and saves the data used for training for future reference.
 *
 * @param  Object 	params 	Parameters for the Watson RR service.
 * @return Object        	Result from Watson RR service.
 */
RRManager.prototype._createRanker = function(params){
	logger.info('Creating new ranker...');
	return new Promise((resolve, reject) => {
		this.rr.createRanker(params, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error creating ranker.`, err);
				logger.error(`${TAG} Options and data sent to train RR service.`, params);
				reject('Error creating ranker');
			}
			else {
				this.rankerTraining = response;
				if (this.opts.saveTrainingData) {
					logger.debug(`${TAG}: Saving RR trained data for ${response.ranker_id}`);
					let doc = {
						_id: response.ranker_id,
						type: 'ranker_data',
						trainedData: params.training_data
					};
					rrDb.createOrUpdate(doc).then(() => {
						logger.debug(`${TAG}: Saved RR trained data for ${response.ranker_id}`);
						resolve(response);
					}).catch((error) => {
						logger.error(`${TAG}: Error saving RR trained data for ${response.ranker_id}`, error);
						resolve(response); // Resolve promise; don't fail because of DB errors.
					});
				}
				else {
					resolve(response);
				}
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
 * Internal method to poll for ranker status.
 *
 * @param  String 	ranker_id 	The id of the ranker.
 * @return Promise               	Resolved when training completes. Returns the ranker settings/status. Errors if traininf fails.
 */
RRManager.prototype._monitor = function(ranker_id){
	return new Promise((resolve, reject) => {
		const checkAvailable = (resolve, reject) => {
			logger.info(`Checking status of ranker ${ranker_id}`);
			this.rr.rankerStatus({ranker_id: ranker_id}, (err, status) => {
				if (err){
					reject('Error getting status for ranker in training.');
				}
				else {
					logger.info(`Status of ranker ${ranker_id} is ${status.status}.`);
					if (status.status === 'Training'){
						setTimeout(() => {
							checkAvailable(resolve, reject);
						}, 1000 * 60);
					}
					else if (status.status === 'Available'){
						this.rankerTraining = undefined;
						this.ranker_cache = status;
						this._deleteOldRankers().then((result) => {
							resolve(status);
						}).catch((err) => {
							logger.error(`${TAG}: Error deleting ranker ${status.ranker_id}`);
							reject(err);
						});
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
 * Internal method to help with the clanup of old rankers.
 *
 * @return Promise Resolves when rankers have been deleted.
 */
RRManager.prototype._deleteOldRankers = function(){
	return new Promise((resolve, reject) => {
		this.rr.listRankers({}, (err, response) => {
			if (err) {
				reject('Error getting available rankers. ' + JSON.stringify(err, null, 2));
			}
			else {
				let sortedRankers = response.rankers.sort((a, b) => {
					return new Date(b.created) - new Date(a.created);
				});

				let filteredRankers = sortedRankers.filter((ranker) => {
					return ranker.name === this.opts.rankerName;
				});

				if (filteredRankers.length > this.opts.maxRankers) {
					let deleteRankerId = filteredRankers[filteredRankers.length - 1].ranker_id;
					logger.debug(`Deleting ranker ${deleteRankerId}`);

					this.rr.deleteRanker({ranker_id: deleteRankerId}, (err, result) => {
						if (err){
							reject('Error deleting ranker: ' + JSON.stringify(err, null, 2));
						}
						else {
							logger.info('Deleted ranker', filteredRankers[filteredRankers.length - 1].ranker_id);
							rrDb.get(deleteRankerId).then((doc) => {
								doc._deleted = true;
								return rrDb.put(doc).then(() => {
									logger.info(`${TAG}: Deleted DB ranker training data for ${deleteRankerId}`);
								});
							}).catch((error) => {
								logger.warn(`${TAG}: Couldn't delete DB doc with ranker data for ${deleteRankerId}`, error);
							});

							this._deleteOldRankers().then((result) => {
								resolve(result);
							}).catch((err) => {
								reject(err);
							});
						}
					});
				}
				else {
					resolve();
				}
			}
		});
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
									else if (clusterStatus[i].status === 'NOT_AVAILABLE' && !this.clusterInitializing){
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
 * Helper method to find a cluster's config
 * If none exists, upload a new one.
 *
 * @return Promise When resolved it returns a json object.
 */
RRManager.prototype._getConfig = function(params){
	let conf_params = {cluster_id: params.cluster_id};
	return new Promise((resolve, reject) => {
		this.rr.listConfigs(conf_params, (err, response) => {
			if (err) {
				reject('Error getting available config: ' + JSON.stringify(err, null, 2));
			}
			else {
				if (response.solr_configs){
					resolve(response);
				}
				else {
					this._uploadConfig(params).then((result) => {
						resolve(result);
					}).catch((err) => {
						reject(err);
					});
				}
			}
		});
	});
};


/**
 * Helper method to finds a ranker which is available (training completed)
 * and with the most recent creation date.  If none are 'Available' then find
 * the most recent ranker that started training.  If none are training,
 * start the training.
 *
 * @return Promise When resolved it returns a JSON object with the ranker information.
 */
RRManager.prototype._getRanker = function(doNotTrain){
	return new Promise((resolve, reject) => {

		if (this.ranker_cache){
			logger.debug(`Using cached RR ranker ${this.ranker_cache.ranker_id}`);
			resolve(this.ranker_cache);
		}
		else {
			this.rr.listRankers({}, (err, response) => {
				if (err) {
					reject('Error getting available rankers.' + JSON.stringify(err, null, 2));
				}
				else {
					let rankerName = this.opts.rankerName;
					let filteredRankers = response.rankers.filter((ranker) => {
						return ranker.name === rankerName;
					});

					if (filteredRankers.length < 1){
						if (doNotTrain) {
							reject(`No rankers found under [${this.opts.rankerName}]`);
						}
						else {
							// no rankers found by this name, so create one and start training.
							logger.info(`No rankers found with name ${this.opts.rankerName}. Creating and training a new one.`);
							this._startTraining().then((result) => {
								resolve(result);
							}).catch((err) => {
								reject(err);
							});
						}
					}
					else {
						// try to find the most recent available.  or most recent that started training.
						let sortedRankers = filteredRankers.sort((a, b) => {
							return new Date(b.created) - new Date(a.created);
						});

						let checkStatus = [];
						sortedRankers.map((ranker) => {
							checkStatus.push(this._getRankerStatus(ranker.ranker_id));
						});

						Promise.all(checkStatus).then((rankerStatus) => {

							this.rankerTraining = undefined;
							for (let i = 0; i < sortedRankers.length; i++){
								if (sortedRankers[i].name === this.opts.rankerName){
									if (rankerStatus[i].status === 'Available'){
										this.ranker_cache = rankerStatus[i];
										resolve(rankerStatus[i]);
										return;
									}
									else if (rankerStatus[i].status === 'Training' && !this.rankerTraining){
										this.rankerTraining = rankerStatus[i];
									}
								}
							}

							if (this.rankerTraining){
								resolve(this.rankerTraining);
							}
							else {
								if (doNotTrain) {
									reject(`No rankers available under [${this.opts.rankerName}]`);
								}
								else {
									// none are available or training, start training one.
									logger.info(`No rankers with name ${this.opts.rankerName} are avilable or in training. Start training a new one.`);
									this._startTraining().then((result) => {
										resolve(result);
									}).catch((err) => {
										reject(err);
									});
								}
							}
						}).catch((error) => {
							reject('Error getting a ranker.' + JSON.stringify(error));
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


/**
 * Helper method to retrieve the status of a ranker.
 *
 * @param  String 	ranker_id 	The id of the ranker.
 * @return Promise       			When resolved returns the ranker data.
 */
RRManager.prototype._getRankerStatus = function(ranker_id){
	return new Promise((resolve, reject) => {
		if (ranker_id) {
			this.rr.rankerStatus({ranker_id: ranker_id}, (err, status) => {
				if (err){
					reject('Error while checking status of ranker ' + ranker_id + JSON.stringify(err, null, 2));
				}
				else {
					// If ranker is Training, record it's training duration
					if (status.status === 'Training') {
						var duration = Math.floor((Date.now() - new Date(status.created)) / 60000);
						status.duration = duration > 0 ? duration : 0;
					}
					resolve(status);
				}
			});
		}
		else {
			this._getRanker(true).then(function(status) {
				resolve(status);
			}).catch(function(err) {
				reject(err);
			});
		}
	});
};

/**
 * Helper method to list all rankers.
 *
 * @return Promise When resolved it returns an array of JSON objects with each ranker's information.
 */
RRManager.prototype._getRankerList = function(){
	return new Promise((resolve, reject) => {
		this.rr.listRankers({}, (err, response) => {
			if (err) {
				reject('Error getting list of rankers.' + JSON.stringify(err, null, 2));
			}
			else {
				var checkStatus = [];
				response.rankers.map((ranker) => {
					checkStatus.push(this._getRankerStatus(ranker.ranker_id));
				});

				Promise.all(checkStatus).then((rankers) => {
					// Sort by latest created; first Available rankers, then Training
					var sortedRankers = rankers.sort((a, b) => {
						if (a.status !== b.status) {
							return a.status === 'Available' ? -1 : 1;
						}
						return new Date(b.created) - new Date(a.created);
					});
					resolve(sortedRankers);
				}).catch((err) => {
					reject('Error getting list of rankers.' + JSON.stringify(err, null, 2));
				});
			}
		});
	});
};

module.exports = RRManager;
