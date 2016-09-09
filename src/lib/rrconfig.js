/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const env = require('./env');
const DBManager = require('./dbManager');
const classesView = 'classes/byClass';
const rrDb = new DBManager({localDbName: 'rr', remoteDbName: env.cloudantDb});

const RRCONFIG_KEY = Symbol.for('hubot-ibmcloud-cognitive-lib-rrconfig');

let globalSymbols = Object.getOwnPropertySymbols(global);
if (globalSymbols.indexOf(RRCONFIG_KEY) < 0) {
	global[RRCONFIG_KEY] = {};
}

let singleton = {};
Object.defineProperty(singleton, 'instance', {
	get: function(){
		return global[RRCONFIG_KEY];
	}
});

exports.getRRClasses = function(){
	// assumption that the database can be held in memory
	// note classifier will break if this is not the case
	// return an array of [text, className]
	return new Promise((resolve, reject) => {
		let result = [];
		if (rrDb){
			// get all of the class types
			return rrDb.query(classesView, {
				include_docs: true
			}).then((res) => {
				for (let row of res.rows){
					let className = row.key;
					// allow short hand assignment for classifications
					let text = row.doc.text || row.doc.classification.text;
					if (result.length > 0 && result[result.length - 1].indexOf(className) !== -1) {
						result[result.length - 1] = [className, result[result.length - 1][1] + ',' + text];
					}
					else {
						result.push([
							className, text
						]);
					}
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
