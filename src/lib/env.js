/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const settings = {
	nlc_url: process.env.HUBOT_WATSON_NLC_URL,
	nlc_username: process.env.HUBOT_WATSON_NLC_USERNAME,
	nlc_password: process.env.HUBOT_WATSON_NLC_PASSWORD,
	nlc_classifier: process.env.HUBOT_WATSON_NLC_CLASSIFIER || 'default-hubot-classifier',
	nlc_autoApprove: process.env.HUBOT_WATSON_NLC_AUTO_APPROVE || false,
	alchemy_url: process.env.HUBOT_WATSON_ALCHEMY_URL,
	alchemy_apikey: process.env.HUBOT_WATSON_ALCHEMY_APIKEY,
	alchemy_dataset: process.env.HUBOT_WATSON_ALCHEMY_DATASET,
	cloudantEndpoint: process.env.HUBOT_CLOUDANT_ENDPOINT,
	cloudantKey: process.env.HUBOT_CLOUDANT_KEY,
	cloudantPassword: process.env.HUBOT_CLOUDANT_PASSWORD,
	cloudantDb: process.env.HUBOT_CLOUDANT_DB || 'nlc',
	dbPath: process.env.HUBOT_DB_PATH || './',
	dbDirectory: process.env.HUBOT_DB_DIRECTORY || 'databases',
	syncInterval: process.env.SYNC_INTERVAL || '1800000', // default 30 minutes
	highThreshold: process.env.CONFIDENCE_THRESHOLD_HIGH || '0.9',
	lowThreshold: process.env.CONFIDENCE_THRESHOLD_LOW || '0.3',
	test: process.env.HUBOT_DB_TEST || false,
	version: 'v1',
	suppressErrors: process.env.SUPPRESS_ERRORS || false,
	paramParsingDisabled: process.env.PARAM_PARSING_DISABLED || false
};

function logError(msg){
	if (!settings.suppressErrors){
		console.log(msg);
	}
}

// gracefully output message and exit if any required config is undefined
if (settings.cloudantEndpoint) {
	let tmp = settings.cloudantEndpoint;
	settings.cloudantEndpoint = tmp.substring(tmp.indexOf('/') + 2);
}

if (!settings.nlc_url) {
	logError('HUBOT_WATSON_NLC_URL not set');
}

if (!settings.nlc_username) {
	logError('HUBOT_WATSON_NLC_USERNAME not set');
}
if (!settings.nlc_password) {
	logError('HUBOT_WATSON_NLC_PASSWORD not set');
}

if (!settings.nlc_classifier) {
	logError('HUBOT_WATSON_NLC_CLASSIFIER not set');
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
