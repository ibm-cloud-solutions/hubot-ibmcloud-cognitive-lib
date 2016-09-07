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
const PouchDB = require('./PouchDB');

const pjson = require(path.resolve(process.cwd(), 'package.json'));
const classesDesignDoc = '_design/classes';
const classesView = 'classes/byClass';
const targetView = 'classes/byTarget';


function DBManager(options){
	this.localDbName = options.localDbName;
	this.db = PouchDB.open(options.localDbName);
	this.opts = options;

	initializeDB(this.db).then(() => {
		syncFn(this.db, options.localDbName, options.remoteDbName);
	}).catch((error) => {
		logger.error(`${TAG}: Unable to start sync for [${options.localDbName}] because`, error);
	});

}


function initializeDB(db){
	return new Promise((resolve, reject) => {
		db.get('_design/classes').then(() => {
			resolve();
		}).catch(() => {
			// create design doc
			let ddoc = {
				_id: classesDesignDoc,
				storageType: 'private',
				views: {
					byClass: {
						map: 'function(doc) { if (doc.selectedClass && doc.approved){ emit(doc.selectedClass); } if (doc.class && doc.text){ emit(doc.class); }}'
					},
					byTarget: {
						map: 'function(doc){ if (doc.emittarget) { if(doc.description){ emit(doc._id, [doc.emittarget, doc.parameters, doc.description]); } else{ emit(doc._id, [doc.emittarget, doc.parameters]); }}}'
					}
				}
			};

			this.db.put(ddoc).then(() => {
				resolve();
			}).catch((err) => {
				logger.error(`${TAG}: Error initializing Cloudant sync`, err);
				reject(err);
			});
		});
	});
}


function syncFn(db, localDbName, remoteDbName){
	if (!env.test && env.cloudantEndpoint && env.cloudantPassword) {
		logger.info(`${TAG}: Starting sync of database ${localDbName} with remote Cloudant db ${remoteDbName}.`);

		db.sync(`https://${env.cloudantKey}:${env.cloudantPassword}@${env.cloudantEndpoint}/${remoteDbName}`,
			{
				include_docs: true,
				filter: function(doc) {
					// filter client side documents that we don't want synchronized
					return doc.storageType !== 'private';
				}
			})
			.on('complete', function(info){
				logger.info(`${TAG}: Completed sync of NLC training data with Cloudant.`);
				logger.debug(`${TAG}: Cloudant sync results.`, info);

				setTimeout(syncFn, env.syncInterval);
			})
			.on('denied', function(err){
				logger.error(`${TAG}: Replication of NLC training data record denied.`, err);
			})
			.on('error', function(err){
				let retryInterval = Math.min(env.syncInterval, 1000 * 60);
				logger.error(`${TAG}: Error during sync of NLC training data with Cloudant. Will retry in ${Math.floor(retryInterval / 1000)} seconds.`, err);
				setTimeout(syncFn, retryInterval);
			});
	}
	else {
		logger.warn(`${TAG}: Cloudant sync disabled. To enable set HUBOT_CLOUDANT_ENDPOINT and HUBOT_CLOUDANT_PASSWORD.`);
	}
};


DBManager.prototype.get = function(docId) {
	return this.db.get(docId);
};


DBManager.prototype.put = function(doc){
	return this.db.put(doc);
};


DBManager.prototype.post = function(classification, type, selectedClass) {
	return new Promise((resolve, reject) => {
		let doc = {
			type: type,
			ts: Date.now()
		};

		if (type === 'negative_fb'){
			doc.logs = classification;
		}
		else {
			doc.classification = classification;
		}

		if (selectedClass && type === 'learned') {
			doc.selectedClass = selectedClass;
			if (env.truthy(env.nlc_autoApprove)) {
				doc.approved = true;
				doc.approved_timestamp = Date.now();
				doc.approved_method = 'auto';
			}
		}

		// add confidence thresholds and bot version
		doc.lowConfidenceThreshold = env.lowThreshold;
		doc.highConfidenceThreshold = env.highThreshold;
		doc.botVersion = pjson.version;
		doc.botName = pjson.name;

		if (this.db){
			return this.db.post(doc).then((result) => {
				resolve(result);
			});
		}
		else {
			reject('Database needs to be open before calling put');
		}
	});
};


DBManager.prototype.createOrUpdate = function(newDoc){
	return new Promise((resolve, reject) => {
		if (newDoc._id) {
			return this.db.get(newDoc._id).then((doc) => {
				newDoc._rev = doc._rev;
				return this.db.put(newDoc);
			}).then(() => {
				resolve();
			}).catch(() => {
				// doc doesn't exist
				return this.db.put(newDoc).then(() => {
					resolve();
				}).catch((err) => {
					reject(err);
				});
			});
		}
		else {
			reject('document id is required for update');
		}
	});
};


DBManager.prototype.info = function(opts){
	return new Promise((resolve, reject) => {
		if (this.db){
			return this.db.info().then((info) => {
				if (opts && (opts.allDocs || opts.include_docs)){
					return this.db.allDocs(opts).then((allDocs) => {
						resolve(allDocs);
					});
				}
				else {
					resolve(info);
				}
			});
		}
		else {
			reject('Database needs to be open before calling info');
		}
	});
};


// ************** NLC specific methods ******************************* //

/**
 * Return configuration associated with a specific class name.
 *
 * @param  string className 	Name of the NLC classification.
 * @return {}           		Return object contains the following keys. {class, description, target, parameters}
 */
DBManager.prototype.getClassEmitTarget = function(className){
	return this.db.query(targetView, {
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
									return this.db.get(ref).then((doc) => {
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

DBManager.prototype.getClasses = function(approvedAfterDate){
	// assumption that the database can be held in memory
	// note classifier will break if this is not the case
	// return an array of [text, className]
	return new Promise((resolve, reject) => {
		let result = [];
		if (this.db){
			// get all of the class types
			return this.db.query(classesView, {
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


DBManager.prototype.getAutoApprove = function() {
	return env.truthy(env.nlc_autoApprove);
};

DBManager.prototype.setAutoApprove = function(approve) {
	if (typeof (approve) === 'boolean') {
		env.nlc_autoApprove = approve;
	}
	else {
		env.nlc_autoApprove = false;
	}
};


module.exports = DBManager;
