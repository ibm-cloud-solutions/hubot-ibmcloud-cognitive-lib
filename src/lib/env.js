/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const logger = require('./logger');

let settings = {
	// NLC settings
	nlc_url: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_URL || process.env.HUBOT_WATSON_NLC_URL,
	nlc_username: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_USERNAME || process.env.HUBOT_WATSON_NLC_USERNAME,
	nlc_password: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_PASSWORD || process.env.HUBOT_WATSON_NLC_PASSWORD,
	db_nlc_remote: process.env.HUBOT_CLOUDANT_NLC_DB || 'nlc',
	nlc_classifier: process.env.HUBOT_WATSON_NLC_CLASSIFIER || 'default-hubot-classifier',
	nlc_autoApprove: process.env.HUBOT_WATSON_NLC_AUTO_APPROVE || false,

	// R & R settings
	rr_url: process.env.VCAP_SERVICES_RETRIEVE_RANK_0_CREDENTIALS_URL || process.env.HUBOT_RETRIEVE_RANK_URL,
	rr_username: process.env.VCAP_SERVICES_RETRIEVE_RANK_0_CREDENTIALS_USERNAME || process.env.HUBOT_RETRIEVE_RANK_USERNAME,
	rr_password: process.env.VCAP_SERVICES_RETRIEVE_RANK_0_CREDENTIALS_PASSWORD || process.env.HUBOT_RETRIEVE_RANK_PASSWORD,
	db_rr_remote: process.env.HUBOT_CLOUDANT_RR_DB || 'rr',

	// Remote Cloudant settings
	cloudantEndpoint: process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_HOST ? 'https://' + process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_HOST : process.env.HUBOT_CLOUDANT_ENDPOINT,
	cloudantKey: process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_USERNAME || process.env.HUBOT_CLOUDANT_KEY,
	cloudantPassword: process.env.VCAP_SERVICES_CLOUDANTNOSQLDB_0_CREDENTIALS_PASSWORD || process.env.HUBOT_CLOUDANT_PASSWORD,
	syncInterval: process.env.SYNC_INTERVAL || '1800000', // default 30 minutes
	syncToMaster: process.env.HUBOT_COGNITIVE_FEEDBACK_ENABLED || false,
	syncToMasterEndpoint: process.env.HUBOT_COGNITIVE_FEEDBACK_ENDPOINT || 'cognitive-keys.ng.bluemix.net',

	// Local PouchDB settings
	dbPath: process.env.HUBOT_DB_PATH || './',
	initDbPath: process.env.HUBOT_INIT_DB_PATH || process.env.HUBOT_DB_PATH || './',
	dbDirectory: process.env.HUBOT_DB_DIRECTORY || 'databases',

	// Bot identification
	botName: process.env.HUBOT_NAME,
	slackApi: process.env.HUBOT_SLACK_API || 'https://slack.com/api',
	slackToken: process.env.HUBOT_SLACK_TOKEN,
	bluemixUser: process.env.HUBOT_BLUEMIX_USER,
	bluemixOrg: process.env.HUBOT_BLUEMIX_ORG,
	bluemixSpace: process.env.HUBOT_BLUEMIX_SPACE,

	// Other settings
	suppressErrors: process.env.SUPPRESS_ERRORS || false,
	test: process.env.HUBOT_DB_TEST || false,
	highThreshold: process.env.CONFIDENCE_THRESHOLD_HIGH || '0.8',
	lowThreshold: process.env.CONFIDENCE_THRESHOLD_LOW || '0.05'
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

// trim protocol from cloudantEndpoint
if (settings.cloudantEndpoint) {
	settings.cloudantEndpoint = settings.cloudantEndpoint.replace('http://', '').replace('https://', '');
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
