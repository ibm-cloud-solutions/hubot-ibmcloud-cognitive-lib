/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const nlcDb = require('./nlcDb');

/**
 * Return array of class definitions for all classes (emit target, textfile, and parameters).
 */
exports.getAllClasses = function() {
	return nlcDb.open().then((db) => {
		return nlcDb.getClasses();
	});
};

/**
 * Return emit target associated with a specific class name.
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
