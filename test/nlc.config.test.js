/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const nlcconfig = require('../index').nlcconfig;
const expect = require('chai').expect;
const db = require('./setupTestDb');

const clz = 'test.class';
const emittarget = 'test.class.js';

describe('Testing NLC Configuration', function() {

	before(function(done){
		return db.setup().then(() => {
			done();
		});
	});

	context('Verify class-related data is stored properly', function() {

		it('Verify getAllClasses', function() {
			return nlcconfig.getAllClasses().then(function(classes) {
				// should be at least 1 class in the database
				// the seed db test increases the number of classes and the order
				// of execution may differ
				expect(classes.length).to.be.above(1);
				// check that there isn't a 'notApproved' class
				let approved = false;
				for (let arr of classes){
					let cls = arr[1];
					expect(cls).to.not.eql('notApproved');
					if (cls === 'approved'){
						approved = true;
					}
				}
				expect(approved).to.eql(true);
			});
		});

		it('Verify getClassEmitTarget', function() {
			return nlcconfig.getClassEmitTarget(clz).then(function(tgt) {
				expect(tgt.target).to.eql(emittarget);
			});
		});

		it('Verify getClassEmitTarget for invalid class', function() {
			return nlcconfig.getClassEmitTarget('invalidclass').then(function(tgt) {
				expect(tgt).to.be.null;
			});
		});
	});

});
