/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const nlcDb = require('./nlcDb');

const NLCCONFIG_KEY = Symbol.for('hubot-ibmcloud-cognitive-lib-nlcconfig');

let globalSymbols = Object.getOwnPropertySymbols(global);
if (globalSymbols.indexOf(NLCCONFIG_KEY) < 0) {
	global[NLCCONFIG_KEY] = {};
}

let singleton = {};
Object.defineProperty(singleton, 'instance', {
	get: function(){
		return global[NLCCONFIG_KEY];
	}
});

/**
 * Return array of class definitions for all classes (emit target, textfile, and parameters).
 *
 * @param 	Date 	approvedAfterDate 	A Date() object used to filter and return only class definitions
 *                                  	approved after the given date. It tolerates dates specified in ms.
 *
 * @return	[]		Array of class definitions for all classes (emit target, textfile, and parameters).
 */
exports.getAllClasses = function(approvedAfterDate) {
	return nlcDb.open().then((db) => {
		return nlcDb.getClasses(approvedAfterDate);
	});
};

/**
 * Return configuration associated with a specific class name.
 *
 * @param  string 	className 	Name of the NLC classification.
 * @return {}           		Return object contains the following keys. {class, description, target, parameters }
 */
exports.getClassEmitTarget = function(className) {
	return nlcDb.getClassEmitTarget(className);
};

/**
* Updates global parameter definitions
*/
exports.updateGlobalParameterValues = function(name, values){
	return nlcDb.createOrUpdate({
		_id: name,
		values: values
	});
};

/**
* Get auto-approve setting
*/
exports.getAutoApprove = function(){
	return nlcDb.getAutoApprove();
};

/**
* Set auto-approve setting
*/
exports.setAutoApprove = function(value){
	return nlcDb.setAutoApprove(value);
};

/**
 * Sets entity function definitions.
 */
exports.setGlobalEntityFunction = function(name, entityFunction){
	singleton.instance[name] = entityFunction;
};

/**
 * Returns entity function definitions.
 */
exports.getGlobalEntityFunction = function(name){
	return singleton.instance[name];
};
