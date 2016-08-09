[![Build Status](https://travis-ci.org/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib.svg?branch=master)](https://travis-ci.org/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib)
[![Coverage Status](https://coveralls.io/repos/github/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib/badge.svg?branch=cleanup)](https://coveralls.io/github/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib?branch=cleanup)
[![Dependency Status](https://dependencyci.com/github/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib/badge)](https://dependencyci.com/github/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib)
[![npm](https://img.shields.io/npm/v/hubot-ibmcloud-cognitive-lib.svg?maxAge=2592000)](https://www.npmjs.com/package/hubot-ibmcloud-cognitive-lib)

# hubot-ibmcloud-cognitive-lib

Provides helper functions for configuring, storing, and processing information related to Natural Language processing of a statment and the retrieval of variable data from that statement.

These functions can be incorporated into a server to process statements to determine a class to handle the statement and the parameters to pass to the function used to handle statements for that class.

## Getting Started
 * [Installation](#installation)		
 * [Overview](#overview)		
 * [NLC JSON Configuration File](#nlc-json-configuration-file)		
 * [External functions](#external-functions)
 * [License](#license)		
 * [Contribute](#contribute)

## Installation

In your npm project:

Either run:

`npm install hubot-ibmcloud-cognitive-lib --save`

or add the following line to your package.json's dependencies:

`"hubot-ibmcloud-cognitive-lib": "*"`

## Overview

In general, Watson's Natural Language Classifier maps a statement to a class that best matches it.  The classifier is seeded with classes and various statements that can be associated with each class.

For the NLC support, a class will represent a command (such as `weather`).  That is, there is a one-to-one correlation between command handlers and the NLC class.

Once the class has been determined, the parameter values needed by that class are pulled from the statement.  For instance if the statement is `I want the weather for Chicago` then the location (Chicago) is pulled from the statement.

## NLC JSON Configuration File

### Introduction

This library uses [PouchDB](https://pouchdb.com/) to store learning data for the Watson NLC. PouchDB is an offline first database and will periodically synchronize with a remote Cloudant database (if configured as an envionment variable). Writing to a local database maintains a smooth interaction with the consumer of this package as there is no need for am immediate network hop.

### Environment variables

```
HUBOT_WATSON_NLC_URL
HUBOT_WATSON_NLC_USERNAME
HUBOT_WATSON_NLC_PASSWORD
HUBOT_WATSON_NLC_CLASSIFIER (optional, defaults to default-hubot-classifier)
HUBOT_WATSON_NLC_AUTO_APPROVE (optional, defaults to false)
HUBOT_WATSON_ALCHEMY_URL (optional, required to pull city parameter values from statement)
HUBOT_WATSON_ALCHEMY_APIKEY (optional, required to pull city parameter values from statement)
HUBOT_WATSON_ALCHEMY_DATASET (optional, required to pull city parameter values from statement)
HUBOT_CLOUDANT_ENDPOINT (optional, default to null)
HUBOT_CLOUDANT_KEY (optional, default to null)
HUBOT_CLOUDANT_PASSWORD (optional, default to null)
HUBOT_CLOUDANT_DB (defaults to nlc)
HUBOT_DB_DIRECTORY (defaults to 'databases')
SYNC_INTERVAL (defaults to 30 minutes, this value is set in millseconds)
CONFIDENCE_THRESHOLD_HIGH (defaults to 0.9)
CONFIDENCE_THRESHOLD_LOW (defaults to 0.3)
PARAM_PARSING_DISABLED (defaults to false, but should be set to true if parameter processing is not desired)
HUBOT_DB_TEST (defaults to false, but should be set to null if running in same shell as the tests which overrides this setting)
```
__Note:__ Usage of `HUBOT_WATSON_NLC_AUTO_APPROVE` could have potential negative effects. Auto-approving the classified statements if they include keywords/entities could cause incorrect classifications for other command usages in the future.

### Training data and class definition setup.

NLC defaults to using `./databases` as the folder for the configuration data and this folder is created if it doesn't exist.

To create a class with a set of suggested natural language statements, an emit target, and parameter value definitions create a JSON file such as the following sample:

```json
{
	"name": "AName",
	"version": "version",
	"classes": [
	    {
			"class": "some-class",
			"description": "Optional description for this class",
			"emittarget": "some-class-targetid",
			"texts": [
				"How can you help me?",
				"What can you do for me?",
				"In what topics are you trained?",
				"help"
			],
			"parameters": [
				{
					"name": "parameter-name",  
					"type": "type-of-parameter",
					"values": [ "value1", "value2" ],
					"prompt": "OK. What is the parameter value you want me to use?"
				}
			]
	    }
	],
	"parameter.values": [
		{
			"name": "parameter-name",
			"values": [ "value1", "value2" ]
		}
	]
}
```
`name` is required and uniquely identifies this JSON file from other packages.

`version` is the version of this file.

`class` is the name of the class you want the classifier to use. Class identifiers should be unique within the file, if the class is not unique then it will be rejected by the database.

`description` is optional. It provides a description for the class. If a value is not provided it will default to the class name.

`texts` is an array of suggested natural language statements to use to invoke the command.  These statements are used to seed the natural language classifier.

`emittarget` is the target event name.  If this package is incorporated within a bot, this emittarget could be used to communicate between a common NLC handler and a specific command handler.

`parameters` is optional and there is one for each desired parameter.

Within the `parameters` object `name` is a required field and gives the name for this parameter.

Within the `parameters` object `type` is a required field and gives a predefined type, this should be one of
(`entity`, `keyword`, `number`, `repourl`, `repouser`, `reponame`, `city`) but this restriction is not enforced.

Within the `parameters` object `values` is an optional list of values to associate with the parameter name (applies to `entity` and `keyword` types).

Within the `parameters` object `prompt` is an optional field.  If a value for the parameter can not be determined through normal processing, this prompt could be used to ask the user for the specific parameter value.

Within the `parameters` object `required` is an optional field indicating whether the value for the parameter is required.  The default is true.

`parameter.values` is optional and is used to specify global hard-coded values for a specified parameter name.  All commands using that parameter name will use the common set of hard-coded values.

Within the `parameter.values` object `name` is a required field and gives the name for this parameter.

Within the `parameters.values` object `values` is a required list of values to associate with the parameter name (applies to `entity` and `keyword` types).

It is also possible to set global parameter values at runtime.  If this is going to be done, then a `parameter.values` object should be configured in the json file with an empty list.
`parameter.values` is namespaced with the `name` (denoted `n1`) at the root of the JSON structure used with the `name` (denoted `n2`) in the `parameter.values` object as follows `n1_n2`. e.g. to update a parameter value.  To set the global parameter a runtime, add a statement similar to the following:

```
nlcconfig.updateGlobalParameterValues('n1_n2', ['aVal', 'anotherVal']);
```

Here's an explanation of the various parameter types:

**entity:**
If there are hard-coded values associated with the parameter name, then the statement is searched for each of the hard-coded values.  If one is found, that is the parameter value.
If there are no hard-coded values or none were found in the statement, then the 'poc' package is used to parse the statement.  It is then analyzed for a single NN or NNP value.  If one is found, the associated text is the parameter value.  If none are found or multiples are found (ambiguous), then no parameter value is set.

**keyword:**
If there are hard-coded values associated with the parameter name (should be), then the statement is searched for each of the hard-coded values.  If one is found, that is the parameter value.  If none are found, then no parameter value is set.

**number:**
The 'poc' package is used to parse the statement.  It is then analyzed for a single CD value.  If one is found, the associated text is the parameter value.  If none are found or multiples are found (ambiguous), then no parameter value is set.

**repourl:**
A url regular expression is used to pull a url from the statement.  If a match is found, that is the parameter value.

**repouser:**
A repo regular expression (repouser/reponame) is used to pull a repo username from the statement.  If a match is found, that is the parameter value.  If a match is not found, then no parameter value is set.

**reponame:**
A repo regular expression (repouser/reponame) is used to pull a repo name from the statement.  If a match is found, that is the parameter value.  If a match is not found, then no parameter value is set.

**city:**
Watson Alchemy is used to parse the statement into entities.  If a single City entity is found, then the associated text is the parameter value.  If one is not found or multiples are found (ambiguous), then no parameter value is set.

The data included in this file will be put into a pouchdb database called by default 'nlc' and marked as private and will not be synchronized if that feature is enabled. Feedback data synchronization (if enabled) from a remote Cloudant/CouchDB server will be stored in the same database.

### Database initialization

Run `initDb /path/to/NLC.json` to create the training data. If you are a developer on this library you will first have to run `npm link`.

The training data has now been created and will be used when training the classifier. The class definition for obtaining parameter values from the statement and specifying the emit target have also now been created and will be available for processing the statement through the natural language path.

## External functions

Following is a description of the various functions exposed by this package:

### Database related functions (nlcDb)

These are functions used to control the underlying database directly.

1. `nlcDb.open()`
	- Opens the underlying database for use by the various functions.

### NLC / Parameter Definition related functions (nlcconfig)

These are functions used to read/write configuration data.

1. `nlcconfig.getAllClasses()`
	- Retrieve seeded text information.  It is an array of arrays of `statement` and `class-name`.

1. `nlcconfig.getClassEmitTarget(className)`
	- Retrieve all configuration information for a given class.  It is an object that parallels the json definition of the class (without the texts).
	- Note: If global parameters have been set or a parameter name, then they will be included in the list of values for any parameter with that name.

1. `nlcconfig.updateGlobalParameterValues(name, values)`
	- Update global parameter values for a parameters for the given name.  Note that the name is namespaced.  It should be the value of the root 'name' field in the json file contatenated with '_' and the parameter name.  After this is invoked, all parameters with the same name will contain the specified values.

### NLC Processing related functions (NLCManager)

These are functions used to process a statement against the current NLC classifier and determine the best class to handle it.  It can also be used to trigger a training to create a new NLC classifier.

1. `NLCManager.train()`
	- Create a new classifier and start training it with the latest information stored in the database.

1. `NLCManager.monitorTraining(classifier_id)`
	- Monitor the training of the given classifier.  A promise is returned and is resolved when the training is complete.

1. `NLCManager.classifierStatus(classifier_id)`
	- Retrieve the current status of the classifier (Training or Available)

1. `NLCManager.classify(text)`
	- Returns the Watson NLC classification information for the given statement.  This includes information such as the top className and an array of potential className matches along with a confidence level and score.

### Parameter Processing related functions (ParamManager)

These are functions used to pull parameter values from a statement using the parameter definition.

1. `ParamManager.getParameters(className, statement, classParameters)`
	- Process the given statement using the given class parameter definitions to obtain parameter values.  A map object is returned with parameter-name / parameter-value pairs.  If the parameter value could not be found, the parameter-name is not in the map.

## License

See [LICENSE.txt](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib/blob/master/LICENSE.txt) for license information.

## Contribute

Please check out our [Contribution Guidelines](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-cognitive-lib/blob/master/CONTRIBUTING.md) for detailed information on how you can lend a hand.
