/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const path = require('path');
const events = require('events');
const eventEmitter = new events.EventEmitter();
const env = require('./env');
const HubotPouch = require('./hubotPouch');
const pjson = require(path.resolve(process.cwd(), 'package.json'));

const classesDesignDoc = '_design/classes';
const classesView = 'classes/byClass';
const targetView = 'classes/byTarget';


const pouch = new Promise((resolve, reject) => {
	try {
		const db = new HubotPouch();
		this.db = db;

		const syncFn = function(){
			let update = false;
			db.sync(`https://${env.cloudantKey}:${env.cloudantPassword}@${env.cloudantEndpoint}/${env.cloudantDb}`,
				{
					include_docs: true,
					filter: function(doc) {
						// filter client side documents that we don't want synchronized
						if (doc.storageType === 'private'){
							return false;
						}
						else {
							return true;
						}
					}
				})
				.on('change', function(change){
					update = true;
				})
				.on('complete', function(info){
					if (update){
						eventEmitter.emit('nlc.retrain');
					}
					setTimeout(syncFn, env.syncInterval);
				})
				.on('error', function(err){
					console.log(err);
					setTimeout(syncFn, env.syncInterval);
				});
		};

		return db.get('_design/classes').then(() => {
			// sync if enabled
			if (env.cloudantDb !== undefined)
				setTimeout(syncFn, env.syncInterval);
			resolve(this);
		}).catch(() => {
			// create design doc
			let ddoc = {
				_id: classesDesignDoc,
				views: {
					byClass: {
						map: 'function(doc) { if (doc.selectedClass && doc.approved){ emit(doc.selectedClass); } if (doc.class && doc.text){ emit(doc.class); }}'
					},
					byTarget: {
						map: 'function(doc){ if (doc.emittarget) { if(doc.description){ emit(doc._id, [doc.emittarget, doc.parameters, doc.description]); } else{ emit(doc._id, [doc.emittarget, doc.parameters]); }}}'
					}
				}
			};

			return db.put(ddoc).then(() => {
				// sync if not testing
				if (!env.test)
					setTimeout(syncFn, env.syncInterval);
				resolve(this);
			}).catch((err) => {
				reject(err);
			});
		});

	}
	catch (e) {
		reject(e);
	}
});

module.exports.open = function() {
	return pouch;
};


/**
 * Return configuration associated with a specific class name.
 *
 * @param  string className 	Name of the NLC classification.
 * @return {}           		Return object contains the following keys. {class, description, target, parameters}
 */
module.exports.getClassEmitTarget = function(className){
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
					return null;
				});
			}
			else {
				// no parameters
				return resp;
			}
		}
		else {
			return null;
		}
	});
};

module.exports.getClasses = function(){
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
				for (let row of res.rows){
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

module.exports.get = function(docId) {
	return this.db.get(docId);
};

module.exports.put = function(doc){
	return this.db.put(doc);
};

module.exports.post = function(classification, type, selectedClass) {
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

		if (selectedClass) {
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

module.exports.createOrUpdate = function(newDoc){
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

module.exports.info = function(opts){
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
