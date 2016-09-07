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
const stringify = require('csv-stringify');
const csvParse = require('csv-parse');
const nlcDb = require('./nlcDb');
const logger = require('./logger');

/**
 * @param options Object with the following configuration.
 *        options.url = Watson NLC API URL (OPTIONAL, defaults to https://gateway.watsonplatform.net/natural-language-classifier/api)
 *        options.username = Watson NLC username (REQUIRED)
 *        options.password = Watson NLC password (REQUIRED)
 *        options.version = Watson NLC version (OPTIONAL, defaults to V1)
 *        options.language = Watson NLC language (OPTIONAL, defaults to en)
 *        options.classifierName = Watson NLC classifier name (OPTIONAL, defaults to 'default-classifier')
 *        options.maxClassifiers = Maximum number of classifiers with name 'classifierName', will delete classifiers exceding this num (OPTIONAL, defaults to 3)
 *        options.training_data = ReadStream or function used to get CSV data to train NLC (OPTIONAL, if omitted training data will come from nlcDb)
 *        options.saveTrainingData = Saves data used to train the classifier (OPTIONAL, defaults to true)
 * @constructor
 */
function NLCManager(options) {
	this.opts = options || {};

	this.opts.classifierName = options.classifierName || 'default-classifier';
	this.opts.maxClassifiers = options.maxClassifiers || 3;
	this.opts.classifierLanguage = options.language || 'en';
	this.opts.saveTrainingData = options.saveTrainingData === false ? options.saveTrainingData : true;

	this.nlc = watson.natural_language_classifier(this.opts);
}


/**
 * Creates a new classifier and starts training it. The new classifier can't be used until training completes.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(classifier_id)`.
 *
 * @return Promise	When resolved it returns a JSON object with the new classifier information.
 */
NLCManager.prototype.train = function(){
	return this._startTraining();
};

/**
 * Find the most recent classifier that either available or training.  If no such classifier, then start training.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(classifier_id)`.
 *
 * @return Promise Resolved with existing classifier or new classifier information if training is needed.
 */
NLCManager.prototype.trainIfNeeded = function(){
	return new Promise((resolve, reject) => {
		this._getClassifier().then((classifier) => {
			resolve(classifier);
		}).catch((err) => {
			reject(err);
		});
	});
};

/**
 * Asynchronously monitors a classifier that is being trained. It resolves when training
 * completes and the classifier status is 'Available'. It polls for classifier status every
 * 60 seconds. Training a classifier takes at least 10 minutes.
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise               	Resolved when training completes. Returns the classifier settings/status. Errors if training fails.
 */
NLCManager.prototype.monitorTraining = function(classifier_id){
	return this._monitor(classifier_id);
};


/**
 * Gets the current status for the classifier with classifier_id
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise       			When resolved returns the classifier data. It errors if a classifier isn't found.
 */
NLCManager.prototype.classifierStatus = function(classifier_id){
	return this._getClassifierStatus(classifier_id);
};

/**
 * Gets list of classifiers
 *
 * @return Promise       			When resolved returns a list of classifiers.
 */
NLCManager.prototype.classifierList = function(){
	return this._getClassifierList();
};


/**
 * Get information about the curent classifier
 *
 * @return Promise
 */
NLCManager.prototype.currentClassifier = function(){
	return this._getClassifier(true);
};

/**
 * Returns classification data for a statement using the latest classifier available.
 *
 * @param  String	text	Natural Language statement to be classified.
 * @return JSON      		Classification data from Watson Natural Language Classifier.
 */
NLCManager.prototype.classify = function(text){
	return new Promise((resolve, reject) => {
		this._getClassifier().then((classifier) => {
			logger.info('Using classifier %s', JSON.stringify(classifier));
			if (classifier.status === 'Training'){
				resolve(classifier);
			}
			else {
				this.nlc.classify({
					text: text,
					classifier_id: classifier.classifier_id },
					(err, response) => {
						if (err) {
							this.classifier_cache = undefined;
							reject(err);
						}
						else {
							resolve(response);
						}
					});
			}
		}).catch((err) => {
			this.classifier_cache = undefined;
			reject(err);
		});
	});
};


/**
 * Gets data used to train the classifier with classifierId.
 *
 * @param  String	classifierId
 * @return Promise  JSON			Sample result:	{"className": ["Text 1.", "Text 2"]}
 */
NLCManager.prototype.getClassifierData = function(classifierId){
	logger.debug(`${TAG} Requested data used to train NLC with clasifierId=${classifierId}`);
	return new Promise((resolve, reject) => {
		return nlcDb.open().then((db) => {
			return db.get(classifierId).then((doc) => {
				csvParse(doc.trainedData, function(err, jsonData){
					if (err){
						logger.error(`${TAG}: Error parsing CSV data used to train NLC with clasifierId=${classifierId}`, err);
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
						logger.debug(`${TAG}: Data used to train NLC with classifierId=${classifierId}`, result);
						resolve(result);
					}
				});
			});
		}).catch((err) => {
			logger.error(`Error retrieving data used to train classifier ${classifierId}`, err);
			reject(`Error retrieving data used to train classifier ${classifierId}`, err);
		});
	});
};


