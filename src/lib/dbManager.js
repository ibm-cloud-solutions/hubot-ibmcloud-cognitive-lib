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
const botIdentity = require('./botIdentity');
const request = require('request');

const pjson = require(path.resolve(process.cwd(), 'package.json'));
const classesDesignDoc = '_design/classes';

let managedDBs = {};
/**
 * Provides access to a local database instance and manages its replication.
 *
 * @param {Object} options  Object with the following configuration.
 *                         	- options.localDbName = Name of local db, such as nlc.
 *                         	- options.remoteDbName = Name of the remote database to use for replication. If undefined, user replication is disabled.
 */
function DBManager(options){
	// Reuse existing dbManager instances whenever possible
	if (managedDBs[options.localDbName] !== undefined){
		return managedDBs[options.localDbName];
	}

	// Validate options
	if (options.localDbName === undefined) {
		logger.error(`${TAG}: options.localDbName must be provided.`);
	}

	this.localDbName = (typeof options === 'string') ? options : options.localDbName;
	this.remoteDbName = options.remoteDbName;
	this.syncToUser = options.remoteDbName !== undefined;
	this.localDbPath = options.localDbPath ? options.localDbPath : env.dbPath;
	this.db = PouchDB.open(this.localDbName, this.localDbPath);

	initializeDB(this.db).then(() => {
		// Sync with user's Cloudant
		if (this.syncToUser) {
			let cloudantCreds = {endpoint: env.cloudantEndpoint, apikey: env.cloudantKey, password: env.cloudantPassword, dbname: this.remoteDbName};
			syncFn(this.db, cloudantCreds, {pull: true, push: true});
		}
		else {
			logger.debug(`${TAG}: Replication to user's Cloudant disabled for database [${this.localDbName}].`);
		}

		// Sync with Master Cloudant
		if (env.truthy(env.syncToMaster)){
			logger.info(`${TAG}: Anonymous reporting of cognitive feedback data is enabled for database [${this.localDbName}]. To disable set HUBOT_COGNITIVE_FEEDBACK_ENABLED to false.`);
			getMasterCreds(this.db, this.localDbName).then((masterCreds) => {
				syncFn(this.db, masterCreds, {pull: false, push: true});
			}).catch((error) => {
				logger.error(`${TAG}: Error retrieving master cloudant credentials for database [${this.localDbName}]. Unable to start replication.`, error);
			});
		}
		else {
			logger.warn(`${TAG}: Cognitive feedback reporting is disabled for database [${this.localDbName}]. Anonymous reporting of NLC results helps with improving the training data of your bot. To enable set HUBOT_COGNITIVE_FEEDBACK_ENABLED to true.`);
		}

	}).catch((error) => {
		logger.error(`${TAG}: Error initializing database [${this.localDbName}]. Cause:`, error);
	});

	managedDBs[this.localDbName] = this;
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

			db.put(ddoc).then(() => {
				resolve();
			}).catch((err) => {
				logger.error(`${TAG}: Error initializing database [${db._db_name}].`, err);
				reject(err);
			});
		});
	});
}


/**
 * Obtains credentials to the Master Cloudant database for sync.
 * @param  {object} db          PouchDB database
 * @param  {string} localDbName name of the local Pouch Database.
 * @return {Promise}            Resolves to object with Master Cloudant credentials
 */
function getMasterCreds(db, localDbName){
	return new Promise((resolve, reject) => {
		db.get('botInfo').then((botInfo) => {
			logger.debug(`${TAG}: Replicating [${localDbName}] to master using saved credentials.`);
			let cloudantCreds = botInfo.masterCloudantCreds;
			resolve(cloudantCreds);
		}).catch((error) => {
			if (error.status === 404){
				botIdentity.getBotName().then((botName) => {
					logger.debug(`${TAG}: Using bot name [${botName}]`);
					let botUID = botIdentity.getBotUID();
					let remoteDbName = (botName + '_' + localDbName + '_' + botUID).replace(' ', '').toLowerCase();

					request('https://' + env.syncToMasterEndpoint + '/generate?botid=' + remoteDbName, (error, response, body) => {
						if (error) {
							logger.error(`${TAG}: Error getting master Cloudant keys to replicate [${localDbName}].`, error);
							reject(error);
						}
						else {
							logger.debug(`${TAG}: Got Master Cloudant credentials to replicate [${localDbName}].`);
							let cloudantCreds = JSON.parse(body);

							db.put({_id: 'botInfo', botName: botName, localDbName: localDbName, botId: botUID, masterCloudantCreds: cloudantCreds}).then(() => {
								logger.debug(`${TAG}: Saved master Cloudant keys for local db [${localDbName}].`);
							}).catch((error) => {
								logger.error(`${TAG}: Error saving botInfo document in [${localDbName}]`, error);
							});

							resolve(cloudantCreds);
						}
					});
				}).catch((error) => {
					logger.error(`${TAG}: Error getting bot name.`, error);
				});
			}
			else {
				logger.error(`${TAG} Unexpected error retrieving botInfo from [${localDbName}]`, error);
				reject(error);
			}
		});
	});
}

