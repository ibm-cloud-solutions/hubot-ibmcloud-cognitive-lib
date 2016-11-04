/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const path = require('path');
const TAG = path.basename(__filename);
const logger = require('./logger');
const env = require('./env');
const DBManager = require('./dbManager');
const nlcDb = new DBManager({localDbName: 'nlc', remoteDbName: env.db_nlc_remote });
const classesView = 'classes/byClass';
const targetView = 'classes/byTarget';

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
	// assumption that the database can be held in memory
	// note classifier will break if this is not the case
	// return an array of [text, className]
	return new Promise((resolve, reject) => {
		let result = [];
		if (nlcDb){
			// get all of the class types
			return nlcDb.query(classesView, {
				include_docs: true
			}).then((res) => {
				if (approvedAfterDate && typeof approvedAfterDate === 'number'){
					approvedAfterDate = new Date(approvedAfterDate);
				}

				for (let row of res.rows){
					// Filter records without an approvedDate or approved before the given date.
					if (approvedAfterDate) {
						if (row.doc.approved){
							let approvedDate = row.doc.approved_timestamp || row.doc.approved;
							if (new Date(parseInt(approvedDate, 10)) < approvedAfterDate){
								continue;
							}
						}
						else {
							continue;
						}
					}

					let className = row.key;
					// allow short hand assignment for classifications
					let text = row.doc.text || row.doc.classification.text;

					result.push([
						text, className
					]);
				}
				return resolve(result);
			}).catch(function(err) {
				reject(err);
			});
		}
		else {
			reject('Database needs to be open before calling getLocalClasses');
		}
	});
};

/**
 * Return configuration associated with a specific class name.
 *
 * @param  string 	className 	Name of the NLC classification.
 * @return {}           		Return object contains the following keys. {class, description, target, parameters }
 */
exports.getClassEmitTarget = function(className) {
	return nlcDb.query(targetView, {
		key: className
	}).then((result) => {
		if (result.rows.length > 0){
			let resp = {
				class: result.rows[0].id,
				description: result.rows[0].value.length >= 3 ? result.rows[0].value[2] : result.rows[0].id,
				target: result.rows[0].value[0],
				parameters: result.rows[0].value[1]
			};

			// loop through and resolve $ref if defined
			if (resp.parameters){
				let ps = [];
				for (let p of resp.parameters){
					ps.push(
						new Promise((resolve, reject) => {
							if (p.values && !Array.isArray(p.values)){
								if (p.values.$ref){
									let ref = p.values.$ref;
									return nlcDb.get(ref).then((doc) => {
										if (doc.values){
											p.values = doc.values;
											resolve(p);
										}
										else {
											resolve(p);
										}
									});
								}
								else {
									// skip over, return object
									resolve(p);
								}
							}
							else {
								resolve(p);
							}
						})
					);
				}
				return Promise.all(ps).then((params) => {
					resp.parameters = params;
					return resp;
				}).catch(() => {
					// can't execute this emit target, so return null
					logger.error(`${TAG} Couldn't resolve parameters for class ${className}. This is likely caused by incorrect data in the database. Was trying to resolve initial params`, resp.parameters);
					return null;
				});
			}
			else {
				// no parameters
				return resp;
			}
		}
		else {
			logger.error(`${TAG} Class ${className} doesn't exist in the database. This is likely an indication of (1) the Watson NLC needs to be re-trained with the current data, or (2) a problem initializing or synchronizing the database.`);
			return null;
		}
	});
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
	return env.truthy(env.nlc_autoApprove);
};

/**
* Set auto-approve setting
*/
exports.setAutoApprove = function(approve){
	if (typeof (approve) === 'boolean') {
		env.nlc_autoApprove = approve;
	}
	else {
		env.nlc_autoApprove = false;
	}
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