/**
 * Internal method to start training a classifier.
 *
 * @return Promise
 */
NLCManager.prototype._startTraining = function(){
	return new Promise((resolve, reject) => {
		if (this.classifierTraining) {
			resolve(this.classifierTraining);
		}
		// Training with data initialized in opts.
		else if (this.opts.training_data) {

			let training_data;

			if (typeof this.opts.training_data === 'function') {
				// invoke the caller provided function to supply training data dynamically.
				training_data = this.opts.training_data();
			}
			else {
				training_data = this.opts.training_data;
			}

			let params = {
				language: this.opts.classifierLanguage,
				name: this.opts.classifierName,
				training_data: training_data
			};

			this._createClassifier(params).then((result) => {
				resolve(result);
			}).catch((err) => {
				reject(err);
			});
		}

		// Training data from PouchDB.
		else {
			return nlcDb.open().then((db) => {
				return db.getClasses().then((csvInput) => {
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

							this._createClassifier(params).then((result) => {
								resolve(result);
							}).catch((error) => {
								reject(error);
							});
						}
					});
				});
			}).catch((error) => {
				reject(error);
			});
		}
	});
};


/**
 * Helper method that creates an NLC instance and saves the data used for training for future reference.
 *
 * @param  Object 	params 	Parameters for the Watson NLC service.
 * @return Object        	Result from Watson NLC service.
 */
