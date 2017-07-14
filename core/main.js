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

// const download = require('download');
const path = require('path');
const imagemin = require('imagemin');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const imageminGifsicle = require('imagemin-gifsicle');

const aws = require('aws-sdk');
const bluebird = require('bluebird');
const fs = require('fs');
const mime = require('mime');

aws.config.update(config.s3);
aws.config.setPromisesDependency(bluebird);

const s3 = new aws.S3(config.s3);

const host = config.s3.cname || `https://s3${config.s3.region === 'us-east-1' ? '' : `-${config.s3.region}`}.amazonaws.com/${config.s3.bucket}`;

console.log(host);

models.Media
	.find({
		// origin: null
	})
	// .limit(10)
	.skip(1115)
	.exec()
	.then(media => {
		console.log(media.length);
		return media.reduce((p, m) => {
			return p.then(() => {
				return convert(m);
			});
		}, Promise.resolve());
	})
	.then(() => {
		console.log('done');
	})
	.catch((err) => console.log(err));

const request = require('request');
const progress = require('request-progress');

function download(m) {
	let basename = path.basename(m.path);

	return new bluebird((resolve, reject) => {
		progress(request(m.origin || m.path, {
			throttle: 1e3
		}))
			.on('progress', (state) => {
				console.log('donwloaded %d %...', (state.percent * 100).toFixed(2));
			})
			.on('error', (err) => {
				reject(err);
			})
			.on('end', () => {
				resolve();
			})
			.pipe(fs.createWriteStream('/home/d/workspace/test/' + basename));
	});
}

function convert(m) {
	console.log('starting media %d', m.alias);

	let basename = path.basename(m.path);
	let key = 'optimized/' + basename;

	return download(m)
		.then(() => {
			console.log('downloaded media %d', m.alias);

			return imagemin(['/home/d/workspace/test/*.{jpg,jpeg,png,gif}'], '/home/d/workspace/test/imagemin', {
				plugins: [
					imageminMozjpeg({
						quality: 80,
						progressive: true
					}),
					imageminPngquant({
						quality: '65-80'
					}),
					imageminGifsicle({
						interlaced: true,
						optimizationLevel: 2
					})
				]
			})
		})
		.then(files => {
			console.log('minified media %d', m.alias);

			let contentType = mime.lookup('/home/d/workspace/test/imagemin/' + basename);

			let s3Object = {
				Bucket: config.s3.bucket,
				Key: key,
				Body: fs.createReadStream('/home/d/workspace/test/imagemin/' + basename),
				ContentType: contentType,
				ContentDisposition: 'attachment; filename=' + basename,
				CacheControl: `max-age=${30 * 24 * 60 * 60}`
			};

			return s3.putObject(s3Object).promise();
		})
		.then(() => {
			return `${host}/${key}`;
		})
		.then(onlinePath => {
			console.log('uploaded media %d', m.alias);

			return models.Media.findOneAndUpdate({
				alias: m.alias
			}, {
				path: onlinePath,
				origin: m.path
			}).exec();
		})
		.then(() => {
			console.log('updated media %d', m.alias);

			fs.unlink('/home/d/workspace/test/' + basename);
			fs.unlink('/home/d/workspace/test/imagemin/' + basename);
			console.log('process picture %d done', m.alias);
		}).catch(err => {
			console.log(err);
			console.log('process picture %d fail', m.alias);
		});
}

return;

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

// handle error
system.use((error, req, res, next) => {
	res.sendStatus(500);
});

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