/**
 * Synchronizes the training data for cognitive services.
 * @param  {object} db          PouchDB object.
 * @param  {JSON} cloudantCreds Must contain ALL of the following fields
 *                                - cloudantCreds.endpoint - Cloudant account. Typically cloudantUserId.cloudant.com
 *                                - cloudantCreds.apikey - apikey with _read and _write permissions on the remote database.
 *                                - cloudantCreds.password - password for the apikey.
 *                                - cloudantCreds.dbname - Name of the remote database
 * @param  {JSON} options       Replication options:
 *                                - pull - Defaults to true. Controls weather documents from the remote database are saved locally.
 *                                - push - Defaults to true. Controls weather local documents are sent to the remote database.
 */
function syncFn(db, cloudantCreds, options){
	if (cloudantCreds.endpoint && cloudantCreds.password && cloudantCreds.apikey) {
		logger.debug(`${TAG}: Starting sync of database [${db._db_name}] with remote Cloudant db ${cloudantCreds.dbname} @ ${cloudantCreds.endpoint}.`);

		db.sync(`https://${cloudantCreds.apikey}:${cloudantCreds.password}@${cloudantCreds.endpoint}/${cloudantCreds.dbname}`,
			{
				push: {
					include_docs: true,
					filter: function(doc) {
						// filter client side documents that we don't want synchronized
						return options.push && doc._id.indexOf('_design/') < 0 && doc.storageType !== 'private';
					}
				},
				pull: {
					filter: function(doc) {
						return options.pull ? options.pull : false;
					}
				}
			})
			.on('complete', function(info){
				logger.info(`${TAG}: Completed sync of database [${db._db_name}] with Cloudant.`);
				logger.debug(`${TAG}: Results for sync of database ${db._db_name} to ${cloudantCreds.dbname}.`, info);

				setTimeout(function(){
					syncFn(db, cloudantCreds, options);
				}, env.syncInterval);
			})
			.on('denied', function(err){
				logger.error(`${TAG}: Authorization problem during sync of database [${db._db_name}] with remote Cloudant database [${cloudantCreds.dbname}].`, err);
			})
			.on('error', function(err){
				let retryInterval = Math.min(env.syncInterval, 1000 * 60);
				logger.error(`${TAG}: Error during sync of database [${db._db_name}] with remote Cloudant database [${cloudantCreds.dbname}]. Will retry in ${Math.floor(retryInterval / 1000)} seconds.`, err);

				setTimeout(function(){
					syncFn(db, cloudantCreds, options);
				}, retryInterval);
			});
	}
	else {
		logger.warn(`${TAG}: Cloudant sync disabled. To enable set HUBOT_CLOUDANT_ENDPOINT and HUBOT_CLOUDANT_PASSWORD.`);
	}
};


/**
 * Retrieve a document from the database.
 * @param  {String} docId ID of the document.
 * @return {Object}       Retrieved document.
 */
DBManager.prototype.get = function(docId) {
	return this.db.get(docId);
};

/**
 * Saves a document to the database
 * @param  {Object} doc Document to save in the database
 * @return {Object}     Result of the save operation
 */
DBManager.prototype.put = function(doc){
	return this.db.put(doc);
};


DBManager.prototype.query = function(view, opts) {
	return this.db.query(view, opts);
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


/**
 * Retrieves information for the database
 * @param  {Obect} opts CouchDB options
 * @return {Object}     CouchDB information about the database.
 */
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


module.exports = DBManager;
