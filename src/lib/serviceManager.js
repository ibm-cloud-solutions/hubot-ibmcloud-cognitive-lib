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
const DBManager = require('./dbManager');
const env = require('./env');
const csvParse = require('csv-parse');
const logger = require('./logger');
const qs = require('qs');
const stringify = require('csv-stringify');
const rrConfig = require('./rrconfig');
const nlcConfig = require('./nlcconfig');

/**
* @param {options} Object with the following configuration.
*				options.serviceName = (REQUIRED) 'nlc' or 'rr'
*				other options are those necessary for either rrManager or nlcManager
* @constructor
*/
function serviceManager(options) {
	this.opts = options || {};
	if (options.serviceName === 'nlc'){
		this.opts.serviceType = 'classifier';
		this.db = new DBManager({localDbName: 'nlc', remoteDbName: env.db_nlc_remote});
		this.nlc = watson.natural_language_classifier(this.opts);
		this.config = nlcConfig;
	}
	else if (options.serviceName === 'rr'){
		this.opts.serviceType = 'ranker';
		this.db = new DBManager({localDbName: 'rr', remoteDbName: env.db_rr_remote});
		this.rr = watson.retrieve_and_rank(this.opts);
		this.config = rrConfig;
	}
	else {
		// TODO: Error if not one of these
	}
	this.instanceName = options.classifierName || options.rankerName;
	this.opts.maxInstances = options.maxRankers || options.maxClassifiers;
}

/**
 * Creates a new ranker/classifier and starts training it. The new ranker/classifier can't be used until training completes.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(instance_id)`.
 *
 * @return Promise	When resolved it returns a JSON object with the new instance information.
 */
serviceManager.prototype.train = function(cluster_cache){
	if (cluster_cache){
		this.cluster_cache = cluster_cache;
	}
	return this._startTraining();
};

/**
 * Find the most recent ranker/classifier instance that either available or training.  If no such instance, then start training.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(instance_id)`.
 *
 * @return Promise Resolved with existing or new instance information.
 */
serviceManager.prototype.trainIfNeeded = function(cluster_cache){
	if (cluster_cache){
		this.cluster_cache = cluster_cache;
	}
	return new Promise((resolve, reject) => {
		this._getServiceInstance().then((instance) => {
			resolve(instance);
		}).catch((err) => {
			reject(err);
		});
	});
};

/**
 * Asynchronously monitors a classifier/ranker that is being trained. It resolves when training
 * completes and the instance status is 'Available'. It polls for instance status every
 * 60 seconds.
 *
 * @param  String 	instance_id 	The id of the ranker/clasifier.
 * @return Promise               	Resolved when training completes. Returns the instance settings/status. Errors if training fails.
 */
serviceManager.prototype.monitorTraining = function(instance_id){
	return this._monitor(instance_id);
};

/**
 * Gets the current status for the ranker/classifier with instance_id
 *
 * @param  String 	instance_id 	The id of the ranker/clasifier.
 * @return Promise       			When resolved returns the instance data. It errors if an instance isn't found.
 */
