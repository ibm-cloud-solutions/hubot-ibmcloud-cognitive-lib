/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const logger = require('./logger');


/**
 * Returns true if the given search string is found in the given statement.
 * @param statement The statement to search.
 * @param searchString The string to attempt to find within the statement.
 * @return true if found; false otherwise.
 */
function findStringInStatement(statement, searchString) {
	return (statement.indexOf(searchString) >= 0);
}

/**
 * Handle finding parameter value in statement for parameters of type 'entity'.
 * If one of the given entity values is found within the given statement, then it will be returned as
 * the entity value.
 * If one of the given entity values is not found within the given statement, then the given paramDecoder
 * is used to find any nouns. If one is found (but not more than one) then the
 * associated text value is returned.
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check.
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processEntity(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;

		// First, look for one of the given entityValues in the given statement.
		// If found, return it.
		if (entityValues) {
			for (var i = 0; (i < entityValues.length && !result); i++) {
				if (findStringInStatement(statement, entityValues[i])) {
					result = entityValues[i];
					logger.debug(`paramHandlers: processEntity(): Exit: Entity [${result}] found in statement [${statement}].`);
					resolve(result);
					break;
				}
			}
		}

		// Next, obtain nouns from the paramDecoder.
		// If there is one (and only one) then return it.
		if (!result) {
			logger.debug(`paramHandlers: processEntity(): Did not find any of the known entities [${entityValues}] in statement [${statement}]`);
			paramDecoder.getNouns().then(function(nouns) {
				if (nouns && nouns.length === 1) {
					result = nouns[0];
					logger.debug(`paramHandlers: processEntity(): Exit: Entity [${result}] found in statement [${statement}] using parts-of-speech.`);
				}
				else {
					logger.info(`paramHandlers: processEntity(): Exit: Entity cannot be pulled from statement [${statement}] using parts-of-speech because there is not just one noun; nouns = [${nouns}].`);
				}
				resolve(result);
			}).catch(function(err) {
				reject(err);
			});
		}

	});
}

/**
 * Handle finding parameter value in statement for parameters of type 'keyword'.
 * If one of the given entity values is found within the given statement, then it will be returned as
 * the keyword value.
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check.
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processKeyword(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;

		// First, look for one of the given entityValues in the given statement.
		// If found, return it.
		if (entityValues) {
			for (var i = 0; (i < entityValues.length && !result); i++) {
				if (findStringInStatement(statement, entityValues[i])) {
					result = entityValues[i];
					logger.debug(`paramHandlers: processKeyword(): Exit: Keyword [${result}] found in statement [${statement}].`);
					break;
				}
			}
		}

		if (!result) {
			logger.debug(`paramHandlers: processKeyword(): Did not find any of the known keywords [${entityValues}] in statement [${statement}]`);
		}

		resolve(result);

	});
}

/**
 * Handle finding parameter value in statement for parameters of type 'number'.
 * The given paramDecoder is used to find any numbers. If one is found (but not more than one) then the
 * associated number is returned (as a string).
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check (ignored).
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processNumber(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;

		// Obtain numbers from the paramDecoder.
		// If there is one (and only one) then return it.
		paramDecoder.getNumbers().then(function(numbers) {
			if (numbers && numbers.length === 1) {
				result = numbers[0];
				logger.debug(`paramHandlers: processNumber(): Exit: Number [${result}] found in statement [${statement}] using parts-of-speech.`);
			}
			else {
				logger.info(`paramHandlers: processNumber(): Exit: Number cannot be pulled from statement [${statement}] using parts-of-speech because there is not just one number; numbers = [${numbers}].`);
			}
			resolve(result);
		}).catch(function(err) {
			reject(err);
		});

	});
}

/**
 * Handle finding parameter value in statement for parameters of type 'repourl'.
 * The given statment is processed against a regular expression.  If found, the matched value is returned
 * as the entity value.
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check (ignored).
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processRepoUrl(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;
		const REGEX_REPOURL = /(.*)\s+(http[s]?:\/\/\S+)/i;

		// First, use the given regular expression to find the URL
		// If found, return it.
		var matches = statement.match(REGEX_REPOURL);
		if (matches && matches.length > 1 && matches[2]) {
			result = matches[2];
			logger.debug(`paramHandlers: processRepoUrl(): Exit: repoUrl [${result}] found in statement [${statement}] using regex.`);
		}
		else {
			logger.info(`paramHandlers: processRepoUrl(): Exit: repoUrl cannot be pulled from statement [${statement}] using regex; matches = [${matches}].`);
		}

		resolve(result);

	});
}

/**
 * Handle finding parameter value in statement for parameters of type 'reponame'.
 * The given statment is processed against a regular expression.  If found, the matched value is returned
 * as the entity value.
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check (ignored).
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processRepoName(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;
		const REGEX_USERREPO = /(.*)\s+(\w+)\/(\S+)/i;

		// First, use the given regular expression to find the reponame (expected format is repouser/reponame)
		// If found, return it.
		var matches = statement.match(REGEX_USERREPO);
		if (matches && matches.length > 2 && matches[3]) {
			result = matches[3];
			logger.debug(`paramHandlers: processRepoName(): Exit: repoName [${result}] found in statement [${statement}] using regex.`);
		}
		else {
			logger.info(`paramHandlers: processRepoName(): Exit: repoName cannot be pulled from statement [${statement}] using regex; matches = [${matches}].`);
		}

		resolve(result);

	});
}

/**
 * Handle finding parameter value in statement for parameters of type 'repouser'.
 * The given statment is processed against a regular expression.  If found, the matched value is returned
 * as the entity value.
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check (ignored).
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processRepoUser(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;
		const REGEX_USERREPO = /(.*)\s+(\w+)\/(\S+)/i;

		// First, use the given regular expression to find the reponame (expected format is repouser/reponame)
		// If found, return it.
		var matches = statement.match(REGEX_USERREPO);
		if (matches && matches.length > 1 && matches[2]) {
			result = matches[2];
			logger.debug(`paramHandlers: processRepoUser(): Exit: repoUser [${result}] found in statement [${statement}] using regex.`);
		}
		else {
			logger.info(`paramHandlers: processRepoUser(): Exit: repoUser cannot be pulled from statement [${statement}] using regex; matches = [${matches}].`);
		}

		resolve(result);

	});
}

/**
 * Handle finding parameter value in statement for parameters of type 'city'.
 * The given paramDecoder is used to find any entities of type 'City'. If one is found (but not more than one)
 * then the associated text value is returned.
 * @param statement The statement being processed.
 * @param paramDecoder The intance of the ParamDecoder to use to obtain nouns, numbers, or cities
 *        from the given statement.
 * @param entityValues An optional array of potential entity values to check (ignored).
 * @return A promise.  If successful the promise returns a parameter value.
 */
function processCity(statement, paramDecoder, entityValues) {
	return new Promise(function(resolve, reject) {
		var result;

		// Obtain cities from the paramDecoder.
		// If there is one (and only one) then return it.
		paramDecoder.getCityEntities().then(function(cities) {
			if (cities && cities.length === 1) {
				result = cities[0];
				logger.debug(`paramHandlers: processCity(): Exit: Cith [${result}] found in statement [${statement}] using Watson Alchemy API.`);
			}
			else {
				logger.info(`paramHandlers: processCity(): Exit: City cannot be pulled from statement [${statement}] using Watson Alchemy API because there is not just one city; city = [${cities}].`);
			}
			resolve(result);
		}).catch(function(err) {
			reject(err);
		});

	});
}

const PARAMETERTYPE_FUNCTIONS = {
	entity: processEntity,
	keyword: processKeyword,
	number: processNumber,
	repourl: processRepoUrl,
	reponame: processRepoName,
	repouser: processRepoUser,
	city: processCity
};

/**
 * Returns pre-defined handler for specified parameter type.
 */
exports.getHandler = function(paramType) {
	return PARAMETERTYPE_FUNCTIONS[paramType];
};
