const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const path = require('path');
const url = require('url');
const fs = require('fs');
const readline = require('readline');
const { getVideoDurationInSeconds } = require('get-video-duration')
var child_process = require ("child_process");

var knex = require("knex")({
	client: "sqlite3",
	useNullAsDefault: true,
	connection: {
		filename: path.join(__dirname, 'database.sqlite')
	}
});

var conf_vlc_loc;
var root_dir_loc;

knex.raw("select value from config where key ='conf_vlc_loc'").then(function (result) {
	console.log(result[0].value);
	conf_vlc_loc = result[0].value;
	if (conf_vlc_loc == null) {
		conf_vlc_loc = "LOL CANT FIND IT";
	}
});

knex.raw("select value from config where key ='root_dir_loc'").then(function (result) {
	if (result[0] !== undefined){
		root_dir_loc = result[0].value;
	} else {
		root_dir_loc = "AH DANG";
	}
});

app.on("ready", () => {


	let mainWindow = new BrowserWindow({ height: 666, width: 888, show: false, webPreferences: {nodeIntegration: true, additionalArguments: [conf_vlc_loc, root_dir_loc]}});
	
	if (process.env.DEBUG == 1){
		mainWindow.webContents.openDevTools();
	}

	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'main.html'),
		protocol: 'file',
		slashes: true
	}));

	mainWindow.once("ready-to-show", () => { mainWindow.show() })

	ipcMain.on("mainWindowLoaded", function () {

		knex.raw("select value from config where key ='conf_vlc_loc'").then(function (result) {
			conf_vlc_loc = result[0].value;
			if (conf_vlc_loc == null) {
				conf_vlc_loc = "LOL CANT FIND IT";
			}
		});

		knex.raw("select value from config where key ='root_dir_loc'").then(function (result) {
			if (result[0] !== undefined){
				root_dir_loc = result[0].value;
			} else {
				root_dir_loc = "AH DANG";
			}
		});		

		try {
			readDir(root_dir_loc);
		 }	catch(err) {
		 	console.log("dang");
		 }

		let result = knex.select().from("movies")
		result.then(function(rows){
			mainWindow.webContents.send("resultSent", rows, conf_vlc_loc, root_dir_loc);
		})

	});

	ipcMain.on("update-cell", function (event, value, db_column, id) {

		var raw_sql = "update `movies` set `"+db_column+"` = '"+value+"' where `entry_id`="+id

		knex.raw(raw_sql).then(function (result) {
			console.log("Updated");
		});

	});

	ipcMain.on("play-movie", function (event, movie) {

		//var vlc_loc = "/Applications/VLC.app/Contents/MacOS/VLC";

		if (process.platform === "win32") {
			console.log("Windoze");

			// check if file is on ext drive or not
			// and replace the prefix if so
			try {
				if (fs.existsSync(movie)) {
					console.log("Okay");
				}
			} catch(err) {
				let pwd = process.env.PORTABLE_EXECUTABLE_DIR;
				let prefix = pwd.substr(0,2);
				movie = movie.replace(/^.{2}/g, prefix);
				console.log(movie);
			}
		};

		var proc = child_process.spawn(conf_vlc_loc, [movie]);

		// Handle VLC error output (from the process' stderr stream)
		proc.stderr.on ("data", (data) => {
			console.error ("VLC: " + data.toString ());
		});

		// Optionally, also handle VLC general output (from the process' stdout stream)
		proc.stdout.on ("data", (data) => {
			console.log ("VLC: " + data.toString ());
		});

		// Finally, detect when VLC has exited
		proc.on ("exit", (code, signal) => {
		    // Every code > 0 indicates an error.
		    console.log ("VLC exited with code " + code);
		});
	})

	ipcMain.on('delete-row', function (event, movie) {

		var raw_sql = "delete from movies where title ='"+movie+"'";

		knex.raw(raw_sql).then(function (result) {
			console.log("Baleted");

			mainWindow.reload();

		});
	});

	ipcMain.on('select-dirs', function () {
		let files = dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }).then((result) =>{
			let fullPath = result.filePaths[0] + '/'
			readDir(fullPath);
		});
	});

	ipcMain.on('change-vlc', function () {
		let new_loc = dialog.showOpenDialog(mainWindow, { properties: ['openFile'] }).then((result) =>{
			let path = result.filePaths[0] 
			knex("config").where({key: "conf_vlc_loc"}).update({value: path}).then(function (result) {
				mainWindow.webContents.send("update-vlc-txt", path);
			});

		});
	});

	ipcMain.on('change-root', function () {
		let new_loc = dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }).then((result) =>{
			if (result.filePaths === undefined || result.filePaths == 0){
				console.log("No dir selected");
			} else {
				knex("config").where({key: "root_dir_loc"}).update({value: path}).then(function (result) {
					mainWindow.webContents.send("update-root-txt", path);
				});
			}

		});
	});

	ipcMain.on('load-idx', async function () {

		let files = dialog.showOpenDialog(mainWindow, { properties: ['openFile'] }).then((result) =>{
			let path = result.filePaths[0];
			var data = fs.readFileSync(path);
			lines = data.toString().split('\n');
			for (line in lines){
				values = lines[line].split('µ');

				title = values[0];
				year = values[2];
				runtime = values[3];
				language = values[4];
				director = values[5];
				dp = values[6];
				color = values[7];
				nickcage = values[9];
				location = values[11];

				knex('movies').insert({title: title, runtime: runtime, year: year, language: language, director: director, dp: dp, color: color, nickcage: nickcage, location: location}).then(function (result) {
						console.log("Inserted")
					});				

			}

			mainWindow.reload();
		});

	});

	function readDir(fullPath) {

		fs.readdirSync(fullPath).forEach(file => {

			let stats = fs.statSync(fullPath+file);

			if (stats.isDirectory()){
				readDir(fullPath+file+'/');
			}

			var fileInfo = new Map();
			var allowedFiles = ['.mkv', '.m4a', '.mpg', '.mpeg4'];
			var allowed = allowedFiles.includes(path.extname(fullPath+file));

			if (allowed){ 
				fileInfo.set("title", path.basename(file));

				getVideoDurationInSeconds(fullPath+file).then((duration) => {

					var time = new Date(null);
					time.setSeconds(duration);
					formatTime = time.toISOString().substr(11, 8);
					fileInfo.set("runtime", formatTime)

					knex('movies').insert({title: file, runtime: formatTime, location: fullPath+file}).then(function (result) {
						console.log("Inserted")
					});

				});
			}

		});
	};
});


app.on("window-all-closed", () => { app.quit() })
