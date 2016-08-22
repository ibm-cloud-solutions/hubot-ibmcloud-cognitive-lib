/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const nlcDb = require('../index').nlcDb;

const learned = require('./resources/training.local.learned.json');
const unclassified = require('./resources/training.local.unclassified.json');
const clz = 'test.class';
const emittarget = 'test.class.js';
const descriptionText = 'Sample description text';

const open = new Promise((resolve, reject) => {
	return nlcDb.open().then((db) => {
		return db.put({
			_id: clz,
			emittarget: emittarget,
			description: descriptionText,
			parameters: [
				{
					name: 'actionname1',
					type: 'keyword',
					values: [
						'jump',
						'run',
						'drop',
						'kick'
					]
				},
				{
					name: 'actionname2',
					type: 'keyword',
					values: {
						$ref: 'test.global.parameters'
					}
				}
			],
			storageType: 'private'
		}).then(() => {
			return db.put({
				_id: 'test.global.parameters',
				values: [
					'cpu',
					'memory',
					'disk',
					'event',
					'all'
				]
			});
		}).then(() => {
			return db.put({
				_id: 'sample_classification',
				class: clz,
				text: 'test data',
				storageType: 'private'
			});
		}).then(() => {
			return db.put({
				_id: 'classifier-data-123',
				type: 'classifier_data',
				trainedData: 'Sample classification text,classification\nSample classification text 2,classification\nSample classification text 3,classification3'
			});
		}).then(() => {
			return db.put(learned);
		}).then(() => {
			return db.put(unclassified);
		}).then(() => {
			// not approved
			return db.put({
				_id: 'not.approved',
				selectedClass: 'notApproved',
				text: 'should not see this'
			});
		}).then(() => {
			// approved
			return db.put({
				_id: 'approved',
				selectedClass: 'approved',
				approved: true,
				approved_timestamp: Date.now(),
				approved_method: 'manual',
				text: 'should see this'
			});
		}).then(() => {
			resolve(db);
		}).catch((err) => {
			reject(err);
		});
	});
});

module.exports.setup = function(){
	return open;
};
