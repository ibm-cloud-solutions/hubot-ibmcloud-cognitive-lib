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
	logLevel: process.env.COGNITIVE_LOG_LEVEL || 'error'
};

// cloudantNoSQLDB service bound to application, overrides any other settings.
if (process.env.VCAP_SERVICES) {
	if (JSON.parse(process.env.VCAP_SERVICES).cloudantNoSQLDB) {
		let credentials = JSON.parse(process.env.VCAP_SERVICES).cloudantNoSQLDB[0].credentials;
		settings.cloudantEndpoint = credentials.host;
		settings.cloudantKey = credentials.username;
		settings.cloudantPassword = credentials.password;
	}
	if (JSON.parse(process.env.VCAP_SERVICES).natural_language_classifier) {
		let credentials = JSON.parse(process.env.VCAP_SERVICES).natural_language_classifier[0].credentials;
		settings.nlc_url = credentials.url;
		settings.nlc_username = credentials.username;
		settings.nlc_password = credentials.password;
	}
}

// strip 'https://' from cloudantEndpoint, if exists.
if (settings.cloudantEndpoint && settings.cloudantEndpoint.includes('/')) {
	let tmp = settings.cloudantEndpoint;
	settings.cloudantEndpoint = tmp.substring(tmp.indexOf('/') + 2);
}

// gracefully output message and exit if any required config is undefined
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
