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

let managedDBs = {};
/**
 * Provides access to a local database instance and manages its replication.
 *
 * @param {options} Object with the following configuration.
 *        options.localDbName = Name of local db, such as nlc.
 *        options.remoteDbName = Name of the remote database to use for replication.
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
	this.remoteDbName = options.remoteDbName ? options.remoteDbName : this.localDbName;
	this.db = PouchDB.open(this.localDbName);

	initializeDB(this.db).then(() => {
		syncFn(this.db, this.localDbName, this.remoteDbName);
	}).catch((error) => {
		logger.error(`${TAG}: Unable to start sync for [${this.localDbName}] because`, error);
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
				logger.error(`${TAG}: Error initializing Cloudant sync`, err);
				reject(err);
			});
		});
	});
}


function syncFn(db, localDbName, remoteDbName){
	if (!env.test && env.cloudantEndpoint && env.cloudantPassword) {
		logger.info(`${TAG}: Starting sync of database ${localDbName} with remote Cloudant db ${remoteDbName} @ ${env.cloudantEndpoint}.`);

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

				setTimeout(function(){
					syncFn(db, localDbName, remoteDbName);
				}, env.syncInterval);
			})
			.on('denied', function(err){
				logger.error(`${TAG}: Authorization problem during sync of database [${localDbName}] with remote Cloudant database [${remoteDbName}].`, err);
			})
			.on('error', function(err){
				let retryInterval = Math.min(env.syncInterval, 1000 * 60);
				logger.error(`${TAG}: Error during sync of database [${localDbName}] with remote Cloudant database [${remoteDbName}]. Will retry in ${Math.floor(retryInterval / 1000)} seconds.`, err);

				setTimeout(function(){
					syncFn(db, localDbName, remoteDbName);
				}, retryInterval);
			});
	}
	else {
		logger.warn(`${TAG}: Cloudant sync disabled. To enable set HUBOT_CLOUDANT_ENDPOINT and HUBOT_CLOUDANT_PASSWORD.`);
	}
};

/**
 * @deprecated Keeping this here for compability with the previous implementation, must remove once dependencies are updated.
 */
DBManager.prototype.open = function() {
	return new Promise((resolve, reject) => {
		resolve(this.db);
	});
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
