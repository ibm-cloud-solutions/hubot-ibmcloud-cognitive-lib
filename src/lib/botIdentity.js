/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const path = require('path');
const TAG = path.basename(__filename);
const logger = require('./logger');
const env = require('./env');

const request = require('request');
const crypto = require('crypto');

/**
 * Attempts to get the name of the bot from the environment.
 * @return {string} 	The bot's name.
 */
const getBotName = function getBotName(){
	return new Promise((resolve, reject) => {
		if (env.botName){
			resolve(env.botName);
		}
		// NOTE The following is Slack-specific, but it's used as an additional help in case HUBOT_NAME isn't set.
		else if (env.slackToken){
			request(env.slackApi + '/auth.test?token=' + env.slackToken, (error, response, body) => {
				if (!error){
					resolve(JSON.parse(body).user);
				}
				else {
					resolve('hubot');
				}
			});
		}
		else if (env.bluemixUser){
			resolve(env.bluemixUser.substring(0, env.bluemixUser.indexOf('@')));
		}
		else {
			logger.warn(`${TAG}: Unable to find the name of your bot, using default name 'hubot'. For better results set env HUBOT_NAME.`);
			resolve('hubot');
		}
	});
};

/**
 * Generates an ID for the bot.
 *
 * The algorithm:
 * 	 1. Combibe several unique environment variables.
 *   2. Use the string to create a hash
 *   3. To avoid provlems when using in urls, remove special characters + and / and convert to lowercase. Remainig set is [a-z][0-9].
 *   4. We only need 4 characters. This represents 1.6 million (36^4) possibilities, so an extremely low chance of collisions for the intended use.
 *
 * @return {string}
 */
const getBotUID = function getBotUID(){
	let botUID = env.nlc_username;

	if (env.bluemixUser) botUID += env.bluemixUser;
	if (env.bluemixOrg) botUID += env.bluemixOrg;
	if (env.bluemixSpace) botUID += env.bluemixSpace;
	if (env.slackToken) botUID += env.slackToken;

	return crypto.createHash('sha256').update(botUID).digest('base64').replace('+', '').replace('/', '').substr(0, 4).toLowerCase();
};

module.exports = { getBotName, getBotUID };
