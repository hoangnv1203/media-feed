const imagemin = require('imagemin');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const imageminGifsicle = require('imagemin-gifsicle');

const filename = '/home/d/workspace/test/*.{jpg,png,gif}';

imagemin([filename], '/home/d/workspace/test/imagemin', {
	plugins: [
		imageminMozjpeg({
			quality: 95,
			progressive: true
		}),
		imageminPngquant({
			quality: '65-80'
		}),
		imageminGifsicle({
			interlaced: true,
			optimizationLevel: 3
		})
	]
})
.then(files => {
	console.log(files);
});
