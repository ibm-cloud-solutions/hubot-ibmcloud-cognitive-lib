/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const expect = require('chai').expect;
const env = require('../src/lib/env');
const nlcconfig = require('../index').nlcconfig;
const ParamManager = require('../src/lib/paramManager');
const initDb = require('../src/lib/initDb');

const nlcFile = 'test/resources/mock.seed.json';

let paramManager;

describe('Testing Param Manager', function() {
	var saveAlchemyUri = null;

	before('Null alchemy uri and setup up Param Manager', function() {
		saveAlchemyUri = env.alchemy_url;
		env.alchemy_url = null;
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

	after('Restore env', function() {
		env.alchemy_url = saveAlchemyUri;
	});

	// Make sure these work independently of alchemy
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

	});

	// Make sure that these now fail
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
				done(new Error('Expected error indicating that Watson alchemy service has not been configured'));
			}).catch(function(error) {
				if (error) {
					done();
				}
				else {
					done(new Error('Expected an error indicating that Watson alchemy service has not been configured'));
				}
			});
		});

		it('Verify \'I would like to know the weather in London\'', function(done) {
			return paramManager.getParameters('app.test.7', 'I would like to know the weather in London', classParameters).then(function(parameters) {
				done(new Error('Expected error indicating that Watson alchemy service has not been configured'));
			}).catch(function(error) {
				if (error) {
					done();
				}
				else {
					done(new Error('Expected an error indicating that Watson alchemy service has not been configured'));
				}
			});
		});

		it('Verify \'What\'s the weather in Paris, France.\'', function(done) {
			return paramManager.getParameters('app.test.7', 'What\'s the weather in Paris, France.', classParameters).then(function(parameters) {
				done(new Error('Expected error indicating that Watson alchemy service has not been configured'));
			}).catch(function(error) {
				if (error) {
					done();
				}
				else {
					done(new Error('Expected an error indicating that Watson alchemy service has not been configured'));
				}
			});
		});

		it('Verify \'What is the weather in Chapel Hill?\'', function(done) {
			return paramManager.getParameters('app.test.7', 'What is the weather in Chapel Hill?', classParameters).then(function(parameters) {
				done(new Error('Expected error indicating that Watson alchemy service has not been configured'));
			}).catch(function(error) {
				if (error) {
					done();
				}
				else {
					done(new Error('Expected an error indicating that Watson alchemy service has not been configured'));
				}
			});
		});

		it('Verify \'What\'s the weather like on July, 4 2016?\'', function(done) {
			return paramManager.getParameters('app.test.7', 'What\'s the weather like on July, 4 2016?', classParameters).then(function(parameters) {
				done(new Error('Expected error indicating that Watson alchemy service has not been configured'));
			}).catch(function(error) {
				if (error) {
					done();
				}
				else {
					done(new Error('Expected an error indicating that Watson alchemy service has not been configured'));
				}
			});
		});

		it('Verify \'Weather?\'', function(done) {
			return paramManager.getParameters('app.test.7', 'Weather?', classParameters).then(function(parameters) {
				done(new Error('Expected error indicating that Watson alchemy service has not been configured'));
			}).catch(function(error) {
				if (error) {
					done();
				}
				else {
					done(new Error('Expected an error indicating that Watson alchemy service has not been configured'));
				}
			});
		});

	});

});
