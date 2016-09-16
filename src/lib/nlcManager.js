/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const ServiceManager = require('./serviceManager');

/**
 * @param {options} Object with the following configuration.
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
	this.opts.serviceName = 'nlc';
	this.serviceManager = new ServiceManager(this.opts);
}


/**
 * Creates a new classifier and starts training it. The new classifier can't be used until training completes.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(classifier_id)`.
 *
 * @return Promise	When resolved it returns a JSON object with the new classifier information.
 */
NLCManager.prototype.train = function(){
	return this.serviceManager.train();
};

/**
 * Find the most recent classifier that either available or training.  If no such classifier, then start training.
 * TIP:
 * 	 It is useful to monitor training progress using `monitorTraining(classifier_id)`.
 *
 * @return Promise Resolved with existing classifier or new classifier information if training is needed.
 */
NLCManager.prototype.trainIfNeeded = function(){
	return this.serviceManager.trainIfNeeded();
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
	return this.serviceManager.monitorTraining(classifier_id);
};


/**
 * Gets the current status for the classifier with classifier_id
 *
 * @param  String 	classifier_id 	The id of the clasifier.
 * @return Promise       			When resolved returns the classifier data. It errors if a classifier isn't found.
 */
NLCManager.prototype.classifierStatus = function(classifier_id){
	return this.serviceManager.getStatus(classifier_id);
};

/**
 * Gets list of classifiers
 *
 * @return Promise       			When resolved returns a list of classifiers.
 */
NLCManager.prototype.classifierList = function(){
	return this.serviceManager.getList();
};


/**
 * Get information about the curent classifier
 *
 * @return Promise
 */
NLCManager.prototype.currentClassifier = function(){
	return this.serviceManager.currentInstance();
};

/**
 * Returns classification data for a statement using the latest classifier available.
 *
 * @param  String	text	Natural Language statement to be classified.
 * @return JSON      		Classification data from Watson Natural Language Classifier.
 */
NLCManager.prototype.classify = function(text){
	return this.serviceManager.process(text);
};


/**
 * Gets data used to train the classifier with classifierId.
 *
 * @param  String	classifierId
 * @return Promise  JSON			Sample result:	{"className": ["Text 1.", "Text 2"]}
 */
NLCManager.prototype.getClassifierData = function(classifierId){
	return this.serviceManager.getInstanceData(classifierId);
};

module.exports = NLCManager;
