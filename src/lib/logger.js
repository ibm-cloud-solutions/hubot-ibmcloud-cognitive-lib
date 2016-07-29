/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const LOGLEVEL = {
	NONE: 0,
	ERROR: 1,
	WARNING: 2,
	INFO: 3,
	DEBUG: 4
};
var robot;

function isLogging(targetlevel) {
	var loglevel = (process.env.COGNITIVE_LOG_LEVEL && LOGLEVEL[process.env.COGNITIVE_LOG_LEVEL]
		? LOGLEVEL[process.env.COGNITIVE_LOG_LEVEL]
		: LOGLEVEL.NONE);
	return (loglevel >= targetlevel);
};

module.exports.setRobot = function(bot) {
	robot = bot;
};

module.exports.logError = function(logmessage) {
	if (robot) {
		robot.log.error(logmessage);
	}
	else {
		if (isLogging(LOGLEVEL.ERROR)) {
			console.log(`ERROR: ${logmessage}`);
		}
	}
};

module.exports.logWarning = function(logmessage) {
	if (robot) {
		robot.log.warning(logmessage);
	}
	else {
		if (isLogging(LOGLEVEL.WARNING)) {
			console.log(`WARNING: ${logmessage}`);
		}
	}
};

module.exports.logInfo = function(logmessage) {
	if (robot) {
		robot.log.info(logmessage);
	}
	else {
		if (isLogging(LOGLEVEL.INFO)) {
			console.log(`INFO: ${logmessage}`);
		}
	}
};

module.exports.logDebug = function(logmessage) {
	if (robot) {
		robot.log.debug(logmessage);
	}
	else {
		if (isLogging(LOGLEVEL.DEBUG)) {
			console.log(`DEBUG: ${logmessage}`);
		}
	}
};
