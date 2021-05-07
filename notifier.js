let nodemailer = require('nodemailer');

let nodemailerTransporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: String(process.env.APPLICATION_USER),
        pass: String(process.env.APPLICATION_PASSWORD)
    }
});


exports.sendEmail = function (email, subjectLine, slotDetails, callback) {
    let options = {
        from: String('Vaxxx' + process.env.APPLICATION_USER),
        to: email,
        cc: process.env.APPLICATION_USER,
        subject: subjectLine,
        text: 'Vaccine available.\n Details: \n\n' + slotDetails
    };
    nodemailerTransporter.sendMail(options, (error, info) => {
        if (error) {
            return callback(error);
        }
        callback(error, info);
    });
};
