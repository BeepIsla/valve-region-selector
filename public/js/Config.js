var Config = (function () {
	let localStorage = window.localStorage;
	let _configs = {};

	let _Init = function () {
		if (!localStorage.getItem("configs")) {
			localStorage.setItem("configs", "{}");
		}

		try {
			_configs = JSON.parse(localStorage.getItem("configs"));
		} catch {
			console.error("Failed to parse local storage item \"configs\" as JSON");
			console.error(localStorage.getItem("configs"));

			localStorage.setItem("configs_error_backup", localStorage.getItem("configs"));

			_configs = {};
			localStorage.setItem("configs", "{}");

			// Failed to load configs
			_ShowToast("Failed to load configs - Configs have been reset to default", 10000);
		}

		$("#saveloaddelete-config-selection").empty();
		$("#new-config > input").val("");

		if (Object.keys(_configs).length <= 0) {
			$("#saveloaddelete-config").addClass("hidden");
		} else {
			$("#saveloaddelete-config").removeClass("hidden");

			let snippet = $("snippets > snippet[name=\"ConfigSelectRadio\"] > *");
			for (let key in _configs) {
				let clone = snippet.clone();
				clone.find("label").append(key);
				clone.find("input").attr("value", key);

				$("#saveloaddelete-config-selection").append(clone);
			}

			$("#saveloaddelete-config-selection > .radio").on("click", _RadioOnClick);
		}
	};

	let _RadioOnClick = function (ev) {
		let el = $(ev.target);
		if (el.prop("tagName") !== "INPUT") {
			return;
		}

		$("#saveloaddelete-config-selection > .radio").find("input").each((i, _e) => {
			let e = $(_e);
			e[e.val() === el.val() ? "prop" : "removeProp"]("checked", true);
		});
	};

	let _CreateNewConfig = function (ev) {
		let configName = $("#new-config > input").val();
		if (!configName || configName.length <= 0) {
			_ShowToast("Failed to create config - No name has been provided", 1500);
			return;
		}

		if (_configs[configName]) {
			_ShowToast("Failed to create config - A config with the same name already exists", 1500);
			return;
		}

		_configs[configName] = _GetCurrentConfig();
		localStorage.setItem("configs", JSON.stringify(_configs));
		_Init();
	};

	let _SaveConfig = function (ev) {
		let configName = _GetSelectedConfig();
		if (!configName) {
			_ShowToast("Failed to save config - No config has been selected", 1500);
			return;
		}

		_configs[configName] = _GetCurrentConfig();
		localStorage.setItem("configs", JSON.stringify(_configs));
	};

	let _LoadConfig = function (ev) {
		let configName = _GetSelectedConfig();
		if (!configName) {
			_ShowToast("Failed to load config - No config has been selected", 1500);
			return;
		}

		let config = _configs[configName];
		for (let appid in config) {
			let game = $("#game-tabs-container > #" + appid);

			for (let ping of _configs[configName][appid]) {
				let div = game.find("#" + appid + "_" + ping.sdr);
				let checkbox = div.find(".custom-checkbox > input.custom-control-input");
				let slider = div.find("input.slider");
				let input = div.find("#input > input.form-control");

				checkbox.attr("data-mode", ping.mode);
				div.toggleClass("indeterminate", ping.mode == "2");
				div.toggleClass("disabled", ping.mode == "0");
				div.toggleClass("enabled", ping.mode == "1");

				slider.val(ping.ping);
				input.val(ping.ping);
			}
		}

		Main.OnUpdatePings();
	};

	let _DeleteConfig = function (ev) {
		let configName = _GetSelectedConfig();
		if (!configName) {
			_ShowToast("Failed to delete config - No config has been selected", 1500);
			return;
		}

		delete _configs[configName];
		localStorage.setItem("configs", JSON.stringify(_configs));
		_Init();
	};

	let _ShowToast = function (html, seconds) {
		let toast = $.snackbar({
			content: html,
			htmlAllowed: true,
			timeout: seconds,
			onClose: () => {
				// Wait for fadeout to finish (500ms, another 500ms for good measure)
				setTimeout(() => {
					toast.remove();
				}, 1000);
			}
		});
	};

	let _GetSelectedConfig = function () {
		let el = $("#saveloaddelete-config-selection > .radio").find("input").toArray().find(e => e.checked);
		return el ? $(el).val() : undefined;
	};

	let _GetCurrentConfig = function () {
		let games = $("#game-tabs-container > div > div").toArray();
		let obj = {};
		for (let game of games) {
			if (!game.id) {
				continue;
			}

			let parts = game.id.split("_");
			let appID = parts[0];
			let sdr = parts[1];
			let ping = $(game).find("input.slider").val();
			let mode = $(game).find(".custom-checkbox > input").attr("data-mode");

			if (!obj[appID]) {
				obj[appID] = [];
			}

			obj[appID].push({
				sdr: sdr,
				ping: ping,
				mode: mode
			});
		}

		return obj;
	};

	return {
		Init: _Init,
		CreateNewConfig: _CreateNewConfig,
		SaveConfig: _SaveConfig,
		LoadConfig: _LoadConfig,
		DeleteConfig: _DeleteConfig
	};
})();

(function () {
	$("#new-config > button").on("click", Config.CreateNewConfig);
	$("#config-save").on("click", Config.SaveConfig);
	$("#config-load").on("click", Config.LoadConfig);
	$("#config-delete").on("click", Config.DeleteConfig);
})();
