/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const logger = require('./logger');

const settings = {
	nlc_url: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_URL || process.env.HUBOT_WATSON_NLC_URL,
	nlc_username: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_USERNAME || process.env.HUBOT_WATSON_NLC_USERNAME,
	nlc_password: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_PASSWORD || process.env.HUBOT_WATSON_NLC_PASSWORD,
	nlc_classifier: process.env.HUBOT_WATSON_NLC_CLASSIFIER || 'default-hubot-classifier',
	nlc_autoApprove: process.env.HUBOT_WATSON_NLC_AUTO_APPROVE || false,
	alchemy_url: process.env.VCAP_SERVICES_ALCHEMY_API_0_CREDENTIALS_URL || process.env.HUBOT_WATSON_ALCHEMY_URL,
	alchemy_apikey: process.env.VCAP_SERVICES_ALCHEMY_API_0_CREDENTIALS_APIKEY || process.env.HUBOT_WATSON_ALCHEMY_APIKEY,
	alchemy_dataset: process.env.HUBOT_WATSON_ALCHEMY_DATASET,
	cloudantEndpoint: process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_HOST ? 'https://' + process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_HOST : process.env.HUBOT_CLOUDANT_ENDPOINT,
	cloudantKey: process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_USERNAME || process.env.HUBOT_CLOUDANT_KEY,
	cloudantPassword: process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_PASSWORD || process.env.HUBOT_CLOUDANT_PASSWORD,
	cloudantDb: process.env.HUBOT_CLOUDANT_DB || 'nlc',
	dbPath: process.env.HUBOT_DB_PATH || './',
	dbDirectory: process.env.HUBOT_DB_DIRECTORY || 'databases',
	syncInterval: process.env.SYNC_INTERVAL || '1800000', // default 30 minutes
	highThreshold: process.env.CONFIDENCE_THRESHOLD_HIGH || '0.8',
	lowThreshold: process.env.CONFIDENCE_THRESHOLD_LOW || '0.05',
	test: process.env.HUBOT_DB_TEST || false,
	version: 'v1',
	suppressErrors: process.env.SUPPRESS_ERRORS || false,
	paramParsingDisabled: process.env.PARAM_PARSING_DISABLED || false,
	logLevel: process.env.COGNITIVE_LOG_LEVEL || 'error'
};


// gracefully output message and exit if any required config is undefined
if (settings.cloudantEndpoint) {
	let tmp = settings.cloudantEndpoint;
	settings.cloudantEndpoint = tmp.substring(tmp.indexOf('/') + 2);
}

if (!settings.nlc_url) {
	logger.error('HUBOT_WATSON_NLC_URL not set');
}

if (!settings.nlc_username) {
	logger.error('HUBOT_WATSON_NLC_USERNAME not set');
}
if (!settings.nlc_password) {
	logger.error('HUBOT_WATSON_NLC_PASSWORD not set');
}

if (!settings.nlc_classifier) {
	logger.error('HUBOT_WATSON_NLC_CLASSIFIER not set');
}

if (!settings.alchemy_url) {
	logger.error('HUBOT_WATSON_ALCHEMY_URL');
}
if (!settings.alchemy_apikey) {
	logger.error('HUBOT_WATSON_ALCHEMY_APIKEY');
}


settings.syncInterval = parseInt(settings.syncInterval, 10);
settings.lowThreshold = parseFloat(settings.lowThreshold);
settings.highThreshold = parseFloat(settings.highThreshold);

module.exports = settings;


module.exports.truthy = function(val) {
	if (val && (val === true || val === 'true' || val === 'TRUE' ||
		val === 'YES' || val === 'Y' || val === 'y')) {
		return true;
	}
	else {
		return false;
	}
};
