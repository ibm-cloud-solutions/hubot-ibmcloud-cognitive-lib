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
