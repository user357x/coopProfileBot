const Raven = require('raven');

/*
module.exports = error => {
    Raven.captureException(error, (sendError) => {
        if (sendError) {
            console.trace(error);
            console.error(sendError);
        }

        process.exit(1);
    });
};
*/

module.exports = error => {
    console.trace(error);
    console.error(error);
};