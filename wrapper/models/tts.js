const brotli = require("brotli");
const https = require("https");
const voices = require("../data/voices.json").voices;
const fileUtil = require("../../utils/realFileUtil");

/**
 * uses tts demos to generate tts
 * @param {string} voiceName voice name
 * @param {string} text text
 * @returns {IncomingMessage}
 */
module.exports = function processVoice(voiceName, rawText) {
	return new Promise(async (res, rej) => {
		const voice = voices[voiceName];
		if (!voice) {
			rej("The voice you requested is unavailable.");
		}

		let flags = {};
		const pieces = rawText.split("#%");
		let text = pieces.pop().substring(0, 300);
		for (const rawFlag of pieces) {
			const index = rawFlag.indexOf("=");
			if (index == -1) continue;
			const name = rawFlag.substring(0, index);
			const value = rawFlag.substring(index + 1);
			flags[name] = value;
		}

		try {
			switch (voice.source) {
				case "cepstral": {
					let pitch;
					if (flags.pitch) {
						pitch = +flags.pitch;
						pitch /= 100;
						pitch *= 4.6;
						pitch -= 0.4;
						pitch = Math.round(pitch * 10) / 10;
					} else {
						pitch = 1;
					}
					https.get("https://www.cepstral.com/en/demos", async (r) => {
						const cookie = r.headers["set-cookie"];
						const q = new URLSearchParams({
							voiceText: text,
							voice: voice.arg,
							createTime: 666,
							rate: 170,
							pitch: pitch,
							sfx: "none"
						}).toString();

						https.get(
							{
								hostname: "www.cepstral.com",
								path: `/demos/createAudio.php?${q}`,
								headers: { Cookie: cookie }
							},
							(r) => {
								let body = "";
								r.on("data", (b) => body += b);
								r.on("end", () => {
									const json = JSON.parse(body);

									https
										.get(`https://www.cepstral.com${json.mp3_loc}`, res)
										.on("error", rej);
								});
								r.on("error", rej);
							}
						).on("error", rej);
					}).on("error", rej);
					break;
				}
 				case "voiceforge": {
					const q = new URLSearchParams({						
						msg: text,
						voice: voice.arg,
						email: "null",
					}).toString();
					
					https.get({
						hostname: "api.voiceforge.com",
						path: `/swift_engine?${q}`,
						headers: { 
							HTTP_X_API_KEY: '8b3f76a8539',
							'Accept-Encoding': 'identity',
							'Icy-Metadata': '1',
						 }
					}, (r) => {
						fileUtil.convertToMp3(r, "wav").then(res).catch(rej);
					}).on("error", rej);
					break;
				}
				case "polly": {
					const q = new URLSearchParams({
						voice: voice.arg,
						text: text,
					}).toString();

					https
						.get(`https://api.streamelements.com/kappa/v2/speech?${q}`, res)
						.on("error", rej);
					break;
				}
				case "polly2": {
					const body = new URLSearchParams({
						msg: text,
						lang: voice.arg,
						source: "ttsmp3"
					}).toString();

					const req = https.request(
						{
							hostname: "ttsmp3.com",
							path: "/makemp3_new.php",
							method: "POST",
							headers: { 
								"Content-Length": body.length,
								"Content-type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								if (json.Error == 1) rej(json.Text);

								https
									.get(json.URL, res)
									.on("error", rej);
							});
							r.on("error", rej);
						}
					).on("error", rej);
					req.end(body);
					break;
				}
				case "pollyold": {
					const req = https.request(
						{
							hostname: "101.99.94.14",														
							path: voice.arg,
							method: "POST",
							headers: { 			
								Host: "gonutts.net",					
								"Content-Type": "application/x-www-form-urlencoded"
							}
						},
						(r) => {
							let buffers = [];
							r.on("data", (b) => buffers.push(b));
							r.on("end", () => {
								const html = Buffer.concat(buffers);
								const beg = html.indexOf("/tmp/");
								const end = html.indexOf("mp3", beg) + 3;
								const path = html.subarray(beg, end).toString();
								//console.log(html.toString());

								https
									.get({
										hostname: "101.99.94.14",	
										path: `/${path}`,
										headers: {
											Host: "gonutts.net"
										}
									}, res)
									.on("error", rej);
							});
						}
					).on("error", rej);
					req.end(
						new URLSearchParams({
							but1: text,
							butS: 0,
							butP: 0,
							butPauses: 0,
							but: "Submit",
						}).toString()
					);
					break;
				}
 				case "pollyold2": {
					const req = https.request(
						{
                                        hostname: "support.readaloud.app",
                                        path: "/ttstool/createParts",
                                        method: "POST",
                                        headers: {
                                                "Content-Type": "application/json",
                                        },
                                }, (r) => {
                                        let buffers = [];
                                        r.on("data", (d) => buffers.push(d)).on("error", rej).on("end", () => {
                                                https.get({
                                                        hostname: "support.readaloud.app",
							path: `/ttstool/getParts?q=${JSON.parse(Buffer.concat(buffers))[0]}`,
							headers: {
                                                                "Content-Type": "audio/mp3"
                                                        }
						}, (r) => {
							let buffers = [];
							r
                                                                .on("data", (b) => buffers.push(b))
                                                                .on("end", () => res(Buffer.concat(buffers)))
                                                                .on("error", rej);
                                                }).on("error", rej);
                                        });
                                }).end(JSON.stringify([
                                        {
                                                voiceId: voice.arg,
                                                ssml: `<speak version="1.0" xml:lang="${voice.lang}">${text}</speak>`
                                        }
                                ])).on("error", rej);
                     break;
				}
				case "vocalware": {
					const [EID, LID, VID] = voice.arg;
					const q = new URLSearchParams({
						EID,
						LID,
						VID,
						TXT: text,
						EXT: "mp3",
						FNAME: "",
						ACC: 15679,
						SceneID: 2703396,
						HTTP_ERR: "",
					}).toString();

					console.log(`https://cache-a.oddcast.com/tts/genB.php?${q}`)
					https
						.get(
							{
								hostname: "cache-a.oddcast.com",
								path: `/tts/genB.php?${q}`,
								headers: {
									"Host": "cache-a.oddcast.com",
									"Accept": "*/*",
									"Accept-Language": "en-US,en;q=0.5",
									"Accept-Encoding": "gzip, deflate, br",
									"Origin": "https://www.oddcast.com",
									"DNT": 1,
									"Connection": "keep-alive",
									"Referer": "https://www.oddcast.com/",
									"Sec-Fetch-Dest": "empty",
									"Sec-Fetch-Mode": "cors",
									"Sec-Fetch-Site": "same-site"
								}
							}, res
						)
						.on("error", rej);
					break;
				}
				case "cereproc": {
					const req = https.request(
						{
							hostname: "www.cereproc.com",
							path: "/themes/benchpress/livedemo.php",
							method: "POST",
							headers: {
								"content-type": "text/xml",
								"accept-encoding": "gzip, deflate, br",
								origin: "https://www.cereproc.com",
								referer: "https://www.cereproc.com/en/products/voices",
								"x-requested-with": "XMLHttpRequest",
								cookie: "Drupal.visitor.liveDemo=666",
							},
						},
						(r) => {
							var buffers = [];
							r.on("data", (d) => buffers.push(d));
							r.on("end", () => {
								const xml = String.fromCharCode.apply(null, brotli.decompress(Buffer.concat(buffers)));
								const beg = xml.indexOf("<url>") + 5;
								const end = xml.lastIndexOf("</url>");
								const loc = xml.substring(beg, end).toString();
								https.get(loc, res).on("error", rej);
							});
							r.on("error", rej);
						}
					).on("error", rej);
					req.end(
						`<speakExtended key='666'><voice>${voice.arg}</voice><text>${text}</text><audioFormat>mp3</audioFormat></speakExtended>`
					);
					break;
				}
				case "acapela": {
					let acapelaArray = [];
					for (let c = 0; c < 15; c++) acapelaArray.push(~~(65 + Math.random() * 26));
					const email = `${String.fromCharCode.apply(null, acapelaArray)}@gmail.com`;

					let req = https.request(
						{
							hostname: "acapelavoices.acapela-group.com",
							path: "/index/getnonce",
							method: "POST",
							headers: {
								"Content-Type": "application/x-www-form-urlencoded",
							},
						},
						(r) => {
							let buffers = [];
							r.on("data", (b) => buffers.push(b));
							r.on("end", () => {
								const nonce = JSON.parse(Buffer.concat(buffers)).nonce;
								let req = https.request(
									{
										hostname: "acapela-group.com",
										port: "8443",
										path: "/Services/Synthesizer",
										method: "POST",
										headers: {
											"Content-Type": "application/x-www-form-urlencoded",
										},
									},
									(r) => {
										let buffers = [];
										r.on("data", (d) => buffers.push(d));
										r.on("end", () => {
											const html = Buffer.concat(buffers);
											const beg = html.indexOf("&snd_url=") + 9;
											const end = html.indexOf("&", beg);
											const sub = html.subarray(beg, end).toString();

											https
												.get(sub, res)
												.on("error", rej);
										});
										r.on("error", rej);
									}
								).on("error", rej);
								req.end(
									new URLSearchParams({
										req_voice: voice.arg,
										cl_pwd: "",
										cl_vers: "1-30",
										req_echo: "ON",
										cl_login: "AcapelaGroup",
										req_comment: `{"nonce":"${nonce}","user":"${email}"}`,
										req_text: text,
										cl_env: "ACAPELA_VOICES",
										prot_vers: 2,
										cl_app: "AcapelaGroup_WebDemo_Android",
									}).toString()
								);
							});
						}
					).on("error", rej);
					req.end(
						new URLSearchParams({
							json: `{"googleid":"${email}"`,
						}).toString()
					);
					break;
				}
				case "google": {
					const q = new URLSearchParams({
						voice: voice.arg,
						text: text,
					}).toString();

					https
						.get(`https://api.streamelements.com/kappa/v2/speech?${q}`, res)
						.on("error", rej);
					break;
				}
				case "googletranslate": {
					const q = new URLSearchParams({
						ie: "UTF-8",
                        total: 1,
                        idx: 0,
                        client: "tw-ob",
                        q: text,
                        tl: voice.arg,
					}).toString();

					https
						.get(`https://translate.google.com/translate_tts?${q}`, res)
						.on("error", rej);
					break;
				}
 				case "sapi4": {
					const q = new URLSearchParams({
						text,
						voice: voice.arg
					}).toString();

					https.get({
						hostname: "www.tetyys.com",
						path: `/SAPI4/SAPI4?${q}`,
					}, (r) => fileUtil.convertToMp3(r, "wav").then(res).catch(rej)).on("error", rej);
					break;
				}
 				case "onecore": {
					const req = https.request(
						{
                                        hostname: "support.readaloud.app",
                                        path: "/ttstool/createParts",
                                        method: "POST",
                                        headers: {
                                                "Content-Type": "application/json",
                                        },
                                }, (r) => {
                                        let buffers = [];
                                        r.on("data", (d) => buffers.push(d)).on("error", rej).on("end", () => {
                                                https.get({
                                                        hostname: "support.readaloud.app",
							path: `/ttstool/getParts?q=${JSON.parse(Buffer.concat(buffers))[0]}`,
							headers: {
                                                                "Content-Type": "audio/mp3"
                                                        }
						}, (r) => {
							let buffers = [];
							r
                                                                .on("data", (b) => buffers.push(b))
                                                                .on("end", () => res(Buffer.concat(buffers)))
                                                                .on("error", rej);
                                                }).on("error", rej);
                                        });
                                }).end(JSON.stringify([
                                        {
                                                voiceId: voice.arg,
                                                ssml: `<speak version="1.0" xml:lang="${voice.lang}">${text}</speak>`
                                        }
                                ])).on("error", rej);
                     break;
				}
				case "onecore2": {
					const q = new URLSearchParams({
						hl: voice.lang,
						c: "MP3",
                        f: "16khz_16bit_stereo",
                        v: voice.arg,
                        src: text,
					}).toString();

					https
						.get(`https://api.voicerss.org/?key=c52b84f130c244eab434bce9ac66cba2&${q}`, res)
						.on("error", rej);
					break;
				}
				case "svox": {
					const q = new URLSearchParams({
						apikey: "e3a4477c01b482ea5acc6ed03b1f419f",
						action: "convert",
						format: "mp3",
						voice: voice.arg,
						speed: 0,
						text: text,
						version: "0.2.99",
					}).toString();

					https
						.get(`https://api.ispeech.org/api/rest?${q}`, res)
						.on("error", rej);
					break;
				}
				case "nuance": {
					const q = new URLSearchParams({
						voice_name: voice.arg,
						speak_text: text,
					}).toString();

					https
						.get(`https://voicedemo.codefactoryglobal.com/generate_audio.asp?${q}`, res)
						.on("error", rej);
					break;
				}
				case "tiktok": {
					const req = https.request(
						{
							hostname: "tiktok-tts.weilnet.workers.dev",
							path: "/api/generation",
							method: "POST",
							headers: {
								"Content-type": "application/json"
							}
						},
						(r) => {
							let body = "";
							r.on("data", (b) => body += b);
							r.on("end", () => {
								const json = JSON.parse(body);
								if (json.success !== true) rej(json.error);

								res(Buffer.from(json.data, "base64"));
							});
							r.on("error", rej);
						}
					).on("error", rej);
					req.end(JSON.stringify({
						text: text,
						voice: voice.arg
					}));
					break;
				}
			}
		} catch (e) {
			rej(e);
		}
	});
};
