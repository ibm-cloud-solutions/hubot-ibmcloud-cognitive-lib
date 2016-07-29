/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const expect = require('chai').expect;
const nlcconfig = require('../index').nlcconfig;
const ParamManager = require('../src/lib/paramManager');
const initDb = require('../src/lib/initDb');
const mockParam = require('./paramManager.mock');

const nlcFile = 'test/resources/mock.seed.json';

let paramManager;

describe('Testing Param Manager', function() {

	before('Setup up Param Manager', function() {
		paramManager = new ParamManager();
	});

	before(function(){
		return initDb.init(nlcFile).then((db) => {
			this.db = db;
		}).catch((err) => {
			// safe to ignore doc update conflicts
			if (err.status !== 409){
				throw err;
			}
		});

	});

	before('Add well-known application names', function(done) {
		nlcconfig.updateGlobalParameterValues('test_appname', ['knownapp1', 'knownapp2']).then(function() {
			done();
		}).catch(function(error) {
			done(error);
		});
	});

	before(function() {
		return mockParam.setupMockery();
	});

	context('Test various statements for app.list', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.list').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I want to list all my applications\'', function(done) {
			return paramManager.getParameters('app.list', 'I want to list all my applications', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.start', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.start').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I want to start knownapp1 app\'', function(done) {
			return paramManager.getParameters('app.start', 'I want to start knownapp1 app', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.eql('knownapp1');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Start app TestApp\'', function(done) {
			return paramManager.getParameters('app.start', 'Start app TestApp', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.eql('TestApp');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I want to start the application TestApp\'', function(done) {
			return paramManager.getParameters('app.start', 'I want to start the application TestApp', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.eql('TestApp');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Start TestApp\'', function(done) {
			return paramManager.getParameters('app.start', 'Start TestApp', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.eql('TestApp');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I am in the mood to begin execution of the application named TestApp.\'', function(done) {
			return paramManager.getParameters('app.start', 'I am in the mood to begin execution of the application named TestApp.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.appname).to.eql.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Start my application\'', function(done) {
			return paramManager.getParameters('app.start', 'Start my application', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.appname).to.eql.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.test.1', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.1').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Please show me my most problematic applications this week\'', function(done) {
			return paramManager.getParameters('app.test.1', 'Please show me my most problematic applications this week', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.timeframe).to.eql('this week');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Please show me today\'s problematic apps\'', function(done) {
			return paramManager.getParameters('app.test.1', 'Please show me today\'s problematic apps', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.timeframe).to.eql('today');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Display the apps with the most problems last month.\'', function(done) {
			return paramManager.getParameters('app.test.1', 'Display the apps with the most problems last month.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.timeframe).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Show me the most problematic applications\'', function(done) {
			return paramManager.getParameters('app.test.1', 'Show me the most problematic applications', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.timeframe).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.test.2', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.2').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Set my cpu threshold to 50%\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Set my cpu threshold to 50%', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.alerttype).to.eql('cpu');
				expect(parameters.threshold).to.eql('50');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Alert me when the memory exceeds to 84 percent\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Alert me when the memory exceeds to 84 percent', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.alerttype).to.eql('memory');
				expect(parameters.threshold).to.eql('84');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Notify me if 75% threshold exceeded for disk usage\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Notify me if 75% threshold exceeded for disk usage', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.alerttype).to.eql('disk');
				expect(parameters.threshold).to.eql('75');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Set all of the thresholds to 90%\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Set all of the thresholds to 90%', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.alerttype).to.eql('all');
				expect(parameters.threshold).to.eql('90');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Notify me when events occur\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Notify me when events occur', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.alerttype).to.eql('events');
				expect(parameters.threshold).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Set threshold to 49%\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Set threshold to 49%', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.alerttype).to.be.undefined;
				expect(parameters.threshold).to.eql('49');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I\'d like to be notified when my thresholds exceed 84 percent\'', function(done) {
			return paramManager.getParameters('app.test.2', 'I\'d like to be notified when my thresholds exceed 84 percent', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.alerttype).to.be.undefined;
				expect(parameters.threshold).to.eql('84');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Alert me when thresholds are exceeded\'', function(done) {
			return paramManager.getParameters('app.test.2', 'Alert me when thresholds are exceeded', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.alerttype).to.be.undefined;
				expect(parameters.threshold).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});


	context('Test various statements for app.test.3', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.3').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Scale knownapp1 to 3 instances\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Scale knownapp1 to 3 instances', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('knownapp1');
				expect(parameters.instances).to.eql('3');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Scale knownapp2 to 2\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Scale knownapp2 to 2', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('knownapp2');
				expect(parameters.instances).to.eql('2');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Set the number of instances of TestApp to 4\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Set the number of instances of TestApp to 4', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('TestApp');
				expect(parameters.instances).to.eql('4');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Set TestApp instances at 10\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Set TestApp instances at 10', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('TestApp');
				expect(parameters.instances).to.eql('10');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Scale to 9 instances\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Scale to 9 instances', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.be.undefined;
				expect(parameters.instances).to.eql('9');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Scale my knownapp1 application\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Scale my knownapp1 application', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.eql('knownapp1');
				expect(parameters.instances).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Scale my app\'', function(done) {
			return paramManager.getParameters('app.test.3', 'Scale my app', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.appname).to.be.undefined;
				expect(parameters.instances).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.test.4', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.4').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Deploy knownapp1 to https://github.com/testuser/test-repo-name\'', function(done) {
			return paramManager.getParameters('app.test.4', 'Deploy knownapp1 to https://github.com/testuser/test-repo-name', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('knownapp1');
				expect(parameters.reponame).to.eql('https://github.com/testuser/test-repo-name');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I\'d like to deploy my knownapp2 app to http://github.com/testuser/test-repo-name\'', function(done) {
			return paramManager.getParameters('app.test.4', 'I\'d like to deploy my knownapp2 app to http://github.com/testuser/test-repo-name', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('knownapp2');
				expect(parameters.reponame).to.eql('http://github.com/testuser/test-repo-name');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Deploy the TestApp application from https://github.com/testuser2/test-repo-name2\'', function(done) {
			return paramManager.getParameters('app.test.4', 'Deploy the TestApp application from https://github.com/testuser2/test-repo-name2', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.appname).to.eql('TestApp');
				expect(parameters.reponame).to.eql('https://github.com/testuser2/test-repo-name2');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Deploy http://github.com/testuser/test-repo-name\'', function(done) {
			return paramManager.getParameters('app.test.4', 'Deploy http://github.com/testuser/test-repo-name', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.be.undefined;
				expect(parameters.reponame).to.eql('http://github.com/testuser/test-repo-name');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Deploy knownapp2\'', function(done) {
			return paramManager.getParameters('app.test.4', 'Deploy knownapp2', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.appname).to.eql('knownapp2');
				expect(parameters.reponame).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Deploy my app from testuser/test-repo-name\'', function(done) {
			return paramManager.getParameters('app.test.4', 'Deploy my app from testuser/test-repo-name', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.appname).to.be.undefined;
				expect(parameters.reponame).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Deploy my app\'', function(done) {
			return paramManager.getParameters('app.test.4', 'Deploy my app', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.appname).to.be.undefined;
				expect(parameters.reponame).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.test.5', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.5').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I want to invoke openwhisk action run\'', function(done) {
			return paramManager.getParameters('app.test.5', 'I want to invoke openwhisk action run', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.actionname).to.eql('run');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Invoke jump openwhisk action\'', function(done) {
			return paramManager.getParameters('app.test.5', 'Invoke jump openwhisk action', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.actionname).to.eql('jump');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I\'d like to initiate kick from openwhisk.\'', function(done) {
			return paramManager.getParameters('app.test.5', 'I\'d like to initiate kick from openwhisk.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.actionname).to.eql('kick');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Launch openwhisk action to drop things.\'', function(done) {
			return paramManager.getParameters('app.test.5', 'Launch openwhisk action to drop things.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.actionname).to.eql('drop');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Invoke openwhisk punt\'', function(done) {
			return paramManager.getParameters('app.test.5', 'Invoke openwhisk punt', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.actionname).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Launch openwhisk action\'', function(done) {
			return paramManager.getParameters('app.test.5', 'Launch openwhisk action', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.actionname).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.test.6', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.6').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Open github issue at testuser/test-repo-name when applications crash\'', function(done) {
			return paramManager.getParameters('app.test.6', 'Open github issue at testuser/test-repo-name when applications crash', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.username).to.eql('testuser');
				expect(parameters.reponame).to.eql('test-repo-name');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Create issue at testuser2/test-repo-name2 on app crash\'', function(done) {
			return paramManager.getParameters('app.test.6', 'Create issue at testuser2/test-repo-name2 on app crash', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(2);
				expect(parameters.username).to.eql('testuser2');
				expect(parameters.reponame).to.eql('test-repo-name2');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Open issue at testuser2 test-repo-name2 on app crash\'', function(done) {
			return paramManager.getParameters('app.test.6', 'Open issue at testuser2 test-repo-name2 on app crash', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.username).to.be.undefined;
				expect(parameters.reponame).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'If app crashes, open an issue.\'', function(done) {
			return paramManager.getParameters('app.test.6', 'If app crashes, open an issue.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.username).to.be.undefined;
				expect(parameters.reponame).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for app.test.7', function() {
		var classParameters;

		before(function(done) {
			return nlcconfig.getClassEmitTarget('app.test.7').then(function(tgt) {
				classParameters = tgt.parameters;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I would like to know the weather for Raleigh, NC.\'', function(done) {
			return paramManager.getParameters('app.test.7', 'I would like to know the weather for Raleigh, NC.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.city).to.eql('Raleigh');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'I would like to know the weather in London\'', function(done) {
			return paramManager.getParameters('app.test.7', 'I would like to know the weather in London', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.city).to.eql('London');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'What\'s the weather in Paris, France.\'', function(done) {
			return paramManager.getParameters('app.test.7', 'What\'s the weather in Paris, France.', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.city).to.eql('Paris');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'What is the weather in Chapel Hill?\'', function(done) {
			return paramManager.getParameters('app.test.7', 'What is the weather in Chapel Hill?', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(1);
				expect(parameters.city).to.eql('Chapel Hill');
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'What\'s the weather like on July, 4 2016?\'', function(done) {
			return paramManager.getParameters('app.test.7', 'What\'s the weather like on July, 4 2016?', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.city).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

		it('Verify \'Weather?\'', function(done) {
			return paramManager.getParameters('app.test.7', 'Weather?', classParameters).then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				expect(parameters.city).to.be.undefined;
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

	context('Test various statements for invalid class', function() {

		it('Verify \'I want to generate an error\'', function(done) {
			return paramManager.getParameters('invalidclass', 'I want to generate an error').then(function(parameters) {
				expect(Object.keys(parameters).length).to.eql(0);
				done();
			}).catch(function(error) {
				done(error);
			});
		});

	});

});
