#! /usr/bin/env node

/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

const fs = require('fs');

process.env.SUPPRESS_ERRORS = true;


const env = require('./env');
const DBManager = require('./dbManager');
let db = new DBManager({localDbName: 'nlc', localDbPath: env.initDbPath});

const PARAMETER_VALUES = 'parameter.values';

exports.init = function(nlcFile){
	return new Promise((resolve, reject) => {
		fs.readFile(nlcFile, (err, data) => {
			if (err){
				reject(err);
			}
			else {
				let ps = [];
				let cntr = 0;
				let obj = JSON.parse(data);

				if (obj.name && obj.version){
					let name = obj.name.replace(/ /g, '_');
					let version = obj.version;

					if (obj.classes){
						for (let cls of obj.classes){
							let dfnObj = {
								_id: cls.class,
								emittarget: cls.emittarget || cls.class,
								description: cls.description,
								storageType: 'private'
							};
							for (let txt of cls.texts){
								let txtObj = {
									_id: `${name}_${cntr++}_v${version}`,
									class: cls.class,
									text: txt,
									storageType: 'private'
								};
								ps.push(db.put(txtObj));
							}
							// check parameters are fully defined with a values list
							if (cls.parameters){
								for (let p of cls.parameters){
									if (!p.values){
										// check global parameter.values
										if (obj[PARAMETER_VALUES]){
											let vals = obj[PARAMETER_VALUES];
											for (let v of vals){
												if (v.name === p.name){
													p.values = {
														$ref: `${name}_${p.name}`
													};
													break;
												}
											}
										}
									}
									if (p.entityfunction) {
										p.entityfunction = `${name}_${p.entityfunction}`;
									}
								}
							}
							dfnObj.parameters = cls.parameters;
							ps.push(db.put(dfnObj));
						}
					}

					if (obj[PARAMETER_VALUES]){
						for (let p of obj[PARAMETER_VALUES]){
							p._id = `${name}_${p.name}`;
							delete p.name;
							p.storageType = 'private';
							ps.push(db.put(p));
						}
					}

					if (ps.length > 0){
						Promise.all(ps).then(() => {
							resolve(db);
						}).catch((err) => {
							reject(err);
						});
					}
					else {
						reject('unrecognized JSON structure');
					}
				}
				else {
					reject('name and version is required in the NLC JSON configuration file');
				}
			}
		});
	});
};

if (!env.test){
	let args = process.argv.slice(2);

	if (args.length > 0){
		let fname = args[0];
		this.init(fname).then(() => {
			if (args.length > 1){
				let fname2 = args[1];
				db = new DBManager({localDbName: 'rr'});
				return this.init(fname2);
			}
		}).then(() => {
			console.log(`Database initialization complete.  Database location: ${env.dbPath}`);
			process.exit(0);
		}).catch((err) => {
			if (err.status === 409){
				console.warn('nlc and/or rr database already exists! Delete them and run initDb again to update.');
				process.exit(0);
			}
			else {
				console.log(err);
				process.exit(1);
			}
		});
	}
	else {
		console.log('Please supply the path to the JSON NLC definition file, e.g. initDb /path/to/NLC.json');
		process.exit(1);
	}
}
