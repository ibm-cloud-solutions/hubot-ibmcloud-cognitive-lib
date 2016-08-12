/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const env = require('./env');
const logger = require('./logger');
const watson = require('watson-developer-cloud');
const nlcconfig = require('./nlcconfig');
const paramHandlers = require('./paramHandlers');
const ParamDecoder = require('./paramDecoder');

let textsByClass;

/**
 * Creates an object that manages the gleaning of parameter values from statements.
 * @constructor
 */
function ParamManager() {

	logger.debug('ParamManager: ctor(): Entry');
	// Update the Watson Alchemy constructor options
	if (env.alchemy_url && env.alchemy_apikey) {
		var alchemy_ctor_opts = {};
		alchemy_ctor_opts.url = env.alchemy_url;
		alchemy_ctor_opts.apikey = env.alchemy_apikey;

		// Create Watson Alchemy instance with options
		this.alchemy = watson.alchemy_language(alchemy_ctor_opts);
	}

	else {
		logger.warn('ParamManager: ctor(): Watson Alchemy is not configured. To configure set the HUBOT_WATSON_ALCHEMY_URL and HUBOT_WATSON_ALCHEMY_APIKEY environment variables.');
		this.alchemy = null;
	}

	logger.debug('ParamManager: ctor(): Exit');
}

/**
 * Returns an array of the seeded text strings corresponding to the given class name.
 * If the seeded text strings have not been obtained yet, do it.
 * @param className The name of the class for which the seeded text strings are requested.
 * @return Returns (in the promise) an array of seeded text strings corresponding to the given class name.
 */
function getTextsByClass(className) {
	return new Promise(function(resolve, reject) {

		if (!textsByClass) {
			textsByClass = {};
			nlcconfig.getAllClasses().then(function(classes) {
				for (var i = 0; i < classes.length; i++) {
					var classItem = classes[i];
					var text = classItem[0];
					var cName = classItem[1];
					var texts = textsByClass[cName] || [];
					texts.push(text);
					textsByClass[cName] = texts;
				}
				resolve(textsByClass[className]);
			}).catch(function(error) {
				reject(error);
			});
		}
		else {
			resolve(textsByClass[className]);
		}

	});
}

/**
 * Obtain parameter type handler for the given parameter type.
 * First, the pre-defined functions are searched.
 * Second, the stored functions are searched.
 * @param parameterType The type of parameter (entity, keyword, number, repourl, reponame, repouser, city, datetime, or
 *                      a project-specific type).
 * @return The function that handles the specified parameter type.
 */
function getParameterTypeFunction(parameterType) {
	return new Promise(function(resolve, reject) {

		// Find a pre-defined function to handle this type of parameter
		var parameterTypeFunction = paramHandlers.getHandler(parameterType);

		// If there is a pre-defined function, return it
		if (parameterTypeFunction) {
			resolve(parameterTypeFunction);
		}

		// If there is no pre-defined function, return error
		else {
			logger.error(`ParamManager: getParameterTypeFunction(): No function found to handle parameter type ${parameterType}`);
			reject(new Error(`Unable to find parameter type function to handle parameter type ${parameterType}`));
		}

	});
}

/**
 * Process a parameter associated with a pre-defined class.
 * The input is the statement, a parameter decoder instance, and the class parameter definition.
 * The output is the parameter value.
 * @param statement The statement to process against the parameter.
 * @param paramDecoder An instance of the ParamDecoder to used to obtain partsOfSpeech and entities.
 * @param className The name of the class being processed.
 * @param classParameter The definition of the parameter from the class definition.
 * @return The parameter value.
 */
function processClassParameter(statement, paramDecoder, className, classParameter) {
	return new Promise(function(resolve, reject) {

		// Find a pre-defined function to handle this type of parameter
		getParameterTypeFunction(classParameter.type).then(function(parameterTypeFunction) {
			var entityValues = classParameter.values;
			parameterTypeFunction(statement, paramDecoder, entityValues).then(function(paramValue) {
				resolve(paramValue);
			}).catch(function(error) {
				reject(error);
			});
		}).catch(function(error) {
			reject(error);
		});

	});
}

/**
 * Attempts to pull parameter values from the given statement for parameters specified in the given class'
 * definition.  The class to use is derived from the natural language processing.
 * For each required parameter (specified in the class' definition), a paramHandler for the parameter's type is
 * found and invoked to obtain a parameter value.  On the invocation to each paramHandler, a ParamDecoder instance is
 * provided.  This decoder can be used by the paramHandler to obtain tokens, partsOfSpeech, and/or entities from
 * the statement using various services.
 * An object is returned specifying a value for each parameter (if a value is found).
 * @param className The name of the class being processed.
 * @param statement The statement to process (containing the parameter values).
 * @param classParameters The class parameters defined for the class being processed.
 * @param textsForClass The set of seeded texts associated with the given class.
 * @return A map of parameter name -> parameter value.
 */
