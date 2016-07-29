/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const nock = require('nock');
const path = require('path');
const env = require(path.resolve(__dirname, '..', 'src', 'lib', 'env'));

const alchemyEndpoint = env.alchemy_url;

const mockWeatherRaleighResults = require(path.resolve(__dirname, 'resources', 'mock.weather.raleigh.alchemy.json'));
const mockWeatherLondonResults = require(path.resolve(__dirname, 'resources', 'mock.weather.london.alchemy.json'));
const mockWeatherParisResults = require(path.resolve(__dirname, 'resources', 'mock.weather.paris.alchemy.json'));
const mockWeatherChapelHillResults = require(path.resolve(__dirname, 'resources', 'mock.weather.chapelhill.alchemy.json'));
const mockWeatherJuly4Results = require(path.resolve(__dirname, 'resources', 'mock.weather.july4.alchemy.json'));
const mockWeatherResults = require(path.resolve(__dirname, 'resources', 'mock.weather.alchemy.json'));

module.exports = {
	setupMockery: function() {
		let alchemyScope = nock(alchemyEndpoint).persist();

		alchemyScope.post(/.*/, function(body){
			return (body.text === 'I would like to know the weather for Raleigh, NC.');
		})
		.reply(200, mockWeatherRaleighResults);

		alchemyScope.post(/.*/, function(body){
			return (body.text === 'I would like to know the weather in London');
		})
		.reply(200, mockWeatherLondonResults);

		alchemyScope.post(/.*/, function(body){
			return (body.text === 'What\'s the weather in Paris, France.');
		})
		.reply(200, mockWeatherParisResults);

		alchemyScope.post(/.*/, function(body){
			return (body.text === 'What is the weather in Chapel Hill?');
		})
		.reply(200, mockWeatherChapelHillResults);

		alchemyScope.post(/.*/, function(body){
			return (body.text === 'What\'s the weather like on July, 4 2016?');
		})
		.reply(200, mockWeatherJuly4Results);

		alchemyScope.post(/.*/, function(body){
			return (body.text === 'Weather?');
		})
		.reply(200, mockWeatherResults);

	}
};
