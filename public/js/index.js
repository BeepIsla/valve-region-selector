var Main = (function () {
	let ipcRenderer = window.ipcRenderer;
	let isLinux = window.isLinux;
	let tzdb = window.tzdb;
	let cities = window.cities;
	let games = [
		{
			appid: 730,
			name: "Counter-Strike: Global Offensive"
		},
		{
			appid: 440,
			name: "Team Fortress 2"
		},
		{
			appid: 1046930,
			name: "Dota Underlords",
			disabled: true
		},
		{
			appid: 583950,
			name: "Artifact",
			disabled: true
		},
		{
			appid: 570,
			name: "Dota 2",
			disabled: true
		}
	];
	let overrides = {
		730: {
			can: "Guangzhou",
			canm: "Guangzhou (Mobile)",
			cant: "Guangzhou (Telecom)",
			canu: "Guangzhou (Unicom)",

			pwg: false,
			pwj: false,
			pwu: false,
			pww: false,
			pwz: false,

			tsn: "Tianjin",
			tsnm: "Tianjin (Mobile)",
			tsnt: "Tianjin (Telecom)",
			tsnu: "Tianjin (Unicom)"
		},
		440: {}
	};

	let _Init = async function () {
		// Init settings
		Settings.Init();

		// Clocks
		setInterval(_UpdateTimes, 1000);

		// Change HTML stuff depending on OS
		if (isLinux) {
			$(".modal-content > .modal-body > div > ol > li > #steamExe").text("Steam.sh");
		}

		// Fetch pings
		let configs = await Promise.all(games.map((game) => {
			return Helper.FetchSDR(game.appid);
		}));

		for (let config of configs) {
			let index = games.findIndex(g => g.appid === config.appid);
			if (index <= -1) {
				continue;
			}

			// Add overrides
			for (let key in overrides[config.appid]) {
				if (overrides[config.appid][key] === false) {
					delete config.pops[key];
					continue;
				}

				if (typeof overrides[config.appid][key] !== "string") {
					continue;
				}

				if (!config.pops[key]) {
					continue;
				}

				config.pops[key].desc = overrides[config.appid][key];
			}

			games[index].config = config.pops;
		}

		// Add toggle button event
		$("#toggle > button").on("click", _OnButtonToggle);

		// Fill in tab buttons
		let gameTabs = $("#game-tabs");
		let gameTabButtonSnippet = $("snippets > snippet[name=\"GameTabButton\"] > *");
		for (let game of games) {
			let clone = gameTabButtonSnippet.clone();
			clone.text(game.name);
			clone.attr("id", game.appid.toString());

			if (game.disabled) {
				clone.addClass("disabled");
				clone.attr("disabled", true);
			}

			gameTabs.append(clone);
		}

		// Fill in ping selections
		let gameTabContainerSnippet = $("snippets > snippet[name=\"GameTabContainer\"] > *");
		let gameTabSliderSnipper = $("snippets > snippet[name=\"GameTabSlider\"] > *");
		let gameTabContainer = $("#game-tabs-container");
		for (let game of games) {
			let clone = gameTabContainerSnippet.clone();
			clone.attr("id", game.appid);
			clone.addClass("hidden");

			if (game.disabled) {
				continue;
			}

			if (!game.config || Object.keys(game.config).length <= 0) {
				gameTabs.find("#" + game.appid).addClass("disabled");
				gameTabs.find("#" + game.appid).attr("disabled", true);
				continue;
			}

			for (let pop in game.config) {
				// Most perfect world definitions do not
				// have a description so we give them a
				// special hardcoded name
				if (!game.config[pop].desc) {
					continue;
				}

				let sliderClone = gameTabSliderSnipper.clone();
				sliderClone.find("#name").text(game.config[pop].desc);
				sliderClone.addClass("enabled");
				sliderClone.attr("id", game.appid + "_" + pop);

				let offset = _GetTimezone(game.config[pop].desc, game.config[pop].geo);
				if (typeof offset === "number") {
					sliderClone.find("#time").attr("offset", offset);
				}

				clone.append(sliderClone);
			}

			gameTabContainer.append(clone);
		}

		// Add event handler for buttons
		gameTabs.children("button").on("click", _OnGameToggle);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-label").on("click", _OnCheckboxToggle);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-input").on("click", _OnCheckboxToggle);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-label").on("click", _OnUpdatePings);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-input").on("click", _OnUpdatePings);
		gameTabContainer.find("div > div > input.slider").on("input", _OnInputChange);
		gameTabContainer.find("div > div > #input > input").on("input", _OnTextChange);
		gameTabContainer.find("div > div > input.slider").on("change", _OnUpdatePings);
		gameTabContainer.find("div > div > #input > input").on("change", _OnUpdatePings);

		// Automatically select the first tab & Fix names
		_OnGameToggle({
			target: gameTabs.children("button").first()[0]
		});
		Settings.SwitchFixedNames();
	};

	let _GetTimezone = function (name, geo) {
		// This entire thing is very slow and bad but it works
		let match = name.match(/^(?<name>.*)(\(|,).*$/);
		if (match) {
			name = match.groups.name.trim();
		}

		// Get timezones directly if available
		let timezones = tzdb.getTimeZones();
		for (let timezone of timezones) {
			if (timezone.mainCities.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
				return timezone.rawOffsetInMinutes * 60;
			}
		}

		// Else try to get it from a list of all cities
		for (let city of cities) {
			if (city.name.toLowerCase() === name.toLowerCase()) {
				for (let timezone of timezones) {
					if (
						timezone.mainCities.map(c => c.toLowerCase()).includes(city.country.toLowerCase()) ||
						timezone.countryCode.toLowerCase() === city.country.toLowerCase()
					) {
						return timezone.rawOffsetInMinutes * 60;
					}
				}
			}
		}

		// Else try rough city name
		for (let city of cities) {
			if (city.name.toLowerCase().includes(name.toLowerCase())) {
				for (let timezone of timezones) {
					if (
						timezone.mainCities.find(c => c.toLowerCase().includes(city.country.toLowerCase())) ||
						timezone.countryCode.toLowerCase().includes(city.country.toLowerCase())
					) {
						return timezone.rawOffsetInMinutes * 60;
					}
				}
			}
		}

		// If nothing works try to fix the names
		let replacers = {
			"Sao Paulo": "São Paulo"
		};
		if (replacers[name]) {
			return _GetTimezone(replacers[name], geo);
		}

		// Last resort - Try geolocation
		for (let city of cities) {
			if (!city.loc || !city.loc.coordinates) {
				continue;
			}

			if (geo[0].toFixed(1) === city.loc.coordinates[0].toFixed(1) && geo[1].toFixed(1) === city.loc.coordinates[1].toFixed(1)) {
				for (let timezone of timezones) {
					if (
						timezone.mainCities.find(c => c.toLowerCase().includes(city.country.toLowerCase())) ||
						timezone.countryCode.toLowerCase().includes(city.country.toLowerCase())
					) {
						return timezone.rawOffsetInMinutes * 60;
					}
				}
			}
		}

		console.log(name);
		return undefined;
	};

	let _UpdateTimes = function () {
		let times = $(".slider").find("#time");
		times.each((i, elem) => {
			let el = $(elem);
			let offset = parseInt(el.attr("offset"));
			if (typeof offset !== "number" || isNaN(offset)) {
				el.text("Unfetched");
				return;
			}

			let date = new Date();
			let msOffset = Date.now() + (offset * 1000);
			date.setTime(msOffset);

			let hours = date.getUTCHours();
			hours = hours <= 9 ? ("0" + hours) : hours;
			let minutes = date.getUTCMinutes();
			minutes = minutes <= 9 ? ("0" + minutes) : minutes;

			if (el.text() === (hours + ":" + minutes)) {
				return;
			}
			el.text(hours + ":" + minutes);
		});
	};

	let _OnUpdatePings = function (ev) {
		let pings = Helper.GetPingData();

		ipcRenderer.send("pings", {
			pingData: pings
		});
	};

	let _OnInputChange = function (ev) {
		let el = $(ev.target);
		el.parent().find("#input > input").val(el.val());
	};

	let _OnTextChange = function (ev) {
		let el = $(ev.target);
		let num = el.val().replace(/[^0-9]/g, "");
		if (num.length <= 0) {
			num = 1;
		} else {
			num = parseInt(num);
			if (isNaN(num)) {
				num = 1;
			}
		}

		if (num > 500) {
			num = 500;
		}

		el.val(num.toString());
		el.parent().parent().find("input.slider").val(num.toString());
	};

	let _OnCheckboxToggle = function (ev) {
		let el = $(ev.target);
		let mode = el.parent().find("input").attr("data-mode");

		let modes = [
			"1", // Enabled (Use custom ping)
			"0", // Disabled (Force 10000 ping)
			"2" // Indeterminate (Use real ping)
		];
		let index = modes.indexOf(mode);
		if (index <= -1) {
			mode = "1";
		} else {
			mode = modes[index + 1];
			if (!mode) {
				mode = modes[0];
			}
		}
		el.parent().find("input").attr("data-mode", mode);

		el.parent().parent().toggleClass("disabled", mode === "0");
		el.parent().parent().toggleClass("enabled", mode === "1");
		el.parent().parent().toggleClass("indeterminate", mode === "2");

		ev.preventDefault();

		_OnUpdatePings();
	};

	let _OnGameToggle = function (ev) {
		$("#game-tabs > button").each((i, e) => {
			$(e).toggleClass("btn-outline-success", e.isEqualNode(ev.target));
			$(e).toggleClass("btn-outline-info", !e.isEqualNode(ev.target));
		});

		let appID = $(ev.target).attr("id");
		$("#game-tabs-container > div").each((i, e) => {
			let el = $(e);
			el.toggleClass("hidden", el.attr("id") !== appID);
		});
	};

	let _OnButtonToggle = function (ev) {
		if ($(ev.target).attr("data-toggle") === "modal") {
			// This is the modal popup with help information
			// We don't have to do anything because it is
			// already handled automatically by bootstrap

			if ($(ev.target).attr("data-target") === "#config-modal") {
				Settings.Open();
			}

			return;
		}

		$("#toggle > button").each((i, e) => {
			if ($(e).attr("data-toggle") === "modal") {
				return;
			}

			$(e).toggleClass("hidden", e.isEqualNode(ev.target));
		});

		_OnUpdatePings();

		// Ensure using only double equals here for type conversion
		ipcRenderer.send("toggle", {
			enabled: $(ev.target).val() == true,
			pingData: Helper.GetPingData()
		});
	};

	let _OnStatusUpdate = function (ev, args) {
		if (args.message) {
			$("#toggle > h2 > span").text(args.message);
		}

		$("#toggle > button").each((i, e) => {
			let el = $(e);
			if (el.attr("data-toggle") === "modal") {
				return;
			}

			el[!args.button ? "attr" : "removeAttr"]("disabled", "");
		});
	};

	let _OnStartup = function (ev, args) {
		// Start has been cancelled so lets force it to be disabled
		if (args.canceled) {
			$("#toggle > button.btn-danger").click();
			$("#toggle > button").removeAttr("disabled");
		}
	};

	let _OpenExternalLink = function (ev) {
		let el = $(ev.target);
		ipcRenderer.send("openExternal", {
			url: el.attr("href")
		});

		ev.preventDefault();
	};

	let _OnClickSetAllCheckboxes = function (ev) {
		let el = $(ev.target);

		ev.preventDefault();

		while (!["DIV", "BODY"].includes(el.prop("tagName"))) {
			el = el.parent();
		}

		if (el.prop("tagName") === "BODY") {
			return;
		}

		let setTo = el.find("input").attr("id");
		let SDR_divs = $("#game-tabs-container > .container").filter((i, el) => {
			return !el.classList.contains("hidden");
		}).find(".container.slider");
		let SDR_checkboxes = SDR_divs.find(".custom-checkbox > input.custom-control-input");
		let modes = {
			"set-all-disabled": "0",
			"set-all-enabled": "1",
			"set-all-indeterminate": "2"
		};

		SDR_checkboxes.attr("data-mode", modes[setTo]);
		SDR_divs.toggleClass("indeterminate", setTo === "set-all-indeterminate");
		SDR_divs.toggleClass("disabled", setTo === "set-all-disabled");
		SDR_divs.toggleClass("enabled", setTo === "set-all-enabled");

		_OnUpdatePings();
	};

	return {
		Init: _Init,
		OnStatusUpdate: _OnStatusUpdate,
		OnStartup: _OnStartup,
		OpenExternalLink: _OpenExternalLink,
		OnUpdatePings: _OnUpdatePings,
		OnClickSetAllCheckboxes: _OnClickSetAllCheckboxes
	};
})();

(function () {
	$(Main.Init);
	$("a[data-type=\"external-link\"]").on("click", Main.OpenExternalLink);
	$("#set-all-checkboxes > div").on("click", Main.OnClickSetAllCheckboxes);
	window.ipcRenderer.on("status", Main.OnStatusUpdate);
	window.ipcRenderer.on("toggle", Main.OnStartup);
})();
