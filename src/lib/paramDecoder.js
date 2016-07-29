/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const env = require('./env');
const logger = require('./logger');
const pos = require('pos');
const _ = require('lodash');

/**
 * Handles decoding the given statement using various methods:
 *  - breaking down the statement into an array of 'words' (using salient)
 *  - breaking down the statement into parts-of-speech (using salient)
 *  - obtaining well-known entities (using Watson Alchemy)
 * @param inStatement    The statement to break down.
 * @param inAlchemy      An instance of watson alchemy to use to communicate with Watson alchemy service.
 * @param inSeedTexts    An array of the text statements associated with class.
 * @constructor
 */
function ParamDecoder(inStatement, inAlchemy, inSeedTexts) {

	// Store statement and alchemy instance
	this.statement = inStatement;
	this.alchemy = inAlchemy;
	this.alchemy_call_opts = {};
	this.seedTexts = inSeedTexts;

	// Update the Watson Alchemy invocation options
	if (env.alchemy_dataset) this.alchemy_call_opts.dataset = env.alchemy_dataset;
	this.alchemy_call_opts.text = this.statement;

	this.ignoreNouns;
	this.taggedWords;
	this.entities;

}

/**
 * Internal method that returns all nouns that appeared in any of the seed statements.
 * The assumption is that these nouns can be ignored as parameter values in chat statements.
 */
ParamDecoder.prototype.getNounsToIgnore = function() {
	var self = this;
	return new Promise(function(resolve, reject) {

		if (!self.ignoreNouns) {
			self.ignoreNouns = [ 'i' ];
			if (self.seedTexts) {
				for (var i = 0; i < self.seedTexts.length; i++) {
					var words = new pos.Lexer().lex(self.seedTexts[i]);
					var tagger = new pos.Tagger();
					var taggedWords = tagger.tag(words);
					for (var j = 0; j < taggedWords.length; j++) {
						var taggedWord = taggedWords[j];
						var twWord = taggedWord[0].toLowerCase();
						var twTag = taggedWord[1];
						if (twTag === 'NN' || twTag === 'NNP') {
							if (_.indexOf(self.ignoreNouns, twWord) < 0) {
								self.ignoreNouns.push(twWord);
							}
						}
					}
				}
			}
		}
		resolve(self.ignoreNouns);

	});
};

/**
 * Internal method that returns all tagged words from the statement using pos package.
 */
ParamDecoder.prototype.getTaggedWords = function() {
	var self = this;
	return new Promise(function(resolve, reject) {

		if (!self.taggedWords) {
			var words = new pos.Lexer().lex(self.statement);
			var tagger = new pos.Tagger();
			self.taggedWords = tagger.tag(words);
			resolve(self.taggedWords);
		}
		resolve(self.taggedWords);

	});
};

/**
 * Internal method that returns all entities from the statement using the Watson alchemy API.
 */
ParamDecoder.prototype.getEntities = function() {
	var self = this;
	return new Promise(function(resolve, reject) {

		if (!self.entities) {
			if (self.alchemy) {
				self.alchemy.entities(self.alchemy_call_opts, function(err, entities) {
					if (!err) {
						self.entities = entities;
						resolve(self.entities);
					}
					else {
						reject(err);
					}
				});
			}
			else {
				reject(new Error('The Watson alchemy service has not been configured; the entities cannot be retrieved.'));
			}
		}
		else {
			resolve(self.entities);
		}

	});
};

/**
 * Method that returns all nouns in the statement.
 * The pos package is used to parse the statement.  The parse output is searched for words tagged
 * as nouns.  Any words that do not appear in the ignoreNouns list are added to the returned nouns list.
 */
ParamDecoder.prototype.getNouns = function() {
	var self = this;
	return new Promise(function(resolve, reject) {

		var retNouns = [];
		self.getNounsToIgnore().then(function(ignore) {
			logger.logDebug(`ParamDecoder: getNouns(): nounsToIgnore = ${ignore}`);
			self.getTaggedWords().then(function(tw) {
				logger.logDebug(`ParamDecoder: getNouns(): taggedWords = ${tw}`);
				if (tw) {
					for (var i = 0; i < tw.length; i++) {
						var twItem = tw[i];
						var twWord = twItem[0];
						var twTag = twItem[1];
						if (twTag === 'NN' || twTag === 'NNP') {
							if (_.indexOf(retNouns, twWord) < 0) {
								if (_.indexOf(ignore, twWord.toLowerCase()) < 0) {
									retNouns.push(twWord);
								}
							}
						}
					}
				}
				logger.logDebug(`ParamDecoder: getNouns(): retNouns = ${retNouns}`);
				resolve(retNouns);
			}).catch(function(err) {
				logger.logError(`ParamDecoder: getNouns(): Error = ${err}.`);
				reject(err);
			});
		}).catch(function(err) {
			logger.logError(`ParamDecoder: getNouns(): Error = ${err}.`);
			reject(err);
		});

	});
};

/**
 * Method that returns all numbers in the statement.
 * The pos package is used to parse the statement.  The parse output is searched for words tagged
 * as numbers.  Any matching words are added to the returned numbers list.
 */
ParamDecoder.prototype.getNumbers = function() {
	var self = this;
	return new Promise(function(resolve, reject) {

		var retNumbers = [];
		self.getTaggedWords().then(function(tw) {
			logger.logDebug(`ParamDecoder: getNumbers(): taggedWords = ${tw}`);
			if (tw) {
				for (var i = 0; i < tw.length; i++) {
					var twItem = tw[i];
					var twWord = twItem[0];
					var twTag = twItem[1];
					if (twTag === 'CD') {
						if (self.statement.indexOf(' ' + twWord) >= 0) { // Safety check to make sure number is not part of a word
							if (_.indexOf(retNumbers, twWord) < 0) {
								retNumbers.push(twWord);
							}
						}
					}
				}
			}
			logger.logDebug(`ParamDecoder: getNumbers(): retNouns = ${retNumbers}`);
			resolve(retNumbers);
		}).catch(function(err) {
			logger.logError(`ParamDecoder: getNumbers(): Error = ${err}.`);
			reject(err);
		});

	});
};

/**
 * Method that returns all cities in the statement.
 * The Watson Alchemy API is used to search the statement for well-known entities.
 * Any entities of type 'City' are added to the returned cities list.
 */
ParamDecoder.prototype.getCityEntities = function() {
	var self = this;
	return new Promise(function(resolve, reject) {

		self.getEntities().then(function(entities) {
			logger.logDebug(`ParamDecoder: getCityEntities(): entities = ${JSON.stringify(entities)}`);
			var cities = [];
			if (entities.entities) {
				for (var i = 0; i < entities.entities.length; i++) {
					var entity = entities.entities[i];
					if (entity.type === 'City') {
						cities.push(entity.text);
					}
				}
			}
			logger.logDebug(`ParamDecoder: getCityEntities(): cities = ${cities}`);
			resolve(cities);
		}).catch(function(err) {
			logger.logError(`ParamDecoder: getCityEntities(): Error = ${err}.`);
			reject(err);
		});

	});
};

module.exports = ParamDecoder;
