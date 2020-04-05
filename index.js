const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const path = require('path');
const url = require('url');
const fs = require('fs');
const { getVideoDurationInSeconds } = require('get-video-duration')
var child_process = require ("child_process");

var knex = require("knex")({
	client: "sqlite3",
	useNullAsDefault: true,
	connection: {
		filename: path.join(__dirname, 'database.sqlite')
	}
});

app.on("ready", () => {
	let mainWindow = new BrowserWindow({ height: 666, width: 888, show: false, webPreferences: {nodeIntegration: true}})
	
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
		let result = knex.select().from("movies")
		result.then(function(rows){
			mainWindow.webContents.send("resultSent", rows);
		})
	});

	ipcMain.on("update-cell", function (event, value, db_column, id) {

		var raw_sql = "update `movies` set `"+db_column+"` = '"+value+"' where `entry_id`="+id

		knex.raw(raw_sql).then(function (result) {
			console.log("Updated");
		});

	});

	ipcMain.on("play-movie", function (event, movie) {

		var proc = child_process.spawn("/Applications/VLC.app/Contents/MacOS/VLC", [movie]);

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

	ipcMain.on('drive-prefix', function () {
		// Get windows drive prefix
		let pwd = process.env.PORTABLE_EXECUTABLE_DIR;
		let prefix = pwd.substr(0,3);
		knex('config').insert({drive_prefix: prefix});
	});


	ipcMain.on('select-dirs', function () {
		let files = dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }).then((result) =>{
			let fullPath = result.filePaths[0] + '/'
			readDir(fullPath);
		});


	});

	function readDir(fullPath) {

		fs.readdirSync(fullPath).forEach(file => {

			let stats = fs.statSync(fullPath+file);

			if (stats.isDirectory()){
				readDir(fullPath+file+'/');
			}

			var fileInfo = new Map();

			if (file.charAt(0) != "."){ 
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

		mainWindow.reload();
	};

});




app.on("window-all-closed", () => { app.quit() })
