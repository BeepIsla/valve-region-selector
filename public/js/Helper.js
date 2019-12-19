var Helper = (function () {
	let _FetchSDR = function (appid) {
		return new Promise((resolve, reject) => {
			fetch("https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=" + appid).then((res) => {
				return res.json();
			}).then((json) => {
				if (json.success !== 1 || !json.pops) {
					resolve({
						appid: appid,
						pops: {}
					});
				} else {
					resolve({
						appid: appid,
						pops: json.pops
					});
				}
			}).catch((err) => {
				resolve({
					appid: appid,
					pops: {}
				});
			});
		});
	};

	let _GetPingData = function () {
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

			if (!obj[appID]) {
				obj[appID] = [];
			}

			obj[appID].push({
				sdr: sdr,
				ping: game.classList.contains("off") ? -1 : ping
			});
		}

		return obj;
	};

	return {
		FetchSDR: _FetchSDR,
		GetPingData: _GetPingData
	};
})();

(function () {
})();
