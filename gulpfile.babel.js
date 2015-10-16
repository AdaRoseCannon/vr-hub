// generated on 2015-07-01 using generator-gulp-webapp 1.0.2
'use strict';

import gulp from 'gulp';
import gulpLoadPlugins from 'gulp-load-plugins';
import browserSync from 'browser-sync';
import del from 'del';
import {statSync, readdirSync, createWriteStream} from 'fs';
import browserify from 'browserify';
import babelify from 'babelify';

const $ = gulpLoadPlugins();
const reload = browserSync.reload;

gulp.task('styles', () => {
	return gulp.src('app/styles/*.scss')
		.pipe($.plumber())
		.pipe($.sourcemaps.init())
		.pipe($.sass.sync({
			outputStyle: 'expanded',
			precision: 10,
			includePaths: ['.']
		}).on('error', $.sass.logError))
		.pipe($.autoprefixer({browsers: ['last 1 version']}))
		.pipe($.sourcemaps.write())
		.pipe(gulp.dest('.tmp/styles'))
		.pipe(reload({stream: true}));
});

gulp.task('vendorScripts', () => {
	return gulp.src([
		'app/scripts/vendor/*.*',
	], {
		dot: true
	}).pipe(gulp.dest('.tmp/scripts'));
});

gulp.task('browserify', ['vendorScripts'], function () {

	return Promise.all(readdirSync('./app/scripts/').map(function (a) {
		var path = './app/scripts/' + a;
		if (!statSync(path).isDirectory()) {
			return new Promise(function (resolve, reject) {
				process.stdout.write('Browserify: Processing ' + a + '\n');
								var writer = createWriteStream('.tmp/scripts/' + a);
								writer.on('finish', function () {
									resolve(a);
								});
				browserify({ debug: true })
					.transform(babelify)
					.require(require.resolve(path), { entry: true })
					.bundle()
					.on('error', function(err) {
						this.emit('exit');
						reject(err);
					})
					.pipe(writer);
			}).then(function (a) {
				process.stdout.write('Browserify: Finished processing ' + a + '\n');
			});
		} else {
			return undefined;
		}
	})).then(function () {
		process.stdout.write('Browserify: Finished all\n');
	}, function (e) {
		process.stdout.write(e.codeFrame + '\n' + e.message);
	});
});

function lint(files, options) {
	return () => {
		return gulp.src(files)
			.pipe(reload({stream: true, once: true}))
			.pipe($.eslint(options))
			.pipe($.eslint.format())
			.pipe($.if(!browserSync.active, $.eslint.failAfterError()));
	};
}

const testLintOptions = {
	env: {
		mocha: true
	},
	globals: {
		assert: false,
		expect: false,
		should: false
	}
};

gulp.task('lint', lint('app/scripts/**/*.js', {
	env: {
		"es6": true,
		"node": true
	},
	rules: require('./.eslintrc.json')
}));
gulp.task('lint:test', lint('test/spec/**/*.js', testLintOptions));

gulp.task('html', ['styles'], () => {
	const assets = $.useref.assets({searchPath: ['.tmp', 'app', '.']});

	return gulp.src('app/*.html')
		.pipe(assets)
		.pipe($.if('*.css', $.minifyCss({compatibility: '*'})))
		.pipe(assets.restore())
		.pipe($.useref())
		.pipe($.if('*.html', $.minifyHtml({conditionals: true, loose: true})))
		.pipe(gulp.dest('dist'));
});

gulp.task('images', () => {
	return gulp.src('app/images/**/*')
		.pipe($.if($.if.isFile, $.cache($.imagemin({
			progressive: true,
			interlaced: true,
			// don't remove IDs from SVGs, they are often used
			// as hooks for embedding and styling
			svgoPlugins: [{cleanupIDs: false}]
		}))
		.on('error', function (err) {
			console.log(err);
			this.end();
		})))
		.pipe(gulp.dest('dist/images'));
});

gulp.task('fonts', () => {
	return gulp.src(['app/fonts/**/*'])
		.pipe(gulp.dest('.tmp/fonts'))
		.pipe(gulp.dest('dist/fonts'));
});

gulp.task('models', () => {
	return gulp.src([
		'app/models/**/*',
		'!app/models/**/*.{blend,maya}',
	], {
		dot: true
	}).pipe(gulp.dest('dist/models'));
});

gulp.task('extras', ['models'],() => {
	return gulp.src([
		'app/*.*',
		'!app/*.html',
		'app/**/*.json'
	], {
		dot: true
	}).pipe(gulp.dest('dist'));
});

gulp.task('copy-tmp', ['browserify'], () => {
	return gulp.src([
		'.tmp/**/*.{js,css}'
	])
	.pipe(gulp.dest('dist'));
});

gulp.task('copy-tmp:dist', ['browserify'], () => {
	return Promise.all([gulp.src([
			'.tmp/**/*.css'
		])
		.pipe(gulp.dest('dist')),
		gulp.src([
			'.tmp/**/*.js'
		])
		.pipe(gulp.dest('dist'))
	]);
});

gulp.task('clean', del.bind(null, ['.tmp', 'dist']));


gulp.task('browserify-reload', ['browserify'], () => {
	reload();
});

gulp.task('serve', ['styles', 'browserify', 'fonts'], () => {
	browserSync({
		notify: false,
		port: 9000,
		server: {
			baseDir: ['.tmp', 'app']
		}
	});

	gulp.watch([
		'app/*.html',
		'app/images/**/*',
		'.tmp/fonts/**/*',
	]).on('change', reload);

	gulp.watch('app/styles/**/*.scss', ['styles']);
	gulp.watch('app/fonts/**/*', ['fonts']);
	gulp.watch('app/scripts/**/*.js', ['browserify-reload']);
});

gulp.task('serve:dist', () => {
	browserSync({
		notify: false,
		port: 9000,
		server: {
			baseDir: ['dist']
		}
	});
});

gulp.task('ship', function () {
	return gulp.src('./dist/**/*')
		.pipe(require('gulp-gh-pages')({
			origin: 'git@github.com:AdaRoseEdwards/cardboard2.git',
			remoteUrl: 'git@github.com:AdaRoseEdwards/cardboard2.git',
			branch: 'gh-pages'
		}));
});

gulp.task('deploy', ['build'], function () {
	return gulp.start('ship');
});

gulp.task('build', ['copy-tmp:dist', 'html', 'images', 'fonts', 'extras'], () => {
	return gulp.src('dist/**/*').pipe($.size({title: 'build', gzip: true}));
});

gulp.task('default', ['clean'], () => {
	gulp.start('build');
});