serviceManager.prototype.getStatus = function(instance_id){
	return new Promise((resolve, reject) => {
		if (!instance_id){
			this.currentInstance().then((result) => {
				let id = result.ranker_id || result.classifier_id;
				return this._getInstanceStatus(id);
			}).then((result) => {
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		}
		else {
			this._getInstanceStatus(instance_id).then((result) => {
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		}
	});
};

/**
 * Gets list of rankers/classifiers
 *
 * @return Promise       			When resolved returns a list of rankers/classifiers.
 */
serviceManager.prototype.getList = function(){
	return this._getList();
};

/**
 * Get information about the curent ranker/classifier
 *
 * @return Promise
 */
serviceManager.prototype.currentInstance = function(){
	return this._getServiceInstance(true);
};

/**
 * NLC: Returns classification data for a statement using the latest classifier available.
 * RR: Returns the ranked documents for a query using the latest ranker available
 *
 * @param  String	text	Natural Language statement to be classified OR query to be used to rank documents
 * @return JSON      		Classification data from Watson NLC OR ranked documents from Watson RR.
 */
serviceManager.prototype.process = function(text, cluster_cache){
	if (cluster_cache){
		this.cluster_cache = cluster_cache;
	}
	return new Promise((resolve, reject) => {
		this._getServiceInstance().then((instance) => {
			logger.info('Using %s %s', this.opts.serviceType, instance.ranker_id || instance.classifier_id);
			if (instance.status === 'Training'){
				resolve(instance);
			}
			else {
				this._processRequest(text, instance).then((result) => {
					resolve(result);
				}).catch((err) => {
					reject(err);
				});
			}
		}).catch((err) => {
			this.instance_cache = undefined;
			reject(err);
		});
	});
};

/**
 * Gets data used to train the ranker/classifier with instanceId.
 *
 * @param  String	instanceId
 * @return Promise  JSON			Sample result:	{"className": ["Text 1.", "Text 2"]}
 */
serviceManager.prototype.getInstanceData = function(instanceId){
	logger.debug(`${TAG} Requested data used to train ${this.opts.serviceType} with Id=${instanceId}`);
	return new Promise((resolve, reject) => {
		return this.db.get(instanceId).then((doc) => {
			csvParse(doc.trainedData, function(err, jsonData){
				if (err){
					logger.error(`${TAG}: Error parsing CSV data used to train ${this.opts.serviceType} with Id=${instanceId}`, err);
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
					resolve(result);
				}
			});
		}).catch((err) => {
			logger.error(`Error retrieving data used to train ${this.opts.serviceType} ${instanceId}`, err);
			reject(`Error retrieving data used to train ${this.opts.serviceType} ${instanceId}`, err);
		});
	});
};


/* ---------- Helper Methods ---------- */

/**
 * Internal method to start training a ranker or classifier.
 *
 * @return Promise
 */
serviceManager.prototype._startTraining = function(){
	return new Promise((resolve, reject) => {
		if (this.instanceTraining) {
			resolve(this.instanceTraining);
		}
		// Training with data initialized in opts.
		else if (this.opts.training_data) {
			let params;

			if (this.opts.serviceName === 'rr'){
				params = {
					training_data: this.opts.training_data,
					training_metadata: JSON.stringify({name: this.opts.rankerName})
				};
			}
			else if (this.opts.serviceName === 'nlc'){
				let training_data;
				if (typeof this.opts.training_data === 'function') {
					// invoke the caller provided function to supply training data dynamically.
					training_data = this.opts.training_data();
				}
				else {
					training_data = this.opts.training_data;
				}
				params = {
					language: this.opts.classifierLanguage,
					name: this.opts.classifierName,
					training_data: training_data
				};
			}
			else {
				reject('no service instance found');
			}
			this._createInstance(params).then((result) => {
				return this._saveTrainingData(result, params);
			}).then((result) => {
				resolve(result);
			}).catch((err) => {
				reject(err);
			});

		}
		// Training data from PouchDB.
		else {
			let params;
			this._getFromConfig().then((csvInput) => {
				return this._parseTrainingData(csvInput);
			}).then((result) => {
				params = result;
				return this._createInstance(params);
			}).then((result) => {
				return this._saveTrainingData(result, params);
			}).then((result) => {
				resolve(result);
			}).catch((error) => {
				reject(error);
			});
		}
	});
};

/**
 * Helper method to finds a ranker or classifier which is available (training completed)
 * and with the most recent creation date.  If none are 'Available' then find
 * the most recent instance that started training.  If none are training,
 * start the training.
 *
 * @return Promise When resolved it returns a JSON object with the ranker/classifier information.
 */
serviceManager.prototype._getServiceInstance = function(doNotTrain){
	return new Promise((resolve, reject) => {
		if (this.instance_cache){
			logger.debug(`Using cached ${this.opts.serviceType} ${this.instance_cache}`);
			resolve(this.instance_cache);
		}
		else {
			this._listInstances().then((instances) => {
				let instanceName = this.instanceName;
				let filteredInstances = instances.filter((instance) => {
					return instance.name === instanceName;
				});
				if (filteredInstances.length < 1){
					if (doNotTrain) {
						reject(`No ${this.opts.serviceType}s found under [${this.instanceName}]`);
					}
					else {
						// no instances found by this name, so create one and start training.
						logger.info(`No ${this.opts.serviceType}s found with name ${this.instanceName}. Creating and training a new one.`);
						this._startTraining().then((result) => {
							resolve(result);
						}).catch((err) => {
							reject(err);
						});
					}
				}
				else {
					// try to find the most recent available.  or most recent that started training.
					let sortedInstances = filteredInstances.sort((a, b) => {
						return new Date(b.created) - new Date(a.created);
					});

					let checkStatus = [];
					sortedInstances.map((instance) => {
						let instance_id = instance.classifier_id || instance.ranker_id;
						checkStatus.push(this._getInstanceStatus(instance_id));
					});

					Promise.all(checkStatus).then((instanceStatus) => {

						this.instanceTraining = undefined;
						for (let i = 0; i < sortedInstances.length; i++){
							if (sortedInstances[i].name === this.instanceName){
								if (instanceStatus[i].status === 'Available'){
									this.instance_cache = instanceStatus[i];
									resolve(instanceStatus[i]);
									return;
								}
								else if (instanceStatus[i].status === 'Training' && !this.instanceTraining){
									this.instanceTraining = instanceStatus[i];
								}
							}
						}

						if (this.instanceTraining){
							resolve(this.instanceTraining);
						}
						else {
							if (doNotTrain) {
								reject(`No ${this.opts.serviceType}s available under [${this.instanceName}]`);
							}
							else {
								// none are available or training, start training one.
								logger.info(`No ${this.opts.serviceType}s with name ${this.instanceName} are avilable or in training. Start training a new one.`);
								this._startTraining().then((result) => {
									resolve(result);
								}).catch((err) => {
									reject(err);
								});
							}
						}
					}).catch((error) => {
						reject(`Error getting a ${this.opts.serviceType}.` + JSON.stringify(error));
					});
				}
			}).catch((error) => {
				reject(`Error getting a ${this.opts.serviceType}.` + JSON.stringify(error));
			});
		}
	});
};

/**
 * Internal method to poll for ranker/classifier status.
 *
 * @param  String 	instance_id 	The id of the ranker/clasifier.
 * @return Promise               	Resolved when training completes. Returns the ranker/classifier settings/status. Errors if training fails.
 */
serviceManager.prototype._monitor = function(instanceId){
	return new Promise((resolve, reject) => {
		const checkAvailable = (resolve, reject) => {
			logger.info(`Checking status of ${this.opts.serviceType} ${instanceId}`);
			this._getInstanceStatus(instanceId).then((status) => {
				logger.info(`Status of ${this.opts.serviceType} ${instanceId} is ${status.status}.`);
				if (status.status === 'Training'){
					setTimeout(() => {
						checkAvailable(resolve, reject);
					}, 1000 * 60);
				}
				else if (status.status === 'Available'){
					this.instanceTraining = undefined;
					this.instance_cache = status;
					this._deleteOldInstances().then((result) => {
						resolve(status);
					}).catch((err) => {
						let instance_id = status.ranker_id || status.classifier_id;
						logger.error(`${TAG}: Error deleting ${this.opts.serviceType} ${instance_id}`);
						reject(err);
					});
				}
				else {
					reject(status);
				}
			}).catch((err) => {
				reject(err);
			});
		};
		checkAvailable(resolve, reject);
	});
};

/**
 * Helper method to retrieve the status of a ranker/classifier.
 *
 * @param  String 	instance_id 	The id of the ranker/classifier.
 * @return Promise       			When resolved returns the ranker/classifier data.
 */
serviceManager.prototype._getInstanceStatus = function(instanceId){
	return new Promise((resolve, reject) => {
		if (this.rr){
			return this.rr.rankerStatus({ranker_id: instanceId}, (err, response) => {
				if (err){
					reject('Error getting status for ranker in training.');
				}
				else {
					resolve(response);
				}
			});
		}
		else if (this.nlc){
			return this.nlc.status({classifier_id: instanceId}, (err, response) => {
				if (err){
					reject('Error getting status for classifier in training.');
				}
				else {
					resolve(response);
				}
			});
		}
		else {
			reject('no service instance found');
		}
	});
};

/**
 * Helper method to list all rankers/classifiers.
 *
 * @return Promise When resolved it returns an array of JSON objects with each instance's information.
 */
serviceManager.prototype._getList = function(){
	return new Promise((resolve, reject) => {
		this._listInstances().then((result) => {
			let checkStatus = [];

			let filteredInstances = result.filter((instance) => {
				return instance.name === this.instanceName;
			});

			filteredInstances.map((instance) => {
				let instance_id = instance.classifier_id || instance.ranker_id;
				checkStatus.push(this._getInstanceStatus(instance_id));
			});

			Promise.all(checkStatus).then((instances) => {
				// Sort by latest created; first Available instances, then Training
				let sortedInstances = instances.sort((a, b) => {
					if (a.status !== b.status) {
						return a.status === 'Available' ? -1 : 1;
					}
					return new Date(b.created) - new Date(a.created);
				});
				resolve(sortedInstances);
			}).catch((err) => {
				reject(`Error getting list of ${this.opts.serviceType}.` + JSON.stringify(err, null, 2));
			});
		}).catch((err) => {
			reject(err);
		});
	});
};

/**
 * Helper method to execute a rank or classify request.
 *
 * @return Promise When resolved it returns the JSON response from the Watson NLC or RR instance.
 */
serviceManager.prototype._processRequest = function(text, instance){
	return new Promise((resolve, reject) => {
		if (this.rr){
			if (!this.solrClient){
				let params = {
					cluster_id: this.cluster_cache.solr_cluster_id,
					collection_name: this.opts.collectionName
				};
				this.solrClient = this.rr.createSolrClient(params);
			}
			let query = qs.stringify({
				q: text,
				ranker_id: instance.ranker_id,
				fl: 'id,title,url'
			});
			this.solrClient.get('fcselect', query, (err, response) => {
				if (err) {
					this.instance_cache = undefined;
					reject(err);
				}
				else {
					resolve(response);
				}
			});
		}
		else if (this.nlc){
			this.nlc.classify({
				text: text,
				classifier_id: instance.classifier_id },
				(err, response) => {
					if (err) {
						this.instance_cache = undefined;
						reject(err);
					}
					else {
						resolve(response);
					}
				});
		}
		else {
			reject('no service instance found');
		}
	});
};

/**
 * Helper method that creates an NLC or RR instance and saves the data used for training for future reference.
 *
 * @param  Object 	params 	Parameters for the Watson NLC/RR service.
 * @return Promise	       	Resolves with result from Watson NLC/RR service.
 */
serviceManager.prototype._createInstance = function(params){
	return new Promise((resolve, reject) => {
		if (this.rr){
			return this.rr.createRanker(params, (err, response) => {
				if (err){
					logger.error(`${TAG}: Error creating ${this.opts.serviceType}.`, err);
					reject(`Error creating ${this.opts.serviceType}.`);
				}
				else {
					resolve(response);
				}
			});
		}
		else if (this.nlc){
			let serviceType = this.opts.serviceType;
			return this.nlc.create(params, function(err, response){
				if (err){
					logger.error(`${TAG}: Error creating ${serviceType}.`, err);
					reject(`Error creating ${serviceType}.`);
				}
				else {
					resolve(response);
				}
			});
		}
		else {
			reject('no service instance found');
		}
	});
};

/**
 * Helper method that saves training data used to train an NLC/RR instance to the database (only if the saveTrainingData flag is true)
 *
 * @param  Object		response 	The response received from creating the instance.
 * @param  Object 	params 		Parameters used to create the Watson NLC/RR service.
 * @return Promise        		Resolves with result from Watson NLC/RR service, regardless of db results.
 */
serviceManager.prototype._saveTrainingData = function(response, params){
	return new Promise((resolve, reject) => {
		this.instanceTraining = response;
		if (this.opts.saveTrainingData) {
			let instance_id = response.classifier_id || response.ranker_id;
			logger.debug(`${TAG}: Saving training data for ${instance_id}`);
			let doc = {
				_id: instance_id,
				type: 'classifier_data',
				trainedData: params.training_data
			};
			return this.db.createOrUpdate(doc).then(() => {
				logger.debug(`${TAG}: Saved trained data for ${instance_id}`);
				resolve(response);
			}).catch((error) => {
				logger.error(`${TAG}: Error saving trained data for ${instance_id}`, error);
				resolve(response); // Resolve promise; don't fail because of DB errors.
			});
		}
		else {
			resolve(response);
		}
	});
};

/**
 * Helper method to use the appropriate config file (rrconfig or nlcconfig) to query the db and get classes
 *
 * @return Object 	Returns the results from the appropriate db query called in the config file
 */
serviceManager.prototype._getFromConfig = function(){
	if (this.rr){
		return this.config.getRRClasses();
	}
	else if (this.nlc){
		return this.config.getAllClasses();
	}
	else {
		return new Promise((resolve, reject) => {
			reject('no service instance found');
		});
	}
};

/**
 * Helper method to parse the training data from the db query
 *
 * @return Object Returns a 'params' JSON object that contains the training data to be used in a createInstance request to either NLC or RR
 */
serviceManager.prototype._parseTrainingData = function(csvInput){
	return new Promise((resolve, reject) => {
		if (this.rr){
			let csv_text = 'question_id,f0,f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,r1,r2,s,ground_truth\n';
			let fcselect_calls = [];
			if (!this.solrClient){
				let params = {
					cluster_id: this.cluster_cache.solr_cluster_id,
					collection_name: this.opts.collectionName
				};
				this.solrClient = this.rr.createSolrClient(params);
			}
			for (let i = 0; i < csvInput.length; i++){
				let row = csvInput[i];
				fcselect_calls.push(new Promise((resolve, reject) => {
					let query = qs.stringify(
						{
							q: row[0],
							gt: row[1],
							returnRSInput: 'true',
							rows: 10,
							fl: 'id'
						});
					this.solrClient.get('fcselect', query, (err, response) => {
						if (err) {
							reject(err);
						}
						else {
							if (response.statusCode >= 300){
								reject(response.statusMessage);
							}
							else {
								csv_text += response.RSInput;
								resolve(response.RSInput);
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
				resolve(params);
			}).catch((error) => {
				reject(error);
			});
		}
		else if (this.nlc){
			stringify(csvInput, (err, csvStream) => {
				if (err){
					logger.error(`${TAG}: Error generating training data in csv format.`, err);
					reject('Error generating training data in csv format.');
				}
				else {
					let params = {
						language: this.opts.classifierLanguage,
						name: this.opts.classifierName,
						training_data: csvStream
					};
					resolve(params);
				}
			});
		}
	});
};

/**
 * Helper method to make a list request to the Watson NLC or RR instance.
 *
 * @return Promise When resolved it returns an array of JSON objects with each instance's information.
 */
serviceManager.prototype._listInstances = function(){
	return new Promise((resolve, reject) => {
		if (this.rr){
			this.rr.listRankers({}, (err, response) => {
				if (err) {
					reject('Error getting list of rankers.' + JSON.stringify(err, null, 2));
				}
				else {
					resolve(response.rankers);
				}
			});
		}
		else if (this.nlc){
			this.nlc.list({}, (err, response) => {
				if (err) {
					reject('Error getting list of classifiers.' + JSON.stringify(err, null, 2));
				}
				else {
					resolve(response.classifiers);
				}
			});
		}
		else {
			reject('no service instance found');
		}
	});
};

/**
 * Internal method to help with the cleanup of old rankers or classifiers.
 *
 * @return Promise Resolves when rankers/classifiers have been deleted.
 */
serviceManager.prototype._deleteOldInstances = function(){
	return new Promise((resolve, reject) => {
		this._listInstances().then((result) => {
			let sortedInstances = result.sort((a, b) => {
				return new Date(b.created) - new Date(a.created);
			});

			let filteredInstances = sortedInstances.filter((instance) => {
				return instance.name === this.instanceName;
			});

			if (filteredInstances.length > this.opts.maxInstances) {
				let deleteInstanceId = filteredInstances[filteredInstances.length - 1].ranker_id || filteredInstances[filteredInstances.length - 1].classifier_id;
				logger.debug(`Deleting ${this.opts.serviceType} ${deleteInstanceId}`);
				this._deleteInstance(deleteInstanceId).then((result) => {
					logger.info(`Deleted ${this.opts.serviceType}`, filteredInstances[filteredInstances.length - 1].ranker_id);
					this.db.get(deleteInstanceId).then((doc) => {
						doc._deleted = true;
						return this.db.put(doc).then(() => {
							logger.info(`${TAG}: Deleted DB ${this.opts.serviceType} training data for ${deleteInstanceId}`);
						});
					}).catch((error) => {
						logger.warn(`${TAG}: Couldn't delete DB doc with ${this.opts.serviceType} data for ${deleteInstanceId}`, error);
					});
					this._deleteOldInstances().then((result) => {
						resolve(result);
					}).catch((err) => {
						reject(err);
					});
				});
			}
			else {
				resolve();
			}
		}).catch((err) => {
			reject(err);
		});
	});
};

/**
 * Internal method to delete a specific ranker/classifier instance.
 *
 * @return Promise Resolves when the ranker/classifier has been deleted.
 */
serviceManager.prototype._deleteInstance = function(instance_id){
	return new Promise((resolve, reject) => {
		if (this.rr){
			this.rr.deleteRanker({ranker_id: instance_id}, (err, result) => {
				if (err){
					reject('Error deleting ranker: ' + JSON.stringify(err, null, 2));
				}
				else {
					resolve(result);
				}
			});
		}
		else if (this.nlc){
			this.nlc.remove({classifier_id: instance_id}, (err, result) => {
				if (err){
					reject('Error deleting classifier: ' + JSON.stringify(err, null, 2));
				}
				else {
					resolve(result);
				}
			});
		}
		else {
			reject('did not find service instance');
		}
	});
};


module.exports = serviceManager;
