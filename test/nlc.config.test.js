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
const descriptionText = 'Sample description text';

describe('Testing NLC Configuration', function() {

	before(function(done){
		return db.setup().then(() => {
			done();
		});
	});

	context('Verify class-related data is stored properly', function() {

		it('Verify getAllClasses()', function() {
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

		it('Verify getAllClasses(approvedAfterDate) - with new Date() object', function(){
			return nlcconfig.getAllClasses(new Date(Date.now() - 1000)).then(function(classes) {
				expect(classes.length).to.be.eql(3);
				expect(classes[0][0]).to.be.eql('should see this');
				expect(classes[0][1]).to.be.eql('approved');
			});
		});

		it('Verify getAllClasses(approvedAfterDate) - with date in ms', function(){
			return nlcconfig.getAllClasses(Date.now() - 1000).then(function(classes) {
				expect(classes.length).to.be.eql(3);
				expect(classes[0][0]).to.be.eql('should see this');
				expect(classes[0][1]).to.be.eql('approved');
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

		it('Verify getClassEmitTarget contains class description', function() {
			return nlcconfig.getClassEmitTarget(clz).then(function(tgt) {
				expect(tgt.description).to.eql(descriptionText);
			});
		});
	});

	context('Verify Auto Approve setter/getter', function() {
		it('Verify getAutoApprove contains correct value', function() {
			expect(nlcconfig.getAutoApprove()).to.eql(true);
		});

		it('Verify setAutoApprove sets correct value', function() {
			nlcconfig.setAutoApprove(false);
			expect(nlcconfig.getAutoApprove()).to.eql(false);
		});

		it('Verify setAutoApprove sets correct value', function() {
			nlcconfig.setAutoApprove(true);
			expect(nlcconfig.getAutoApprove()).to.eql(true);
		});
	});

	context('Verify entity function setter/getter', function() {

		function testFunc(robot, res, paramName, parameters) {
			return ['value1', 'value2', 'value3'];
		}

		it('Verify entity function setter/getter correct value', function() {
			nlcconfig.setGlobalEntityFunction('ns_testfunc', testFunc);
			let retFunc = nlcconfig.getGlobalEntityFunction('ns_testfunc');
			expect(typeof (retFunc)).to.eql('function');
			let retFuncResult = testFunc(null, null, null, null);
			expect(retFuncResult.length).to.eql(3);
			expect(retFuncResult[0]).to.eql('value1');
		});
	});
});
