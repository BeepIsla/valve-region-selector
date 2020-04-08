var Main = (function () {
	let ipcRenderer = window.ipcRenderer;
	let localStorage = window.localStorage;
	let isLinux = window.isLinux;
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
			can: "Guangzhou Baiyun",
			canm: "Guangzhou Baiyun (Mobile)",
			cant: "Guangzhou Baiyun (Telecom)",
			canu: "Guangzhou Baiyun (Unicom)",

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
	let timezones = {};
	let fetchTimezones = [];

	let _Init = async function () {
		// Init settings
		Settings.Init();

		// Timezone saving/loading & time updating
		if (!localStorage.getItem("timezones")) {
			localStorage.setItem("timezones", "{}");
		}

		try {
			timezones = JSON.parse(localStorage.getItem("timezones"));
		} catch {
			localStorage.setItem("timezones", "{}");
			timezones = {};
			console.error("Failed to load timezone data - Forced to rebuild");
		}

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

				let ipAddress = undefined;
				if (game.config[pop].relay_addresses && game.config[pop].relay_addresses[0]) {
					ipAddress = game.config[pop].relay_addresses[0].split(":").shift();
				} else if (game.config[pop].relays && game.config[pop].relays[0] && game.config[pop].relays[0].ipv4) {
					ipAddress = game.config[pop].relays[0].ipv4;
				} else if (game.config[pop].service_address_ranges && game.config[pop].service_address_ranges[0]) {
					ipAddress = game.config[pop].service_address_ranges[0].split("/").shift();
					ipAddress = ipAddress.split("-").shift();
				}

				let sliderClone = gameTabSliderSnipper.clone();
				sliderClone.find("#name").text(game.config[pop].desc || pop); // There should always be a description but just to be sure
				sliderClone.addClass("enabled");
				sliderClone.attr("id", game.appid + "_" + pop);

				_FetchTimezone(ipAddress, sliderClone);

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

	let _FetchTimezone = async function (addr, snippet) {
		if (!addr || !snippet || snippet.length <= 0) {
			return;
		}

		let timeDiv = snippet.find("#time");
		if (!timeDiv || timeDiv.length <= 0) {
			return;
		}

		fetchTimezones.push({
			ip: addr,
			div: timeDiv
		});

		if (fetchTimezones.length > 1) {
			// Only run the while loop one at a time
			return;
		}

		while (fetchTimezones.length > 0) {
			let notFound = false;
			let timezone = undefined;
			while (!timezone) {
				if (timezones[fetchTimezones[0].ip]) {
					timezone = timezones[fetchTimezones[0].ip];
				} else {
					timezone = await Helper.GetTimezone(fetchTimezones[0].ip).catch((err) => {
						if (err.message !== "Not Found") {
							return;
						}

						notFound = true;
					});

					if (notFound) {
						break;
					}
				}

				if (!timezone) {
					await new Promise(p => setTimeout(p, 10000));
				}
			}

			if (notFound) {
				console.error(fetchTimezones[0].ip + " > Failed to find timezone");
				fetchTimezones.shift();
				continue;
			}

			if (timezone.error) {
				console.error(fetchTimezones[0].ip + " > " + timezone.error);
				fetchTimezones.shift();
				continue;
			}

			let ip = fetchTimezones[0].ip;
			let div = fetchTimezones[0].div;
			fetchTimezones.shift();

			timezones[ip] = {
				// We only need to save the "raw_offset" parameter, everything else is irrelevant to us
				raw_offset: timezone.raw_offset
			};
			localStorage.setItem("timezones", JSON.stringify(timezones));

			div.attr("offset", timezone.raw_offset);
			_UpdateTimes();
		}
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
			let msOffset = date.getTime() + (offset * 1000) + (date.getTimezoneOffset() * 60 * 1000);
			date.setTime(msOffset);

			let hours = date.getHours();
			hours = hours <= 9 ? ("0" + hours) : hours;
			let minutes = date.getMinutes();
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
	$(window).ready(Main.Init);
	$("a[data-type=\"external-link\"]").click(Main.OpenExternalLink);
	$("#set-all-checkboxes > div").on("click", Main.OnClickSetAllCheckboxes);
	window.ipcRenderer.on("status", Main.OnStatusUpdate);
	window.ipcRenderer.on("toggle", Main.OnStartup);
})();
