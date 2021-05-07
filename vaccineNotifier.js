require('dotenv').config()
const moment = require('moment');
const cron = require('node-cron');
const axios = require('axios');
const notifier = require('./notifier');
const fs = require('fs');
const path = require('path');
/**
Step 1) Enable application access on your gmail with steps given here:
 https://support.google.com/accounts/answer/185833?p=InvalidSecondFactor&visit_id=637554658548216477-2576856839&rd=1

Step 2) Enter the details in the file .env, present in the same folder

Step 3) On your terminal run: npm i && pm2 start vaccineNotifier.js

To close the app, run: pm2 stop vaccineNotifier.js && pm2 delete vaccineNotifier.js
 */

// const PINCODE = process.env.PINCODE
// const EMAIL = process.env.EMAIL
// const AGE = process.env.AGE
// const DISTRICT_ID = process.env.DISTRICT_ID
// const DAYS = process.env.DAYS

const headers = {
	'accept': 'application/json',
	'accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
	'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_3_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36',
	'sec-gpc': '1',
	'origin': 'https://www.cowin.gov.in',
	'sec-fetch-site': 'cross-site',
	'sec-fetch-mode': 'cors',
	'sec-fetch-dest': 'empty',
	'referer': 'https://www.cowin.gov.in/',
	'if-none-match': 'W/"384b-Ok88GnihQTqtwwnAIWVIfwnTiSA"'
};
const subscriptionList = JSON.parse(fs.readFileSync(path.join(__dirname, `subscribers.json`), 'utf8'));
const baseUrl = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/';
const pathForType = {
	district: 'calendarByDistrict',
	pin: 'calendarByPin'
};
const recentlySentEmails = {};
async function main() {
	try {
		cron.schedule('*/10 * * * * *', async () => {
			for (const subscriber of subscriptionList.subscribers) {
				try {
					for (const subscription of subscriber.subscriptions) {
						await sleep(2000)
						checkAvailability(subscriber.email, subscription.type, subscription.id,
							subscription.days, subscription.age);
					}
				} catch (error) {
					log('Error for subscriber in main: ' + JSON.stringify(error))
				}

			}
		});
	} catch (e) {
		log('Error in main: ' + JSON.stringify(e));
	}
}

async function checkAvailability(email, type, id, days, age) {
	let datesArray = await fetchDays(1);
	for (date of datesArray) {
		await sleep(300);
		getSlotsForDate(email, type, id, age, date);
	}
}

function getSlotsForDate(email, type, id, age, date) {
	let url = baseUrl;
	switch (type) {
		case 'district':
			url = `${url}${pathForType.district}?district_id=${id}&date=${date}`
			break;
		case 'pin':
			url = `${url}${pathForType.pin}?pincode=${id}&date=${date}`
	}
	let config = {
		method: 'get',
		url,
		headers
	};
	log(`Checking availability for ${email}, ${type}, ${id}, ${age}, ${date} with url - ${url}`);
	axios(config)
		.then(function (result) {
			let availableDates = {};
			let district, pin;
			for (center of result.data.centers) {
				let sessions = center.sessions;
				let validSlots = sessions.filter(slot => slot.min_age_limit <= age
					&& slot.available_capacity > 0);
				if (validSlots.length > 0) {
					for (validSlot of validSlots) {
						if (!availableDates[validSlot.date]) {
							availableDates[validSlot.date] = [];
						}
						const centerToPush = Object.assign({}, center);
						centerToPush.sessions = validSlot;
						availableDates[validSlot.date].push(centerToPush);
					}

				}
			}
			if (Object.keys(availableDates).length === 0) {
				log(`No available sessions for - ${JSON.stringify({ email, type, id, age, availableDates })}`)
			} else {
				log(`Available sessions - ${JSON.stringify({ email, type, id, age, availableDates })}`)
			}
			for (date in availableDates) {
				notifySubscriber(email, availableDates[date], age, date, availableDates[date][0].district_name, availableDates[date][0].pincode);
			}

		})
		.catch(function (error) {
			log('Error in getSlotsForDate' + error)
		});
}

async function notifySubscriber(emailAddress, validSlots, minAgeLimit, date, district, pincode) {
	let body = JSON.stringify(validSlots, null, '\t');
	let sendEmail = true;
	if (recentlySentEmails[emailAddress]) {
		for (const emailBody in recentlySentEmails[emailAddress]) {
			if (emailBody === body) {
				const timeSent = recentlySentEmails[emailAddress][emailBody];
				if (timeSent > Date.now() - 300000) {
					sendEmail = false;
				}
			}
		}
	} else {
		recentlySentEmails[emailAddress] = {}
	}

	const subjectLine = `VACCINE | AGE > ${minAgeLimit} | DATE - ${date} | ${district} - ${pincode}`;
	if (sendEmail) {
		notifier.sendEmail(emailAddress, subjectLine, body, (err, result) => {
			if (err) {
				log('Error in notifier send email: ' + err)
			} else {
				recentlySentEmails[emailAddress][body] = Date.now();
			}
		})
	}

};

async function fetchDays(numDays) {
	let dates = [];
	let today = moment();
	for (let i = 0; i < numDays; i++) {
		let dateString = today.format('DD-MM-YYYY')
		dates.push(dateString);
		today.add(1, 'day');
	}
	return dates;
}

function log(data) {
	console.log(`${new Date()} - ${JSON.stringify(data)}`)
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

main()
	.then(() => { log('Vaccine availability checker started.'); });
