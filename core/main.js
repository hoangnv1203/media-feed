const express = require('express');
const kue = require('kue');

const env = process.env.NODE_ENV || 'dev';

const config = require('../config')[env];

if (!config) {
	throw new Error('Invalid environment [%s]', env);
}

const models = require('./models')(config);

const queue = kue.createQueue({
	prefix: 'if',
	redis: config.redis
});

const shared = {
	mediaCount: 0,
	cache: {},
	settings: {}
};

const system = module.exports = express();

// log
if (config.debug) {
	system.use(require('morgan')('tiny'));
}

// remove slash trailing
system.use(require('connect-slashes')(false));

// load modules
system.use('/api', require('./api')(config));
system.use('/admin', require('./admin')(config));
system.use('/', require('./app')(config));

if (config.production) {
	// handle error
	system.use((error, req, res, next) => {
		res.sendStatus(500);
	});
}

// init config
system.set('config', config);

// init models
system.set('models', models);

// init queue
system.set('queue', queue);

// init shared data
system.set('shared', shared);

// start worker
system.set('workers', {
	Media: require('./workers/media')(queue, shared, models, config),
	Setting: require('./workers/setting')(queue, shared, models, config)
});

