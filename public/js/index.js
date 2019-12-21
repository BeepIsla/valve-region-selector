var Main = (function () {
	let ipcRenderer = window.ipcRenderer;
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

	let _Init = async function () {
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
				sliderClone.find("#name").text(game.config[pop].desc || pop); // There should always be a description but just to be sure
				sliderClone.addClass("enabled");
				sliderClone.attr("id", game.appid + "_" + pop);

				clone.append(sliderClone);
			}

			gameTabContainer.append(clone);
		}

		// Add event handler for buttons
		gameTabs.children("button").on("click", _OnGameToggle);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-label").on("click", _OnCheckboxToggle);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-input").on("click", _OnCheckboxToggle);
		gameTabContainer.find("div > div > .custom-checkbox > .custom-control-input").on("click", _OnUpdatePings);
		gameTabContainer.find("div > div > input.slider").on("input", _OnInputChange);
		gameTabContainer.find("div > div > #input > input").on("input", _OnTextChange);
		gameTabContainer.find("div > div > input.slider").on("change", _OnUpdatePings);
		gameTabContainer.find("div > div > #input > input").on("change", _OnUpdatePings);

		// Automatically select the first tab
		_OnGameToggle({
			target: gameTabs.children("button").first()[0]
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
			return;
		}

		$("#toggle > button").each((i, e) => {
			if ($(e).attr("data-toggle") === "modal") {
				return;
			}

			$(e).toggleClass("hidden", e.isEqualNode(ev.target));
		});

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

	return {
		Init: _Init,
		OnStatusUpdate: _OnStatusUpdate,
		OnStartup: _OnStartup,
		OpenExternalLink: _OpenExternalLink
	};
})();

(function () {
	$(window).ready(Main.Init);
	$("a[data-type=\"external-link\"]").click(Main.OpenExternalLink);
	window.ipcRenderer.on("status", Main.OnStatusUpdate);
	window.ipcRenderer.on("toggle", Main.OnStartup);
})();