function processStatement(className, statement, classParameters, alchemy, textsForClass) {
	return new Promise(function(resolve, reject) {

		// Create an instance of the decoder to use
		var paramDecoder = new ParamDecoder(statement, alchemy, textsForClass);

		// Obtain parameter values for all parameters
		var paramHandlers = [];
		for (var i = 0; i < classParameters.length; i++) {
			paramHandlers.push(processClassParameter(statement, paramDecoder, className, classParameters[i]));
		}
		Promise.all(paramHandlers).then(function(results) {

			// Initialize returned set of parameter values (key/value pairs)
			var parameters = {};

			// Gather all the resulting parameters into a single object
			for (var j = 0; j < results.length; j++) {
				if (results[j]) parameters[classParameters[j].name] = results[j];
			}

			// We're done; return the parameter values object
			resolve(parameters);

		}).catch(function(err) {
			reject(err);
		});

	});
};

/**
 * Attempts to pull parameter values from the given statement for parameters specified in the given class'
 * definition.  The class to use is derived from the natural language processing.
 * For each required parameter (specified in the class' definition), a paramHandler for the parameter's type is
 * found and invoked to obtain a parameter value.  On the invocation to each paramHandler, a ParamDecoder instance is
 * provided.  This decoder can be used by the paramHandler to obtain tokens, partsOfSpeech, and/or entities from
 * the statement using various services.
 * An object is returned specifying a value for each parameter (if a value is found).
 * @param className The name of the class being processed.
 * @param statement The statement to process (containing the parameter values).
 * @param classParameters The class parameters defined for the class being processed.
 * @return A map of parameter name -> parameter value.
 */
ParamManager.prototype.getParameters = function(className, statement, classParameters) {
	var self = this;
	return new Promise(function(resolve, reject) {
		logger.info(`ParamManager: getParameters(): Entry. className = ${className}; statement = ${statement}; classParameters = ${JSON.stringify(classParameters)}.`);

		// If the ParamManager is disabled, then return an empty set of parameters
		if (env.paramParsingDisabled) {
			logger.info('ParamManager: getParameters(): Exit. parameters = {}.');
			resolve({});
		}

		// If there are any parameter values to be obtained; obtain them
		else if (classParameters && classParameters.length > 0) {

			// Obtain the set of seeded text strings associated with the class (used by ParamDecoder)
			getTextsByClass(className).then(function(textsForClass) {
				logger.debug(`ParamManager: getParameters(): textsForClass = ${textsForClass}.`);

				// Make a first pass at obtaining the parameter values based on the original statement.
				logger.debug('ParamManager: getParameters(): Begin pass 1.');
				processStatement(className, statement, classParameters, self.alchemy, textsForClass).then(function(parameters) {
					logger.debug(`ParamManager: getParameters(): End pass 1; parameters = ${JSON.stringify(parameters)}.`);

					// Go through the parameter values obtained and see if any are missing.
					// In addition, remove any parameter values that were found from the statement.
					var newStatement = statement;
					var newClassParameters = [];
					for (var i = 0; i < classParameters.length; i++) {
						var paramValue = parameters[classParameters[i].name];
						if (!paramValue) {
							newClassParameters.push(classParameters[i]);
						}
						else {
							newStatement = newStatement.replace(paramValue, '');
						}
					}

					// If there are any missing parameter values, make a second pass at obtaining the
					// missing parameter values based on the modified statement (having removed all found parameter values).
					if (newClassParameters.length > 0) {
						logger.debug(`ParamManager: getParameters(): Begin pass 2; newStatement = ${newStatement}; newClassParameters = ${newClassParameters}.`);
						processStatement(className, newStatement, newClassParameters, self.alchemy, textsForClass).then(function(newParameters) {
							logger.debug(`ParamManager: getParameters(): End pass 1; parameters = ${JSON.stringify(newParameters)}.`);
							for (var j = 0; j < newClassParameters.length; j++) {
								var paramName = newClassParameters[j].name;
								if (newParameters[paramName]) parameters[paramName] = newParameters[paramName];
							}
							logger.info(`ParamManager: getParameters(): Exit. parameters = ${JSON.stringify(parameters)}.`);
							resolve(parameters);
						}).catch(function(err) {
							logger.info(`ParamManager: getParameters(): Exit with error. error = ${err}.`);
							reject(err);
						});
					}

					// If all parameter values were found, return them
					else {
						logger.info(`ParamManager: getParameters(): Exit. parameters = ${JSON.stringify(parameters)}.`);
						resolve(parameters);
					}

				}).catch(function(err) {
					logger.info(`ParamManager: getParameters(): Exit with error. error = ${err}.`);
					reject(err);
				});

			}).catch(function(err) {
				logger.info(`ParamManager: getParameters(): Exit with error. error = ${err}.`);
				reject(err);
			});

		}

		// If no parameters associated with class ... we're done.
		else {
			logger.info('ParamManager: getParameters(): Exit. parameters = {}.');
			resolve({});
		}

	});
};

module.exports = ParamManager;
