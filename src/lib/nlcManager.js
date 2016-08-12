/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const watson = require('watson-developer-cloud');
const stringify = require('csv-stringify');
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
 *        options.training_data = ReadStream, typically created from a CSV file.  (OPTIONAL, if omitted training data will come from nlcDb)
 * @constructor
 */
function NLCManager(options) {
	this.opts = options || {};

	this.opts.classifierName = options.classifierName || 'default-classifier';
	this.opts.maxClassifiers = options.maxClassifiers || 3;
	this.opts.classifierLanguage = options.language || 'en';

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
	var dfd = Promise.defer();

	this._getClassifier().then((classifier) => {
		dfd.resolve(classifier);
	}).catch((err) => {
		dfd.reject(err);
	});

	return dfd.promise;
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
 * Returns classification data for a statement using the latest classifier available.
 *
 * @param  String	text	Natural Language statement to be classified.
 * @return JSON      		Classification data from Watson Natural Language Classifier.
 */
NLCManager.prototype.classify = function(text){
	var dfd = Promise.defer();
	this._getClassifier().then((classifier) => {
		logger.info('Using classifier %s', JSON.stringify(classifier));
		if (classifier.status === 'Training'){
			dfd.resolve(classifier);
		}
		else {
			this.nlc.classify({
				text: text,
				classifier_id: classifier.classifier_id },
				(err, response) => {
					if (err) {
						this.classifier_cache = undefined;
						dfd.reject(err);
					}
					else {
						dfd.resolve(response);
					}
				});
		}
	}).catch((err) => {
		this.classifier_cache = undefined;
		dfd.reject(err);
	});
	return dfd.promise;
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
		else if (this.opts.training_data) {
			let params = {
				language: this.opts.classifierLanguage,
				name: this.opts.classifierName,
				training_data: this.opts.training_data
			};

			this.nlc.create(params, (err, response) => {
				if (err) {
					reject('Error creating classifier from provided training_data:' + JSON.stringify(err, null, 2));
				}
				else {
					this.classifierTraining = response;
					resolve(response);
				}
			});
		}
		else {
			return nlcDb.open().then((db) => {
				return db.getClasses();
			})
			.then((csvInput) => {
				stringify(csvInput, (err, csvStream) => {
					if (err){
						reject('Error generating training data in csv format.');
					}

					let params = {
						language: this.opts.classifierLanguage,
						name: this.opts.classifierName,
						training_data: csvStream
					};

					this.nlc.create(params, (err, response) => {
						if (err) {
							reject('Error creating classifier from nlcDb:' + JSON.stringify(err, null, 2));
						}
						else {
							this.classifierTraining = response;
							resolve(response);
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
 * Internal method to poll for classifier status.
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise               	Resolved when training completes. Returns the classifier settings/status. Errors if traininf fails.
 */
NLCManager.prototype._monitor = function(classifier_id){
	var dfd = Promise.defer();

	const checkAvailable = (dfd) => {
		logger.info(`Checking status of classifier ${classifier_id}`);
		this.nlc.status({classifier_id: classifier_id}, (err, status) => {
			if (err){
				dfd.reject('Error getting status for classifier in training.');
			}
			else {
				logger.info(`Status of classifier ${classifier_id} is ${status.status}.`);
				if (status.status === 'Training'){
					setTimeout(() => {
						checkAvailable(dfd);
					}, 1000 * 60);
				}
				else if (status.status === 'Available'){
					this.classifierTraining = undefined;
					this.classifier_cache = status;
					this._deleteOldClassifiers().then((result) => {
						logger.info('Deleted old classifier', result);
						dfd.resolve(status);
					});
				}
				else {
					dfd.reject(status);
				}
			}
		});
	};
	checkAvailable(dfd);

	return dfd.promise;
};

/**
 * Internal method to help with the clanup of old classifiers.
 *
 * @return Promise Resolves when classifiers have been deleted.
 */
NLCManager.prototype._deleteOldClassifiers = function(){
	var dfd = Promise.defer();
	this.nlc.list({}, (err, response) => {
		if (err) {
			dfd.reject('Error getting available classifiers. ' + JSON.stringify(err, null, 2));
		}
		else {
			var sortedClassifiers = response.classifiers.sort((a, b) => {
				return new Date(b.created) - new Date(a.created);
			});

			var filteredClassifiers = sortedClassifiers.filter((classifier) => {
				return classifier.name === this.opts.classifierName;
			});

			if (filteredClassifiers.length > this.opts.maxClassifiers) {
				logger.info(`Deleting classifier ${filteredClassifiers[filteredClassifiers.length - 1].classifier_id}`);
				this.nlc.remove({classifier_id: filteredClassifiers[filteredClassifiers.length - 1].classifier_id}, (err, result) => {
					if (err){
						dfd.reject('Error deleting classifier: ' + JSON.stringify(err, null, 2));
					}
					else {
						logger.info('Deleted classifier', filteredClassifiers[filteredClassifiers.length - 1].classifier_id);
						this._deleteOldClassifiers().then((result) => {
							dfd.resolve(result);
						}).catch((err) => {
							dfd.reject(err);
						});
					}
				});
			}
			else {
				dfd.resolve();
			}
		}
	});
	return dfd.promise;
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
	var dfd = Promise.defer();

	if (this.classifier_cache){
		logger.debug(`Using cached NLC classifier ${this.classifier_cache.classifier_id}`);
		dfd.resolve(this.classifier_cache);
	}
	else {
		this.nlc.list({}, (err, response) => {
			if (err) {
				dfd.reject('Error getting available classifiers.' + JSON.stringify(err, null, 2));
			}
			else {
				var filteredClassifiers = response.classifiers.filter((classifier) => {
					return classifier.name === this.opts.classifierName;
				});

				if (filteredClassifiers.length < 1){
					if (doNotTrain) {
						dfd.reject(`No classifiers found under [${this.opts.classifierName}]`);
					}
					else {
						// no classifiers found by this name, so create one and start training.
						logger.info(`No classifiers found with name ${this.opts.classifierName}. Creating and training a new one.`);
						this._startTraining().then((result) => {
							dfd.resolve(result);
						}).catch((err) => {
							dfd.reject(err);
						});
					}
				}
				else {
					// try to find the most recent available.  or most recent that started training.
					var sortedClassifiers = filteredClassifiers.sort((a, b) => {
						return new Date(b.created) - new Date(a.created);
					});

					var checkStatus = [];
					sortedClassifiers.map((classifier) => {
						checkStatus.push(this._getClassifierStatus(classifier.classifier_id));
					});

					Promise.all(checkStatus).then((classifierStatus) => {

						this.classifierTraining = undefined;
						for (var i = 0; i < sortedClassifiers.length; i++){
							if (sortedClassifiers[i].name === this.opts.classifierName){
								if (classifierStatus[i].status === 'Available'){
									this.classifier_cache = classifierStatus[i];
									dfd.resolve(classifierStatus[i]);
									return;
								}
								else if (classifierStatus[i].status === 'Training' && !this.classifierTraining){
									this.classifierTraining = classifierStatus[i];
								}
							}
						}

						if (this.classifierTraining){
							dfd.resolve(this.classifierTraining);
						}
						else {
							if (doNotTrain) {
								dfd.reject(`No classifiers available under [${this.opts.classifierName}]`);
							}
							else {
								// none are available or training, start training one.
								logger.info(`No classifiers with name ${this.opts.classifierName} are avilable or in training. Start training a new one.`);
								this._startTraining().then((result) => {
									dfd.resolve(result);
								}).catch((err) => {
									dfd.reject(err);
								});
							}
						}
					}).catch((error) => {
						dfd.reject('Error getting a classifier.' + JSON.stringify(error));
					});
				}
			}
		});
	}
	return dfd.promise;
};

/**
 * Helper method to retrieve the status of a classifier.
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise       			When resolved returns the classifier data.
 */
NLCManager.prototype._getClassifierStatus = function(classifier_id){
	var dfd = Promise.defer();
	if (classifier_id) {
		this.nlc.status({classifier_id: classifier_id}, (err, status) => {
			if (err){
				dfd.reject('Error while checking status of classifier ' + classifier_id + JSON.stringify(err, null, 2));
			}
			else {
				dfd.resolve(status);
			}
		});
	}
	else {
		this._getClassifier(true).then(function(status) {
			dfd.resolve(status);
		}).catch(function(err) {
			dfd.reject(err);
		});
	}
	return dfd.promise;
};


module.exports = NLCManager;