NLCManager.prototype._createClassifier = function(params){
	return new Promise((resolve, reject) => {
		this.nlc.create(params, (err, response) => {
			if (err) {
				logger.error(`${TAG}: Error creating classifier.`, err);
				logger.error(`${TAG} Options and data sent to train NLC service.`, params);
				reject('Error creating classifier');
			}
			else {
				this.classifierTraining = response;

				if (this.opts.saveTrainingData) {
					logger.debug(`${TAG}: Saving NLC trained data for ${response.classifier_id}`);
					return nlcDb.open().then((db) => {
						let doc = {
							_id: response.classifier_id,
							type: 'classifier_data',
							trainedData: params.training_data
						};
						return db.createOrUpdate(doc).then(() => {
							logger.debug(`${TAG}: Saved NLC trained data for ${response.classifier_id}`);
							resolve(response);
						});
					}).catch((error) => {
						logger.error(`${TAG}: Error saving NLC trained data for ${response.classifier_id}`, error);
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
 * Internal method to poll for classifier status.
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise               	Resolved when training completes. Returns the classifier settings/status. Errors if traininf fails.
 */
NLCManager.prototype._monitor = function(classifier_id){
	return new Promise((resolve, reject) => {
		const checkAvailable = (resolve, reject) => {
			logger.info(`Checking status of classifier ${classifier_id}`);
			this.nlc.status({classifier_id: classifier_id}, (err, status) => {
				if (err){
					reject('Error getting status for classifier in training.');
				}
				else {
					logger.info(`Status of classifier ${classifier_id} is ${status.status}.`);
					if (status.status === 'Training'){
						setTimeout(() => {
							checkAvailable(resolve, reject);
						}, 1000 * 60);
					}
					else if (status.status === 'Available'){
						this.classifierTraining = undefined;
						this.classifier_cache = status;
						this._deleteOldClassifiers().then((result) => {
							logger.info('Deleted classifier', result);
							resolve(status);
						}).catch((err) => {
							logger.error(`${TAG}: Error deleting classifier ${status.classifier_id}`);
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
 * Internal method to help with the clanup of old classifiers.
 *
 * @return Promise Resolves when classifiers have been deleted.
 */
NLCManager.prototype._deleteOldClassifiers = function(){
	return new Promise((resolve, reject) => {
		this.nlc.list({}, (err, response) => {
			if (err) {
				reject('Error getting available classifiers. ' + JSON.stringify(err, null, 2));
			}
			else {
				let sortedClassifiers = response.classifiers.sort((a, b) => {
					return new Date(b.created) - new Date(a.created);
				});

				let filteredClassifiers = sortedClassifiers.filter((classifier) => {
					return classifier.name === this.opts.classifierName;
				});

				if (filteredClassifiers.length > this.opts.maxClassifiers) {
					let deleteClassifierId = filteredClassifiers[filteredClassifiers.length - 1].classifier_id;
					logger.debug(`Deleting classifier ${deleteClassifierId}`);

					this.nlc.remove({classifier_id: deleteClassifierId}, (err, result) => {
						if (err){
							reject('Error deleting classifier: ' + JSON.stringify(err, null, 2));
						}
						else {
							logger.info('Deleted classifier', filteredClassifiers[filteredClassifiers.length - 1].classifier_id);

							nlcDb.open().then((db) => {
								return db.get(deleteClassifierId).then((doc) => {
									doc._deleted = true;
									return db.put(doc).then(() => {
										logger.info(`${TAG}: Deleted DB classifier training data for ${deleteClassifierId}`);
									});
								});
							}).catch((error) => {
								logger.warn(`${TAG}: Couldn't delete DB doc with classifier data for ${deleteClassifierId}`, error);
							});

							this._deleteOldClassifiers().then((result) => {
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
 * Helper method to finds a classifier which is available (training completed)
 * and with the most recent creation date.  If none are 'Available' then find
 * the most recent classifier that started training.  If none are training,
 * start the training.
 *
 * @return Promise When resolved it returns a JSON object with the classifier information.
 */
NLCManager.prototype._getClassifier = function(doNotTrain){
	return new Promise((resolve, reject) => {

		if (this.classifier_cache){
			logger.debug(`Using cached NLC classifier ${this.classifier_cache.classifier_id}`);
			resolve(this.classifier_cache);
		}
		else {
			this.nlc.list({}, (err, response) => {
				if (err) {
					reject('Error getting available classifiers.' + JSON.stringify(err, null, 2));
				}
				else {
					let filteredClassifiers = response.classifiers.filter((classifier) => {
						return classifier.name === this.opts.classifierName;
					});

					if (filteredClassifiers.length < 1){
						if (doNotTrain) {
							reject(`No classifiers found under [${this.opts.classifierName}]`);
						}
						else {
							// no classifiers found by this name, so create one and start training.
							logger.info(`No classifiers found with name ${this.opts.classifierName}. Creating and training a new one.`);
							this._startTraining().then((result) => {
								resolve(result);
							}).catch((err) => {
								reject(err);
							});
						}
					}
					else {
						// try to find the most recent available.  or most recent that started training.
						let sortedClassifiers = filteredClassifiers.sort((a, b) => {
							return new Date(b.created) - new Date(a.created);
						});

						let checkStatus = [];
						sortedClassifiers.map((classifier) => {
							checkStatus.push(this._getClassifierStatus(classifier.classifier_id));
						});

						Promise.all(checkStatus).then((classifierStatus) => {

							this.classifierTraining = undefined;
							for (let i = 0; i < sortedClassifiers.length; i++){
								if (sortedClassifiers[i].name === this.opts.classifierName){
									if (classifierStatus[i].status === 'Available'){
										this.classifier_cache = classifierStatus[i];
										resolve(classifierStatus[i]);
										return;
									}
									else if (classifierStatus[i].status === 'Training' && !this.classifierTraining){
										this.classifierTraining = classifierStatus[i];
									}
								}
							}

							if (this.classifierTraining){
								resolve(this.classifierTraining);
							}
							else {
								if (doNotTrain) {
									reject(`No classifiers available under [${this.opts.classifierName}]`);
								}
								else {
									// none are available or training, start training one.
									logger.info(`No classifiers with name ${this.opts.classifierName} are avilable or in training. Start training a new one.`);
									this._startTraining().then((result) => {
										resolve(result);
									}).catch((err) => {
										reject(err);
									});
								}
							}
						}).catch((error) => {
							reject('Error getting a classifier.' + JSON.stringify(error));
						});
					}
				}
			});
		}
	});
};

/**
 * Helper method to retrieve the status of a classifier.
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise       			When resolved returns the classifier data.
 */
NLCManager.prototype._getClassifierStatus = function(classifier_id){
	return new Promise((resolve, reject) => {
		if (classifier_id) {
			this.nlc.status({classifier_id: classifier_id}, (err, status) => {
				if (err){
					reject('Error while checking status of classifier ' + classifier_id + JSON.stringify(err, null, 2));
				}
				else {
					// If classifier is Training, record it's training duration
					if (status.status === 'Training') {
						let duration = Math.floor((Date.now() - new Date(status.created)) / 60000);
						status.duration = duration > 0 ? duration : 0;
					}
					resolve(status);
				}
			});
		}
		else {
			this._getClassifier(true).then(function(status) {
				resolve(status);
			}).catch(function(err) {
				reject(err);
			});
		}
	});
};

/**
 * Helper method to list all classifiers.
 *
 * @return Promise When resolved it returns an array of JSON objects with each classifier's information.
 */
NLCManager.prototype._getClassifierList = function(){
	return new Promise((resolve, reject) => {
		this.nlc.list({}, (err, response) => {
			if (err) {
				reject('Error getting list of classifiers.' + JSON.stringify(err, null, 2));
			}
			else {
				let checkStatus = [];

				let filteredClassifiers = response.classifiers.filter((classifier) => {
					return classifier.name === this.opts.classifierName;
				});

				filteredClassifiers.map((classifier) => {
					checkStatus.push(this._getClassifierStatus(classifier.classifier_id));
				});

				Promise.all(checkStatus).then((classifiers) => {
					// Sort by latest created; first Available classifiers, then Training
					let sortedClassifiers = classifiers.sort((a, b) => {
						if (a.status !== b.status) {
							return a.status === 'Available' ? -1 : 1;
						}
						return new Date(b.created) - new Date(a.created);
					});
					resolve(sortedClassifiers);
				}).catch((err) => {
					reject('Error getting list of classifiers.' + JSON.stringify(err, null, 2));
				});
			}
		});
	});
};

module.exports = NLCManager;
