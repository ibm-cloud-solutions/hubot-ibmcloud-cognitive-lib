/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';
const DBManager = require('../src/lib/dbManager');
const nlc_db = new DBManager({localDbName: 'nlc'});
const rr_db = new DBManager({localDbName: 'rr'});

const learned = require('./resources/training.local.learned.json');
const unclassified = require('./resources/training.local.unclassified.json');
const clz = 'test.class';
const emittarget = 'test.class.js';
const descriptionText = 'Sample description text';

const open = new Promise((resolve, reject) => {
	return nlc_db.put({
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
		return nlc_db.put({
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
		return nlc_db.put({
			_id: 'sample_classification',
			class: clz,
			text: 'test data',
			storageType: 'private'
		});
	}).then(() => {
		return nlc_db.put({
			_id: 'cd02b5x110-nlc-0000',
			type: 'classifier_data',
			trainedData: 'This classifier should be deleted.'
		});
	}).then(() => {
		return nlc_db.put({
			_id: 'classifier-data-123',
			type: 'classifier_data',
			trainedData: 'Sample classification text,classification\nSample classification text 2,classification\nSample classification text 3,classification3'
		});
	}).then(() => {
		return nlc_db.put(learned);
	}).then(() => {
		return nlc_db.put(unclassified);
	}).then(() => {
		// not approved
		return nlc_db.put({
			_id: 'not.approved',
			selectedClass: 'notApproved',
			text: 'should not see this'
		});
	}).then(() => {
		// approved
		return nlc_db.put({
			_id: 'approved',
			selectedClass: 'approved',
			approved: true,
			approved_timestamp: Date.now(),
			approved_method: 'manual',
			text: 'should see this'
		});
	}).then(() => {
		// approved
		return rr_db.put({
			_id: 'approved',
			selectedClass: 'approved',
			approved: true,
			approved_timestamp: Date.now(),
			approved_method: 'manual',
			text: 'should see this'
		});
	}).then(() => {
		return rr_db.put({
			_id: 'cd02b5x110-rr-0000',
			type: 'ranker_data',
			trainedData: 'This ranker should be deleted.'
		});
	}).then(() => {
		return rr_db.put({
			_id: 'ranker-data-123',
			type: 'ranker_data',
			trainedData: 'Sample ranking text,ranking\nSample ranking text 2,ranking\nSample ranking text 3,ranking3'
		});
	}).then(() => {
		resolve({nlcDb: nlc_db, rrDb: rr_db});
	}).catch((err) => {
		reject(err);
	});
});

module.exports.setup = function(){
	return open;
};
